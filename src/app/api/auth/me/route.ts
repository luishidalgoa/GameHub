import { NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const authenticated = await getSessionFromRequest(req)
  return NextResponse.json({ admin: authenticated })
}
