import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { buildProposal, type RenameProposal } from '@/lib/curation'

export const dynamic = 'force-dynamic'

/**
 * Proposals for improving ROM file names. Read-only: this endpoint never
 * touches a file, it only says what it *would* rename. See src/lib/curation.ts
 * for why the split matters.
 */
export async function GET() {
  const [games, cards] = await Promise.all([
    db.game.findMany({
      where: { isHidden: false, releaseYear: { not: null } },
      select: {
        id: true,
        fileName: true,
        filePath: true,
        releaseYear: true,
        rawgId: true,
        platform: { select: { name: true } },
      },
      orderBy: [{ platform: { name: 'asc' } }, { fileName: 'asc' }],
    }),
    // A RAWG entry pointed at by more than one game. Sometimes legitimate (one
    // game, several platforms), sometimes a mismatch — we cannot tell from
    // here, so we flag it and let the reviewer decide.
    db.game.groupBy({
      by: ['rawgId'],
      where: { isHidden: false, rawgId: { not: null } },
      _count: { rawgId: true },
      having: { rawgId: { _count: { gt: 1 } } },
    }),
  ])

  const shared = new Set<number>(
    cards.map(c => c.rawgId).filter((id): id is number => id != null),
  )

  const proposals: RenameProposal[] = []
  for (const g of games) {
    const p = buildProposal(
      {
        id: g.id,
        fileName: g.fileName,
        filePath: g.filePath,
        releaseYear: g.releaseYear,
        rawgId: g.rawgId,
        platformName: g.platform.name,
      },
      shared,
    )
    if (p) proposals.push(p)
  }

  return NextResponse.json({
    proposals,
    total: proposals.length,
    risky: proposals.filter(p => p.risk !== null).length,
    scanned: games.length,
  })
}
