import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const settings = await db.setting.findMany()
  const map: Record<string, string> = {}
  settings.forEach((s) => { map[s.key] = s.value })
  return NextResponse.json(map)
}

export async function PUT(req: Request) {
  let body: Record<string, string>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición inválido' }, { status: 400 })
  }

  try {
    const ops = Object.entries(body).map(([key, value]) =>
      db.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    )
    await Promise.all(ops)
    return NextResponse.json({ ok: true })
  } catch (err) {
    // Surface the real cause (e.g. "attempt to write a readonly database") instead
    // of an opaque 500, so the admin form can show why the save didn't persist.
    console.error('[PUT /api/settings] upsert failed:', err)
    const detail = err instanceof Error ? err.message : 'error desconocido'
    return NextResponse.json(
      { error: `No se pudieron guardar los ajustes: ${detail}` },
      { status: 500 },
    )
  }
}
