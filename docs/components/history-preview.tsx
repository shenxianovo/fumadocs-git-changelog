'use client';

import { TranslationProvider } from '@fuma-translate/react';
import { GitChangelog, GitContributors } from 'fumadocs-page-history/ui';
import { zhCN } from 'fumadocs-page-history/i18n';
import commits from '@/lib/demo-history.json';

// An explicit fixture for exercising multiple authors and missing avatars.
const coauthorCommits = commits.map((commit) => ({
  ...commit,
  authors: [...commit.authors, { name: 'Demo co-author with a longer display name' }],
}));

export interface HistoryPreviewProps {
  language?: 'English' | '中文';
  history?: boolean;
  contributors?: boolean;
  expanded?: boolean;
  relativeDates?: boolean;
  inlineAuthors?: boolean;
  headings?: boolean;
  empty?: boolean;
  coauthors?: boolean;
}

export function HistoryPreview({
  language = 'English',
  history = true,
  contributors = true,
  expanded = false,
  relativeDates = true,
  inlineAuthors = false,
  headings = true,
  empty = false,
  coauthors = false,
}: HistoryPreviewProps) {
  const chinese = language === '中文';
  const locale = chinese ? 'zh-CN' : 'en';
  const historyCommits = empty ? [] : coauthors ? coauthorCommits : commits;

  return (
    <div className="history-preview">
      <TranslationProvider translations={chinese ? zhCN().value : {}}>
        {history ? (
          <GitChangelog
            // Changing the initial expansion control starts a fresh preview.
            key={`${expanded}-${empty}`}
            id="demo-history"
            contributorsId="demo-contributors"
            commits={historyCommits}
            defaultExpanded={expanded}
            showContributors={contributors}
            commitsRelativeTime={relativeDates}
            displayAuthorsInsideCommitLine={inlineAuthors}
            hideChangelogHeader={!headings}
            hideContributorsHeader={!headings}
            locale={locale}
          />
        ) : contributors ? (
          <GitContributors
            id="demo-contributors"
            commits={historyCommits}
            hideContributorsHeader={!headings}
            locale={locale}
          />
        ) : (
          <p className="py-4 text-sm text-fd-muted-foreground">
            {chinese
              ? '两个区块均已关闭，页面正文仍然可见。'
              : 'Both sections are disabled. The page content stays visible.'}
          </p>
        )}
      </TranslationProvider>
    </div>
  );
}
