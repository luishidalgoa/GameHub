import fs from 'fs'
import { Readable } from 'stream'

/**
 * 4 MiB read buffer. The Node default is 64 KiB, which throttles large-file
 * throughput on a fast LAN to a few MB/s because each chunk crosses the
 * event-loop / web-stream boundary separately. A larger buffer keeps the pipe
 * full. `Readable.toWeb` applies real backpressure, so memory stays bounded
 * even when the client (e.g. a Switch over Wi-Fi) reads slowly — and it tears
 * the file descriptor down automatically when the client aborts.
 */
const HIGH_WATER_MARK = 4 * 1024 * 1024

export interface FileStreamHandlers {
  /** Fires once the whole (ranged) read completes successfully. */
  onEnd?: () => void
  /** Fires when the fd closes — on success AND on client abort. */
  onClose?: () => void
  /** Fires on a read error. */
  onError?: (err: unknown) => void
}

/**
 * Stream a file (optionally a byte range) as a Web ReadableStream with a large
 * read buffer and correct backpressure. Lifecycle handlers attach to the
 * underlying Node stream.
 */
export function createFileWebStream(
  filePath: string,
  range?: { start: number; end: number },
  handlers?: FileStreamHandlers,
): ReadableStream<Uint8Array> {
  const nodeStream = fs.createReadStream(filePath, {
    highWaterMark: HIGH_WATER_MARK,
    ...(range ? { start: range.start, end: range.end } : {}),
  })

  if (handlers?.onEnd)   nodeStream.on('end',   handlers.onEnd)
  if (handlers?.onClose) nodeStream.on('close', handlers.onClose)
  if (handlers?.onError) nodeStream.on('error', handlers.onError)

  return Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>
}
