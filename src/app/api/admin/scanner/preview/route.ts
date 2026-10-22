import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { previewScan } from '@/lib/scanner/preview'

export const dynamic = 'force-dynamic'

// GET ?platformSlug=… — what the next scan would add, change or hide. Reads only:
// it walks the scan paths and compares with the library, and writes nothing (#137).
export async function GET(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied
  const platformSlug = new URL(req.url).searchParams.get('platformSlug') || undefined
  return NextResponse.json(await previewScan(platformSlug))
}
