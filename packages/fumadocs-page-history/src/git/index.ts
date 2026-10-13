import { x } from 'tinyexec';
import path from 'node:path';
import { createGitHubResolver, type GitHubOptions } from './github';
import type { HistoryAuthor, HistoryCommit } from '../index';

export type { GitHubOptions } from './github';

export interface MappedAuthor {
  name: string;
  username?: string;
  avatar?: string;
  url?: string;
  i18n?: Record<string, string>;
  mapByNameAliases?: readonly string[];
  mapByEmailAliases?: readonly string[];
}

export interface HistoryOptions {
  /** A directory inside the checkout. Paths are always relative to its Git root. */
  cwd?: string;
  /** GitHub-compatible web URL; never inferred from private remote credentials. */
  repoURL: string;
  registry?: readonly MappedAuthor[];
  /** Optional build-time GitHub account lookup. Disabled unless configured. */
  github?: GitHubOptions;
  /** Exclude bot identities from attribution, while keeping their commits. Default: true. */
  excludeBots?: boolean;
  /** Optional cap on the page history. Defaults to the complete history. */
  maxGitLogCount?: number;
  getCommitURL?: (commit: HistoryCommit) => string;
  getReleaseTagURL?: (tag: string, commit: HistoryCommit) => string;
}

const normalize = (value: string) => value.trim().toLocaleLowerCase('en-US');

function findMappedAuthor(name: string, email: string, registry: readonly MappedAuthor[]) {
  return (
    registry.find((entry) =>
      entry.mapByEmailAliases?.some((alias) => normalize(alias) === normalize(email)),
    ) ??
    registry.find((entry) =>
      [entry.name, entry.username, ...(entry.mapByNameAliases ?? [])].some(
        (alias) => alias && normalize(alias) === normalize(name),
      ),
    )
  );
}

export function mapAuthor(
  name: string,
  email: string,
  registry: readonly MappedAuthor[] = [],
): HistoryAuthor {
  const author = findMappedAuthor(name, email, registry);
  // Once mapped, all aliases use the registry's public identity.
  const username = author
    ? author.username
    : email.match(/^(?:\d+\+)?([a-z\d](?:[a-z\d-]*[a-z\d])?)@users\.noreply\.github\.com$/i)?.[1];
  const profile = username ? `https://github.com/${encodeURIComponent(username)}` : undefined;
  const avatarUrl = author?.avatar ?? (profile ? `${profile}.png` : undefined);
  const url = author?.url ?? profile;
  return {
    name: author?.name ?? name,
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(url ? { url } : {}),
    ...(author?.i18n ? { i18n: author.i18n } : {}),
  };
}

function repositoryURL(value: string): string {
  const url = new URL(value);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'repoURL must be an HTTP(S) repository URL without credentials, query, or fragment.',
    );
  }
  return url.href.replace(/\/$/, '');
}

/** Parse the six NUL-delimited fields emitted by readPageHistory. */
export function parseGitLog(
  output: string,
  options: Pick<HistoryOptions, 'repoURL' | 'registry' | 'excludeBots' | 'getCommitURL'>,
): HistoryCommit[] {
  return parseGitLogWithAuthors(output, options).commits;
}

function parseGitLogWithAuthors(output: string, options: Parameters<typeof parseGitLog>[1]) {
  const unresolved = new Map<HistoryAuthor, { sha: string; email: string }>();
  const commits: HistoryCommit[] = [];
  const repoURL = repositoryURL(options.repoURL);
  if (!output.trim()) return { commits, unresolved };
  const fields = output.split('\0');
  const trailing = fields.pop();
  if (trailing?.trim() || fields.length % 6 !== 0)
    throw new Error('Incomplete Git history record.');
  for (let index = 0; index < fields.length; index += 6) {
    const [rawSha, authoredAt, committedAt, name, email, body] = fields.slice(index, index + 6);
    const sha = rawSha.trim();
    if (
      !/^(?:[\da-f]{40}|[\da-f]{64})$/i.test(sha) ||
      !Number.isFinite(Date.parse(authoredAt)) ||
      !Number.isFinite(Date.parse(committedAt))
    ) {
      throw new Error('Invalid Git history record.');
    }
    const identities = [{ name, email }];
    for (const match of body.matchAll(
      /^[\t ]*Co-authored-by:[\t ]*(.*?)[\t ]*<([^<>\r\n]+)>[\t ]*\r?$/gim,
    )) {
      identities.push({ name: match[1].trim(), email: match[2].trim() });
    }
    const authors: HistoryAuthor[] = [];
    for (const identity of identities) {
      if (options.excludeBots !== false && /\[bot\]/i.test(identity.name + identity.email))
        continue;
      const author = mapAuthor(identity.name, identity.email, options.registry);
      if (
        identity === identities[0] &&
        !author.url &&
        !findMappedAuthor(name, email, options.registry ?? [])
      )
        unresolved.set(author, { sha, email });
      if (!authors.some((entry) => entry.name === author.name && entry.url === author.url))
        authors.push(author);
    }
    // Identity emails are lookup keys, not fields in the public result.
    const publicMessage = body.replace(/^[\t ]*Co-authored-by:.*(?:\r?\n|$)/gim, '').trim();
    const [message, ...description] = publicMessage.split(/\r?\n/);
    const commit: HistoryCommit = {
      sha,
      shortSha: sha.slice(0, 7),
      date: authoredAt,
      authoredAt,
      committedAt,
      message,
      description: description.join('\n').trim(),
      authors,
      url: `${repoURL}/commit/${sha}`,
      repoURL,
    };
    if (options.getCommitURL) commit.url = options.getCommitURL(commit);
    commits.push(commit);
  }
  return { commits, unresolved };
}

/** Node/build-time API. Each standalone call reads a fresh repository snapshot. */
export async function readPageHistory(
  sourcePath: string,
  options: HistoryOptions,
): Promise<HistoryCommit[]> {
  return createHistoryReader(options).read(sourcePath);
}

/** Reuse repository metadata within one build. Create a new reader for each build. */
export function createHistoryReader(options: HistoryOptions) {
  const run = async (args: string[], cwd: string) =>
    (await x('git', args, { throwOnError: true, nodeOptions: { cwd } })).stdout;
  let root: Promise<string> | undefined;
  const getRoot = () =>
    (root ??= run(['rev-parse', '--show-toplevel'], options.cwd ?? process.cwd()).then((v) =>
      v.trim(),
    ));
  const git = async (args: string[]) => run(['--literal-pathspecs', ...args], await getRoot());
  const resolveGitHub = options.github
    ? createGitHubResolver(repositoryURL(options.repoURL), options.github, getRoot)
    : undefined;
  let metadata: Promise<string> | undefined;
  const getTags = () =>
    (metadata ??= (async () => {
      if ((await git(['rev-parse', '--is-shallow-repository'])).trim() === 'true') {
        throw new Error(
          'Complete page history requires a full checkout. Run git fetch --unshallow; CI must use fetch-depth: 0.',
        );
      }
      return git([
        'for-each-ref',
        '--format=%(objectname)%09%(*objectname)%09%(refname:strip=2)',
        'refs/tags',
      ]);
    })());

  async function read(sourcePath: string): Promise<HistoryCommit[]> {
    if (
      options.maxGitLogCount !== undefined &&
      (!Number.isSafeInteger(options.maxGitLogCount) || options.maxGitLogCount < 1)
    ) {
      throw new Error('maxGitLogCount must be a positive safe integer.');
    }
    const source = path.normalize(sourcePath).split(path.sep).join('/');
    if (source === '.' || path.isAbsolute(source) || source === '..' || source.startsWith('../')) {
      throw new Error(
        'History requires a non-empty repository-relative file path inside the checkout.',
      );
    }
    const repoURL = repositoryURL(options.repoURL);
    const tags = await getTags();
    const output = await git([
      'log',
      '--follow',
      '--diff-merges=first-parent',
      '--no-patch',
      '--no-show-signature',
      '--format=%H%x00%aI%x00%cI%x00%an%x00%ae%x00%B%x00',
      '--',
      source,
    ]);
    const parsed = parseGitLogWithAuthors(output, options);
    const commits = new Map(parsed.commits.map((commit) => [commit.sha, commit]));
    for (const line of tags.trim().split('\n').filter(Boolean)) {
      const [object, peeled, name] = line.split('\t');
      const commit = commits.get(peeled || object);
      if (commit)
        (commit.tags ??= []).push({
          name,
          url:
            options.getReleaseTagURL?.(name, commit) ??
            `${repoURL}/releases/tag/${encodeURIComponent(name)}`,
        });
    }
    const ordered = [...commits.values()].sort(
      (a, b) => Date.parse(b.date) - Date.parse(a.date) || a.sha.localeCompare(b.sha),
    );
    const result =
      options.maxGitLogCount === undefined ? ordered : ordered.slice(0, options.maxGitLogCount);
    if (resolveGitHub) {
      await Promise.all(
        result.flatMap((commit) =>
          commit.authors.map(async (author) => {
            const identity = parsed.unresolved.get(author);
            if (!identity) return;
            const username = await resolveGitHub(identity.sha, identity.email);
            if (username) {
              author.url = `https://github.com/${username}`;
              author.avatarUrl = `${author.url}.png`;
            }
          }),
        ),
      );
    }
    return result;
  }
  return { getRoot, read };
}

/** Resolve explicit frontmatter contributors on the server with the same author registry. */
export function resolveAuthors(
  names: readonly string[],
  registry: readonly MappedAuthor[] = [],
): HistoryAuthor[] {
  return names.map((name) => mapAuthor(name, '', registry));
}
