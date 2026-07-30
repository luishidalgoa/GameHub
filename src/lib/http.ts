/** HTTP header / Range helpers shared by the download routes. */

/**
 * Build a `Content-Disposition: attachment` value that survives quotes, control
 * characters and non-ASCII names: an ASCII-sanitised `filename` for old clients
 * plus the RFC 5987 `filename*` that modern ones prefer.
 */
export function contentDispositionAttachment(fileName: string): string {
  const ascii = fileName
    .replace(/[\r\n"\\]/g, '_')      // header injection + quote breakage
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '_')
    .replace(/[^\x20-\x7e]/g, '_')   // non-ASCII → placeholder
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}

export type ByteRange = { start: number; end: number }

/**
 * Parse a single-range `Range: bytes=…` header against the real file size.
 *
 * Returns `null` when there is no usable range (caller serves the whole file)
 * and `'unsatisfiable'` when the client must get a 416.
 *
 * Per RFC 7233 §2.1 a last-byte-pos beyond the end of the file is **clamped**,
 * not rejected: `bytes=0-99999999` on a 500-byte file is a valid request for the
 * whole file. Rejecting it breaks clients that guess a large upper bound.
 * Multi-range requests are not supported — we serve the first range only, which
 * is allowed and is what every install client actually asks for.
 */
export function parseByteRange(header: string | null, size: number): ByteRange | 'unsatisfiable' | null {
  if (!header) return null

  const m = header.match(/^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)/i)
  if (!m) return null                       // not a byte range → ignore
  const [, firstRaw, lastRaw] = m
  if (!firstRaw && !lastRaw) return null     // "bytes=-" is malformed → ignore

  // Empty file: any range is unsatisfiable.
  if (size <= 0) return 'unsatisfiable'

  let start: number
  let end: number

  if (!firstRaw) {
    // Suffix range: last N bytes.
    const suffix = parseInt(lastRaw, 10)
    if (!Number.isFinite(suffix) || suffix <= 0) return 'unsatisfiable'
    start = Math.max(0, size - suffix)
    end   = size - 1
  } else {
    start = parseInt(firstRaw, 10)
    if (!Number.isFinite(start) || start >= size) return 'unsatisfiable'
    end = lastRaw ? parseInt(lastRaw, 10) : size - 1
    if (!Number.isFinite(end) || end < start) return 'unsatisfiable'
    if (end > size - 1) end = size - 1       // clamp, don't reject
  }

  return { start, end }
}
