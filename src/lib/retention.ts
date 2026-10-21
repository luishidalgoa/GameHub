import { db } from './db'

// Periods declared in the privacy page (src/app/privacy/page.tsx).
const DAY_MS = 24 * 60 * 60 * 1000
export const RETENTION_DAYS = { requestLog: 7, searchLog: 30, downloadLog: 90, ip: 7, ipCache: 7, diagnostics: 30 } as const

let lastRun = 0

export async function pruneLogs(now: number = Date.now()): Promise<{ requests: number; searches: number; downloads: number; ipsCleared: number; geoCache: number }> {
  const ipCutoff = new Date(now - RETENTION_DAYS.ip * DAY_MS)
  const [requests, searches, downloads, searchIps, downloadIps, geo] = await Promise.all([
    db.requestLog.deleteMany({ where: { ts: { lt: new Date(now - RETENTION_DAYS.requestLog * DAY_MS) } } }),
    db.searchLog.deleteMany({ where: { ts: { lt: new Date(now - RETENTION_DAYS.searchLog * DAY_MS) } } }),
    db.downloadLog.deleteMany({ where: { startedAt: { lt: new Date(now - RETENTION_DAYS.downloadLog * DAY_MS) } } }),
    // The privacy page promises IPs live 7 days. The rest of each row (counts,
    // routes, sizes) is kept for its own period, so only the address is cleared.
    db.searchLog.updateMany({ where: { ts: { lt: ipCutoff }, ip: { not: '' } }, data: { ip: '' } }),
    db.downloadLog.updateMany({ where: { startedAt: { lt: ipCutoff }, ip: { not: '' } }, data: { ip: '' } }),
    db.ipCache.deleteMany({ where: { cachedAt: { lt: new Date(now - RETENTION_DAYS.ipCache * DAY_MS) } } }),
    db.clientDiagnostic.deleteMany({ where: { createdAt: { lt: new Date(now - RETENTION_DAYS.diagnostics * DAY_MS) } } }),
  ])
  return {
    requests: requests.count,
    searches: searches.count,
    downloads: downloads.count,
    ipsCleared: searchIps.count + downloadIps.count,
    geoCache: geo.count,
  }
}

/** Runs at most once a day, piggybacking on traffic already being recorded. */
export function maybePruneLogs(): void {
  const now = Date.now()
  if (now - lastRun < DAY_MS) return
  lastRun = now
  pruneLogs(now).catch(() => {})
}
