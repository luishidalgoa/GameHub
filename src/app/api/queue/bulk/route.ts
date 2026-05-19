import { NextResponse }       from 'next/server'
import { isAdminSession }     from '@/lib/auth'
import { createBulkToken }    from '@/lib/bulk-queue'
import type { BulkType }      from '@/lib/bulk-queue'

export async function POST(req: Request) {
  if (!await isAdminSession()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { platformSlug, type } = await req.json() as { platformSlug?: string; type?: BulkType }
  if (!platformSlug || !type || !['dlc', 'update', 'mod'].includes(type)) {
    return NextResponse.json({ error: 'platformSlug and type (dlc|update|mod) required' }, { status: 400 })
  }

  const entry = createBulkToken(platformSlug, type)

  // Bulk tokens are immediately ready (admin-only, no concurrency limit needed)
  return NextResponse.json({ token: entry.token, status: 'ready' })
}
