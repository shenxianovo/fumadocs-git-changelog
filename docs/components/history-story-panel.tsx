'use client';

import { useId, useState } from 'react';
import { StoryProvider, useStory, useStoryArgs, type WithControlProps } from '@fumadocs/story';
import { useFieldValue } from '@fumari/stf';
import { buttonVariants } from 'fumadocs-ui/components/ui/button';
import type { HistoryPreviewProps } from './history-preview';

const toggles = [
  { name: 'history', label: 'Page history' },
  { name: 'contributors', label: 'Contributors' },
  { name: 'expanded', label: 'Start expanded' },
  { name: 'relativeDates', label: 'Relative dates' },
  { name: 'inlineAuthors', label: 'Inline authors' },
  { name: 'headings', label: 'Section headings' },
  { name: 'empty', label: 'Empty history' },
] as const;

export function HistoryStoryPanel(props: WithControlProps) {
  return (
    <StoryProvider {...props}>
      <Panel />
    </StoryProvider>
  );
}

function Panel() {
  const { Component, presets, variant, setVariant } = useStory();
  const args = useStoryArgs();
  const [previewVersion, setPreviewVersion] = useState(0);
  const exampleId = useId();
  const selectVariant = (value: string) => {
    setVariant(value);
    // Presets and Reset also reset the preview's own expansion and sort state.
    setPreviewVersion((version) => version + 1);
  };

  return (
    <div className="not-prose overflow-hidden rounded-xl border bg-fd-card text-fd-card-foreground">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <label htmlFor={exampleId} className="text-sm font-medium">
          Example
        </label>
        <select
          id={exampleId}
          value={variant}
          onChange={(event) => selectVariant(event.target.value)}
          className="min-w-0 rounded-md border bg-fd-background px-2 py-1 text-sm"
        >
          {presets.map((preset) => (
            <option key={preset.variant} value={preset.variant}>
              {preset.variant}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => selectVariant(variant)}
          className={`${buttonVariants({ variant: 'ghost', size: 'sm' })} ms-auto`}
        >
          Reset
        </button>
      </div>
      <div className="bg-fd-background p-4">
        <Component key={previewVersion} {...args} />
      </div>
      <fieldset aria-label="Preview options" className="grid gap-3 border-t p-4 sm:grid-cols-2">
        <LanguageControl />
        {toggles.map((toggle) => (
          <ToggleControl key={toggle.name} {...toggle} />
        ))}
      </fieldset>
    </div>
  );
}

function LanguageControl() {
  const [language, setLanguage] = useFieldValue<HistoryPreviewProps['language']>(['language']);
  const id = useId();
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-3 text-sm">
      Language
      <select
        id={id}
        value={language ?? 'English'}
        onChange={(event) => setLanguage(event.target.value)}
        className="rounded-md border bg-fd-background px-2 py-1 text-sm"
      >
        <option value="English">English</option>
        <option value="中文">中文</option>
      </select>
    </label>
  );
}

function ToggleControl({ name, label }: (typeof toggles)[number]) {
  const [value, setValue] = useFieldValue<boolean>([name]);
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={value ?? false}
        onChange={(event) => setValue(event.target.checked)}
        className="size-4 shrink-0 accent-fd-primary"
      />
      {label}
    </label>
  );
}
