import { scanBus } from '@/lib/scanner/events'
import type { ScanEvent } from '@/lib/scanner/events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const encoder = new TextEncoder()

  let cleanup: () => void = () => {}

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: ScanEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          // Controller already closed (client disconnected) — stop listening
          cleanup()
        }
      }

      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: heartbeat\n\n`)) } catch { cleanup() }
      }, 15000)

      cleanup = () => {
        clearInterval(heartbeat)
        scanBus.off('scan', send)
        scanBus.off('scan', done)
      }

      const done = (event: ScanEvent) => {
        if (event.type === 'pipeline_done' || event.type === 'scan_error') {
          cleanup()
          try { controller.close() } catch { /* already closed */ }
        }
      }

      scanBus.on('scan', send)
      scanBus.on('scan', done)

      // Signal the client that the SSE connection is ready — the client
      // should only start the scan POST after receiving this event.
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`))
    },

    cancel() {
      // Client disconnected — remove all listeners immediately
      cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
