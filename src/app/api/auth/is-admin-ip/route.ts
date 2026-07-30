/**
 * GET /api/auth/is-admin-ip
 * Whether the sidebar should surface the admin link for this client. Cosmetic
 * only — never a security check; /admin is gated by the session cookie.
 */
import { NextResponse } from 'next/server'
import { checkAdminIp, isAdminSession } from '@/lib/auth'
import { isTrustedIp } from '@/lib/net'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const check = checkAdminIp(req.headers)
  if (!check.allowed) return NextResponse.json({ isAdminIp: false })

  // With the IP gate disabled (the default) every request passes it, so don't
  // advertise the admin entry point to the whole internet: show it to an already
  // authenticated admin, or to someone on a trusted network. A null IP means the
  // app was reached directly on its own port, which is the LAN case.
  if (check.reason === 'gate-disabled' && !(await isAdminSession())) {
    const local = check.ip === null || isTrustedIp(check.ip)
    return NextResponse.json({ isAdminIp: local })
  }

  return NextResponse.json({ isAdminIp: true })
}
