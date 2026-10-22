'use client'

import { Github, ExternalLink, Link2 } from 'lucide-react'
import { parseExternalLinks, githubInfo, type ExternalLinkItem } from '@/lib/external-links'

export { parseExternalLinks, type ExternalLinkItem }

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

/** The same links as plain rows (no cards), the icon follows the source: GitHub or a generic link. */
export function ExternalLinkRows({ links }: { links: ExternalLinkItem[] }) {
  return (
    <ul className="flex flex-col">
      {links.map((link, i) => {
        const gh = githubInfo(link.url)
        return (
          <li key={i} className="flex items-center gap-3.5 py-3 border-b border-border/60 text-sm last:border-b-0">
            <span className="flex-shrink-0 text-muted-foreground">
              {gh ? <Github className="w-5 h-5" aria-label="GitHub" /> : <Link2 className="w-5 h-5" aria-label="Enlace" />}
            </span>
            <span className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-2">
              <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
                {link.title || (gh ? `${gh.owner}/${gh.repo}` : link.url)}
              </a>
              {(link.description || gh) && (
                <span className="text-xs text-muted-foreground">
                  {[gh ? `${gh.owner}/${gh.repo}` : null, link.description].filter(Boolean).join(' · ')}
                </span>
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
