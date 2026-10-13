import path from 'node:path';
import { expect, it } from 'vitest';
import { mapContentPath } from '../src/paths';

it.each([
  [path.posix, '/build/content/core/guide.mdx', '/build/content'],
  [path.win32, 'C:\\build\\content\\core\\guide.mdx', 'C:\\build\\content'],
])('maps native source paths to the same Git identity', (diskPath, file, directory) => {
  expect(mapContentPath(file, directory, 'apps/docs/content', diskPath)).toBe(
    'apps/docs/content/core/guide.mdx',
  );
});

it.each([
  [path.posix, '/build/content-other/page.mdx', '/build/content'],
  [path.win32, 'C:\\build\\content-other\\page.mdx', 'C:\\build\\content'],
  [path.win32, 'D:\\build\\content\\page.mdx', 'C:\\build\\content'],
])('rejects files outside the declared source directory', (diskPath, file, directory) => {
  expect(() => mapContentPath(file, directory, 'content', diskPath)).toThrow('content.directory');
});

it.each(['../secret', '/absolute', 'C:/absolute', 'content/../../secret'])(
  'rejects a repository prefix outside the checkout: %s',
  (prefix) => {
    expect(() => mapContentPath('/build/guide.mdx', '/build', prefix, path.posix)).toThrow(
      'repository-relative',
    );
  },
);

it('preserves literal backslashes in POSIX file names', () => {
  expect(mapContentPath('/build/guide\\draft.mdx', '/build', '.', path.posix)).toBe(
    'guide\\draft.mdx',
  );
  expect(mapContentPath('/build/\\draft.mdx', '/build', '.', path.posix)).toBe('\\draft.mdx');
});
