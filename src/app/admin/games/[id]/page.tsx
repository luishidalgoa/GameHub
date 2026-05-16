import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { GameEditorForm } from '@/components/admin/GameEditorForm'

export const dynamic = 'force-dynamic'

interface Props {
  params: { id: string }
}

export default async function AdminGameEditorPage({ params }: Props) {
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
      <GameEditorForm game={gameData} />
    </div>
  )
}
