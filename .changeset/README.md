# Changesets

Run `pnpm changeset` for user-facing package changes. Run `pnpm changeset version` to update package versions and changelogs. Commit and push the release commit to `main`, then push its matching `v<version>` tag. CI deploys documentation from `main` and publishes npm releases from version tags after validation.
