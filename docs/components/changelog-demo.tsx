'use client';

import { useState } from 'react';
import { TranslationProvider } from '@fuma-translate/react';
import { GitChangelog, GitContributors } from 'fumadocs-page-history/ui';
import { zhCN } from 'fumadocs-page-history/i18n';
import { buttonVariants } from 'fumadocs-ui/components/ui/button';
import commits from '@/lib/demo-history.json';

export function ChangelogDemo() {
  const [contributors, setContributors] = useState(true);
  const [history, setHistory] = useState(true);
  const [relative, setRelative] = useState(true);
  const [chinese, setChinese] = useState(false);
  const locale = chinese ? 'zh-CN' : 'en';
  const toggles = [
    { label: 'Contributors', value: contributors, toggle: () => setContributors(!contributors) },
    { label: 'Page history', value: history, toggle: () => setHistory(!history) },
    { label: 'Relative dates', value: relative, toggle: () => setRelative(!relative) },
    { label: '中文', value: chinese, toggle: () => setChinese(!chinese) },
  ];
  return (
    <div>
      <div aria-label="Demo options" className="not-prose mb-8 flex flex-wrap gap-2">
        {toggles.map(({ label, value, toggle }) => (
          <button
            key={label}
            type="button"
            aria-pressed={value}
            onClick={toggle}
            className={buttonVariants({ variant: value ? 'secondary' : 'outline', size: 'sm' })}
          >
            {label}
          </button>
        ))}
      </div>
      <TranslationProvider translations={chinese ? zhCN().value : {}}>
        {history ? (
          <GitChangelog
            commits={commits}
            defaultExpanded
            showContributors={contributors}
            commitsRelativeTime={relative}
            locale={locale}
          />
        ) : contributors ? (
          <GitContributors commits={commits} locale={locale} />
        ) : (
          <p className="text-sm text-fd-muted-foreground">
            Both sections are disabled. The page content stays visible.
          </p>
        )}
      </TranslationProvider>
    </div>
  );
}
