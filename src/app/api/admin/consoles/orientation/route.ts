import { adminGuard } from '@/lib/admin-guard'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrientations, isOrientation, saveOrientation } from '@/lib/console-orientation'

export const dynamic = 'force-dynamic'

export async function GET() {
  const denied = await adminGuard()
  if (denied) return denied
  return NextResponse.json({ orientations: await getOrientations() })
}

// PUT { slug, rotation: [x, y, z] | null } — null goes back to the default in consoles.ts.
export async function PUT(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied
  const body = await req.json().catch(() => ({}))
  if (typeof body.slug !== 'string' || !(await db.platform.findUnique({ where: { slug: body.slug }, select: { id: true } }))) {
    return NextResponse.json({ error: 'unknown platform' }, { status: 400 })
  }
  if (body.rotation !== null && !isOrientation(body.rotation)) {
    return NextResponse.json({ error: 'rotation must be three numbers' }, { status: 400 })
  }
  return NextResponse.json({ orientations: await saveOrientation(body.slug, body.rotation) })
}
