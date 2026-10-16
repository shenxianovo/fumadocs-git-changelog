import { x } from 'tinyexec';
import path from 'node:path';
import { normalizeRepositoryPath } from '../paths';
import { createGitHubResolver, type GitHubOptions } from './github';
import { createPathHistoryReader } from './history';
import type { HistoryAuthor, HistoryCommit, Repository } from '../index';

export type { GitHubOptions } from './github';

export type AuthorMapping = {
  githubUsername: string;
  displayName?: string;
  avatar?: string;
  url?: string;
  i18n?: Record<string, string>;
} & ({ gitName: string; gitEmail?: string } | { gitName?: string; gitEmail: string });

export interface HistoryOptions {
  repository: Repository;
  authorMappings?: readonly AuthorMapping[];
  /** Optional build-time GitHub account lookup. Disabled unless configured. */
  github?: GitHubOptions;
  /** Exclude bot identities from attribution, while keeping their commits. Default: true. */
  excludeBots?: boolean;
  /** Optional cap on the page history. Defaults to the complete history. */
  maxGitLogCount?: number;
  /** Additional historical paths, relative to the Git root. Build-time only.
   * Receives the normalized repository-relative source path; the current path
   * is always included. No extension or migration paths are guessed.
   */
  getHistoryPaths?: (sourcePath: string) => readonly string[];
  getCommitURL?: (commit: HistoryCommit) => string;
  getReleaseTagURL?: (tag: string, commit: HistoryCommit) => string;
}

const normalize = (value: string) => value.trim().toLocaleLowerCase('en-US');

function findMappedAuthor(name: string, email: string, mappings: readonly AuthorMapping[]) {
  for (const mapping of mappings) {
    if (!mapping.githubUsername?.trim() || (!mapping.gitName?.trim() && !mapping.gitEmail?.trim()))
      throw new Error(
        'Each author mapping needs githubUsername and at least one of gitName or gitEmail.',
      );
  }
  const matches = (mapping: AuthorMapping) =>
    (mapping.gitName === undefined || normalize(mapping.gitName) === normalize(name)) &&
    (mapping.gitEmail === undefined || normalize(mapping.gitEmail) === normalize(email));
  // Email-qualified mappings take precedence over name-only mappings.
  return (
    mappings.find((mapping) => mapping.gitEmail !== undefined && matches(mapping)) ??
    mappings.find(matches)
  );
}

export function mapAuthor(
  name: string,
  email: string,
  authorMappings: readonly AuthorMapping[] = [],
): HistoryAuthor {
  const author = findMappedAuthor(name, email, authorMappings);
  // Once mapped, matched Git identities use the account's public identity.
  const username = author
    ? author.githubUsername
    : email.match(/^(?:\d+\+)?([a-z\d](?:[a-z\d-]*[a-z\d])?)@users\.noreply\.github\.com$/i)?.[1];
  const profile = username ? `https://github.com/${encodeURIComponent(username)}` : undefined;
  const avatarUrl = author?.avatar ?? (profile ? `${profile}.png` : undefined);
  const url = author?.url ?? profile;
  return {
    name: author?.displayName ?? author?.githubUsername ?? name,
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
      'repository.url must be an HTTP(S) repository URL without credentials, query, or fragment.',
    );
  }
  return url.href.replace(/\/$/, '');
}

/** Parse the six NUL-delimited fields emitted by readPageHistory. */
export function parseGitLog(
  output: string,
  options: Pick<HistoryOptions, 'repository' | 'authorMappings' | 'excludeBots' | 'getCommitURL'>,
): HistoryCommit[] {
  return parseGitLogWithAuthors(output, options).commits;
}

function parseGitLogWithAuthors(output: string, options: Parameters<typeof parseGitLog>[1]) {
  const unresolved = new Map<HistoryAuthor, { sha: string; email: string }>();
  const commits: HistoryCommit[] = [];
  const repositoryUrl = repositoryURL(options.repository.url);
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
      const author = mapAuthor(identity.name, identity.email, options.authorMappings);
      if (
        identity === identities[0] &&
        !author.url &&
        !findMappedAuthor(name, email, options.authorMappings ?? [])
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
      url: `${repositoryUrl}/commit/${sha}`,
      repositoryUrl,
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
    (root ??= run(
      ['rev-parse', '--show-toplevel'],
      options.repository.directory ?? process.cwd(),
    ).then((v) => v.trim()));
  const git = async (args: string[]) => run(['--literal-pathspecs', ...args], await getRoot());
  const readPathHistory = createPathHistoryReader(git);
  const resolveGitHub = options.github
    ? createGitHubResolver(repositoryURL(options.repository.url), options.github, getRoot)
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
    const normalizeSource = (source: string) =>
      normalizeRepositoryPath(path.normalize(source).split(path.sep).join('/'));
    const source = normalizeSource(sourcePath);
    const sources = new Set([
      source,
      ...(options.getHistoryPaths?.(source) ?? []).map(normalizeSource),
    ]);
    const repositoryUrl = repositoryURL(options.repository.url);
    const tags = await getTags();
    const output = await readPathHistory([...sources]);
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
            `${repositoryUrl}/releases/tag/${encodeURIComponent(name)}`,
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

/** Resolve explicit frontmatter contributors through the same public account mappings. */
export function resolveAuthors(
  names: readonly string[],
  authorMappings: readonly AuthorMapping[] = [],
): HistoryAuthor[] {
  return names.map((name) => {
    const mapping = authorMappings.find((entry) =>
      [entry.githubUsername, entry.displayName, entry.gitName].some(
        (value) => value !== undefined && normalize(value) === normalize(name),
      ),
    );
    return mapping
      ? mapAuthor(mapping.gitName ?? name, mapping.gitEmail ?? '', [mapping])
      : mapAuthor(name, '', authorMappings);
  });
}
