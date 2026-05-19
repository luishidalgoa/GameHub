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

// 24-hour browser cache; the ?t= cache-bust appended after upload handles freshness.
const CACHE_SECONDS = 86_400

export async function GET(
  _req: Request,
  { params }: { params: { key: string[] } },
) {
  try {
    const key    = params.key.join('/')
    const config = await getS3Config()

    const base   = config.internalEndpoint.replace(/\/$/, '')
    const url    = `${base}/${config.bucketName}/${key}`

    const upstream = await fetch(url, { cache: 'no-store' })

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `MinIO returned ${upstream.status}` },
        { status: upstream.status === 404 ? 404 : 502 },
      )
    }

    const body        = await upstream.arrayBuffer()
    const contentType = upstream.headers.get('content-type') ?? 'image/webp'

    return new NextResponse(body, {
      headers: {
        'Content-Type':  contentType,
        'Cache-Control': `public, max-age=${CACHE_SECONDS}, stale-while-revalidate=3600`,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[COVER PROXY]', msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
