// App version surfaced in /admin. Source of truth, in order:
//   1. APP_VERSION env — baked into the image by CI from the published git tag
//      (vX.Y.Z → "X.Y.Z"). This is the version "associated with the public
//      release". See .github/workflows/docker-publish.yml + Dockerfile.
//   2. package.json "version" — fallback for local dev / non-CI builds.
//
// The GitHub release URL is derived from package.json `repository` (a single
// canonical config point) — no URLs hardcoded in components.

import pkg from '../../package.json'

const SEMVER = /^\d+\.\d+\.\d+(?:[-+].+)?$/

export interface AppVersionInfo {
  /** Raw version string ("1.2.0", "main", "dev", …). */
  version: string
  /** True when `version` looks like a real release (`X.Y.Z`). */
  isSemver: boolean
  /** True when the version was baked by CI from a published tag. */
  isReleaseBuild: boolean
  /** Short commit SHA the image was built from, if known. */
  commit: string | null
  /** ISO build timestamp, if known. */
  buildTime: string | null
  /** Link to the matching GitHub release (or the releases list), if derivable. */
  releaseUrl: string | null
}

/** Normalize a package.json `repository` value to an https web URL. */
function repoWebUrl(): string | null {
  const raw = (pkg as { repository?: string | { url?: string } }).repository
  const url = typeof raw === 'string' ? raw : raw?.url
  if (!url) return null
  return url
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/^ssh:\/\/git@/, 'https://')
}

export function getAppVersion(): AppVersionInfo {
  const baked = process.env.APP_VERSION?.trim() || ''
  const version = baked || (pkg as { version?: string }).version || 'dev'
  const isSemver = SEMVER.test(version)
  const isReleaseBuild = Boolean(baked) && isSemver

  const base = repoWebUrl()
  const releaseUrl = base
    ? isReleaseBuild
      ? `${base}/releases/tag/v${version}` // exact tag — guaranteed to exist
      : `${base}/releases` // dev/manual build: the tag may not exist yet
    : null

  return {
    version,
    isSemver,
    isReleaseBuild,
    commit: process.env.APP_COMMIT?.trim().slice(0, 7) || null,
    buildTime: process.env.APP_BUILD_TIME?.trim() || null,
    releaseUrl,
  }
}
