import type { PlatformChain, ChainStep, SourceReadiness } from '@/lib/metadata/chain-view'

// Read-only view of the metadata chain: per platform, the order of the sources and
// whether each one can answer there. The order is in the code; what the admin
// chooses (primary source per field) is above this panel.

const STATE_STYLE: Record<ChainStep['state'], string> = {
  ready:   'text-emerald-400',
  missing: 'text-amber-400',
  na:      'text-muted-foreground',
}
const STATE_LABEL: Record<ChainStep['state'], string> = {
  ready:   'Listo',
  missing: 'Falta',
  na:      'No aplica',
}

const BADGES: Array<{ key: keyof SourceReadiness; label: string }> = [
  { key: 'launchbox',  label: 'LaunchBox' },
  { key: 'rawg',       label: 'RAWG' },
  { key: 'metacritic', label: 'Metacritic' },
  { key: 'libretro',   label: 'libretro' },
  { key: 'store',      label: 'Tienda' },
]

export function MetadataChainPanel({ chains }: { chains: PlatformChain[] }) {
  return (
    <section className="bg-card border border-border rounded-xl p-6 space-y-4">
      <div>
        <h3 className="font-semibold">Cadena de metadatos por plataforma</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Orden en que GameHub consulta las fuentes y si cada una puede responder para esa plataforma.
          Solo lectura: el orden está en el código. Lo que eliges arriba es la fuente primaria de cada campo.
        </p>
      </div>

      {chains.length === 0 && (
        <p className="text-sm text-muted-foreground">No hay plataformas activas.</p>
      )}

      <div className="space-y-2">
        {chains.map(chain => (
          <details key={chain.slug} className="rounded-md border border-border">
            <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 text-sm">
              <span className="font-medium">{chain.name}</span>
              <span className="flex flex-wrap gap-1.5 text-xs">
                {BADGES.map(b => (
                  <span
                    key={b.key}
                    className={`rounded px-1.5 py-0.5 border ${chain.sources[b.key] ? 'border-emerald-700/50 text-emerald-400' : 'border-border text-muted-foreground line-through'}`}
                  >
                    {b.label}
                  </span>
                ))}
              </span>
            </summary>
            <ol className="px-3 pb-3 space-y-2">
              {chain.steps.map((step, i) => (
                <li key={step.id} className="flex gap-3 text-sm">
                  <span className="w-5 shrink-0 text-right text-xs text-muted-foreground pt-0.5">{i + 1}.</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{step.title}</span>
                      <span className={`text-xs ${STATE_STYLE[step.state]}`}>{STATE_LABEL[step.state]}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </details>
        ))}
      </div>
    </section>
  )
}
