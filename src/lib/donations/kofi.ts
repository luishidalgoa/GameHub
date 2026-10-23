import { timingSafeEqual } from 'node:crypto'

/**
 * Ko-fi webhook rules, kept free of the database so they can be tested alone.
 *
 * Ko-fi posts `application/x-www-form-urlencoded` with one field, `data`, whose
 * value is a JSON document. The document carries `verification_token`, which
 * must match the token configured in Admin → Donaciones.
 */

/** Ko-fi event types that move money we want to record. */
const KEPT_TYPES: readonly string[] = ['Donation', 'Subscription', 'Commission']

const MAX_NOTE = 500
const MAX_NAME = 100

export interface KofiDonation {
  platform: 'kofi'
  amount: number
  currency: string
  note: string | null
  fromName: string | null
  receivedAt: Date
  source: 'webhook'
  externalId: string | null
}

/** The decoded `data` field, or null when the body is not that shape. */
export function parseKofiForm(body: string): Record<string, unknown> | null {
  const raw = new URLSearchParams(body).get('data')
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/**
 * Constant-time comparison. A plain `!==` leaks, through response timing, how
 * much of the token was right. Missing or empty expected tokens never match.
 */
export function tokenMatches(expected: string | null | undefined, received: unknown): boolean {
  if (!expected || typeof received !== 'string') return false
  const a = Buffer.from(expected)
  const b = Buffer.from(received)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Maps a Ko-fi payload to a Donation row. Returns null when the event is not
 * one we keep, or when its amount is not a positive number.
 */
export function kofiToDonation(data: Record<string, unknown>, now: Date = new Date()): KofiDonation | null {
  const type = typeof data.type === 'string' ? data.type : ''
  if (!KEPT_TYPES.includes(type)) return null

  const amount = Number.parseFloat(String(data.amount ?? ''))
  if (!Number.isFinite(amount) || amount <= 0) return null

  const currency = typeof data.currency === 'string' && /^[A-Za-z]{3}$/.test(data.currency)
    ? data.currency.toUpperCase()
    : 'EUR'

  const stamp = typeof data.timestamp === 'string' ? Date.parse(data.timestamp) : NaN
  const receivedAt = Number.isNaN(stamp) ? now : new Date(stamp)

  const message = typeof data.message === 'string' ? data.message.trim() : ''
  const name = typeof data.from_name === 'string' ? data.from_name.trim() : ''
  const txn = typeof data.kofi_transaction_id === 'string' ? data.kofi_transaction_id.trim() : ''

  return {
    platform: 'kofi',
    amount,
    currency,
    note: message ? message.slice(0, MAX_NOTE) : null,
    fromName: name ? name.slice(0, MAX_NAME) : null,
    receivedAt,
    source: 'webhook',
    externalId: txn || null,
  }
}
