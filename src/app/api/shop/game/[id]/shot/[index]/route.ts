/**
 * GET /api/shop/game/<id>/shot/<n>
 * La captura n-esima de un juego, servida desde ESTE dominio.
 *
 * Por que existe: las capturas se guardan tal y como las dio el proveedor de
 * metadata, y muchas son URLs externas (images.launchbox-app.com). GameHubNX
 * solo acepta imagenes de su propio servidor --una ficha manipulada no puede
 * hacer que la consola pida imagenes a cualquier sitio-- asi que una URL
 * externa se rechazaba y la ficha salia sin capturas. Las portadas no tenian el
 * problema porque el trabajo de metadata se las descarga a S3.
 *
 * La URL de origen NO viene de la peticion: se busca en la base de datos por el
 * indice. Aceptar una URL por parametro convertiria esto en un proxy abierto
 * con el que sondear la red interna del servidor.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardShopRequest } from '@/lib/shop-auth'
import { getS3Config } from '@/lib/s3'
import { parseScreenshots } from '@/lib/shop-files'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Un ano de cache: la captura n de un juego no cambia sin que cambie la ficha.
const CACHE_CONTROL = 'public, max-age=31536000, immutable'

export async function GET(
  req: Request,
  { params }: { params: { id: string; index: string } },
) {
  const denied = await guardShopRequest(req)
  if (denied) return denied

  const id = Number(params.id)
  const index = Number(params.index)
  if (!Number.isInteger(id) || id <= 0 ||
      !Number.isInteger(index) || index < 0)
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  const game = await db.game.findUnique({
    where: { id },
    select: { screenshotPaths: true, isHidden: true },
  })
  if (!game || game.isHidden)
    return NextResponse.json({ error: 'Unknown game' }, { status: 404 })

  const shots = parseScreenshots(game.screenshotPaths)
  const stored = shots[index]
  if (!stored)
    return NextResponse.json({ error: 'No such screenshot' }, { status: 404 })

  // Dos formas de guardado conviven: clave de S3 (lo que descarga el trabajo de
  // metadata) y URL externa (lo que dio el proveedor). Se resuelven distinto.
  let upstreamUrl: string
  if (stored.startsWith('http://') || stored.startsWith('https://')) {
    upstreamUrl = stored
  } else {
    const config = await getS3Config()
    const base = config.internalEndpoint.replace(/\/$/, '')
    upstreamUrl = `${base}/${config.bucketName}/${stored.replace(/^\//, '')}`
  }

  try {
    const upstream = await fetch(upstreamUrl, { cache: 'no-store' })
    if (!upstream.ok || !upstream.body)
      return NextResponse.json(
        { error: `Upstream returned ${upstream.status}` },
        { status: upstream.status === 404 ? 404 : 502 },
      )
    // El tipo se toma del origen pero acotado a imagenes: sin esto, un origen
    // que devolviera html lo serviria este dominio como suyo.
    const type = upstream.headers.get('content-type') ?? ''
    if (!type.startsWith('image/'))
      return NextResponse.json({ error: 'Not an image' }, { status: 502 })
    return new NextResponse(upstream.body, {
      status: 200,
      headers: { 'Content-Type': type, 'Cache-Control': CACHE_CONTROL },
    })
  } catch {
    return NextResponse.json({ error: 'Upstream unreachable' }, { status: 502 })
  }
}
