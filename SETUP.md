# Consuming & Publishing `@stoxifyorg/*`

This file is the canonical "path" for every microservice repo and for publishing
the shared packages.

## 1. Publish the shared packages (do this first)

**Automated (recommended, used in CI):**
1. Make your change in `packages/<pkg>`.
2. `pnpm changeset` → pick package + bump type + message (drops a file in `.changeset/`).
3. Commit & push → the **Release shared packages** workflow opens a
   *“Version Packages”* PR → merge it → it builds & publishes to GitHub Packages.

**Manual first publish (no changeset needed for v1.0.0):**
```bash
cd stoxify-shared
pnpm install && pnpm build
NODE_AUTH_TOKEN="<PAT-with-write:packages>" pnpm release
```
`NODE_AUTH_TOKEN` must be a GitHub PAT with the `write:packages` scope (or the
built-in `GITHUB_TOKEN` of this repo, which the `release.yml` workflow already uses).

## 2. Set up ANY service repo to consume `@stoxifyorg/*`

Copy this shape (reference impl: `../auth-service`):

**`.npmrc`** (committed, safe — no secret):
```
@stoxifyorg:registry=https://npm.pkg.github.com
```

**`pnpm-workspace.yaml`** (allows native builds; pnpm v11 reads this, not package.json):
```yaml
packages:
  - '.'
onlyBuiltDependencies:
  - bcrypt
  - esbuild
  - msgpackr-extract
  - protobufjs
  - "@firebase/util"
```

**`package.json`**: list the shared packages as normal deps, e.g.
```json
"@stoxifyorg/auth-utils": "^1.0.0",
"@stoxifyorg/database": "^1.0.0",
"@stoxifyorg/logger": "^1.0.0",
"@stoxifyorg/middleware": "^1.0.0",
"@stoxifyorg/redis": "^1.0.0",
"@stoxifyorg/shared-types": "^1.0.0"
```

**`Dockerfile`**: write a LITERAL token into `.npmrc` at build time (committed
`.npmrc` cannot use `${ENV}` expansion in pnpm v11):
```dockerfile
ARG GITHUB_TOKEN
RUN echo "@stoxifyorg:registry=https://npm.pkg.github.com" > .npmrc && \
    echo "//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}" >> .npmrc
COPY package.json ./
RUN pnpm install --no-frozen-lockfile && rm -f .npmrc
```

**`.github/workflows/deploy.yml`**: build with the read token, update only this
service's Container App:
```yaml
az acr build --registry stoxifyacr \
  --image stoxifyacr.azurecr.io/<svc>:${{ github.sha }} \
  --build-arg GITHUB_TOKEN=${{ secrets.PACKAGES_TOKEN }} --file Dockerfile .
az containerapp update --name <svc> --resource-group rg-stoxify-prod \
  --image stoxifyacr.azurecr.io/<svc>:${{ github.sha }}
```

## 3. Local auth (one-time per machine)

The token goes in **user-level** `~/.npmrc` (where env expansion works), not the
repo:
```bash
pnpm config set //npm.pkg.github.com/:_authToken "<PAT-with-read:packages>"
```
In CI, store that same PAT as repo secret `PACKAGES_TOKEN`.

## 4. Verify a package installs locally

```bash
# confirm it is on the registry
npm view @stoxifyorg/database versions --registry=https://npm.pkg.github.com

# install into a service
cd auth-service
pnpm install
```
