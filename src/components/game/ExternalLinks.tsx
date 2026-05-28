'use client'

import { Github, ExternalLink, Link2 } from 'lucide-react'

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
function githubInfo(url: string): { owner: string; repo: string } | null {
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

export function ExternalLinks({ raw, title }: { raw: string | null | undefined; title: string }) {
  const links = parseExternalLinks(raw)
  if (links.length === 0) return null

  return (
    <div className="mb-6">
      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">{title}</h4>
      <div className="space-y-2">
        {links.map((link, i) => {
          const gh = githubInfo(link.url)
          return (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg border border-border bg-secondary/40 p-3 transition-colors group hover:border-primary/40"
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 flex-shrink-0 ${gh ? 'text-foreground' : 'text-primary'}`}>
                  {gh ? <Github className="w-5 h-5" /> : <Link2 className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                    <span className="truncate">{link.title || (gh ? `${gh.owner}/${gh.repo}` : link.url)}</span>
                    <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                  </p>
                  {gh && (
                    <p className="text-xs text-muted-foreground/70 font-mono truncate">{gh.owner}/{gh.repo}</p>
                  )}
                  {link.description && (
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{link.description}</p>
                  )}
                </div>
              </div>
            </a>
          )
        })}
      </div>
    </div>
  )
}
