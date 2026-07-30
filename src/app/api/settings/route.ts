import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdminSession } from '@/lib/auth'
import { invalidateShopPasswordCache } from '@/lib/shop-auth'

export const dynamic = 'force-dynamic'

/**
 * Every row of the Setting table, values included — API keys, the S3 access and
 * secret pair, webhook tokens. Admin only.
 *
 * The middleware gates this path as well. The check is repeated here on purpose:
 * a matcher entry is one edit away from silently no longer covering the route,
 * and the cost of that mistake on this particular handler is publishing every
 * credential the install holds.
 */
export async function GET() {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
    // The shop caches this one for a few seconds; drop it so a new password takes
    // effect on the next request instead of after the TTL.
    if ('shop_password' in body) invalidateShopPasswordCache()
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
