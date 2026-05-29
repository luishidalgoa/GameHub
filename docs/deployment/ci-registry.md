# CI build + GHCR registry (no build on the Pi)

The production image is **built in GitHub Actions** and pushed to the GitHub
Container Registry (GHCR). The Raspberry Pi never compiles — it just pulls the
prebuilt image. This removes the slow `next build` from every update on the
device.

```
git push (main / tag)
      │
      ▼
GitHub Actions ── buildx + QEMU ──> linux/arm64 image ──> ghcr.io/luishidalgoa/gamehub:latest
                                                                   │
                                              (Pi) docker compose pull && up -d --wait
```

## The workflow

`.github/workflows/docker-publish.yml` runs on push to `main`, on `v*` tags, and
manually (Actions tab → Run workflow). It:

1. sets up QEMU + Buildx (the x86 runner builds the **arm64** image, emulated),
2. logs in to GHCR with the built-in `GITHUB_TOKEN` (`packages: write`),
3. builds and pushes `ghcr.io/luishidalgoa/gamehub` with tags `latest` (main),
   the short commit SHA, and the semver tag when you push `vX.Y.Z`.

GitHub Actions cache (`type=gha`) speeds subsequent CI builds. The first arm64
build under emulation can take a while; that's fine — it's off the Pi.

## One-time setup

1. **Push to `main`** (or run the workflow manually). The first run creates the
   package `gamehub` under your account.
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

## Pinning / rollback

`latest` always points at the newest `main` build. To pin or roll back, set a
specific tag in `docker-compose.yml`:

```yaml
image: ghcr.io/luishidalgoa/gamehub:sha-1a2b3c4   # or a vX.Y.Z tag
```
then `docker compose pull && docker compose up -d --wait`.

## Building locally on the Pi (fallback)

If you ever need to build on the device (e.g. testing an un-pushed change),
`./deploy.sh rebuild` still does a local `docker compose build --no-cache`. For
that, the compose must have a `build:` section (use the source-based compose
rather than the registry one).
