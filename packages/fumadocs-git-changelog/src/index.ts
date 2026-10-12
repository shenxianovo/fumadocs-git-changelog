/** Public metadata only. Git identities and email aliases stay in the Git reader. */
export interface HistoryAuthor {
  name: string;
  avatarUrl?: string;
  url?: string;
  i18n?: Record<string, string>;
}

export interface HistoryCommit {
  sha: string;
  shortSha: string;
  date: string;
  authoredAt: string;
  committedAt: string;
  message: string;
  description: string;
  authors: HistoryAuthor[];
  url: string;
  repoURL?: string;
  tags?: { name: string; url: string }[];
}

export interface ChangelogFrontmatter {
  authors?: string[];
  gitChangelog?:
    | boolean
    | {
        disableChangelog?: boolean;
        disableContributors?: boolean;
      };
}

/** Per-page controls; history and attribution can be enabled independently. */
export function shouldShowChangelog(frontmatter: ChangelogFrontmatter = {}): boolean {
  const options = frontmatter.gitChangelog;
  return options !== false && !(typeof options === 'object' && options.disableChangelog);
}

export function shouldShowContributors(frontmatter: ChangelogFrontmatter = {}): boolean {
  const options = frontmatter.gitChangelog;
  return options !== false && !(typeof options === 'object' && options.disableContributors);
}

export interface HistoryContributor extends HistoryAuthor {
  commitsCount: number;
}

/** Count each author once per revision; explicit contributors need not have a commit. */
export function getContributors(
  commits: readonly HistoryCommit[],
  additional: readonly HistoryAuthor[] = [],
): HistoryContributor[] {
  const contributors = new Map<string, HistoryContributor>();
  const key = (author: HistoryAuthor) => author.url ?? author.name;
  for (const commit of commits) {
    for (const [id, author] of new Map(commit.authors.map((author) => [key(author), author]))) {
      const previous = contributors.get(id);
      contributors.set(id, {
        ...previous,
        ...author,
        commitsCount: (previous?.commitsCount ?? 0) + 1,
      });
    }
  }
  for (const author of additional) {
    const previous = contributors.get(key(author));
    contributors.set(key(author), {
      ...previous,
      ...author,
      commitsCount: previous?.commitsCount ?? 0,
    });
  }
  return [...contributors.values()].sort(
    (a, b) => b.commitsCount - a.commitsCount || a.name.localeCompare(b.name),
  );
}
