import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: { downloadLog: { update: vi.fn(async () => ({})) } } }))

import { DownloadMeter, MAX_BYTES_PER_SECOND } from '@/lib/download-meter'
import { downloadProgress } from '@/lib/traffic-stats'
import { trackDownloadBody } from '@/lib/traffic'

function bodyOf(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0
  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (i < chunks.length) c.enqueue(chunks[i++])
      else c.close()
    },
  })
}

async function drain(s: ReadableStream<Uint8Array>): Promise<number> {
  const reader = s.getReader()
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return total
    total += value.byteLength
  }
}

describe('velocidad acotada', () => {
  it('una velocidad que no cabe en la columna se guarda con el tope', () => {
    const flushes: number[] = []
    const m = new DownloadMeter(0, 0, f => flushes.push(f.bytesPerSecond))
    m.add(5_000_000, 1)
    expect(flushes[0]).toBe(MAX_BYTES_PER_SECOND)
  })
})

describe('media de una descarga corta', () => {
  it('coincide con la medida en vivo cuando dura menos de un segundo', () => {
    const p = downloadProgress({ bytesSent: 3_000_000, fileSize: 3_000_000, speedBps: null, lastByteAt: 300, startedAt: 0, now: 300 })
    expect(p.averageBps).toBe(10_000_000)
  })
})

describe('trackDownloadBody', () => {
  it('entrega el cuerpo sin cambios', async () => {
    const piece = new Uint8Array(200_000)
    const total = await drain(trackDownloadBody(bodyOf(piece, piece), 1))
    expect(total).toBe(400_000)
  })
})
