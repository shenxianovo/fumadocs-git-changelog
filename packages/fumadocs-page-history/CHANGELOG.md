# fumadocs-page-history

## 0.3.1

### Patch Changes

- Show author names beside inline avatars and keep date separators with their dates when long commit messages wrap. Allow multiple inline authors to wrap without overflowing the history panel.

## 0.3.0

### Minor Changes

- Replace flat repository and registry settings with `repository` and explicit `authorMappings`. Support copied content through declarative locations with native path resolution. Explain missing history in development, use the reader's browser time zone after hydration, and reorganize setup, localization, configuration, and troubleshooting documentation.

  This changes the configuration interface: consumers must update repository, account-mapping, and manual UI settings. The public commit URL context is now `repositoryUrl`; time zones are detected automatically.

## 0.2.0

### Minor Changes

- Rename the package and repository to fumadocs-page-history. Update installation instructions, import paths, build-time component injection, and documentation branding to Page History.

## 0.1.1

### Patch Changes

- a261025: Align release tag labels with the surrounding commit text, including wrapped history rows.
  Use horizontal Git commit icons in the page history list.
