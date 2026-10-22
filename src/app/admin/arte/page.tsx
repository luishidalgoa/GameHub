import { db } from '@/lib/db'
import { resolveCoverPath } from '@/lib/cover-url'
import { isValuableForArt } from '@/lib/art-value'
import { ArtJobPanel } from '@/components/admin/ArtJobPanel'
import { ArtManualUpload, type ArtUploadRow } from '@/components/admin/ArtManualUpload'
import { ManualArtList, type ManualArtRow } from '@/components/admin/ManualArtList'

export const dynamic = 'force-dynamic'

const SAMPLE = 60

// Arte (#142). Un juego vale arte si tiene metadatos completos y además le importa a alguien:
// popular en RAWG o descargado aquí (art-value.ts).
export default async function AdminArtPage() {
  const [games, downloads, manual] = await Promise.all([
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
    db.gameImage.findMany({
      where: { kind: { startsWith: 'manual-' } },
      orderBy: { createdAt: 'desc' }, take: 100,
      include: { game: { select: { id: true, title: true, platform: { select: { name: true } } } } },
    }),
  ])

  const downloaded = new Set(downloads.map(d => d.gameId))
  const valuable = games.filter(g => isValuableForArt(g, downloaded.has(g.id)))
  const missingFanart = valuable.filter(g => !g.backdropPath)
  const missingLogo = valuable.filter(g => !g.logoPath)
  const missingFanartSample = missingFanart.slice(0, SAMPLE)
  const missingLogoSample = missingLogo.slice(0, SAMPLE)

  const uploadRows: ArtUploadRow[] = [
    ...missingFanartSample.map(g => ({ id: g.id, title: g.title, platform: g.platform.name, coverUrl: resolveCoverPath(g.coverPath), missing: 'fanart' as const })),
    ...missingLogoSample.map(g => ({ id: g.id, title: g.title, platform: g.platform.name, coverUrl: resolveCoverPath(g.coverPath), missing: 'logo' as const })),
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
            {valuable.length} juegos valiosos: metadatos completos y popular en RAWG o descargado. Sin fondo: {missingFanart.length}. Sin logo: {missingLogo.length}. Se muestran hasta {SAMPLE} de cada tipo.
          </p>
        </div>
        <ArtManualUpload rows={uploadRows} />
      </div>
    </div>
  )
}
