import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as tinyexec from 'tinyexec';
import { createHistoryReader, mapAuthor, parseGitLog, readPageHistory } from '../src/git';
import { getContributors, shouldShowChangelog, shouldShowContributors } from '../src';

vi.mock('tinyexec', { spy: true });

const repoURL = 'https://github.com/example/docs';
const temporary: string[] = [];
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function temp() {
  const directory = mkdtempSync(path.join(tmpdir(), 'fumadocs-history-'));
  temporary.push(directory);
  return directory;
}
function repository() {
  const cwd = temp();
  let revision = 0;
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_AUTHOR_NAME: 'Original',
        GIT_AUTHOR_EMAIL: 'original@example.test',
        GIT_COMMITTER_NAME: 'Original',
        GIT_COMMITTER_EMAIL: 'original@example.test',
        GIT_AUTHOR_DATE: `2026-01-${String(revision + 1).padStart(2, '0')}T12:00:00Z`,
        GIT_COMMITTER_DATE: `2026-01-${String(revision + 1).padStart(2, '0')}T12:00:00Z`,
      },
    });
  git('init', '-b', 'main');
  const write = (file: string, body = 'a\nb\nc\nd\ne\nf\ng\nh\n') => {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    writeFileSync(path.join(cwd, file), body);
  };
  const commit = (message: string) => {
    revision++;
    git('add', '.');
    git('-c', 'commit.gpgsign=false', 'commit', '-m', message);
    return git('rev-parse', 'HEAD').trim();
  };
  return { cwd, git, write, commit };
}

describe('real Git history', () => {
  it('follows renames and MDX migrations, deduplicates, and preserves coauthors and both tag kinds', async () => {
    const r = repository();
    r.write('content/旧指南.md');
    const first = r.commit('初始版本');
    r.git('mv', 'content/旧指南.md', 'content/guide.md');
    const rename = r.commit('Rename guide');
    r.git('mv', 'content/guide.md', 'content/guide.mdx');
    const migrated = r.commit(
      'Move to MDX\n\nMore detail.\n\nCo-authored-by: Partner <partner@example.test>\nCo-authored-by: Partner <partner@example.test>',
    );
    r.git('tag', 'v1.0');
    r.git('-c', 'tag.gpgsign=false', 'tag', '-a', 'release/v1', '-m', 'Release');
    const history = await readPageHistory('content/guide.mdx', {
      cwd: path.join(r.cwd, 'content'),
      repoURL,
      registry: [
        {
          name: 'Public partner',
          username: 'partner',
          mapByEmailAliases: ['partner@example.test'],
        },
      ],
    });
    expect(history.map((commit) => commit.sha)).toEqual([migrated, rename, first]);
    expect(history[0].tags?.map((tag) => tag.name)).toEqual(['release/v1', 'v1.0']);
    expect(history[0].tags?.[0].url).toBe(`${repoURL}/releases/tag/release%2Fv1`);
    expect(history[0].authors.map((author) => author.name)).toEqual(['Original', 'Public partner']);
    expect(history[0].description).toBe('More detail.');
    expect(JSON.stringify(history)).not.toContain('@example.test');
  });

  it('does not combine unrelated files with different Markdown extensions', async () => {
    const r = repository();
    r.write('docs/guide.md');
    r.commit('Markdown page');
    r.write('docs/guide.mdx', 'A separate page');
    const current = r.commit('MDX page');
    expect(
      (await readPageHistory('docs/guide.mdx', { cwd: r.cwd, repoURL })).map((c) => c.sha),
    ).toEqual([current]);
  });

  it('includes merge edits alongside branch history and follows subsequent renames', async () => {
    const r = repository();
    r.write('guide.md', 'Base\n');
    const first = r.commit('Initial page');
    r.git('checkout', '-b', 'feature');
    r.write('guide.md', 'Feature\n');
    const feature = r.commit('Feature edit');
    r.git('checkout', 'main');
    r.write('guide.md', 'Main\n');
    const main = r.commit('Main edit');
    expect(() => r.git('-c', 'commit.gpgsign=false', 'merge', 'feature')).toThrow();
    r.write('guide.md', 'Resolved content\n');
    const merge = r.commit('Resolve page conflict');
    r.git('tag', 'v2');
    r.git('mv', 'guide.md', 'guide.mdx');
    const rename = r.commit('Move page to MDX');

    const history = await readPageHistory('guide.mdx', { cwd: r.cwd, repoURL });
    expect(history.map((commit) => commit.sha)).toEqual([rename, merge, main, feature, first]);
    expect(history.find((commit) => commit.sha === merge)?.tags?.[0].name).toBe('v2');
  });

  it('reads signed commits regardless of signature display settings', async () => {
    const r = repository();
    const key = path.join(r.cwd, '.git', 'signing-key');
    execFileSync('ssh-keygen', ['-t', 'ed25519', '-N', '', '-f', key], { stdio: 'pipe' });
    const signers = path.join(r.cwd, '.git', 'allowed-signers');
    writeFileSync(signers, `original@example.test ${readFileSync(`${key}.pub`, 'utf8')}`);
    r.git('config', 'gpg.format', 'ssh');
    r.git('config', 'user.signingkey', key);
    r.git('config', 'gpg.ssh.allowedSignersFile', signers);
    r.git('config', 'log.showSignature', 'true');
    r.write('guide.md');
    r.git('add', '.');
    r.git('commit', '-S', '-m', 'Signed edit');

    expect(r.git('log', '-1', '--format=%H')).toContain('Good "git" signature');
    const history = await readPageHistory('guide.md', { cwd: r.cwd, repoURL });
    expect(history.map((commit) => commit.message)).toEqual(['Signed edit']);
  });

  it.skipIf(path.sep !== '/')('preserves literal backslashes in POSIX filenames', async () => {
    const r = repository();
    r.write('guide\\draft.mdx');
    const literal = r.commit('Literal backslash');
    r.write('guide/draft.mdx', 'A different page');
    r.commit('Other page');
    const history = await readPageHistory('guide\\draft.mdx', { cwd: r.cwd, repoURL });
    expect(history.map((commit) => commit.sha)).toEqual([literal]);
  });

  it('treats Git pathspec characters literally and returns an empty list for untracked pages', async () => {
    const r = repository();
    r.write('content/[draft]*.mdx');
    r.commit('Literal filename');
    r.write('content/draft-other.mdx');
    r.commit('Other file');
    expect(
      (await readPageHistory('content/[draft]*.mdx', { cwd: r.cwd, repoURL })).map(
        (c) => c.message,
      ),
    ).toEqual(['Literal filename']);
    expect(await readPageHistory('content/untracked.mdx', { cwd: r.cwd, repoURL })).toEqual([]);
  });

  it('rejects shallow checkouts instead of silently publishing incomplete history', async () => {
    const r = repository();
    r.write('guide.md');
    r.commit('First');
    r.write('guide.md', 'Changed');
    r.commit('Second');
    const shallow = temp();
    execFileSync('git', ['clone', '--depth=1', `file://${r.cwd}`, shallow], { stdio: 'pipe' });
    await expect(readPageHistory('guide.md', { cwd: shallow, repoURL })).rejects.toThrow(
      'fetch-depth: 0',
    );
  });

  it('normalizes repository-relative paths', async () => {
    const r = repository();
    r.write('content/guide.md');
    const first = r.commit('Initial page');
    for (const source of [
      './content/guide.md',
      'content//guide.md',
      'content/../content/guide.md',
    ]) {
      expect((await readPageHistory(source, { cwd: r.cwd, repoURL })).map((c) => c.sha)).toEqual([
        first,
      ]);
    }
  });

  it.each(['../secret', path.resolve('absolute'), 'docs/../../secret', '.', ''])(
    'rejects non-repository paths: %s',
    async (source) => {
      await expect(readPageHistory(source, { repoURL })).rejects.toThrow('repository-relative');
    },
  );
});

describe('public metadata', () => {
  it('unifies registered aliases and explicit authors without inferring per-email profiles', () => {
    const registry = [
      { name: 'Alex', mapByEmailAliases: ['alex@example.test', 'alex@users.noreply.github.com'] },
    ];
    const emails = ['alex@example.test', 'alex@users.noreply.github.com'];
    const records = emails
      .map(
        (email, index) =>
          [
            String(index + 1).repeat(40),
            '2026-01-01T00:00:00Z',
            '2026-01-01T00:00:00Z',
            'Alias',
            email,
            `Edit\n\nCo-authored-by: Alias <${emails[1 - index]}>\n`,
          ].join('\0') + '\0\n',
      )
      .join('');
    const commits = parseGitLog(records, { repoURL, registry });
    expect(commits.map((commit) => commit.authors)).toEqual([
      [{ name: 'Alex' }],
      [{ name: 'Alex' }],
    ]);
    expect(getContributors(commits, [mapAuthor('Alex', '', registry)])).toEqual([
      { name: 'Alex', commitsCount: 2 },
    ]);
  });

  it('prioritizes email aliases over names and infers GitHub noreply profiles', () => {
    expect(
      mapAuthor('Alias', 'PERSON@example.test', [
        { name: 'Wrong', mapByNameAliases: ['Alias'] },
        { name: 'Correct', username: 'correct', mapByEmailAliases: ['person@example.test'] },
      ]),
    ).toEqual({
      name: 'Correct',
      avatarUrl: 'https://github.com/correct.png',
      url: 'https://github.com/correct',
    });
    expect(mapAuthor('User', '123+user@users.noreply.github.com').url).toBe(
      'https://github.com/user',
    );
    expect(mapAuthor('Unknown', 'private@example.test')).toEqual({ name: 'Unknown' });
  });

  it('preserves punctuation and multiline text, and rejects truncated records', () => {
    const record =
      [
        'a'.repeat(40),
        '2026-01-01T00:00:00Z',
        '2026-01-02T00:00:00Z',
        'Author',
        'private@example.test',
        'fix: punctuation | % #1\n\nSecond line\nThird line',
      ].join('\0') + '\0\n';
    const [commit] = parseGitLog(record, { repoURL });
    expect(commit.description).toBe('Second line\nThird line');
    expect(commit.authoredAt).not.toBe(commit.committedAt);
    expect(() => parseGitLog(record.slice(0, -2), { repoURL })).toThrow('Incomplete');
    expect(() =>
      parseGitLog(record, { repoURL: 'https://user:secret@github.com/example/docs' }),
    ).toThrow('credentials');
  });

  it('honors per-page controls without conflating contributors and history', () => {
    for (const frontmatter of [
      { gitChangelog: false },
      { gitChangelog: { disableChangelog: true } },
    ]) {
      expect(shouldShowChangelog(frontmatter)).toBe(false);
    }
    expect(shouldShowChangelog()).toBe(true);
    expect(shouldShowChangelog({ gitChangelog: { disableContributors: true } })).toBe(true);
    expect(shouldShowContributors({ gitChangelog: { disableContributors: true } })).toBe(false);
  });
});

it('parses indented co-author trailers without publishing their identity emails', () => {
  const body = 'A change\n\n  Co-authored-by: Partner <private@example.test>\n';
  const record =
    [
      'a'.repeat(40),
      '2026-01-01T00:00:00Z',
      '2026-01-01T00:00:00Z',
      'Author',
      'author@example.test',
      body,
    ].join('\0') + '\0';
  const [commit] = parseGitLog(record, { repoURL });
  expect(commit.authors.map((author) => author.name)).toEqual(['Author', 'Partner']);
  expect(JSON.stringify(commit)).not.toContain('private@example.test');
});

it('filters bots, keeps human coauthors, and permits opting back in', () => {
  const body = 'Automated update\n\nCo-authored-by: Human <human@example.test>\n';
  const record =
    [
      'b'.repeat(40),
      '2026-01-01T00:00:00Z',
      '2026-01-01T00:00:00Z',
      'robot[bot]',
      'robot@example.test',
      body,
    ].join('\0') + '\0';
  expect(parseGitLog(record, { repoURL })[0].authors.map((a) => a.name)).toEqual(['Human']);
  expect(parseGitLog(record, { repoURL, excludeBots: false })[0].authors).toHaveLength(2);
});

it('customizes commit and release links and limits the page history', async () => {
  const r = repository();
  r.write('guide.md');
  r.commit('First');
  r.write('guide.md', 'Second');
  const latest = r.commit('Second');
  r.git('tag', 'v2');
  const history = await readPageHistory('guide.md', {
    cwd: r.cwd,
    repoURL,
    maxGitLogCount: 1,
    getCommitURL: (commit) => `https://gitlab.com/example/docs/-/commit/${commit.sha}`,
    getReleaseTagURL: (tag) => `https://gitlab.com/example/docs/-/tags/${tag}`,
  });
  expect(history).toHaveLength(1);
  expect(history[0].sha).toBe(latest);
  expect(history[0].url).toContain('/-/commit/');
  expect(history[0].tags?.[0].url).toContain('/-/tags/v2');
  for (const maxGitLogCount of [0, -1, 1.5, NaN]) {
    await expect(
      readPageHistory('guide.md', { cwd: r.cwd, repoURL, maxGitLogCount }),
    ).rejects.toThrow('positive safe integer');
  }
});

it('shares repository queries across concurrent pages and refreshes metadata for a new build', async () => {
  const r = repository();
  r.write('first.md');
  r.write('second.md');
  r.commit('Both pages');
  r.git('tag', 'v1');
  const execute = vi.mocked(tinyexec.x);
  const reader = createHistoryReader({ cwd: r.cwd, repoURL });
  const histories = await Promise.all([reader.read('first.md'), reader.read('second.md')]);
  expect(histories.map((history) => history[0].tags?.[0].name)).toEqual(['v1', 'v1']);
  const calls = execute.mock.calls.map(([, args]) => args ?? []);
  expect(calls.filter((args) => args.includes('--show-toplevel'))).toHaveLength(1);
  expect(calls.filter((args) => args.includes('--is-shallow-repository'))).toHaveLength(1);
  expect(calls.filter((args) => args.includes('for-each-ref'))).toHaveLength(1);
  expect(calls.filter((args) => args.includes('--follow'))).toHaveLength(2);

  r.write('first.md', 'New content');
  const latest = r.commit('Next build');
  r.git('tag', 'v2');
  const fresh = await createHistoryReader({ cwd: r.cwd, repoURL }).read('first.md');
  expect(fresh[0].sha).toBe(latest);
  expect(fresh[0].tags?.[0].name).toBe('v2');
});

it('enriches only unresolved primary authors and keeps explicit mappings authoritative', async () => {
  const r = repository();
  r.write('guide.md');
  const sha = r.commit('Initial\n\nCo-authored-by: Partner <partner@example.test>');
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({
      sha,
      commit: { author: { email: 'original@example.test' } },
      author: { login: 'original-user' },
    }),
  );
  vi.stubGlobal('fetch', fetcher);
  const base = { cwd: r.cwd, repoURL, github: { token: 'secret-token', cacheDir: false as const } };
  const history = await readPageHistory('guide.md', base);
  expect(history[0].authors).toEqual([
    {
      name: 'Original',
      url: 'https://github.com/original-user',
      avatarUrl: 'https://github.com/original-user.png',
    },
    { name: 'Partner' },
  ]);
  expect(JSON.stringify(history)).not.toContain('secret-token');
  expect(JSON.stringify(history)).not.toContain('@example.test');
  fetcher.mockClear();
  const mapped = await readPageHistory('guide.md', {
    ...base,
    registry: [{ name: 'Public author', mapByEmailAliases: ['original@example.test'] }],
  });
  expect(mapped[0].authors[0]).toEqual({ name: 'Public author' });
  expect(fetcher).not.toHaveBeenCalled();
  await readPageHistory('guide.md', { cwd: r.cwd, repoURL });
  expect(fetcher).not.toHaveBeenCalled();
});

it('skips noreply identities and filtered bot authors before GitHub lookup', async () => {
  const r = repository();
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  r.write('guide.md');
  r.commit('Initial');
  r.git(
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--amend',
    '--no-edit',
    '--author=Known <123+known@users.noreply.github.com>',
  );
  const options = {
    cwd: r.cwd,
    repoURL,
    github: { token: 'secret-token', cacheDir: false as const },
    maxGitLogCount: 1,
  };
  expect((await readPageHistory('guide.md', options))[0].authors[0].url).toBe(
    'https://github.com/known',
  );
  r.git(
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--amend',
    '--no-edit',
    '--author=robot[bot] <bot@example.test>',
  );
  expect((await readPageHistory('guide.md', options))[0].authors).toEqual([]);
  expect(fetcher).not.toHaveBeenCalled();
});

it('looks up only the returned history and shares lookups between concurrent pages', async () => {
  const r = repository();
  r.write('first.md');
  r.write('second.md');
  r.commit('Old');
  r.write('first.md', 'New');
  r.write('second.md', 'New');
  const sha = r.commit('Latest');
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({
      sha,
      commit: { author: { email: 'original@example.test' } },
      author: { login: 'original-user' },
    }),
  );
  vi.stubGlobal('fetch', fetcher);
  const reader = createHistoryReader({
    cwd: r.cwd,
    repoURL,
    maxGitLogCount: 1,
    github: { token: 'secret-token', cacheDir: false },
  });
  const pages = await Promise.all([reader.read('first.md'), reader.read('second.md')]);
  expect(pages.map((p) => p[0].authors[0].url)).toEqual([
    'https://github.com/original-user',
    'https://github.com/original-user',
  ]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(String(fetcher.mock.calls[0]?.[0])).toContain(sha);
});
