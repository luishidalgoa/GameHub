import { db } from '@/lib/db'
import { ArtJobPanel } from '@/components/admin/ArtJobPanel'
import { ArtManualUpload, type ArtUploadRow } from '@/components/admin/ArtManualUpload'

export const dynamic = 'force-dynamic'

const MISSING_SAMPLE = 40

// Arte (#142): cobertura por tipo, subida manual de lo que falta, y el job de descarga.
export default async function AdminArtPage() {
  const visible = { isHidden: false }
  const [total, withFanart, withLogo, withTile, byKind, missingFanart, missingLogo] = await Promise.all([
    db.game.count({ where: visible }),
    db.game.count({ where: { ...visible, backdropPath: { not: null } } }),
    db.game.count({ where: { ...visible, logoPath: { not: null } } }),
    db.game.count({ where: { ...visible, tilePath: { not: null } } }),
    db.gameImage.groupBy({ by: ['kind'], _count: { _all: true } }),
    db.game.findMany({
      where: { ...visible, backdropPath: null },
      select: { id: true, title: true, platform: { select: { name: true } } },
      orderBy: { title: 'asc' },
      take: MISSING_SAMPLE,
    }),
    db.game.findMany({
      where: { ...visible, logoPath: null },
      select: { id: true, title: true, platform: { select: { name: true } } },
      orderBy: { title: 'asc' },
      take: MISSING_SAMPLE,
    }),
  ])

  const rows: ArtUploadRow[] = [
    ...missingFanart.map(g => ({ id: g.id, title: g.title, platform: g.platform.name, missing: 'fanart' as const })),
    ...missingLogo.map(g => ({ id: g.id, title: g.title, platform: g.platform.name, missing: 'logo' as const })),
  ]
  const imagesOf = (kind: string) => byKind.find(k => k.kind === kind)?._count._all ?? 0
  // Games with the art field set, and the repository's files for the kinds it keeps.
  // A null means the count does not apply to that row.
  const coverage: { label: string; games: number | null; images: number | null }[] = [
    { label: 'Fondo (fanart)', games: withFanart, images: imagesOf('fanart') },
    { label: 'Logo', games: withLogo, images: imagesOf('clear-logo') },
    { label: 'Tile', games: withTile, images: null },
    { label: 'Banner', games: null, images: imagesOf('banner') },
    { label: 'Carátula frontal', games: null, images: imagesOf('box-front') },
  ]

  return (
    <div className="space-y-8">
      <ArtJobPanel />

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div>
          <h3 className="font-semibold">Cobertura por tipo</h3>
          <p className="text-sm text-muted-foreground mt-0.5">De {total} juegos visibles. Las imágenes guardadas cuentan cada fichero del repositorio.</p>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr><th className="py-2">Tipo</th><th className="py-2 text-right">Juegos con imagen</th><th className="py-2 text-right">Imágenes guardadas</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {coverage.map(c => (
              <tr key={c.label}>
                <td className="py-2">{c.label}</td>
                <td className="py-2 text-right tabular-nums">{c.games ?? '—'}</td>
                <td className="py-2 text-right tabular-nums">{c.images ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div>
          <h3 className="font-semibold">Falta fondo o logo</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Hasta {MISSING_SAMPLE} de cada tipo, por orden alfabético. Lo que subas aquí se guarda igual que en la ficha del juego.</p>
        </div>
        <ArtManualUpload rows={rows} />
      </div>
    </div>
  )
}
