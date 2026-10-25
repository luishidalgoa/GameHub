import { ExternalLink, Wifi } from 'lucide-react'
import { parseOnlineProviders } from '@/lib/online/providers'

/** Enlaces a los proyectos de juego en línea de la plataforma (p. ej. Nextendo en Switch). */
export function OnlineProviderLinks({ raw }: { raw: string | null | undefined }) {
  const providers = parseOnlineProviders(raw)
  if (providers.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      {providers.map(p => (
        <a
          key={p.key}
          href={p.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-secondary border border-border hover:bg-accent text-sm font-medium transition-colors"
        >
          <Wifi className="w-4 h-4 text-emerald-400" />
          Proyecto {p.label}
          <ExternalLink className="w-3 h-3 text-muted-foreground" />
        </a>
      ))}
    </div>
  )
}
