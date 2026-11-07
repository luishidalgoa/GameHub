import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { adminGuard } from '@/lib/admin-guard'

export const dynamic = 'force-dynamic'

/**
 * Resumen completo del cliente de un intento de descarga (el historial de client-summary):
 * cabeceras, dispositivo, SO, ruta y descarga. Solo administración.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await adminGuard()
  if (denied) return denied

  const { id } = await params
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: 'id no válido' }, { status: 400 })
  }

  const row = await db.downloadLog.findUnique({
    where: { id: numericId },
    select: { id: true, clientId: true, ip: true, clientInfo: true, startedAt: true, completed: true, bytesSent: true, fileSize: true },
  })
  if (!row) return NextResponse.json({ error: 'no encontrado' }, { status: 404 })

  let summary: unknown = null
  if (row.clientInfo) {
    try {
      summary = JSON.parse(row.clientInfo)
    } catch {
      summary = { raw: row.clientInfo }
    }
  }

  return NextResponse.json({
    id: row.id,
    clientId: row.clientId,
    ip: row.ip,
    startedAt: row.startedAt.toISOString(),
    completed: row.completed,
    bytesSent: Number(row.bytesSent),
    fileSize: Number(row.fileSize),
    summary,
  })
}
