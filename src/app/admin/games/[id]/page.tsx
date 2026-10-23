import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { GameEditorForm } from '@/components/admin/GameEditorForm'

export const dynamic = 'force-dynamic'

interface Props {
  params: { id: string }
  /** The list the editor was opened from (the games list with its filters and panel). */
  searchParams: { volver?: string }
}

export default async function AdminGameEditorPage({ params, searchParams }: Props) {
  // Solo se vuelve a una pagina de administracion: el parametro viene de la URL.
  const back = typeof searchParams?.volver === 'string' && searchParams.volver.startsWith('/admin/games') ? searchParams.volver : null
  const id = parseInt(params.id, 10)
  const game = await db.game.findUnique({
    where: { id },
    include: { platform: true, dlcs: true },
  })

  if (!game) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gameData = { ...game, fileSize: game.fileSize.toString(), dlcs: game.dlcs.map((d) => ({ ...d, fileSize: d.fileSize.toString() })) } as any

  return (
    <div>
      {back && (
        <Link href={back} className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          ← Volver a la lista
        </Link>
      )}
      <GameEditorForm 
        game={gameData}
        thumbnailWidth={game.platform.thumbnailWidth}
        thumbnailHeight={game.platform.thumbnailHeight}
      />
    </div>
  )
}
