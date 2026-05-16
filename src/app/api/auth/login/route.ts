import { NextResponse } from 'next/server'
import { createSessionToken, sessionCookieOptions } from '@/lib/auth'

export async function POST(req: Request) {
  const { password } = await req.json()

  const expected = process.env.ADMIN_PASSWORD
  if (!expected) {
    return NextResponse.json({ error: 'ADMIN_PASSWORD not configured' }, { status: 500 })
  }

  if (password !== expected) {
    // Constant-time comparison isn't needed here since this isn't a cryptographic context,
    // but we add a small delay to prevent brute-force timing attacks
    await new Promise((r) => setTimeout(r, 300))
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  const token = await createSessionToken()

  const res = NextResponse.json({ ok: true })
  res.cookies.set({
    ...sessionCookieOptions,
    value: token,
  })
  return res
}
