/**
 * GET /api/covers/proxy/covers/<platform>/<gameId>.webp
 *
 * Proxies cover images from MinIO through Next.js so they are always
 * served over the same origin (HTTPS).  This avoids mixed-content blocks
 * when the MinIO internal/public endpoint is plain HTTP while the site
 * itself is served over HTTPS.
 *
 * The URL is intentionally public — cover art is not sensitive.
 */
import { NextResponse } from 'next/server'
import { getS3Config } from '@/lib/s3'

export const dynamic = 'force-dynamic'

// 1-year browser cache, immutable: the object at a given key never changes (a
// new cover is uploaded under a fresh ?v= cache-bust), so the browser can keep
// it without re-validating. Cuts repeat image traffic on the Raspberry Pi.
const CACHE_SECONDS = 31_536_000
const CACHE_CONTROL = `public, max-age=${CACHE_SECONDS}, immutable`

export async function GET(
  req: Request,
  { params }: { params: { key: string[] } },
) {
  try {
    const key    = params.key.join('/')
    const config = await getS3Config()

    const base   = config.internalEndpoint.replace(/\/$/, '')
    const url    = `${base}/${config.bucketName}/${key}`

    // Forward the browser's validators so MinIO can answer 304 when unchanged —
    // then we don't transfer the image body at all on repeat views.
    const fwd: Record<string, string> = {}
    const inm = req.headers.get('if-none-match')
    const ims = req.headers.get('if-modified-since')
    if (inm) fwd['if-none-match'] = inm
    if (ims) fwd['if-modified-since'] = ims

    const upstream = await fetch(url, { cache: 'no-store', headers: fwd })

    // 304 Not Modified — relay it with no body.
    if (upstream.status === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          'Cache-Control': CACHE_CONTROL,
          ...(upstream.headers.get('etag') ? { ETag: upstream.headers.get('etag')! } : {}),
        },
      })
    }

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `MinIO returned ${upstream.status}` },
        { status: upstream.status === 404 ? 404 : 502 },
      )
    }

    const body        = await upstream.arrayBuffer()
    const contentType = upstream.headers.get('content-type') ?? 'image/webp'
    const etag        = upstream.headers.get('etag')
    const lastMod     = upstream.headers.get('last-modified')

    // ?fmt=jpg — transcodifica a JPEG.
    //
    // Las portadas se guardan en WebP, que es lo correcto para la web. Pero
    // GameHubNX corre sobre Borealis y decodifica con stb_image, que entiende
    // JPEG, PNG, BMP, GIF y TGA y NO WebP: en la consola las portadas
    // sencillamente no aparecian. Convertir aqui evita meter libwebp en la app
    // y deja intacto lo que sirve al navegador y a CyberFoil, que piden la
    // imagen sin este parametro.
    if (new URL(req.url).searchParams.get('fmt') === 'jpg') {
      try {
        const sharp = (await import('sharp')).default
        const jpeg = await sharp(Buffer.from(body))
          .flatten({ background: '#0a0a0b' })   // WebP puede traer alfa; JPEG no
          .jpeg({ quality: 82, mozjpeg: true })
          .toBuffer()
        return new NextResponse(new Uint8Array(jpeg), {
          headers: {
            'Content-Type':  'image/jpeg',
            'Cache-Control': CACHE_CONTROL,
            // El ETag de origen describe el WebP, no esta conversion: se
            // marca para que un cache intermedio no sirva uno por el otro.
            ...(etag ? { ETag: etag.replace(/"$/, '-jpg"') } : {}),
          },
        })
      } catch (convErr) {
        // Si la conversion falla se devuelve el original: peor una portada que
        // no se ve que una ficha rota.
        console.error('[COVER PROXY] jpeg:', convErr)
      }
    }

    return new NextResponse(body, {
      headers: {
        'Content-Type':  contentType,
        'Cache-Control': CACHE_CONTROL,
        ...(etag    ? { ETag: etag } : {}),
        ...(lastMod ? { 'Last-Modified': lastMod } : {}),
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[COVER PROXY]', msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
