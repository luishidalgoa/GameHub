import { NextResponse } from 'next/server'
import { isPublicIpRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const isAdminIp = isPublicIpRequest(req as any)
  return NextResponse.json({ isAdminIp })
}
