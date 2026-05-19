import { NextResponse }    from 'next/server'
import { db }              from '@/lib/db'
import { isAdminSession }  from '@/lib/auth'
import { serializeBigInt } from '@/lib/serialize'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!await isAdminSession()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id  = parseInt(params.id, 10)
  const log = await db.scanLog.findUnique({ where: { id } })
  if (!log) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(serializeBigInt(log))
}
