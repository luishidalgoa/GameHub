import { db } from '@/lib/db'
import { resolveCoverPath } from '@/lib/cover-url'
import { ArtJobPanel } from '@/components/admin/ArtJobPanel'
import { ArtManualUpload, type ArtUploadRow } from '@/components/admin/ArtManualUpload'
import { ManualArtList, type ManualArtRow } from '@/components/admin/ManualArtList'

export const dynamic = 'force-dynamic'

const SAMPLE = 60

// Arte (#142). Solo cuentan los juegos valiosos: visibles y con descripción o año.
export default async function AdminArtPage() {
  const valuable = {
    isHidden: false,
    OR: [{ description: { not: null } }, { releaseYear: { not: null } }],
  }
  const [missingFanart, missingLogo, manual] = await Promise.all([
    db.game.findMany({
      where: { ...valuable, backdropPath: null },
      select: { id: true, title: true, coverPath: true, platform: { select: { name: true } } },
      orderBy: { title: 'asc' }, take: SAMPLE,
    }),
    db.game.findMany({
      where: { ...valuable, logoPath: null },
      select: { id: true, title: true, coverPath: true, platform: { select: { name: true } } },
      orderBy: { title: 'asc' }, take: SAMPLE,
    }),
    db.gameImage.findMany({
      where: { kind: { startsWith: 'manual-' } },
      orderBy: { createdAt: 'desc' }, take: 100,
      include: { game: { select: { id: true, title: true, platform: { select: { name: true } } } } },
    }),
  ])

  const uploadRows: ArtUploadRow[] = [
    ...missingFanart.map(g => ({ id: g.id, title: g.title, platform: g.platform.name, coverUrl: resolveCoverPath(g.coverPath), missing: 'fanart' as const })),
    ...missingLogo.map(g => ({ id: g.id, title: g.title, platform: g.platform.name, coverUrl: resolveCoverPath(g.coverPath), missing: 'logo' as const })),
  ]
  const manualRows: ManualArtRow[] = manual.map(i => ({
    imageId: i.id,
    gameId: i.game.id,
    title: i.game.title,
    platform: i.game.platform.name,
    kind: (i.kind.replace('manual-', '') as ManualArtRow['kind']),
    imageUrl: resolveCoverPath(i.s3Key),
    createdAt: i.createdAt.toISOString(),
  }))

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
          <h3 className="font-semibold">Juegos valiosos sin fondo o sin logo</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Solo juegos visibles con descripción o año. Hasta {SAMPLE} de cada tipo, por orden alfabético. Eliges la imagen y la ves antes de subirla.
          </p>
        </div>
        <ArtManualUpload rows={uploadRows} />
      </div>
    </div>
  )
}
