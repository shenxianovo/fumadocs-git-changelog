import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Check the actual documentation build, including the collection's MDX preset.
const html = (await readFile('.next/server/app/docs.html', 'utf8')).replace(
  /<script\b[^>]*>[\s\S]*?<\/script>/g,
  '',
);
assert.ok(!html.includes('[toc]'), 'TOC-only headings must not appear in the page body');
for (const id of ['git-contributors', 'git-history']) {
  assert.equal(html.match(new RegExp(`id="${id}"`, 'g'))?.length, 1, `${id} must appear once`);
  assert.ok(html.includes(`href="#${id}"`), `${id} must have a navigation link`);
}
console.log('Built documentation footer checks passed.');
