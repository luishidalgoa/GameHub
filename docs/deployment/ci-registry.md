# CI build + GHCR registry (no build on the Pi)

The production image is **built in GitHub Actions** and pushed to the GitHub
Container Registry (GHCR). The Raspberry Pi never compiles — it just pulls the
prebuilt image. This removes the slow `next build` from every update on the
device.

**A build does NOT run on every push to `main`.** It runs only when you declare
a **public version** by pushing a `vX.Y.Z` tag (see
[Cutting a public release](#cutting-a-public-release)). That keeps the Actions
minutes — and the rolling `:latest` tag the Pi follows — tied to versions you
explicitly publish, not to every commit.

```
git tag vX.Y.Z  (a public version)
      │
      ▼
GitHub Actions ── buildx + QEMU ──> linux/arm64 image ──> ghcr.io/luishidalgoa/gamehub:{X.Y.Z, latest}
      │                                                            │
      └──> GitHub Release (auto notes)            (Pi) Watchtower / docker compose pull
```

## The workflow

`.github/workflows/docker-publish.yml` runs **only** on `v*` tags and on manual
dispatch (Actions tab → Run workflow). Pushing to `main` does nothing. It has two
jobs:

**`build`** —
1. sets up QEMU + Buildx (the x86 runner builds the **arm64** image, emulated),
2. logs in to GHCR with the built-in `GITHUB_TOKEN` (`packages: write`),
3. builds and pushes `ghcr.io/luishidalgoa/gamehub`. On a `vX.Y.Z` tag the image
   gets `X.Y.Z`, `X.Y`, the short commit SHA, and `latest`. A **manual** dispatch
   build (no tag) is pushed as the branch name (e.g. `main`) — never `latest`, so
   it's a safe test build that won't reach the Pi.

**`release`** (only on a `v*` tag) — publishes a **GitHub Release** for the tag
with auto-generated notes (from merged PRs / commits) plus the `docker pull`
instructions.

GitHub Actions cache (`type=gha`) speeds subsequent CI builds. The first arm64
build under emulation can take a while; that's fine — it's off the Pi.

## Cutting a public release

`latest` (and the Release page) only move when you publish a version tag. To cut
one:

```bash
# bump package.json, create the matching v<x.y.z> tag, commit — all in one:
npm version patch          # or: minor / major
git push --follow-tags     # pushes the commit AND the tag → triggers the workflow
```

or by hand:

```bash
git tag v1.2.0
git push origin v1.2.0
```

That single tag push:

1. builds + pushes `ghcr.io/luishidalgoa/gamehub:1.2.0` **and** `:latest`,
2. creates the GitHub Release **v1.2.0** with auto notes + pull command,
3. the Pi's Watchtower sees the new `:latest` digest and updates (≤5 min),
4. the running container reports **`v1.2.0`** in the **/admin** footer (the
   version is baked into the image from the tag — `APP_VERSION` build-arg → env,
   surfaced via `src/lib/version.ts`; it links to the GitHub release). Local/dev
   builds fall back to the `package.json` version and are marked `dev`.

Pre-releases: tag `v1.2.0-rc.1` if you want the version tag (`1.2.0-rc.1`) on
GHCR **without** moving `latest` — `latest` is only set for clean `vX.Y.Z` tags,
so a release candidate won't auto-deploy to the Pi.

## One-time setup

1. **Trigger the first build** — push a version tag (`git tag v1.0.0 && git push
   origin v1.0.0`) or run the workflow manually (Actions tab → Run workflow). The
   first run creates the package `gamehub` under your account. (Plain pushes to
   `main` do **not** build — by design.)
2. **Make the package public** (so the Pi pulls without auth):
   GitHub → your profile → **Packages** → `gamehub` → **Package settings** →
   **Change visibility** → **Public**.
   - If you keep it **private** instead, the Pi must authenticate once:
     ```bash
     echo <PAT_with_read:packages> | docker login ghcr.io -u luishidalgoa --password-stdin
     ```
3. On the Pi, make the compose use the image instead of building:
   ```bash
   cd "$APP_DIR"
   cp docker-compose.prod.example.yml docker-compose.yml   # then edit ports + ROM mounts
   ```
   The key line is `image: ghcr.io/luishidalgoa/gamehub:latest` (no `build:`).

## Deploying an update

```bash
./deploy.sh update     # git pull (repo files) + docker compose pull + up -d --wait
# equivalently:
docker compose pull && docker compose up -d --wait
```

- No build on the Pi — only an image download (seconds).
- Database migrations still run automatically on container start.
- `--wait` blocks until the healthcheck passes.

## Automatic deploy (Watchtower)

GitHub Actions only builds and **publishes** to GHCR — it does **not** deploy to
the Pi (the runners can't reach your home network). To make the Pi update itself,
the `docker-compose.prod.example.yml` includes a **Watchtower** service:

```yaml
  watchtower:
    image: containrrr/watchtower
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      WATCHTOWER_LABEL_ENABLE: "true"   # only update containers with the enable label
      WATCHTOWER_CLEANUP: "true"        # prune the old image after updating
      WATCHTOWER_POLL_INTERVAL: "300"   # poll GHCR every 5 minutes
```

and the `gamehub` service opts in with:

```yaml
    labels:
      com.centurylinklabs.watchtower.enable: "true"
```

How it works: Watchtower polls GHCR every 5 min; when `:latest` has a new digest
it pulls the image, recreates the `gamehub` container (migrations run on start),
and removes the old image. It's **pull-based** — the Pi reaches out, nothing is
exposed inbound, no SSH keys in CI. Mounting `/var/run/docker.sock` grants it
control of Docker on the host (standard for Watchtower; fine on a personal Pi).

So the full chain becomes automatic — and it only fires when you publish a
version, never on a routine push to `main`:

```
git tag vX.Y.Z → Actions builds arm64 → GHCR :latest → Watchtower (≤5 min) pulls + recreates on the Pi
```

`./deploy.sh update` is still available for an immediate, manual update.

## Pinning / rollback

`latest` points at the newest published **version** (`vX.Y.Z`), not at every
`main` commit. To pin or roll back, set a specific tag in `docker-compose.yml`:

```yaml
image: ghcr.io/luishidalgoa/gamehub:sha-1a2b3c4   # or a vX.Y.Z tag
```
then `docker compose pull && docker compose up -d --wait`.

## Building locally on the Pi (fallback)

If you ever need to build on the device (e.g. testing an un-pushed change),
`./deploy.sh rebuild` still does a local `docker compose build --no-cache`. For
that, the compose must have a `build:` section (use the source-based compose
rather than the registry one).
