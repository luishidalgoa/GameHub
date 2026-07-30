/**
 * IP parsing, CIDR matching and client-IP resolution.
 *
 * Runs in BOTH the Edge middleware and Node route handlers, so this module must
 * stay free of Node built-ins (no `net`, no `crypto`).
 *
 * ## Why the client IP is not always knowable
 *
 * Next.js gives a request handler no access to the TCP peer address:
 * `NextRequest.ip` is only populated by Vercel's infrastructure (and was removed
 * in Next 15). The only trustworthy source when self-hosting is a reverse proxy
 * that overwrites `X-Real-IP` / appends to `X-Forwarded-For`.
 *
 * Both headers are trivially forgeable by the client, so they are read ONLY when
 * `TRUST_PROXY` says a proxy really is in front. Reached directly (e.g. the
 * Switch hitting `http://<pi-lan-ip>:3001`) there is no proxy, no header, and
 * therefore **no client IP** — `resolveClientIp` returns `null` and callers must
 * decide explicitly what that means instead of silently assuming localhost.
 */

// ── Parsing ───────────────────────────────────────────────────────────────────

export type IpFamily = 4 | 6

export interface ParsedIp {
  /** Numeric value: 32-bit for IPv4, 128-bit for IPv6. */
  value:  bigint
  family: IpFamily
}

/**
 * Parse an IPv4 / IPv6 address into a numeric value.
 * IPv4-mapped IPv6 (`::ffff:192.168.1.5`) collapses to plain IPv4 so a
 * `192.168.0.0/16` rule still matches it. Returns null for anything unparseable
 * — including the empty string and Apache's literal `(null)`.
 */
export function parseIp(raw: string | null | undefined): ParsedIp | null {
  if (!raw) return null
  const s = raw.trim().replace(/^\[|\]$/g, '')
  if (!s) return null

  // Strip a zone index (fe80::1%eth0) — irrelevant for range checks.
  const noZone = s.split('%')[0]
  if (!noZone) return null

  if (noZone.includes(':')) return parseIpv6(noZone)
  return parseIpv4(noZone)
}

function parseIpv4(s: string): ParsedIp | null {
  const parts = s.split('.')
  if (parts.length !== 4) return null
  let value = BigInt(0)
  for (const part of parts) {
    // Reject empty, non-numeric, out-of-range and zero-padded octets ("01").
    if (!/^\d{1,3}$/.test(part)) return null
    if (part.length > 1 && part[0] === '0') return null
    const n = parseInt(part, 10)
    if (n > 255) return null
    value = (value << BigInt(8)) | BigInt(n)
  }
  return { value, family: 4 }
}

function parseIpv6(s: string): ParsedIp | null {
  // A trailing dotted-quad ("::ffff:192.168.1.5", "64:ff9b::1.2.3.4") becomes
  // the two hex groups it encodes.
  let head = s
  const lastColon = s.lastIndexOf(':')
  const tail = s.slice(lastColon + 1)
  if (tail.includes('.')) {
    const v4 = parseIpv4(tail)
    if (!v4) return null
    const hi = (v4.value >> BigInt(16)) & BigInt(0xffff)
    const lo = v4.value & BigInt(0xffff)
    head = `${s.slice(0, lastColon + 1)}${hi.toString(16)}:${lo.toString(16)}`
  }

  const halves = head.split('::')
  if (halves.length > 2) return null

  const toGroups = (part: string): string[] | null => {
    if (!part) return []
    const groups = part.split(':')
    for (const g of groups) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null
    }
    return groups
  }

  const left  = toGroups(halves[0])
  const right = halves.length === 2 ? toGroups(halves[1]) : []
  if (!left || !right) return null

  const explicit = left.length + right.length
  if (halves.length === 2) {
    if (explicit > 7) return null // "::" must stand for at least one group
  } else if (explicit !== 8) {
    return null
  }

  const groups = [
    ...left,
    ...Array<string>(8 - explicit).fill('0'),
    ...right,
  ]

  let value = BigInt(0)
  for (const g of groups) {
    value = (value << BigInt(16)) | BigInt(parseInt(g, 16))
  }

  // IPv4-mapped (::ffff:0:0/96) → treat as the IPv4 address it carries.
  const MAPPED_PREFIX = BigInt('0xffff')
  if (value >> BigInt(32) === MAPPED_PREFIX) {
    return { value: value & BigInt('0xffffffff'), family: 4 }
  }

  return { value, family: 6 }
}

/** Canonical string form, or null if unparseable. Use before logging/storing. */
export function normalizeIp(raw: string | null | undefined): string | null {
  const parsed = parseIp(raw)
  if (!parsed) return null
  if (parsed.family === 4) {
    const v = parsed.value
    return [24, 16, 8, 0].map((sh) => Number((v >> BigInt(sh)) & BigInt(255))).join('.')
  }
  const groups: string[] = []
  for (let i = 7; i >= 0; i--) {
    groups.push(((parsed.value >> BigInt(i * 16)) & BigInt(0xffff)).toString(16))
  }
  return groups.join(':')
}

// ── CIDR matching ─────────────────────────────────────────────────────────────

/**
 * Match an IP against a CIDR block or a bare address ("10.0.0.5" == /32).
 * Families must match: an IPv6 client never matches an IPv4 rule.
 */
export function isIpInCidr(ip: string | ParsedIp, cidr: string): boolean {
  const addr = typeof ip === 'string' ? parseIp(ip) : ip
  if (!addr) return false

  const [netPart, prefixPart] = cidr.trim().split('/')
  const net = parseIp(netPart)
  if (!net || net.family !== addr.family) return false

  const width = net.family === 4 ? 32 : 128
  const prefix = prefixPart === undefined ? width : parseInt(prefixPart, 10)
  if (isNaN(prefix) || prefix < 0 || prefix > width) return false

  const shift = BigInt(width - prefix)
  return (addr.value >> shift) === (net.value >> shift)
}

export function isIpInAnyCidr(ip: string | ParsedIp, cidrs: readonly string[]): boolean {
  const addr = typeof ip === 'string' ? parseIp(ip) : ip
  if (!addr) return false
  return cidrs.some((c) => isIpInCidr(addr, c))
}

/** Parse a comma/space separated CIDR list, dropping anything unparseable. */
export function parseCidrList(spec: string | undefined | null): string[] {
  if (!spec) return []
  return spec
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((c) => {
      const [net] = c.split('/')
      return parseIp(net) !== null
    })
}

// ── Private / trusted ranges ──────────────────────────────────────────────────

/**
 * RFC-1918 + loopback + link-local, and their IPv6 equivalents.
 * Deliberately EXCLUDES 100.64.0.0/10 (RFC 6598 shared address space): that is
 * carrier-grade NAT, i.e. the public internet from your side — but it is also
 * Tailscale's range, so add it to `TRUSTED_NETWORKS` when you use Tailscale.
 */
const PRIVATE_RANGES = [
  '127.0.0.0/8',      // loopback
  '10.0.0.0/8',       // RFC 1918
  '172.16.0.0/12',    // RFC 1918
  '192.168.0.0/16',   // RFC 1918
  '169.254.0.0/16',   // link-local
  '::1/128',          // loopback
  'fc00::/7',         // unique local address (fc00::/8 + fd00::/8)
  'fe80::/10',        // link-local
] as const

export function isPrivateIp(ip: string | ParsedIp): boolean {
  return isIpInAnyCidr(ip, PRIVATE_RANGES)
}

/** Extra operator-declared trusted ranges, e.g. a VPN subnet or Tailscale. */
export function extraTrustedNetworks(): string[] {
  return parseCidrList(process.env.TRUSTED_NETWORKS)
}

/** Private ranges plus anything listed in `TRUSTED_NETWORKS`. */
export function isTrustedIp(ip: string | ParsedIp): boolean {
  return isPrivateIp(ip) || isIpInAnyCidr(ip, extraTrustedNetworks())
}

// ── Client IP resolution ──────────────────────────────────────────────────────

export type HeaderReader = { get: (name: string) => string | null }

/**
 * True when a reverse proxy is in front and its forwarding headers may be
 * trusted. Defaults to false: without a proxy those headers are pure client
 * input and must never drive an access decision.
 */
export function trustProxy(): boolean {
  const v = (process.env.TRUST_PROXY ?? '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

/**
 * Best-effort client IP, or `null` when it cannot be established.
 *
 * `null` is a real answer, not an error — see the module header. Callers must
 * handle it explicitly; never fall back to a hardcoded address.
 *
 * With `TRUST_PROXY` enabled we read `X-Real-IP` first (both the Apache and
 * nginx templates *overwrite* it, so it cannot be spoofed) and otherwise take
 * the **last** `X-Forwarded-For` entry — the one our own proxy appended. The
 * conventional leftmost entry is whatever the client chose to send.
 */
export function resolveClientIp(headers: HeaderReader): string | null {
  if (!trustProxy()) return null

  const realIp = normalizeIp(headers.get('x-real-ip'))
  if (realIp) return realIp

  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const hops = xff.split(',').map((h) => normalizeIp(h)).filter((h): h is string => h !== null)
    if (hops.length > 0) return hops[hops.length - 1]
  }

  return null
}
