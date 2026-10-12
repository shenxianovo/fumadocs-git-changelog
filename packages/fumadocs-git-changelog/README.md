# fumadocs-git-changelog

Per-page Git history and contributor attribution for Fumadocs.

Register once in your Fumadocs MDX configuration to automatically append each page's contributors and Git history:

```ts
import { defineConfig } from 'fumadocs-mdx/config';
import { remarkGitChangelog } from 'fumadocs-git-changelog/remark';

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [
      [
        remarkGitChangelog,
        {
          repoURL: 'https://github.com/owner/repository',
        },
      ],
    ],
  },
});
```

```css
@import 'fumadocs-git-changelog/css/preset.css';
```

For Sätteri, use `gitChangelog` from `fumadocs-git-changelog/satteri` in `satteriOptions.mdastPlugins`. Collections with their own compiler options must register it there. No page-template changes are required. The plugins read Git during compilation; new commits require a rebuild. Standalone Git reader and UI exports remain available for custom layouts. The React components receive serializable public metadata and work with both Fumadocs UI variants. Use a complete checkout (`fetch-depth: 0` in CI); deployments without Git can import a JSON snapshot generated during the build.

Optionally set `github: { token: process.env.GITHUB_TOKEN }` in the plugin options to resolve primary authors through GitHub during compilation. Lookups are cached and bounded; missing tokens, rate limits, and network failures fall back to local author information. Without this option, no GitHub API requests are made.

This is a community-maintained package. See the [documentation source](https://github.com/shenxianovo/fumadocs-git-changelog/tree/main/docs/content/docs) for author mapping, translations, display options, and deployment details.

Inspired by [Nolebase Git Changelog](https://nolebase-integrations.ayaka.io/pages/en/integrations/git-changelog/); see [NOTICE](./NOTICE).
