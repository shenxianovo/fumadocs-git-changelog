import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

export interface GitHubOptions {
  /** Build-time only. Pass process.env.GITHUB_TOKEN; never sent to the browser. */
  token?: string;
  /** Relative to the Git root. Defaults to node_modules/.cache/fumadocs-git-changelog. */
  cacheDir?: string | false;
  /** Maximum requests per reader/compiler worker. Default: 100. */
  maxRequests?: number;
  /** Timeout per request, in milliseconds. Default: 5000. */
  timeoutMs?: number;
}

const login = z.string().regex(/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i);
const cacheEntry = z.object({
  version: z.literal(1),
  expiresAt: z.number(),
  login: login.nullable(),
});
const apiCommit = z.object({
  sha: z.string(),
  commit: z.object({ author: z.object({ email: z.string() }).nullable() }),
  author: z.object({ login }).nullable(),
});
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const successTTL = 7 * 24 * 60 * 60_000;
const missingTTL = 5 * 60_000;

/** One resolver per reader: bounded serial requests, shared by all its pages. */
export function createGitHubResolver(
  repoURL: string,
  options: GitHubOptions,
  getRoot: () => Promise<string>,
): (sha: string, email: string) => Promise<string | undefined> {
  const url = new URL(repoURL);
  const repository = url.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '');
  const supported = url.origin === 'https://github.com' && /^[\w.-]+\/[\w.-]+$/.test(repository);
  const token = options.token?.trim();
  const maxRequests = options.maxRequests ?? 100;
  const timeoutMs = options.timeoutMs ?? 5000;
  let requests = 0;
  let stopped = false;
  let warned = false;
  let queue: Promise<unknown> = Promise.resolve();
  const pending = new Map<string, Promise<string | undefined>>();
  const authors = new Map<string, string>();
  let directory: Promise<string | undefined> | undefined;

  function warn(reason: string) {
    if (warned) return;
    warned = true;
    console.warn(`[git-changelog] ${reason} Keeping local author information where needed.`);
  }
  const cacheDirectory = () =>
    (directory ??= (async () => {
      if (options.cacheDir === false) return;
      return path.resolve(
        await getRoot(),
        options.cacheDir ?? 'node_modules/.cache/fumadocs-git-changelog',
        hash(repository.toLowerCase()),
      );
    })());

  async function readCache(key: string) {
    try {
      const dir = await cacheDirectory();
      if (!dir) return;
      const entry = cacheEntry.parse(
        JSON.parse(await readFile(path.join(dir, `${key}.json`), 'utf8')),
      );
      if (entry.expiresAt > Date.now()) return entry.login;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        warn('Could not read the GitHub author cache.');
    }
  }
  async function writeCache(key: string, value: string | null) {
    let temporary: string | undefined;
    try {
      const dir = await cacheDirectory();
      if (!dir) return;
      await mkdir(dir, { recursive: true });
      const file = path.join(dir, `${key}.json`);
      temporary = `${file}.${randomUUID()}.tmp`;
      await writeFile(
        temporary,
        JSON.stringify({
          version: 1,
          login: value,
          expiresAt: Date.now() + (value === null ? missingTTL : successTTL),
        }),
      );
      await rename(temporary, file);
    } catch {
      warn('Could not write the GitHub author cache.');
    } finally {
      if (temporary) await rm(temporary, { force: true }).catch(() => {});
    }
  }

  async function resolve(sha: string, email: string): Promise<string | undefined> {
    if (!supported) {
      warn('Automatic author lookup only supports https://github.com repositories.');
      return;
    }
    if (!token) {
      warn('GitHub author lookup needs a GITHUB_TOKEN.');
      return;
    }
    if (
      !Number.isSafeInteger(maxRequests) ||
      maxRequests < 1 ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1
    ) {
      warn('GitHub request limits must be positive integers.');
      return;
    }
    const authorKey = `author-${hash(email)}`;
    const missingKey = `commit-${hash(`${sha}:${email}`)}`;
    const cached = authors.get(email) ?? (await readCache(authorKey));
    if (cached) {
      authors.set(email, cached);
      return cached;
    }
    if ((await readCache(missingKey)) === null || stopped) return;
    if (requests >= maxRequests) {
      stopped = true;
      warn('GitHub author lookup reached its request budget.');
      return;
    }
    requests++;
    try {
      const response = await fetch(`https://api.github.com/repos/${repository}/commits/${sha}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error',
      });
      if (response.headers.get('x-ratelimit-remaining') === '0') {
        stopped = true;
        warn('GitHub API quota exhausted; further requests skipped.');
      }
      if (response.status === 404 || response.status === 422) {
        await writeCache(missingKey, null);
        return;
      }
      if (!response.ok) {
        stopped = true;
        warn(`GitHub author lookup stopped (HTTP ${response.status}).`);
        return;
      }
      const parsed = apiCommit.safeParse(await response.json());
      if (
        !parsed.success ||
        parsed.data.sha !== sha ||
        parsed.data.commit.author?.email.toLowerCase() !== email
      )
        return;
      if (!parsed.data.author) {
        await writeCache(missingKey, null);
        return;
      }
      const username = parsed.data.author.login;
      authors.set(email, username);
      await writeCache(authorKey, username);
      return username;
    } catch {
      stopped = true;
      warn('GitHub author lookup failed or timed out; further requests skipped.');
    }
  }

  return (sha, email) => {
    email = email.trim().toLowerCase();
    const key = `${sha}:${email}`;
    let result = pending.get(key);
    if (!result) {
      result = queue.then(() => resolve(sha, email));
      queue = result;
      pending.set(key, result);
    }
    return result;
  };
}
