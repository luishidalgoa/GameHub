import { db } from '@/lib/db'
import { runMetadataBatch } from '@/lib/metadata/batch'
import type { BatchEvent } from '@/lib/metadata/batch'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const sp           = new URL(req.url).searchParams
  const withCovers   = sp.get('covers') !== 'false'
  // Auto Metadata Fetch also backfills YouTube trailers (incl. games that
  // already have metadata but no trailer). Disable with ?trailers=false.
  const withTrailers = sp.get('trailers') !== 'false'

  const setting = await db.setting.findUnique({ where: { key: 'rawg_api_key' } })
  const apiKey  = setting?.value || undefined

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: BatchEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch { /* client disconnected */ }
      }

      await runMetadataBatch({ emit: send, signal: req.signal, withCovers, withTrailers, backfillTrailers: true, apiKey })

      try { controller.close() } catch { /* already closed */ }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
