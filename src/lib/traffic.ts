import { db } from './db'
import { detectDevice, detectBrowser } from './tracker'

export function getClientIp(req: Request): string {
  const h = req.headers as unknown as { get: (k: string) => string | null }
  return (
    h.get('x-forwarded-for')?.split(',')[0].trim() ??
    h.get('x-real-ip') ??
    '127.0.0.1'
  )
}

export async function logDownloadStart(opts: {
  req: Request
  gameId: number
  dlcId?: number
  dlcType?: string
  fileName: string
  fileSize: bigint
}): Promise<number> {
  const ip = getClientIp(opts.req)
  const h = opts.req.headers as unknown as { get: (k: string) => string | null }
  const ua = h.get('user-agent') ?? ''
  const log = await db.downloadLog.create({
    data: {
      gameId: opts.gameId,
      dlcId: opts.dlcId,
      dlcType: opts.dlcType,
      ip,
      device: detectDevice(ua),
      browser: detectBrowser(ua),
      fileName: opts.fileName,
      fileSize: opts.fileSize,
    },
  })
  return log.id
}

export async function logDownloadComplete(logId: number) {
  await db.downloadLog.update({
    where: { id: logId },
    data: { finishedAt: new Date(), completed: true },
  })
}
