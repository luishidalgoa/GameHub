import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { adminGuard } from '@/lib/admin-guard'

export const dynamic = 'force-dynamic'

// Los destacados de la portada, con su puesto: el editor muestra qué juego
// ocupa cada puesto antes de elegirlo.
export async function GET() {
  const denied = await adminGuard()
  if (denied) return denied

  const picks = await db.game.findMany({
    where: { isFeatured: true },
    select: { id: true, title: true, featuredOrder: true, platform: { select: { name: true } } },
    orderBy: { title: 'asc' },
  })
  return NextResponse.json(picks.map(({ platform, ...p }) => ({ ...p, platformName: platform.name })))
}
