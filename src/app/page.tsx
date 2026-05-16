import { db } from '@/lib/db'
import { ConsoleGrid } from '@/components/home/ConsoleGrid'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const platforms = await db.platform.findMany({
    where: { enabled: true },
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { games: { where: { isHidden: false } } } } },
  })

  const totalGames = platforms.reduce((acc, p) => acc + (p._count?.games ?? 0), 0)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const platformData = platforms as any[]

  return (
    <div>
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Your Library</h1>
        <p className="text-muted-foreground mt-1">
          {platforms.length} platforms · {totalGames} games
        </p>
      </div>
      <ConsoleGrid platforms={platformData} />
    </div>
  )
}
