import { lookup } from 'node:dns/promises'
import net from 'node:net'

/** Largest image the owner can bring in by link. */
export const MAX_REMOTE_IMAGE_BYTES = 15 * 1024 * 1024
const MAX_REDIRECTS = 3

/** True for addresses a public image can never live at: loopback, private, link-local, unspecified or reserved. */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    return a === 0 || a === 10 || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || a >= 224
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase()
    if (v === '::1' || v === '::') return true
    if (v.startsWith('fe80:') || v.startsWith('fc') || v.startsWith('fd')) return true
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    return mapped ? isPrivateAddress(mapped[1]) : false
  }
  return true
}

/** The link as a URL when it is http(s) with no credentials; otherwise null. */
export function parseRemoteUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.username || url.password) return null
    return url
  } catch {
    return null
  }
}

/**
 * Downloads an image the owner pasted a link to. The server fetches it, so the link
 * must not lead inside the network: each address the host resolves to (and each
 * redirect hop) is checked, the size is capped and only images are accepted.
 */
export async function fetchRemoteImage(raw: string): Promise<Buffer> {
  let url = parseRemoteUrl(raw)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!url) throw new Error('Enlace no válido')
    const addresses = await lookup(url.hostname, { all: true })
    if (addresses.length === 0 || addresses.some(a => isPrivateAddress(a.address))) {
      throw new Error('Dirección no permitida')
    }
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
      headers: { 'User-Agent': 'GameHub/1.0', Accept: 'image/*' },
    })
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = parseRemoteUrl(new URL(res.headers.get('location')!, url).toString())
      continue
    }
    if (!res.ok) throw new Error(`La descarga falló (${res.status})`)
    const type = res.headers.get('content-type') ?? ''
    if (!type.startsWith('image/')) throw new Error('El enlace no es una imagen')
    const declared = Number(res.headers.get('content-length') ?? 0)
    if (declared > MAX_REMOTE_IMAGE_BYTES) throw new Error('La imagen es demasiado grande')

    const chunks: Uint8Array[] = []
    let total = 0
    const reader = res.body?.getReader()
    if (!reader) throw new Error('Respuesta vacía')
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      if (total > MAX_REMOTE_IMAGE_BYTES) { await reader.cancel(); throw new Error('La imagen es demasiado grande') }
      chunks.push(value)
    }
    return Buffer.concat(chunks)
  }
  throw new Error('Demasiadas redirecciones')
}
