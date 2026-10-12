'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'fumadocs-core/link';
import type { HistoryAuthor } from '../index';

export function safeURL(value?: string): string | undefined {
  // Reject control characters that could disguise a URL scheme.
  // oxlint-disable-next-line no-control-regex
  if (!value || /[\u0000-\u0020\\]/.test(value)) return undefined;
  return /^(https?:\/\/|\/(?!\/)|#)/i.test(value) ? value : undefined;
}

export function HistoryLink({
  href,
  children,
  className,
  title,
}: {
  href?: string;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  const safe = safeURL(href);
  return safe ? (
    <Link href={safe} className={className} title={title}>
      {children}
    </Link>
  ) : (
    <span className={className} title={title}>
      {children}
    </span>
  );
}

export function Author({
  author,
  locale,
  compact = false,
}: {
  author: HistoryAuthor;
  locale: string;
  compact?: boolean;
}) {
  const avatar = safeURL(author.avatarUrl);
  const name = author.i18n?.[locale] ?? author.i18n?.[locale.split('-')[0]] ?? author.name;
  return (
    <HistoryLink
      href={author.url}
      title={name}
      className={`fgc-author ${compact ? 'fgc-author-compact' : ''}`}
    >
      {avatar ? (
        <img
          src={avatar}
          alt={compact ? name : ''}
          width={compact ? 22 : 36}
          height={compact ? 22 : 36}
          loading="lazy"
          className="fgc-avatar"
        />
      ) : (
        <span aria-hidden="true" className="fgc-avatar fgc-avatar-fallback">
          {Array.from(name)[0] ?? '?'}
        </span>
      )}
      <span className={compact ? 'sr-only' : 'fgc-author-name'}>{name}</span>
    </HistoryLink>
  );
}

/** Stable initial server/client output, then refresh relative dates once a minute. */
export function useNow() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function relativeDate(value: string, now: number, locale: string): string {
  const seconds = (Date.parse(value) - now) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
    ['second', 1],
  ];
  const [unit, size] =
    units.find(([, size]) => Math.abs(seconds) >= size) ?? units[units.length - 1];
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
    Math.round(seconds / size),
    unit,
  );
}

export function isFreshChange(date: string, now: number | null): boolean {
  const age = now === null ? Infinity : now - Date.parse(date);
  return age >= 0 && age < 86_400_000;
}

export function HistoryDate({
  value,
  locale,
  timeZone,
  relative,
  now,
}: {
  value: string;
  locale: string;
  timeZone: string;
  relative?: boolean;
  now: number | null;
}) {
  const parsed = new Date(value);
  const absolute = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone }).format(
    parsed,
  );
  const title = new Intl.DateTimeFormat(locale, {
    dateStyle: 'full',
    timeStyle: 'long',
    timeZone,
  }).format(parsed);
  return (
    <time dateTime={value} title={title}>
      {relative && now !== null ? relativeDate(value, now, locale) : absolute}
    </time>
  );
}
