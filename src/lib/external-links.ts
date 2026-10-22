export interface ExternalLinkItem {
  title: string
  description?: string
  url: string
}

/** Safely parse the JSON string stored in Game.externalLinks. */
export function parseExternalLinks(raw: string | null | undefined): ExternalLinkItem[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .filter((l) => l && typeof l.url === 'string' && l.url.trim())
      .map((l) => ({
        title:       String(l.title ?? ''),
        description: l.description ? String(l.description) : undefined,
        url:         String(l.url),
      }))
  } catch {
    return []
  }
}

/** Detect github.com URLs and pull out owner/repo for richer display. */
export function githubInfo(url: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(url)
    if (!/(^|\.)github\.com$/i.test(u.hostname)) return null
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return null
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') }
  } catch {
    return null
  }
}
