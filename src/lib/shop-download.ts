/**
 * Shared file-serving logic for the two shop download routes.
 *
 * Range-capable, and deliberately sizes every response from `fstat` rather than
 * from the DB column: the console trusts `Content-Length`, so a ROM replaced
 * without a rescan must not be advertised with its old length.
 */
import { NextResponse } from 'next/server'
import fsp from 'fs/promises'
import path from 'path'
import { createFileWebStream } from '@/lib/stream'
import { contentDispositionAttachment, parseByteRange } from '@/lib/http'

export interface ShopDownloadTarget {
  filePath: string
}

export async function serveShopFile(
  req: Request,
  target: ShopDownloadTarget,
): Promise<NextResponse> {
  let fileSize: number
  try {
    const st = await fsp.stat(target.filePath)
    if (!st.isFile()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    fileSize = st.size
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const fileName = path.basename(target.filePath)
  const range    = parseByteRange(req.headers.get('range'), fileSize)

  const baseHeaders: Record<string, string> = {
    'Content-Type':        'application/octet-stream',
    'Accept-Ranges':       'bytes',
    'Content-Disposition': contentDispositionAttachment(fileName),
  }

  if (range === 'unsatisfiable') {
    return new NextResponse(null, {
      status:  416,
      headers: { 'Content-Range': `bytes */${fileSize}` },
    })
  }

  if (range) {
    const { start, end } = range
    return new NextResponse(createFileWebStream(target.filePath, { start, end }), {
      status: 206,
      headers: {
        ...baseHeaders,
        'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': String(end - start + 1),
      },
    })
  }

  return new NextResponse(createFileWebStream(target.filePath), {
    status: 200,
    headers: { ...baseHeaders, 'Content-Length': String(fileSize) },
  })
}
