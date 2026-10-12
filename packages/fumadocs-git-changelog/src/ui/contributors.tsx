'use client';

import { useTranslations } from '@fuma-translate/react';
import { Heading } from 'fumadocs-ui/components/heading';
import { getContributors, type HistoryAuthor, type HistoryCommit } from '../index';
import { Author } from './shared';
import { GitChangelogLabel } from './label';

export interface GitContributorsProps {
  commits: readonly HistoryCommit[];
  /** Public author metadata, including authors resolved from frontmatter on the server. */
  authors?: readonly HistoryAuthor[];
  locale?: string;
  hideContributorsHeader?: boolean;
  id?: string;
  className?: string;
}

export function GitContributors({
  commits,
  authors = [],
  locale = 'en',
  hideContributorsHeader = false,
  id,
  className = '',
}: GitContributorsProps) {
  const headingId = id ?? 'git-contributors';
  const t = useTranslations({ note: 'git changelog' });
  const contributors = getContributors(commits, authors);
  return (
    <section
      className={`fgc fgc-section fgc-contributors ${className}`}
      aria-labelledby={hideContributorsHeader ? undefined : headingId}
      aria-label={hideContributorsHeader ? t('Contributors') : undefined}
      data-git-contributors
    >
      {!hideContributorsHeader && (
        <Heading as="h2" id={headingId} className="fgc-heading">
          <GitChangelogLabel section="contributors" />
        </Heading>
      )}
      {contributors.length ? (
        <ul className="fgc-author-list not-prose">
          {contributors.map((author) => (
            <li
              key={author.url ?? author.name}
              className="fgc-contributor"
              title={`${author.commitsCount} ${author.commitsCount === 1 ? t('Commit') : t('Commits')}`}
            >
              <Author author={author} locale={locale} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="fgc-empty">{t('No contributors yet.')}</p>
      )}
    </section>
  );
}
