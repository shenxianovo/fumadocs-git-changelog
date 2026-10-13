# fumadocs-page-history

Per-page Git history and contributor attribution for Fumadocs. A community-maintained integration.

## Quick start

Requires Node.js 24.14+, Fumadocs 16.17+, and Git with a complete checkout.

```sh
pnpm add fumadocs-page-history
```

Import the stylesheet after your Fumadocs styles:

```css
@import 'fumadocs-page-history/css/preset.css';
```

Register the compiler plugin. The repository URL is the only required setting:

```ts
import { defineConfig } from 'fumadocs-mdx/config';
import { remarkGitChangelog } from 'fumadocs-page-history/remark';

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [
      [
        remarkGitChangelog,
        {
          repository: { url: 'https://github.com/owner/repository' },
        },
      ],
    ],
  },
});
```

Each committed document gets contributors and a collapsible history after its body. No page-template changes are needed. Register the plugin in the documentation collection if your site also compiles other MDX content.

To associate a Git author with a GitHub account, add an optional mapping:

```ts
{
  repository: { url: 'https://github.com/owner/repository' },
  authorMappings: [
    { gitName: 'Alex', githubUsername: 'alex' },
  ],
}
```

Mappings supply profile links and avatars without GitHub API requests. Without mappings, GitHub noreply emails supply accounts; other authors appear with their Git names and initials.

Dates use the reader's browser time zone. Server HTML starts in UTC and switches after hydration. For Chinese labels and dates, follow the [Chinese setup](https://fumadocs-page-history.vercel.app/docs/localization).

History is collected at compilation time. New files need a first commit; restart the development server after Git-only changes. Use a complete checkout (`fetch-depth: 0` in GitHub Actions). The deployed site does not need Git.

See [Setup](https://fumadocs-page-history.vercel.app/docs), [Configuration](https://fumadocs-page-history.vercel.app/docs/configuration), and [Troubleshooting](https://fumadocs-page-history.vercel.app/docs/troubleshooting). Both Radix UI and Base UI are supported. Sätteri uses `gitChangelog` from `fumadocs-page-history/satteri` with the same settings.

Inspired by [Nolebase Git Changelog](https://nolebase-integrations.ayaka.io/pages/en/integrations/git-changelog/); see [NOTICE](./NOTICE).
