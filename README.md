# stoxify-shared

Single source of truth for all shared `@stoxify/*` packages, published to the
**GitHub Packages** npm registry and consumed by each microservice repo
(`auth-service`, `user-service`, …) as normal versioned dependencies.

## Packages
- `@stoxify/auth-utils` — JWT, nonce, ECDSA signature, AES, hashing.
- `@stoxify/database` — Mongoose models, connection, seeds, analytics helpers.
- `@stoxify/logger` — structured logger.
- `@stoxify/middleware` — Fastify middleware (verifyJWT, requirePower, interServiceAuth, rateLimiter, …).
- `@stoxify/redis` — Redis client, pub/sub channels, key builders.
- `@stoxify/shared-types` — shared TS types & enums (events, enums).

> `shared` (no package.json) is intentionally excluded — it is unused by active code.

## Local dev
```bash
pnpm install
pnpm build
```

## Publish to GitHub Packages
Push to `main` (or run the workflow manually) → `publish.yml` builds and
publishes every package. Each `package.json` carries
`"publishConfig": { "registry": "https://npm.pkg.github.com" }`, so the publish
targets GitHub Packages automatically. The publishing identity's token needs
`write:packages`.

To consume from a service repo, set in that repo's `.npmrc`:
```
@stoxify:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

## Publishing — detailed steps

Versioning uses **Changesets** (already configured). Each package versions
independently; `workspace:*` inter-deps are rewritten automatically on release.

### One-time setup
1. Create the repo `Stocxify/stoxify-shared` and push this folder.
2. No extra secrets needed in *this* repo — the workflow uses the default
   `GITHUB_TOKEN` (it has `packages: write` + `contents: write` via the
   workflow `permissions:` block).
3. Consuming repos (`auth-service`, etc.) must set a PAT secret `PACKAGES_TOKEN`
   with `read:packages` so they can pull `@stoxify/*` from GitHub Packages.

### Day-to-day release flow
1. Make your code change in one or more packages under `packages/`.
2. `pnpm install` (pulls `@changesets/cli`).
3. `pnpm changeset` → pick the affected package(s), choose bump
   (`patch` / `minor` / `major`), write a short message. This drops a markdown
   file in `.changeset/`.
4. Commit **only the changeset file** and push to `main`.
5. The **Release shared packages** workflow opens (or updates) a
   *“Version Packages”* PR that bumps versions, updates CHANGELOGs, and rewrites
   dep ranges. Review & merge it.
6. Merging that PR triggers the workflow again; with no pending changesets it
   runs `pnpm build && pnpm release` → new versions land in GitHub Packages.
7. In the consuming service repo, bump the `@stoxify/*` range
   (e.g. `^1.0.0` → `^1.1.0`), run `pnpm install`, commit, and redeploy.

### Manual publish (no bot)
```bash
pnpm install
pnpm build
pnpm changeset          # create a changeset (or skip for first publish)
pnpm version-packages   # bumps versions + changelogs (consumes changesets)
pnpm release            # publishes to GitHub Packages
```

### First-time / initial publish
Versions start at `1.0.0` and are not yet on the registry, so a one-off direct
publish works without a changeset:
```bash
pnpm install && pnpm build && pnpm release
```
After that, always go through the changeset flow for bumps.

### Verify a publish
```bash
npm view @stoxify/database versions --registry=https://npm.pkg.github.com
```

## Switch to public npmjs.org (optional)
If you prefer the public registry instead of GitHub Packages:
1. Remove the `publishConfig.registry` line from each package's `package.json`.
2. Set `NODE_AUTH_TOKEN` to an npmjs.com token in the publish workflow.
# lib-commons
