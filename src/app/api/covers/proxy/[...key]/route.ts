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
