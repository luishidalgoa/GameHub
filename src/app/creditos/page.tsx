import { ExternalLink } from 'lucide-react'
import { CONSOLE_MODELS } from '@/lib/consoles'

export const metadata = { title: 'Créditos — GameHub' }

export default function CreditsPage() {
  const models = Object.values(CONSOLE_MODELS)
  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Créditos</p>
        <h1 className="text-2xl font-bold">Modelos 3D de las consolas</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Las consolas que flotan en la portada son obra de estos autores y se publican en Sketchfab
          con licencia Creative Commons. Los archivos se han optimizado (compresión de geometría y
          texturas) sin cambiar su aspecto. El modelo de la Wii es CC BY-SA, así que su archivo
          adaptado se comparte con esa misma licencia.
        </p>
      </div>

      <ul className="divide-y divide-border border-y border-border">
        {models.map(m => (
          <li key={m.slug} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3">
            <div>
              <a href={m.source} target="_blank" rel="noopener noreferrer"
                 className="font-medium hover:underline inline-flex items-center gap-1.5">
                {m.name}<ExternalLink className="w-3 h-3 text-muted-foreground" />
              </a>
              <p className="text-sm text-muted-foreground">
                por <a href={m.authorUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">{m.author}</a>
              </p>
            </div>
            <a href={m.licenseUrl} target="_blank" rel="noopener noreferrer"
               className="text-xs font-mono text-muted-foreground hover:underline">
              {m.license.replace(/^CC-/, 'CC ').replace(/-4\.0$/, ' 4.0')}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
