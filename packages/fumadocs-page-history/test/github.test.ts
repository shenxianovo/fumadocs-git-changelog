import { mkdtemp, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGitHubResolver } from '../src/git/github';

const repositoryUrl = 'https://github.com/example/docs';
const sha = 'a'.repeat(40);
const email = 'private@example.test';
let directory: string;
const request = vi.fn<typeof fetch>();
const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'fumadocs-github-'));
  vi.stubGlobal('fetch', request);
});
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  request.mockReset();
  warn.mockClear();
  await rm(directory, { recursive: true, force: true });
});
function resolver(options = {}) {
  return createGitHubResolver(
    repositoryUrl,
    { token: 'secret-token', cacheDir: directory, ...options },
    async () => directory,
  );
}
function response(login: string | null = 'octocat', headers?: HeadersInit) {
  return Response.json(
    { sha, commit: { author: { email } }, author: login ? { login } : null },
    { headers },
  );
}

it('deduplicates concurrent pages and reuses persistent author mappings without storing private metadata', async () => {
  request.mockResolvedValue(response());
  const resolve = resolver();
  const profiles = await Promise.all([resolve(sha, email), resolve(sha, email)]);
  expect(profiles).toEqual(['octocat', 'octocat']);
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][0]).toBe(`https://api.github.com/repos/example/docs/commits/${sha}`);
  expect(request.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer secret-token' });
  expect(request.mock.calls[0][1]?.redirect).toBe('error');
  expect(await resolver()('b'.repeat(40), email)).toBe('octocat');
  expect(request).toHaveBeenCalledTimes(1);
  const [namespace] = await readdir(directory);
  const files = await readdir(path.join(directory, namespace));
  const contents = (
    await Promise.all(files.map((file) => readFile(path.join(directory, namespace, file), 'utf8')))
  ).join();
  expect(contents).not.toContain(email);
  expect(contents).not.toContain('secret-token');
});

it('only contacts github.com with a token, and warns once when the token is absent', async () => {
  const resolve = resolver({ token: undefined });
  expect(await resolve(sha, email)).toBeUndefined();
  expect(await resolve('b'.repeat(40), email)).toBeUndefined();
  expect(warn).toHaveBeenCalledTimes(1);
  for (const url of [
    'https://gitlab.com/example/docs',
    'https://github.com.evil.test/example/docs',
    'http://github.com/example/docs',
  ]) {
    await createGitHubResolver(
      url,
      { token: 'secret-token', cacheDir: directory },
      async () => directory,
    )(sha, email);
  }
  expect(request).not.toHaveBeenCalled();
});

it.each([401, 403, 429, 500])(
  'stops queued requests on HTTP %i without failing or leaking credentials',
  async (status) => {
    request.mockResolvedValue(
      new Response('secret-token', { status, headers: { 'retry-after': '3600' } }),
    );
    const resolve = resolver();
    expect(
      await Promise.all([resolve(sha, email), resolve('b'.repeat(40), 'other@example.test')]),
    ).toEqual([undefined, undefined]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-token');
    request.mockResolvedValue(response());
    expect(await resolver()(sha, email)).toBe('octocat');
  },
);

it('uses a successful last response but stops when the remaining quota reaches zero', async () => {
  request.mockResolvedValue(
    response('octocat', { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '9999999999' }),
  );
  const resolve = resolver();
  expect(await resolve(sha, email)).toBe('octocat');
  expect(await resolve('b'.repeat(40), 'other@example.test')).toBeUndefined();
  expect(await resolve('c'.repeat(40), email)).toBe('octocat');
  expect(request).toHaveBeenCalledTimes(1);
});

it('enforces a request budget across concurrent pages', async () => {
  request.mockResolvedValue(response());
  const resolve = resolver({ maxRequests: 1 });
  expect(
    await Promise.all([resolve(sha, email), resolve('b'.repeat(40), 'other@example.test')]),
  ).toEqual(['octocat', undefined]);
  expect(request).toHaveBeenCalledTimes(1);
});

it('serializes requests and reuses an author discovered by a different commit', async () => {
  let active = 0;
  request.mockImplementation(async () => {
    active++;
    expect(active).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return response();
  });
  const resolve = resolver();
  expect(await Promise.all([resolve(sha, email), resolve('b'.repeat(40), email)])).toEqual([
    'octocat',
    'octocat',
  ]);
  expect(request).toHaveBeenCalledTimes(1);
});

it.each([404, 422, 200])(
  'briefly caches an unpublished or unassociated commit (%i), without poisoning other commits',
  async (status) => {
    request.mockResolvedValue(status === 200 ? response(null) : new Response(null, { status }));
    expect(await resolver()(sha, email)).toBeUndefined();
    expect(await resolver()(sha, email)).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(1);
    request.mockResolvedValue(
      Response.json({
        sha: 'b'.repeat(40),
        commit: { author: { email } },
        author: { login: 'octocat' },
      }),
    );
    expect(await resolver()('b'.repeat(40), email)).toBe('octocat');
  },
);

it('expires successful and negative entries', async () => {
  const now = Date.now();
  const clock = vi.spyOn(Date, 'now');
  try {
    request.mockResolvedValue(response(null));
    await resolver()(sha, email);
    clock.mockReturnValue(now + 6 * 60_000);
    request.mockResolvedValue(response());
    expect(await resolver()(sha, email)).toBe('octocat');
    clock.mockReturnValue(now + 8 * 24 * 60 * 60_000);
    request.mockResolvedValue(response('new-login'));
    expect(await resolver()(sha, email)).toBe('new-login');
    expect(request).toHaveBeenCalledTimes(3);
  } finally {
    clock.mockRestore();
  }
});

it('ignores mismatched identities, committers, and malformed API payloads', async () => {
  for (const payload of [
    { sha, commit: { author: { email: 'someone-else@example.test' } }, author: { login: 'wrong' } },
    { sha, commit: { author: { email } }, author: null, committer: { login: 'wrong' } },
    { sha: 'b'.repeat(40), commit: { author: { email } }, author: { login: 'wrong' } },
    { sha, commit: { author: { email } }, author: { login: '../wrong' } },
    {},
  ]) {
    request.mockResolvedValue(Response.json(payload));
    expect(await resolver({ cacheDir: false })(sha, email)).toBeUndefined();
  }
});

it('times out and stops queued requests without persisting network errors', async () => {
  request.mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('secret-token')), {
          once: true,
        });
      }),
  );
  const resolve = resolver({ timeoutMs: 15 });
  expect(await Promise.all([resolve(sha, email), resolve('b'.repeat(40), email)])).toEqual([
    undefined,
    undefined,
  ]);
  expect(request).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-token');
  request.mockResolvedValue(response());
  expect(await resolver()(sha, email)).toBe('octocat');
});

it('tolerates corrupt and unwritable caches', async () => {
  request.mockImplementation(async () => response());
  await resolver()(sha, email);
  const [namespace] = await readdir(directory);
  const [entry] = await readdir(path.join(directory, namespace));
  await writeFile(path.join(directory, namespace, entry), '{broken');
  expect(await resolver()(sha, email)).toBe('octocat');
  const file = path.join(directory, 'not-a-directory');
  await writeFile(file, '');
  expect(await resolver({ cacheDir: file })(sha, email)).toBe('octocat');
});

it('serializes different authors and isolates cached results between repositories', async () => {
  let active = 0;
  let peak = 0;
  request.mockImplementation(async (url) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    const requested = String(url).split('/').at(-1)!;
    return Response.json({
      sha: requested,
      commit: { author: { email: requested === sha ? email : 'other@example.test' } },
      author: { login: 'octocat' },
    });
  });
  const resolve = resolver();
  expect(
    await Promise.all([resolve(sha, email), resolve('b'.repeat(40), 'other@example.test')]),
  ).toEqual(['octocat', 'octocat']);
  expect(peak).toBe(1);
  const another = createGitHubResolver(
    'https://github.com/example/another',
    { token: 'secret-token', cacheDir: directory },
    async () => directory,
  );
  await another(sha, email);
  expect(request).toHaveBeenCalledTimes(3);
});
