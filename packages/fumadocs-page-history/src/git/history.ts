type Git = (args: string[]) => Promise<string>;
type PathHistory = {
  changes: Map<string, { record: string; status: string }>;
  presence: Map<string, boolean>;
};

/** Keep a path identity per ancestry edge instead of --follow's global path. */
export function createPathHistoryReader(git: Git) {
  let graph: Promise<{ head: string; parents: Map<string, string[]> }> | undefined;
  const getGraph = () =>
    (graph ??= git(['rev-list', '--parents', 'HEAD']).then((output) => {
      const parents = new Map(
        output
          .trim()
          .split('\n')
          .map((line) => {
            const [sha, ...parents] = line.split(' ');
            return [sha, parents] as const;
          }),
      );
      return { head: parents.keys().next().value!, parents };
    }));
  const renames = new Map<string, Promise<Map<string, string>>>();
  function getRenames(parent: string, sha: string) {
    const key = `${parent}:${sha}`;
    let result = renames.get(key);
    if (!result) {
      result = git([
        'diff-tree',
        '-r',
        '-z',
        '--no-commit-id',
        '--name-status',
        '--no-renames',
        '--find-renames=50%',
        '--diff-filter=R',
        parent,
        sha,
        '--',
      ]).then((output) => {
        const paths = output.split('\0');
        const result = new Map<string, string>();
        for (let i = 0; i + 2 < paths.length; i += 3) result.set(paths[i + 2], paths[i + 1]);
        return result;
      });
      renames.set(key, result);
    }
    return result;
  }

  const histories = new Map<string, Promise<PathHistory>>();
  function getPathHistory(source: string, head: string) {
    let history = histories.get(source);
    if (!history) {
      history = git([
        'log',
        '--no-follow',
        '--full-history',
        '--diff-merges=first-parent',
        '--no-renames',
        '--no-show-signature',
        '--root',
        '--name-status',
        '-z',
        '--format=%x00%H%x00%aI%x00%cI%x00%an%x00%ae%x00%B',
        head,
        '--',
        source,
      ]).then((output) => {
        // NUL framing preserves arbitrary filenames and commit messages. Every
        // record begins with an empty field, six metadata fields, then changes.
        const fields = output.split('\0');
        const changes: PathHistory['changes'] = new Map();
        let i = 0;
        while (i < fields.length - 1) {
          if (fields[i++] !== '' || i + 6 > fields.length)
            throw new Error('Incomplete Git path history record.');
          const record = fields.slice(i, i + 6);
          i += 6;
          while (i < fields.length - 1 && fields[i] !== '') {
            const status = fields[i++].trim();
            const file = fields[i++];
            if (!/^[ADMTUXB]$/.test(status) || file === undefined)
              throw new Error('Invalid Git path history change.');
            if (file === source)
              changes.set(record[0], { record: record.join('\0') + '\0', status });
          }
        }
        return { changes, presence: new Map() };
      });
      histories.set(source, history);
    }
    return history;
  }

  return async function read(sources: readonly string[]): Promise<string> {
    const { head, parents } = await getGraph();
    const pending = sources.map((source) => ({ source, sha: head }));
    const visited = new Set<string>();
    const records = new Map<string, string>();

    // A fixed path's presence follows its first parent unless that commit adds,
    // deletes, or modifies it. This avoids a tree query per page/commit/parent.
    function exists(sha: string, history: PathHistory): boolean {
      const trail: string[] = [];
      let current: string | undefined = sha;
      let present = false;
      while (current) {
        const cached = history.presence.get(current);
        if (cached !== undefined) {
          present = cached;
          break;
        }
        trail.push(current);
        const change = history.changes.get(current);
        if (change) {
          present = change.status !== 'D';
          break;
        }
        current = parents.get(current)?.[0];
      }
      for (const entry of trail) history.presence.set(entry, present);
      return present;
    }

    while (pending.length > 0) {
      const { source, sha } = pending.pop()!;
      const key = JSON.stringify([source, sha]);
      if (visited.has(key)) continue;
      visited.add(key);
      const history = await getPathHistory(source, head);
      const change = history.changes.get(sha);
      // Merges with no first-parent change are traversed but not published.
      if (change) records.set(sha, change.record);
      for (const parent of parents.get(sha) ?? []) {
        let previous = source;
        if (exists(sha, history) && !exists(parent, history)) {
          // Follow only an actual rename on this edge. Copies start a new page;
          // another parent can still carry the branch that created that page.
          const renamed = (await getRenames(parent, sha)).get(source);
          if (!renamed) continue;
          previous = renamed;
        }
        pending.push({ source: previous, sha: parent });
      }
    }
    return [...records.values()].join('');
  };
}
