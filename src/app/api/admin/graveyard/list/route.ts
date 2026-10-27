import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { parseGameFilters } from '@/lib/games/filters'
import { parseSort } from '@/lib/admin-sort'
import { listAdminGames, GRAVEYARD_SORT_DEFAULT, GRAVEYARD_SORT_KEYS } from '@/lib/games/list'

export const dynamic = 'force-dynamic'

// GET /api/admin/graveyard/list?search=&platform=&sort=&dir=&page=&pageSize= — one page
// of the hidden games, for the infinite list on /admin/graveyard.
export async function GET(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied
  const sp = Object.fromEntries(new URL(req.url).searchParams)
  const page = parseInt(sp.page ?? '1', 10)
  const pageSize = parseInt(sp.pageSize ?? '', 10)
  const data = await listAdminGames({
    scope: 'graveyard',
    filters: parseGameFilters(sp),
    sort: parseSort(sp, GRAVEYARD_SORT_KEYS, GRAVEYARD_SORT_DEFAULT),
    page: Number.isFinite(page) ? page : 1,
    pageSize: Number.isFinite(pageSize) ? pageSize : undefined,
  })
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
