import { describe, expect, it } from 'vitest'
import { kofiToDonation, parseKofiForm, tokenMatches } from '@/lib/donations/kofi'

const NOW = new Date('2026-10-24T10:00:00Z')

function form(payload: unknown): string {
  return `data=${encodeURIComponent(JSON.stringify(payload))}`
}

describe('parseKofiForm', () => {
  it('reads the JSON carried in the data field', () => {
    expect(parseKofiForm(form({ type: 'Donation' }))).toEqual({ type: 'Donation' })
  })

  it('rejects a body without data, with broken JSON, or with a non-object', () => {
    expect(parseKofiForm('other=1')).toBeNull()
    expect(parseKofiForm('data=%7Bnope')).toBeNull()
    expect(parseKofiForm(form([1, 2]))).toBeNull()
    expect(parseKofiForm(form('text'))).toBeNull()
  })
})

describe('tokenMatches', () => {
  it('accepts only the exact configured token', () => {
    expect(tokenMatches('abc123', 'abc123')).toBe(true)
    expect(tokenMatches('abc123', 'abc124')).toBe(false)
    expect(tokenMatches('abc123', 'abc1234')).toBe(false)
  })

  it('never matches when no token is configured or none was sent', () => {
    expect(tokenMatches(null, '')).toBe(false)
    expect(tokenMatches('', '')).toBe(false)
    expect(tokenMatches('abc123', undefined)).toBe(false)
    expect(tokenMatches('abc123', 42)).toBe(false)
  })
})

describe('kofiToDonation', () => {
  const base = {
    type: 'Donation',
    kofi_transaction_id: 'txn-1',
    amount: '3.00',
    currency: 'eur',
    from_name: '  Ana  ',
    message: ' Gracias ',
    timestamp: '2026-10-23T18:00:00Z',
  }

  it('maps a donation to a row, normalising text and currency', () => {
    expect(kofiToDonation(base, NOW)).toEqual({
      platform: 'kofi',
      amount: 3,
      currency: 'EUR',
      note: 'Gracias',
      fromName: 'Ana',
      receivedAt: new Date('2026-10-23T18:00:00Z'),
      source: 'webhook',
      externalId: 'txn-1',
    })
  })

  it('keeps subscriptions and commissions, skips other event types', () => {
    expect(kofiToDonation({ ...base, type: 'Subscription' }, NOW)).not.toBeNull()
    expect(kofiToDonation({ ...base, type: 'Commission' }, NOW)).not.toBeNull()
    expect(kofiToDonation({ ...base, type: 'Shop Order' }, NOW)).toBeNull()
    expect(kofiToDonation({ ...base, type: undefined }, NOW)).toBeNull()
  })

  it('rejects amounts that are not positive numbers', () => {
    expect(kofiToDonation({ ...base, amount: '0' }, NOW)).toBeNull()
    expect(kofiToDonation({ ...base, amount: '-2' }, NOW)).toBeNull()
    expect(kofiToDonation({ ...base, amount: 'abc' }, NOW)).toBeNull()
    expect(kofiToDonation({ ...base, amount: undefined }, NOW)).toBeNull()
  })

  it('falls back to EUR for a bad currency and to now for a bad timestamp', () => {
    const row = kofiToDonation({ ...base, currency: 'EURO', timestamp: 'ayer' }, NOW)
    expect(row?.currency).toBe('EUR')
    expect(row?.receivedAt).toEqual(NOW)
  })

  it('stores no transaction id as null, so it cannot collide on the unique index', () => {
    expect(kofiToDonation({ ...base, kofi_transaction_id: '   ' }, NOW)?.externalId).toBeNull()
  })

  it('caps long names and messages', () => {
    const row = kofiToDonation({ ...base, from_name: 'x'.repeat(300), message: 'y'.repeat(900) }, NOW)
    expect(row?.fromName).toHaveLength(100)
    expect(row?.note).toHaveLength(500)
  })
})
