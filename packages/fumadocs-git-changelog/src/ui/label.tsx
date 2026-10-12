'use client';

import { useTranslations } from '@fuma-translate/react';

/** Shared translated labels for the rendered sections and the compiled table of contents. */
export function GitChangelogLabel({ section }: { section: 'contributors' | 'history' }) {
  const t = useTranslations({ note: 'git changelog' });
  return section === 'contributors' ? t('Contributors') : t('Page history');
}
