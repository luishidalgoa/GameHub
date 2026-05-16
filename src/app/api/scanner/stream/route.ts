import { scanBus } from '@/lib/scanner/events'
import type { ScanEvent } from '@/lib/scanner/events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: ScanEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      scanBus.on('scan', send)

      // Heartbeat every 15s to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`))
        } catch { /* closed */ }
      }, 15000)

      const cleanup = () => {
        clearInterval(heartbeat)
        scanBus.off('scan', send)
      }

      // Auto-cleanup on scan complete/error
      const done = (event: ScanEvent) => {
        if (event.type === 'scan_complete' || event.type === 'scan_error') {
          cleanup()
          try { controller.close() } catch { /* already closed */ }
        }
      }
      scanBus.on('scan', done)
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
