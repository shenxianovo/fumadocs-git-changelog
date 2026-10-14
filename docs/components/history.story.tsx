import { defineStory } from '@/lib/story';
import { HistoryPreview, type HistoryPreviewProps } from './history-preview';

const defaults = {
  language: 'English',
  history: true,
  contributors: true,
  expanded: false,
  relativeDates: true,
  inlineAuthors: false,
  headings: true,
  empty: false,
} satisfies HistoryPreviewProps;

export const story = defineStory({
  Component: HistoryPreview,
  args: [
    { variant: 'Default', initial: defaults },
    { variant: 'Expanded', initial: { ...defaults, expanded: true } },
    {
      variant: 'Compact',
      initial: { ...defaults, expanded: true, headings: false, contributors: false },
    },
    { variant: 'Contributors only', initial: { ...defaults, history: false } },
    { variant: 'Empty', initial: { ...defaults, empty: true } },
    { variant: '中文', initial: { ...defaults, language: '中文', expanded: true } },
    {
      variant: 'Co-authors',
      initial: { ...defaults, expanded: true, inlineAuthors: true },
      fixed: { coauthors: true },
    },
  ],
});
