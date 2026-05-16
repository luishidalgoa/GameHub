import { runMetadataBatch } from '@/lib/metadata/batch'
import type { BatchEvent } from '@/lib/metadata/batch'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const withCovers = new URL(req.url).searchParams.get('covers') !== 'false'

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: BatchEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch { /* client disconnected */ }
      }

      await runMetadataBatch({
        emit:        send,
        signal:      req.signal,
        withCovers,
      })

      try { controller.close() } catch { /* already closed */ }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',   // disable nginx buffering if proxied
    },
  })
}
