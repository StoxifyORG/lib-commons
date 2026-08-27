# Changesets

This directory holds [changesets](https://github.com/changesets/changesets) —
markdown files describing pending changes. Each file declares which packages
changed and the semver bump (patch/minor/major). On release, `changeset version`
consumes them (bumping versions, writing CHANGELOGs, rewriting `workspace:*`
ranges) and `changeset publish` ships the new versions to GitHub Packages.

Add one with: `pnpm changeset`
