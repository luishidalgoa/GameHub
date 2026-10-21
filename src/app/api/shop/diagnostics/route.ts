import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardShopRequest } from '@/lib/shop-auth'
import { quotaGuard } from '@/lib/quota'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const KINDS = ['install', 'download', 'decode', 'network', 'other'] as const

/**
 * POST /api/shop/diagnostics — GameHubNX reports a failure (#91).
 * Body: { kind, message, clientVersion?, device? }. Text is trimmed and bounded;
 * the rows are pruned after 30 days by lib/retention.
 */
export async function POST(req: Request) {
  const denied = await guardShopRequest(req)
  if (denied) return denied
  const limited = quotaGuard(req.headers, 'diagnostics')
  if (limited) return limited

  let body: { kind?: unknown; message?: unknown; clientVersion?: unknown; device?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON invalido' }, { status: 400 })
  }
  const kind = typeof body.kind === 'string' && (KINDS as readonly string[]).includes(body.kind) ? body.kind : 'other'
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 500) : ''
  if (!message) return NextResponse.json({ error: 'message requerido' }, { status: 400 })

  await db.clientDiagnostic.create({
    data: {
      kind,
      message,
      clientVersion: typeof body.clientVersion === 'string' ? body.clientVersion.slice(0, 40) : null,
      device:        typeof body.device === 'string' ? body.device.slice(0, 80) : null,
    },
  })
  return NextResponse.json({ ok: true }, { status: 201 })
}
