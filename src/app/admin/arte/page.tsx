import { db } from '@/lib/db'
import { ArtJobPanel } from '@/components/admin/ArtJobPanel'
import Link from 'next/link'
import { purgeExpiredManualArt } from '@/lib/art-manual'
import { ART_KINDS, artTitle, artKindOf } from '@/lib/art-catalog'
import {
  DEFAULT_ART_FILTER, hasRichMetadata, isValuableForArt, selectArtGames,
  type ArtFilter, type ArtMissing, type ArtView,
} from '@/lib/art-value'

export const dynamic = 'force-dynamic'

const PAGE = 60
const VIEWS: ArtView[] = ['valiosos', 'todos', 'pobres']
const MISSING: ArtMissing[] = ['ambos', 'fondo', 'logo']

const EMPTY: Record<ArtView, string> = {
  valiosos: 'Ningún juego valioso con estos filtros. Cambia la vista a «Todos los visibles» para ver el resto.',
  todos: 'Ningún juego visible con estos filtros.',
  pobres: 'Ningún juego con metadatos pobres con estos filtros.',
}

function filterFrom(sp: Record<string, string | string[] | undefined>): ArtFilter {
  const pick = <T extends string>(v: string | string[] | undefined, allowed: readonly T[], fallback: T): T =>
    typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
  return {
    vista: pick(sp.vista, VIEWS, DEFAULT_ART_FILTER.vista),
    falta: pick(sp.falta, MISSING, DEFAULT_ART_FILTER.falta),
    plataforma: typeof sp.plataforma === 'string' && sp.plataforma ? sp.plataforma : 'todas',
  }
}

// Arte (#142). Por defecto: juegos valiosos (metadatos completos y popular en RAWG o descargado).
// Esta página es referencia: el arte se edita en la ficha de cada juego.
export default async function AdminArtPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  await purgeExpiredManualArt()
  const filter = filterFrom(searchParams)
  const shownRaw = typeof searchParams.n === 'string' ? parseInt(searchParams.n, 10) : NaN
  const shown = Number.isFinite(shownRaw) && shownRaw > PAGE ? shownRaw : PAGE

  const [games, downloads, byKind, platforms] = await Promise.all([
    db.game.findMany({
      where: { isHidden: false },
      select: {
        id: true, title: true, coverPath: true, description: true, releaseYear: true,
        developer: true, genre: true, rawgAdded: true, backdropPath: true, backdropKind: true,
        logoPath: true, tilePath: true, screenshotPaths: true,
        platform: { select: { name: true } },
      },
      orderBy: { title: 'asc' },
    }),
    db.downloadLog.findMany({ distinct: ['gameId'], select: { gameId: true } }),
    db.gameImage.groupBy({ by: ['kind'], _count: { _all: true } }),
    db.platform.findMany({ where: { enabled: true }, select: { name: true }, orderBy: { sortOrder: 'asc' } }),
  ])

  const downloaded = new Set(downloads.map(d => d.gameId))
  const visible = games.length
  const files = (kind: string) => byKind.find(k => k.kind === kind)?._count._all ?? 0

  // Game-level: what each game shows. Then one row per kind in the data model, with the files the repository holds.
  const fieldRows = [
    { label: 'Portada', has: games.filter(g => g.coverPath).length, files: null, missing: null },
    { label: 'Banner', has: games.filter(g => g.backdropKind === 'banner').length, files: null, missing: null },
    { label: 'Fondo', has: games.filter(g => g.backdropPath && g.backdropKind !== 'banner').length, files: null, missing: 'fondo' as const },
    { label: 'Logo', has: games.filter(g => g.logoPath).length, files: null, missing: 'logo' as const },
    { label: 'Capturas', has: games.filter(g => g.screenshotPaths).length, files: null, missing: null },
  ]

  // Every kind the repository holds: the catalogue first, in its order, then any kind it does not know.
  const stored = byKind.map(k => k.kind).filter(k => !k.startsWith('manual-'))
  const catalogue = ART_KINDS.map(k => k.kind)
  const kinds = [...catalogue, ...stored.filter(k => !catalogue.includes(k) && !artKindOf(k))]
  const kindRows = kinds
    .map(k => ({ kind: k, label: artTitle(k), group: artKindOf(k)?.group ?? 'other', files: files(k) }))
    .filter(r => r.files > 0 || catalogue.includes(r.kind))

  const candidates = games.map(g => ({ ...g, platformName: g.platform.name }))
  const count = (view: ArtView) => candidates.filter(g => {
    if (view === 'valiosos') return isValuableForArt(g, downloaded.has(g.id))
    if (view === 'pobres') return !hasRichMetadata(g)
    return true
  }).length

  const selected = selectArtGames(candidates, filter, downloaded)
  const byId = new Map(candidates.map(g => [g.id, g]))
  const rows = selected.slice(0, shown).map(({ id, missing }) => ({ id, title: byId.get(id)!.title, platform: byId.get(id)!.platform.name, missing }))

  const viewLabel: Record<ArtView, string> = {
    valiosos: `Valiosos (${count('valiosos')})`,
    todos: `Todos los visibles (${count('todos')})`,
    pobres: `Metadatos pobres (${count('pobres')})`,
  }
  const select = 'bg-secondary border border-border rounded-md px-2.5 py-2 text-sm'
  const moreParams = new URLSearchParams({ vista: filter.vista, falta: filter.falta, plataforma: filter.plataforma, n: String(shown + PAGE) })

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
            {selected.length} resultados con estos filtros. Se muestran {Math.min(shown, selected.length)}. Pulsa un juego para editar su arte en su ficha.
          </p>
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
          <button type="submit" className="px-3 py-2 rounded-md text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white">Aplicar</button>
        </form>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{EMPTY[filter.vista]}</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map(r => (
              <li key={r.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="font-medium truncate block">{r.title}</span>
                  <span className="text-xs text-muted-foreground">{r.platform} · falta {r.missing === 'fanart' ? 'fondo' : r.missing === 'logo' ? 'logo' : 'fondo o logo'}</span>
                </span>
                <Link href={`/admin/games/${r.id}`} className="px-3 py-1.5 rounded-md text-xs bg-secondary hover:bg-secondary/80 flex-shrink-0">Editar arte</Link>
              </li>
            ))}
          </ul>
        )}

        {selected.length > shown && (
          <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
            <span className="text-xs text-muted-foreground">Mostrando {shown} de {selected.length}</span>
            <Link href={`/admin/arte?${moreParams.toString()}`} className="px-3 py-2 rounded-md text-sm bg-secondary hover:bg-secondary/80">
              Mostrar {PAGE} más
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
