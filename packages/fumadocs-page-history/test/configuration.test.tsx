import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { compile } from '@mdx-js/mdx';
import { afterAll, expect, it, vi } from 'vitest';
import { remarkGitChangelog, type GitChangelogOptions } from '../src/remark';
import { mapAuthor } from '../src/git';
import { createFooter } from '../src/plugins/shared';

const directory = mkdtempSync(path.join(tmpdir(), 'page-history-config-'));
const content = path.join(directory, 'content');
mkdirSync(content);
const file = path.join(content, 'guide.mdx');
writeFileSync(file, '# Guide');
const git = (...args: string[]) =>
  execFileSync('git', args, {
    cwd: directory,
    stdio: 'pipe',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  });
git('init');
git('add', '.');
git(
  '-c',
  'user.name=Original',
  '-c',
  'user.email=private@example.test',
  '-c',
  'commit.gpgsign=false',
  'commit',
  '-m',
  'Write guide',
);
afterAll(() => rmSync(directory, { recursive: true, force: true }));

async function build(options: GitChangelogOptions, source = file) {
  return String(
    await compile(
      { path: source, value: '# Guide' },
      {
        remarkPlugins: [[remarkGitChangelog, options]],
      },
    ),
  );
}

it('requires only the repository URL in an ordinary checkout', async () => {
  const code = await build({ repository: { url: 'https://github.com/example/docs' } });
  expect(code).toContain('Write guide');
  expect(code).toContain('https://github.com/example/docs/commit/');
});

it('maps an explicit Git identity without publishing selectors or making network requests', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch');
  try {
    const code = await build({
      repository: { url: 'https://github.com/example/docs' },
      authorMappings: [
        { gitName: 'Original', gitEmail: 'private@example.test', githubUsername: 'example-user' },
      ],
    });
    expect(code).toContain('https://github.com/example-user.png');
    expect(code).not.toContain('private@example.test');
    expect(code).not.toContain('authorMappings');
    expect(fetcher).not.toHaveBeenCalled();
  } finally {
    fetcher.mockRestore();
  }
});

it('requires both selectors to match when a mapping supplies a name and an email', () => {
  const mappings = [
    { gitName: 'Original', gitEmail: 'private@example.test', githubUsername: 'example-user' },
  ];
  expect(mapAuthor(' ORIGINAL ', 'PRIVATE@example.test', mappings).url).toBe(
    'https://github.com/example-user',
  );
  expect(mapAuthor('Other', 'private@example.test', mappings).url).toBeUndefined();
  expect(mapAuthor('Original', 'other@example.test', mappings).url).toBeUndefined();
});

it('reads the original Git path for copied content without caller-side path code', async () => {
  const copy = mkdtempSync(path.join(tmpdir(), 'page-history-copy-'));
  try {
    writeFileSync(path.join(copy, 'guide.mdx'), '# Guide');
    const code = await build(
      {
        repository: { url: 'https://github.com/example/docs', directory },
        content: { directory: copy, pathInRepository: 'content' },
      },
      path.join(copy, 'guide.mdx'),
    );
    expect(code).toContain('Write guide');
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
});

it('explains empty history once per file in development, without changing rendered content', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.stubEnv('NODE_ENV', 'development');
  try {
    const footer = createFooter({ repository: { url: 'https://github.com/example/docs' } });
    const tree = { type: 'root' as const, children: [] };
    const newFile = path.join(content, 'new.mdx');
    expect(await footer(newFile, {}, tree)).toBeUndefined();
    expect(await footer(newFile, {}, tree)).toBeUndefined();
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][0]).toContain('No Git history for content/new.mdx');
    expect(info.mock.calls[0][0]).toContain('first commit');
    expect(await footer(file, {}, tree)).toBeDefined();
    expect(info).toHaveBeenCalledTimes(1);
    info.mockClear();
    vi.stubEnv('NODE_ENV', 'production');
    expect(await footer(path.join(content, 'other.mdx'), {}, tree)).toBeUndefined();
    expect(info).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllEnvs();
    info.mockRestore();
  }
});

it('rejects incomplete account mappings rather than guessing identities', () => {
  expect(() => mapAuthor('Original', '', [{ githubUsername: 'user' } as never])).toThrow(
    'at least one',
  );
});
