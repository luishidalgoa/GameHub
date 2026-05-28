/**
 * Resolve a stored coverPath value to a public-facing URL.
 *
 * Pure string logic with NO server-only dependencies (no AWS SDK / Prisma), so
 * it is safe to import from client components as well as the server.
 *
 *  - null / undefined        → null
 *  - already http/https URL  → return as-is (external cover like coverUrl)
 *  - legacy /covers/ path     → null (folder removed; treat as no cover)
 *  - S3 key (e.g. covers/…)   → route through /api/covers/proxy/… so the image
 *    is always served same-origin (HTTPS), avoiding mixed-content blocks and
 *    relative-path 404s (e.g. on /admin/games/[id]).
 */
export function resolveCoverPath(coverPath: string | null | undefined): string | null {
  if (!coverPath) return null
  if (coverPath.startsWith('http://') || coverPath.startsWith('https://')) return coverPath
  if (coverPath.startsWith('/covers/')) return null
  return `/api/covers/proxy/${coverPath}`
}
