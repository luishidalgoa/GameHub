import axios from 'axios'
import { db } from './db'
import { isLocalIp } from './auth'

/** Extract the real client IP from a request, checking all possible sources. */
function clientIp(req: Request): string {
  const h = req.headers as Headers
  // Next.js injects x-forwarded-for even for direct connections
  const xff = h.get('x-forwarded-for')?.split(',')[0].trim()
  if (xff) return xff
  const xri = h.get('x-real-ip')
  if (xri) return xri.trim()
  // Next.js specific header added in some versions
  const nextIp = h.get('x-client-ip') || h.get('cf-connecting-ip')
  if (nextIp) return nextIp.trim()
  return ''
}

/**
 * Returns true if the request should skip the shortener:
 *  - Host header is localhost / 127.0.0.1
 *  - Client IP is in an RFC-1918 private range (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
 *  - Client IP is in the admin-configured bypass list (Setting: shortener_bypass_ips)
 */
export async function isLocalRequest(req: Request): Promise<boolean> {
  const host = ((req.headers as Headers).get('host') ?? '').split(':')[0]
  const ip   = clientIp(req)

  console.log(`[isLocalRequest] host="${host}" ip="${ip}"`)

  if (host === 'localhost' || host === '127.0.0.1') return true
  if (ip && isLocalIp(ip)) return true

  // Admin-configured extra IPs / prefixes (comma-separated)
  const setting = await db.setting.findUnique({ where: { key: 'shortener_bypass_ips' } })
  if (setting?.value) {
    const allowed = setting.value.split(',').map(s => s.trim()).filter(Boolean)
    if (ip && allowed.some(a => ip === a || ip.startsWith(a))) return true
  }

  return false
}

async function getConfig() {
  const [urlS, keyS, paramS] = await Promise.all([
    db.setting.findUnique({ where: { key: 'shortener_url' } }),
    db.setting.findUnique({ where: { key: 'shortener_key' } }),
    db.setting.findUnique({ where: { key: 'shortener_param' } }),
  ])
  return {
    baseUrl:   urlS?.value  || 'https://shrinkme.io/api',
    keyParam:  'api',
    keyValue:  keyS?.value  || '17a7385888b0f04f3e2b9f548465bee9df2fd6fc',
    urlParam:  paramS?.value || 'url',
  }
}

/**
 * Shorten a URL via the configured ad-shortener.
 * Returns null if the API call fails — callers must handle this explicitly.
 */
export async function shorten(targetUrl: string): Promise<string | null> {
  const c = await getConfig()
  const apiUrl = `${c.baseUrl}?${c.keyParam}=${c.keyValue}&${c.urlParam}=${encodeURIComponent(targetUrl)}&format=text`
  try {
    const res = await axios.get(apiUrl, { timeout: 5000, responseType: 'text' })
    const text = typeof res.data === 'string' ? res.data.trim() : String(res.data).trim()
    if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
      return text
    }
    console.error('[shortener] unexpected response:', text)
    return null
  } catch (err) {
    console.error('[shortener] request failed:', err)
    return null
  }
}

/** Build the canonical download URL for a game or DLC token. */
export function buildDownloadUrl(
  gameId: number,
  token: string,
  dlcId?: number,
  req?: Request,
): string {
  let domain = process.env.NEXT_PUBLIC_APP_URL || 'http://gamehub.luishidalgoa.ddns-ip.net:3000'

  // If a request is provided, detect the real protocol from proxy headers
  // so the download URL matches the protocol the client is using (avoids mixed-content)
  if (req) {
    const forwarded = (req.headers as Headers).get('x-forwarded-proto')
    if (forwarded) {
      const proto = forwarded.split(',')[0].trim()
      domain = domain.replace(/^https?/, proto)
    }
  }

  return dlcId
    ? `${domain}/api/download/dlc/${dlcId}?token=${token}`
    : `${domain}/api/download/${gameId}?token=${token}`
}
