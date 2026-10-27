import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { parseGameFilters } from '@/lib/games/filters'
import { parseSort } from '@/lib/admin-sort'
import { listAdminGames, LIBRARY_SORT_DEFAULT, LIBRARY_SORT_KEYS } from '@/lib/games/list'

export const dynamic = 'force-dynamic'

// GET /api/admin/games/list?…filters…&sort=&dir=&page=&pageSize= — one page of the
// library table, for the infinite list on /admin/games.
export async function GET(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied
  const sp = Object.fromEntries(new URL(req.url).searchParams)
  const page = parseInt(sp.page ?? '1', 10)
  const pageSize = parseInt(sp.pageSize ?? '', 10)
  const data = await listAdminGames({
    scope: 'library',
    filters: parseGameFilters(sp),
    sort: parseSort(sp, LIBRARY_SORT_KEYS, LIBRARY_SORT_DEFAULT),
    page: Number.isFinite(page) ? page : 1,
    pageSize: Number.isFinite(pageSize) ? pageSize : undefined,
  })
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
