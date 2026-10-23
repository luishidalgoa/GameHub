import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { rawDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET — one company as the catalogue panel reads it: its owner, its sub-companies, and the
// publisher names its games carry (the spellings LaunchBox gave, with how many games).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const denied = await adminGuard()
  if (denied) return denied
  const id = Number(params.id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 })
  const company = await rawDb.company.findUnique({
    where: { id },
    select: {
      id: true, name: true, parent: { select: { id: true, name: true } },
      subsidiaries: { select: { id: true, name: true, _count: { select: { publishedGames: true } } }, orderBy: { name: 'asc' } },
      _count: { select: { publishedGames: true } },
    },
  })
  if (!company) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const texts = await rawDb.game.groupBy({
    by: ['publisher'], where: { publisherCompanyId: id }, _count: { _all: true }, orderBy: { _count: { publisher: 'desc' } }, take: 50,
  })
  return NextResponse.json({
    id: company.id,
    name: company.name,
    games: company._count.publishedGames,
    parent: company.parent,
    subsidiaries: company.subsidiaries.map(s => ({ id: s.id, name: s.name, games: s._count.publishedGames })),
    names: texts.map(t => ({ text: t.publisher ?? '', games: t._count._all })),
  })
}
