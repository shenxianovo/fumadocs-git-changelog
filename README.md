# fumadocs-git-changelog

Per-page Git history and contributors for Fumadocs. A community-maintained integration inspired by [Nolebase Git Changelog](https://nolebase-integrations.ayaka.io/pages/en/integrations/git-changelog/).

[Documentation](https://fumadocs-git-changelog.vercel.app/docs) · [Live demo](https://fumadocs-git-changelog.vercel.app/docs/demo)

- Automatically append contributors and history with MDX or Sätteri.
- Enable each section independently, globally or per page.
- Follow file renames, credit co-authors, and display release tags.
- Use Fumadocs components, themes, accessible collapse controls, and translations.
- Optionally resolve GitHub avatars and profile links at build time, with caching and bounded requests.

## Quick start

Requires Node.js 24.14 or later, Git with a complete checkout, and Fumadocs 16.17 or later.

```sh
pnpm add fumadocs-git-changelog
```

```css
/* After your Fumadocs styles */
@import 'fumadocs-git-changelog/css/preset.css';
```

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

Register the plugin only for the documentation collection if your site also compiles blog posts or other MDX content. Collections with their own compiler options register it there. React homepages are unaffected.

History is collected during compilation. Rebuild after new commits; restart the development server after Git-only changes. In CI, use `actions/checkout` with `fetch-depth: 0`.

See [Setup](docs/content/docs/index.mdx), [Configuration](docs/content/docs/configuration.mdx), and [Advanced API](docs/content/docs/manual.mdx). Both Radix UI (`fumadocs-ui`) and Base UI (`fumadocs-ui` aliased to `@fumadocs/base-ui`) are supported.

## Workspace

```text
packages/fumadocs-git-changelog/  Package, CSS, and tests
docs/                           Fumadocs documentation and interactive demo
.changeset/                     Package version notes
.github/workflows/ci.yml         Validation and documentation deployment
```

The workspace follows the package-and-docs layout used by [Typesense's Fumadocs adapter](https://github.com/typesense/typesense-fumadocs-adapter), using pnpm. The docs app consumes the local package through `workspace:*`; all Fumadocs dependencies come from npm.

```sh
pnpm install
pnpm docs-dev        # http://127.0.0.1:3013
pnpm check           # format, lint, tests, types, package and docs build
```

`pnpm docs-dev` builds the package before starting Next.js. When editing package code, run `pnpm --filter fumadocs-git-changelog dev` in another terminal. Restart the docs server after Git-only changes.

The demo uses a saved snapshot of this project's public Git history with shenxianovo's GitHub profile, so displaying its history does not require a token. Other docs pages use this repository's actual Git history. An optional `GITHUB_TOKEN` can be supplied to the docs build to resolve authors of commits already available in its configured GitHub repository.

## Releases

Use `pnpm changeset` for package changes. Before a release, run `pnpm check` and inspect the package with `pnpm --filter fumadocs-git-changelog exec npm pack --dry-run`. Package versioning and publishing are manual.

## Documentation deployment

After validation passes, pushes to `main` deploy the docs and demo to Vercel. Pull requests only run validation. GitHub Actions builds from a complete Git checkout and uploads the prebuilt output; Vercel's automatic Git deployments are disabled to avoid duplicate deployments.

The Vercel project uses the `docs` root directory with files outside the root directory included, the Next.js preset, and Node.js 24. Build settings are in `docs/vercel.json`.

GitHub Actions requires the repository variables `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`, and the repository secret `VERCEL_TOKEN`. The docs build uses the workflow's read-only `GITHUB_TOKEN` for optional author lookup.

## License and credits

MIT. See [LICENSE](LICENSE) and [NOTICE](packages/fumadocs-git-changelog/NOTICE). Originally developed as an integration proposal for Fumadocs; maintained independently as a community package.
