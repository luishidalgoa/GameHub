import { NextResponse } from 'next/server'
import { logTorrentCompletion } from '@/lib/traffic'
import { parseTorrentReport, shopGameForInfoHash } from '@/lib/torrent-report'

export const dynamic = 'force-dynamic'

/**
 * GameHubNX avisa aquí al terminar de bajar un torrent de la tienda. Un infohash que no es de la
 * tienda se responde 404 y no deja rastro: solo cuentan las descargas de juegos que GameHub ofrece.
 */
export async function POST(req: Request) {
  const report = parseTorrentReport(await req.json().catch(() => null))
  if (!report) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  const game = await shopGameForInfoHash(report.infoHash).catch(() => null)
  if (!game) return new NextResponse(null, { status: 404 })

  const size = report.size !== null ? BigInt(report.size) : game.fileSize
  await logTorrentCompletion({
    req,
    gameId: game.id,
    fileName: report.name ?? game.fileName,
    fileSize: size,
  }).catch(() => null)
  return new NextResponse(null, { status: 204 })
}
