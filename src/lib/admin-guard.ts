import { NextResponse } from 'next/server'
import { isAdminSession } from '@/lib/auth'

/** Returns a 401 response when there is no admin session, otherwise null. */
export async function adminGuard(): Promise<NextResponse | null> {
  if (await isAdminSession()) return null
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
