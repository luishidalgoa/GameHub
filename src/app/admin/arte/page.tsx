import { db } from '@/lib/db'
import { resolveCoverPath } from '@/lib/cover-url'
import { ArtJobPanel } from '@/components/admin/ArtJobPanel'
import { ArtManualUpload, type ArtUploadRow } from '@/components/admin/ArtManualUpload'
import { ManualArtList, type ManualArtRow } from '@/components/admin/ManualArtList'
import {
  DEFAULT_ART_FILTER, hasRichMetadata, isValuableForArt, selectArtGames,
  type ArtFilter, type ArtMissing, type ArtView,
} from '@/lib/art-value'

export const dynamic = 'force-dynamic'

const SAMPLE = 60
const VIEWS: ArtView[] = ['valiosos', 'todos', 'pobres']
const MISSING: ArtMissing[] = ['ambos', 'fondo', 'logo']

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
// Los demás están a un filtro de distancia: nada queda fuera sin poder verse.
export default async function AdminArtPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const filter = filterFrom(searchParams)

  const [games, downloads, platforms, manual] = await Promise.all([
    db.game.findMany({
      where: { isHidden: false },
      select: {
        id: true, title: true, coverPath: true, description: true, releaseYear: true,
        developer: true, genre: true, rawgAdded: true, backdropPath: true, logoPath: true,
        platform: { select: { name: true } },
      },
      orderBy: { title: 'asc' },
    }),
    db.downloadLog.findMany({ distinct: ['gameId'], select: { gameId: true } }),
    db.platform.findMany({ where: { enabled: true }, select: { name: true }, orderBy: { sortOrder: 'asc' } }),
    db.gameImage.findMany({
      where: { kind: { startsWith: 'manual-' } },
      orderBy: { createdAt: 'desc' }, take: 100,
      include: { game: { select: { id: true, title: true, platform: { select: { name: true } } } } },
    }),
  ])

  const downloaded = new Set(downloads.map(d => d.gameId))
  const candidates = games.map(g => ({ ...g, platformName: g.platform.name }))
  const count = (view: ArtView) => candidates.filter(g => {
    if (view === 'valiosos') return isValuableForArt(g, downloaded.has(g.id))
    if (view === 'pobres') return !hasRichMetadata(g)
    return true
  }).length

  const selected = selectArtGames(candidates, filter, downloaded)
  const byId = new Map(candidates.map(g => [g.id, g]))
  const uploadRows: ArtUploadRow[] = selected.slice(0, SAMPLE).map(({ id, missing }) => {
    const g = byId.get(id)!
    return { id, title: g.title, platform: g.platform.name, coverUrl: resolveCoverPath(g.coverPath), missing }
  })

  const manualRows: ManualArtRow[] = manual.map(i => ({
    imageId: i.id,
    gameId: i.game.id,
    title: i.game.title,
    platform: i.game.platform.name,
    kind: (i.kind.replace('manual-', '') as ManualArtRow['kind']),
    imageUrl: resolveCoverPath(i.s3Key),
    createdAt: i.createdAt.toISOString(),
  }))

  const viewLabel: Record<ArtView, string> = {
    valiosos: `Valiosos (${count('valiosos')})`,
    todos: `Todos los visibles (${count('todos')})`,
    pobres: `Metadatos pobres (${count('pobres')})`,
  }
  const select = 'bg-secondary border border-border rounded-md px-2.5 py-2 text-sm'

  return (
    <div className="space-y-8">
      <ArtJobPanel />

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div>
          <h3 className="font-semibold">Subidas a mano</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Lo que has subido, con su vista previa. «Quitar» devuelve el juego a como estaba.</p>
        </div>
        <ManualArtList rows={manualRows} />
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div>
          <h3 className="font-semibold">Sin fondo o sin logo</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {selected.length} resultados con estos filtros. Se muestran {Math.min(SAMPLE, selected.length)}. Eliges la imagen y la ves antes de subirla.
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

        <ArtManualUpload rows={uploadRows} />
      </div>
    </div>
  )
}
