import { db } from './db'

// ── Client detection ──────────────────────────────────────────────────────────

/**
 * Which program is pulling the file — as opposed to which device or browser.
 *
 * This matters because the same game downloaded from the shop can arrive three
 * ways that look nearly identical in the logs: the web UI in a browser, a
 * Tinfoil-family client on the console, and GameHubNX. Telling them apart is
 * what makes the traffic panel able to answer "is the Switch app actually being
 * used, and does it finish its downloads?".
 */
export type DownloadClient =
  | 'gamehubnx'
  | 'cyberfoil'
  | 'tinfoil'
  | 'browser'
  | 'other'

export interface ClientInfo {
  client: DownloadClient
  /** Only ever set when the client declares it; never guessed from a UA. */
  version: string | null
}

/**
 * Prefer an explicit `X-GameHub-Client: <name>/<version>` header over sniffing
 * the User-Agent. Our own client sends it, so its identification is exact;
 * everything else falls back to pattern matching, which is best-effort.
 */
export function detectClient(ua: string, declared?: string | null): ClientInfo {
  const header = (declared ?? '').trim()
  if (header) {
    const [rawName, rawVersion] = header.split('/', 2)
    const name = rawName.trim().toLowerCase()
    const version = (rawVersion ?? '').trim() || null
    if (name === 'gamehubnx') return { client: 'gamehubnx', version }
    // An unknown declared name is still more informative than a UA guess, but
    // it is not trusted enough to invent a new category for.
    if (name) return { client: 'other', version }
  }

  if (!ua) return { client: 'other', version: null }
  if (/GameHubNX/i.test(ua)) return { client: 'gamehubnx', version: null }
  // CyberFoil first: it carries "Tinfoil" in its UA too, so the more specific
  // pattern has to win or every CyberFoil download is filed as Tinfoil.
  if (/CyberFoil/i.test(ua)) return { client: 'cyberfoil', version: null }
  if (/Tinfoil|DBI|Awoo/i.test(ua)) return { client: 'tinfoil', version: null }
  if (/Mozilla\/|Chrome\/|Safari\/|Firefox\/|Edg\//i.test(ua)) {
    return { client: 'browser', version: null }
  }
  return { client: 'other', version: null }
}

// ── Device / Browser detection ────────────────────────────────────────────────

export function detectDevice(ua: string): 'mobile' | 'tablet' | 'desktop' | 'console' | 'unknown' {
  if (!ua) return 'unknown'
  if (/PlayStation|Xbox|Nintendo Switch|SteamDeck/i.test(ua)) return 'console'
  if (/tablet|ipad|kindle|silk/i.test(ua)) return 'tablet'
  if (/mobile|android|iphone|ipod|blackberry|windows phone/i.test(ua)) return 'mobile'
  return 'desktop'
}

export function detectBrowser(ua: string): string {
  if (!ua) return 'Unknown'
  if (/Edg\//i.test(ua)) return 'Edge'
  if (/OPR\//i.test(ua)) return 'Opera'
  if (/Firefox\//i.test(ua)) return 'Firefox'
  if (/Chrome\//i.test(ua)) return 'Chrome'
  if (/Safari\//i.test(ua)) return 'Safari'
  if (/curl\//i.test(ua)) return 'curl'
  return 'Other'
}

export interface UaDetail {
  os: string
  osVersion: string
  deviceModel: string
}

/** Parse a User-Agent string into OS name, version and device model. */
export function parseUaDetail(ua: string): UaDetail {
  if (!ua) return { os: 'Unknown', osVersion: '', deviceModel: '' }

  // iOS (iPhone / iPad / iPod)
  const ios = ua.match(/\(i(?:Phone|Pad|Pod)[^;]*?; CPU(?: iPhone)? OS ([\d_]+)/i)
  if (ios) {
    const version = ios[1].replace(/_/g, '.')
    const isIpad  = /iPad/i.test(ua)
    // iPhone model hint from "iPhone14,2" style
    const modelHint = ua.match(/iPhone(\d+),(\d+)/i)
    const model = isIpad ? 'iPad' : modelHint ? `iPhone (${modelHint[1]},${modelHint[2]})` : 'iPhone'
    return { os: isIpad ? 'iPadOS' : 'iOS', osVersion: version, deviceModel: model }
  }

  // Android
  const android = ua.match(/Android ([\d.]+);?\s*([^)]+?)\s*(?:Build\/|[);])/i)
  if (android) {
    const version    = android[1]
    const rawDevice  = android[2].trim()
    // Strip "wv" (WebView) suffix
    const deviceModel = rawDevice.replace(/\s+wv$/i, '').trim()
    return { os: 'Android', osVersion: version, deviceModel }
  }

  // Windows
  const win = ua.match(/Windows NT ([\d.]+)/i)
  if (win) {
    const ntMap: Record<string, string> = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' }
    const version = ntMap[win[1]] ?? win[1]
    return { os: 'Windows', osVersion: version, deviceModel: 'PC' }
  }

  // macOS
  const mac = ua.match(/Mac OS X ([\d_.]+)/i)
  if (mac) {
    return { os: 'macOS', osVersion: mac[1].replace(/_/g, '.'), deviceModel: 'Mac' }
  }

  // Linux
  if (/Linux/i.test(ua)) return { os: 'Linux', osVersion: '', deviceModel: 'PC' }

  // PlayStation
  if (/PlayStation 5/i.test(ua)) return { os: 'PlayStation', osVersion: '5', deviceModel: 'PS5' }
  if (/PlayStation 4/i.test(ua)) return { os: 'PlayStation', osVersion: '4', deviceModel: 'PS4' }
  if (/Xbox/i.test(ua))           return { os: 'Xbox', osVersion: '', deviceModel: 'Xbox' }

  return { os: 'Unknown', osVersion: '', deviceModel: '' }
}

export function getClientIp(req: Request): string {
  const h = req.headers as unknown as { get: (k: string) => string | null }
  const ip =
    h.get('x-forwarded-for')?.split(',')[0].trim() ??
    h.get('x-real-ip') ??
    '127.0.0.1'
  // Normalize IPv6 loopback to the IPv4 equivalent
  return ip === '::1' ? '127.0.0.1' : ip
}

// ── Geo-lookup (ip-api.com, cached in IpCache) ────────────────────────────────

const GEO_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h

export async function getGeo(ip: string): Promise<{
  country: string | null
  countryCode: string | null
  city: string | null
  isp: string | null
  flagEmoji: string | null
}> {
  // Don't geo-lookup private/loopback IPs
  if (ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip === '::1') {
    return { country: 'Local', countryCode: null, city: null, isp: null, flagEmoji: '🏠' }
  }

  const cached = await db.ipCache.findUnique({ where: { ip } })
  if (cached && Date.now() - cached.cachedAt.getTime() < GEO_CACHE_TTL_MS) {
    return {
      country: cached.country,
      countryCode: cached.countryCode,
      city: cached.city,
      isp: cached.isp,
      flagEmoji: cached.flagEmoji,
    }
  }

  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,countryCode,city,isp`,
      { signal: AbortSignal.timeout(3000) }
    )
    if (!res.ok) throw new Error('geo fetch failed')
    const data = await res.json()
    if (data.status !== 'success') throw new Error('geo status fail')

    const flagEmoji = data.countryCode
      ? String.fromCodePoint(
          ...data.countryCode
            .toUpperCase()
            .split('')
            .map((c: string) => 0x1f1e6 + c.charCodeAt(0) - 65)
        )
      : null

    await db.ipCache.upsert({
      where: { ip },
      update: {
        country: data.country,
        countryCode: data.countryCode,
        city: data.city,
        isp: data.isp,
        flagEmoji,
        cachedAt: new Date(),
      },
      create: {
        ip,
        country: data.country,
        countryCode: data.countryCode,
        city: data.city,
        isp: data.isp,
        flagEmoji,
      },
    })

    return {
      country: data.country,
      countryCode: data.countryCode,
      city: data.city,
      isp: data.isp,
      flagEmoji,
    }
  } catch {
    return { country: null, countryCode: null, city: null, isp: null, flagEmoji: null }
  }
}

// ── Request logging ────────────────────────────────────────────────────────────

export async function trackRequest(opts: {
  req: Request
  path: string
  status?: number
  bytes?: number
  durationMs?: number
}) {
  const ip = getClientIp(opts.req)
  const ua = (opts.req.headers as unknown as { get: (k: string) => string | null }).get('user-agent') ?? ''
  const referer = (opts.req.headers as unknown as { get: (k: string) => string | null }).get('referer') ?? null

  // Fire-and-forget geo lookup (async, don't block response)
  getGeo(ip).catch(() => {})

  await db.requestLog.create({
    data: {
      ip,
      path: opts.path,
      method: 'GET',
      status: opts.status ?? 200,
      userAgent: ua || null,
      device: detectDevice(ua),
      browser: detectBrowser(ua),
      referer,
      bytes: opts.bytes ?? 0,
      durationMs: opts.durationMs,
    },
  })
}

// ── Rate-limit detection ───────────────────────────────────────────────────────

export async function getRateLimitAlerts(): Promise<Array<{
  ip: string
  count: number
  window: string
}>> {
  const since = new Date(Date.now() - 60 * 60 * 1000) // last 1h
  const counts = await db.downloadLog.groupBy({
    by: ['ip'],
    _count: { id: true },
    where: { startedAt: { gte: since } },
    having: { ip: { _count: { gt: 5 } } },
    orderBy: { _count: { id: 'desc' } },
    take: 20,
  })
  return counts.map((c) => ({
    ip: c.ip,
    count: c._count.id,
    window: '1h',
  }))
}
