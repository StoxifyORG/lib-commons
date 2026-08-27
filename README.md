# stoxify-shared (lib-commons)

Shared TypeScript packages for the **Stoxify** platform, published as versioned,
installable npm packages to **GitHub Packages** and consumed by each microservice
repo (`auth-service`, `backend-stocxify`, …) as normal dependencies.

- **Repo:** `StoxifyORG/lib-commons`
- **Root package:** `stoxify-shared` (private workspace root — not published)
- **Monorepo:** pnpm workspaces + [Changesets](https://github.com/changesets/changesets) for versioning & release
- **Registry:** GitHub Packages (`https://npm.pkg.github.com`), packages are **private** to the `StoxifyORG` org

## Packages (`@stoxifyorg/*`)

| Package | Purpose |
|---|---|
| `@stoxifyorg/shared-types` | Shared TS types & enums (events, enums). No internal deps. |
| `@stoxifyorg/logger` | Structured logger (pino). No internal deps. |
| `@stoxifyorg/redis` | Redis client, pub/sub channels, key builders. Deps: `logger`. |
| `@stoxifyorg/database` | Mongoose models, connection, seeds, analytics helpers. Deps: `logger`, `shared-types`. |
| `@stoxifyorg/auth-utils` | JWT, nonce, ECDSA signature, AES, hashing. Deps: `logger`, `redis`, `shared-types`. |
| `@stoxifyorg/middleware` | Fastify middleware (verifyJWT, requirePower, interServiceAuth, rateLimiter, …). Deps: most of the above. |

> The `shared/` folder (no `package.json`) is intentionally excluded — it is unused by active code.

### Why the `@stoxifyorg` scope (not `@stoxify`)
GitHub Packages only allows an npm scope that **exactly matches the publishing
owner's login**. The org login is `StoxifyORG`, so packages must be published under
`@stoxifyorg`. Publishing under `@stoxify` is rejected with
`403 permission_denied: create_package`. The scope was renamed from `@stoxify` →
`@stoxifyorg` (see *Notable changes*).

## Local development

```bash
pnpm install
pnpm build          # runs `tsc` in every package -> packages/*/dist
```

## Repository layout

- `packages/*/` — each publishable package (own `package.json` with `name`,
  `main`, `types`, `files: ["dist"]`, and `publishConfig.registry`).
- `pnpm-workspace.yaml` — workspace globs + native-build allow-list (bcrypt, esbuild, …).
- `.changeset/` — Changesets config + pending changeset files.
- `.github/workflows/release.yml` — the **Release shared packages** workflow.

## Publishing

Packages are published to GitHub Packages as **private** packages. Each
`package.json` sets:

```json
"publishConfig": { "registry": "https://npm.pkg.github.com" }
```

so the target registry is automatic.

### CI release flow (Changesets)

The **Release shared packages** workflow (`.github/workflows/release.yml`) does:

1. `pnpm install`
2. `pnpm build` — **separate step** that builds every package
3. Changesets action runs `pnpm release` (= `changeset publish`) to publish to GitHub Packages

The build and publish are **two separate steps on purpose**. The Changesets
`publish` command must **not** be `pnpm build && pnpm release` — pnpm passes the
trailing `&& pnpm release` into the recursive build, and `tsc` fails with
`TS6231: Could not resolve the path '&&'` (see *Notable changes*).

On a push to `main` with no pending changesets, the workflow builds and exits 0
(nothing to publish). Adding a changeset opens a *“Version Packages”* PR; merging
it bumps versions and republishes.

### Authentication (important)

npm auth in CI uses the repo secret **`PUBLISH_TOKEN`** — a GitHub PAT with
`read:packages` + `write:packages` — injected as `NODE_AUTH_TOKEN`.

We do **not** use the default `GITHUB_TOKEN`: it is repo-scoped and cannot read
packages that were published by a *user* PAT (they are not linked to the repo), so
`changeset publish`'s `npm info` pre-check failed with `403 read_package`.
`PUBLISH_TOKEN` is an org-member PAT that can read/write all `@stoxifyorg/*`
packages.

**One-time setup:** add a repository secret `PUBLISH_TOKEN`
(Settings → Secrets and variables → Actions → New repository secret) whose value
is a PAT with `read:packages` + `write:packages`.

### Day-to-day release

1. Make your change in `packages/<pkg>`.
2. `pnpm changeset` → pick the affected package(s), choose bump
   (`patch` / `minor` / `major`), write a short message. This drops a markdown
   file in `.changeset/`.
3. Commit **only the changeset file** and push to `main`.
4. The **Release shared packages** workflow opens (or updates) a
   *“Version Packages”* PR that bumps versions, updates CHANGELOGs, and rewrites
   `workspace:*` dep ranges. Review & merge it.
5. Merging that PR triggers the workflow again; it builds and runs `pnpm release`
   → new versions land in GitHub Packages.
6. In the consuming service repo, bump the `@stoxifyorg/*` range
   (e.g. `^1.0.0` → `^1.1.0`), run `pnpm install`, commit, and redeploy.

### Manual publish (local)

```bash
pnpm install && pnpm build
NODE_AUTH_TOKEN="<PAT-with-write:packages>" pnpm release
```

> **Initial publish already done:** all six `@stoxifyorg/*` packages are live at
> `1.0.0` on GitHub Packages. From now on, always go through the changeset flow
> for version bumps.

### Verify a publish

```bash
npm view @stoxifyorg/database versions --registry=https://npm.pkg.github.com
```

(Reading private packages requires auth — see *Consuming* below.)

## Consuming in a service repo

1. Add a committed, secret-free `.npmrc`:
   ```
   @stoxifyorg:registry=https://npm.pkg.github.com
   ```
2. Authenticate (the scope → registry mapping above means only `@stoxifyorg/*`
   is fetched from GitHub Packages; everything else still comes from public npm):
   - **Local (one-time):** `pnpm config set //npm.pkg.github.com/:_authToken "<PAT-with-read:packages>" --location user`
   - **CI:** store a read PAT as a repo secret `PACKAGES_TOKEN` and write it into
     `.npmrc` at build time (see `SETUP.md` for the Dockerfile / workflow pattern).
3. Install: `pnpm add @stoxifyorg/logger @stoxifyorg/database ...`
4. Use it:
   ```ts
   import { logger } from "@stoxifyorg/logger";
   import { connect } from "@stoxifyorg/database";
   ```

Consumers must be members of `StoxifyORG` with read access (packages are private).

## Notable changes

These are the fixes made while getting the monorepo publishing cleanly to GitHub Packages:

- **Scope rename `@stoxify` → `@stoxifyorg`.** GitHub Packages requires the npm
  scope to match the owner login (`StoxifyORG`). Publishing under `@stoxify`
  returned `403 permission_denied: create_package`. Renamed all package `name`
  fields, internal `workspace:*` / `workspace:^` deps, source imports, the `.npmrc`
  registry key, and docs. First publish of `@stoxifyorg/*@1.0.0` then succeeded.

- **CI build/publish split.** The workflow originally used
  `publish: pnpm build && pnpm release`. pnpm appended `&& pnpm release` to the
  recursive build, so each package ran `tsc && pnpm release` and `tsc` errored with
  `TS6231: Could not resolve the path '&&'`. Fixed by building in a separate step
  and setting `publish: pnpm release`.

- **CI auth via `PUBLISH_TOKEN`.** `changeset publish` runs `npm info` to check
  existing versions, which needs **read** access. The repo-scoped `GITHUB_TOKEN`
  could not read the packages (they were published via a user PAT and are not linked
  to the repo), causing `403 read_package`. Switched npm auth to the `PUBLISH_TOKEN`
  repo secret (an org PAT with `read:packages` + `write:packages`).

## Switch to public npmjs.org (optional)

If you would rather the packages be publicly installable:

1. Remove the `publishConfig.registry` line from each `package.json`.
2. Set `NODE_AUTH_TOKEN` to an npmjs.com token in the publish workflow.
