import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { artFilterFrom, artListPage, ART_PAGE_SIZE } from '@/lib/art-list'

export const dynamic = 'force-dynamic'

// GET /api/admin/arte/list?vista=&falta=&plataforma=&page= — one page of the games missing art.
export async function GET(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied
  const sp = Object.fromEntries(new URL(req.url).searchParams)
  const page = parseInt(sp.page ?? '1', 10)
  const data = await artListPage(artFilterFrom(sp), Number.isFinite(page) ? page : 1, ART_PAGE_SIZE)
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
