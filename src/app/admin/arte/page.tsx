import { db } from '@/lib/db'
import { ArtJobPanel } from '@/components/admin/ArtJobPanel'
import { ArtGameList } from '@/components/admin/ArtGameList'
import { AdminButton } from '@/components/admin/AdminButton'
import Link from 'next/link'
import { purgeExpiredManualArt } from '@/lib/art-manual'
import { ART_KINDS, artTitle, artKindOf } from '@/lib/art-catalog'
import { artFilterFrom, artSummary } from '@/lib/art-list'
import { type ArtMissing, type ArtView } from '@/lib/art-value'

export const dynamic = 'force-dynamic'

const VIEWS: ArtView[] = ['valiosos', 'todos', 'pobres']

const EMPTY: Record<ArtView, string> = {
  valiosos: 'Ningún juego valioso con estos filtros. Cambia la vista a «Todos los visibles» para ver el resto.',
  todos: 'Ningún juego visible con estos filtros.',
  pobres: 'Ningún juego con metadatos pobres con estos filtros.',
}

// Arte (#142). Por defecto: juegos valiosos (metadatos completos y popular en RAWG o descargado).
// Esta página es referencia; el arte de cada juego se edita en su panel, sin subir archivos aquí.
export default async function AdminArtPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  await purgeExpiredManualArt()
  const filter = artFilterFrom(searchParams)
  const query = new URLSearchParams({ vista: filter.vista, falta: filter.falta, plataforma: filter.plataforma }).toString()

  // Counts are read in the database, not by loading every game for the page.
  const visibleWhere = { isHidden: false }
  const [summary, platforms, byKind, cover, banner, fondo, logo, capturas] = await Promise.all([
    artSummary(filter),
    db.platform.findMany({ where: { enabled: true }, select: { name: true }, orderBy: { sortOrder: 'asc' } }),
    db.gameImage.groupBy({ by: ['kind'], _count: { _all: true } }),
    db.game.count({ where: { ...visibleWhere, coverPath: { not: null } } }),
    db.game.count({ where: { ...visibleWhere, backdropKind: 'banner' } }),
    db.game.count({ where: { ...visibleWhere, backdropPath: { not: null }, OR: [{ backdropKind: null }, { backdropKind: { not: 'banner' } }] } }),
    db.game.count({ where: { ...visibleWhere, logoPath: { not: null } } }),
    db.game.count({ where: { ...visibleWhere, screenshotPaths: { not: null } } }),
  ])
  const visible = summary.visible
  const files = (kind: string) => byKind.find(k => k.kind === kind)?._count._all ?? 0

  // Game-level: what each game shows. Then one row per kind in the data model, with the files the repository holds.
  const fieldRows = [
    { label: 'Portada', has: cover, missing: null },
    { label: 'Banner', has: banner, missing: null },
    { label: 'Fondo', has: fondo, missing: 'fondo' as const },
    { label: 'Logo', has: logo, missing: 'logo' as const },
    { label: 'Capturas', has: capturas, missing: null },
  ]

  // Every kind the repository holds: the catalogue first, in its order, then any kind it does not know.
  const stored = byKind.map(k => k.kind).filter(k => !k.startsWith('manual-'))
  const catalogue = ART_KINDS.map(k => k.kind)
  const kinds = [...catalogue, ...stored.filter(k => !catalogue.includes(k) && !artKindOf(k))]
  const kindRows = kinds
    .map(k => ({ kind: k, label: artTitle(k), group: artKindOf(k)?.group ?? 'other', files: files(k) }))
    .filter(r => r.files > 0 || catalogue.includes(r.kind))

  const viewLabel: Record<ArtView, string> = {
    valiosos: `Valiosos (${summary.views.valiosos})`,
    todos: `Todos los visibles (${summary.views.todos})`,
    pobres: `Metadatos pobres (${summary.views.pobres})`,
  }
  const select = 'bg-secondary border border-border rounded-md px-2.5 py-2 text-sm'
  // The chips count what each «Falta» option would show, and link to it; the same view and platform stay.
  const chips: { falta: ArtMissing; label: string; count: number }[] = [
    { falta: 'ambos', label: 'Fondo o logo', count: summary.chips.ambos },
    { falta: 'fondo', label: 'Falta fondo', count: summary.chips.fondo },
    { falta: 'logo', label: 'Falta logo', count: summary.chips.logo },
  ]
  const chipHref = (falta: ArtMissing) => `/admin/arte?${new URLSearchParams({ vista: filter.vista, falta, plataforma: filter.plataforma }).toString()}`

  return (
    <div className="space-y-8">
      <ArtJobPanel />

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div>
          <h3 className="font-semibold">Vista por tipo</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Juegos visibles ({visible}) con cada arte, y los ficheros que guarda el repositorio por categoría de LaunchBox. Los nombres son los del modelo de datos.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr><th className="py-2">Tipo</th><th className="py-2 text-right">Juegos con este arte</th><th className="py-2 text-right">Sin este arte</th><th className="py-2 text-right">Ficheros en el repositorio</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {fieldRows.map(r => (
              <tr key={r.label}>
                <td className="py-2">
                  {r.missing
                    ? <Link href={`/admin/arte?falta=${r.missing}`} className="hover:underline">{r.label}</Link>
                    : r.label}
                </td>
                <td className="py-2 text-right tabular-nums">{r.has}</td>
                <td className="py-2 text-right tabular-nums">{visible - r.has}</td>
                <td className="py-2 text-right tabular-nums">—</td>
              </tr>
            ))}
            {kindRows.map(r => (
              <tr key={r.kind} className="text-muted-foreground">
                <td className="py-2 pl-4">{r.label} <span className="text-xs opacity-60">· {r.group}</span></td>
                <td className="py-2 text-right tabular-nums">—</td>
                <td className="py-2 text-right tabular-nums">—</td>
                <td className="py-2 text-right tabular-nums">{r.files}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div>
          <h3 className="font-semibold">Sin fondo o sin logo</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {summary.selected.toLocaleString('es-ES')} resultados con estos filtros. Pulsa «Editar arte» para ver y cambiar el arte de un juego en un panel.
          </p>
        </div>

        <div role="group" aria-label="Qué falta" className="flex flex-wrap gap-2">
          {chips.map(c => (
            <Link
              key={c.falta}
              href={chipHref(c.falta)}
              aria-current={filter.falta === c.falta ? 'true' : undefined}
              className={`px-3 py-1.5 rounded-full text-xs ${filter.falta === c.falta ? 'bg-violet-600 text-white' : 'bg-secondary hover:bg-secondary/80'}`}
            >
              {c.label} <span className="opacity-70 tabular-nums">{c.count}</span>
            </Link>
          ))}
        </div>

        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Vista
            <select name="vista" defaultValue={filter.vista} className={select}>
              {VIEWS.map(v => <option key={v} value={v}>{viewLabel[v]}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Falta
            <select name="falta" defaultValue={filter.falta} className={select}>
              <option value="ambos">Fondo o logo</option>
              <option value="fondo">Fondo</option>
              <option value="logo">Logo</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Plataforma
            <select name="plataforma" defaultValue={filter.plataforma} className={select}>
              <option value="todas">Todas</option>
              {platforms.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
          </label>
          <AdminButton variant="primary" type="submit">Aplicar</AdminButton>
        </form>

        {/* Keyed by the filter, so a new filter starts again from the first page. */}
        <ArtGameList key={query} query={query} emptyText={EMPTY[filter.vista]} />
      </div>
    </div>
  )
}
