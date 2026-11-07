import { describe, expect, it } from 'vitest'
import { clientIdOf, clientSummary, safeHeaders } from '@/lib/client-summary'

describe('clientIdOf', () => {
  it('is 8 hex characters and stable for the same IP and User-Agent', () => {
    const a = clientIdOf('192.168.1.20', 'GameHubNX/1.17.0')
    expect(a).toMatch(/^[0-9a-f]{8}$/)
    expect(clientIdOf('192.168.1.20', 'GameHubNX/1.17.0')).toBe(a)
  })

  it('changes when the IP or the User-Agent changes', () => {
    const base = clientIdOf('192.168.1.20', 'GameHubNX/1.17.0')
    expect(clientIdOf('192.168.1.21', 'GameHubNX/1.17.0')).not.toBe(base)
    expect(clientIdOf('192.168.1.20', 'Mozilla/5.0')).not.toBe(base)
  })
})

describe('safeHeaders', () => {
  it('drops session and credential headers, whatever their case', () => {
    const out = safeHeaders({ Cookie: 'sid=abc', authorization: 'Bearer x', 'user-agent': 'curl/8' })
    expect(out).toEqual({ 'user-agent': 'curl/8' })
  })

  it('keeps the header names lowercase and caps each value', () => {
    const long = 'a'.repeat(1000)
    const out = safeHeaders({ 'X-Forwarded-For': long })
    expect(Object.keys(out)).toEqual(['x-forwarded-for'])
    expect(out['x-forwarded-for']).toHaveLength(300)
  })
})

describe('clientSummary', () => {
  it('carries the detected client, the device and the download, plus every safe header', () => {
    const summary = clientSummary({
      ip: '10.0.0.5',
      headers: { 'user-agent': 'GameHubNX/1.17.0', cookie: 'sid=1', 'accept-language': 'es-ES' },
      detected: { client: 'gamehubnx', clientVersion: '1.17.0', device: 'console', browser: 'Other' },
      os: { os: 'Nintendo', osVersion: '', deviceModel: 'Switch' },
      route: 'shop',
      gameId: 42,
      dlcId: null,
      dlcType: null,
      fileName: 'juego.nsz',
      fileSize: 1000,
      range: 'bytes=0-4194303',
      at: new Date('2026-11-07T10:00:00Z'),
    })
    expect(summary.clientId).toBe(clientIdOf('10.0.0.5', 'GameHubNX/1.17.0'))
    expect(summary.client).toBe('gamehubnx')
    expect(summary.device).toBe('console')
    expect(summary.download).toEqual({ gameId: 42, dlcId: null, dlcType: null, fileName: 'juego.nsz', fileSize: 1000, range: 'bytes=0-4194303' })
    expect(summary.requestedAt).toBe('2026-11-07T10:00:00.000Z')
    expect(summary.headers).toEqual({ 'user-agent': 'GameHubNX/1.17.0', 'accept-language': 'es-ES' })
  })
})

describe('a declared device id identifies the console', () => {
  it('two consoles behind the same IP and User-Agent are told apart by their device id', () => {
    const base = {
      ip: '192.168.0.16',
      headers: { 'user-agent': 'GameHubNX/1.18.1' },
      detected: { client: 'gamehubnx', clientVersion: '1.18.1', device: 'console', browser: 'Other' },
      os: { os: 'Nintendo', osVersion: '', deviceModel: 'Switch' },
      route: 'shop', gameId: 1, dlcId: null, dlcType: null, fileName: 'a.nsz', fileSize: 1, range: null,
      at: new Date('2026-11-07T10:00:00Z'),
    }
    const a = clientSummary({ ...base, deviceId: '62a35e0c-b8be-4469-87eb-9265e9930ca9' })
    const b = clientSummary({ ...base, deviceId: '11111111-2222-3333-4444-555555555555' })
    expect(a.clientId).toBe('62a35e0c-b8be-4469-87eb-9265e9930ca9')
    expect(a.clientId).not.toBe(b.clientId)
  })

  it('without a device id the IP and User-Agent identify the client', () => {
    const s = clientSummary({
      ip: '10.0.0.5', headers: { 'user-agent': 'curl/8' },
      detected: { client: 'other', clientVersion: null, device: 'unknown', browser: 'curl' },
      os: { os: 'Unknown', osVersion: '', deviceModel: '' },
      route: 'shop', gameId: 1, dlcId: null, dlcType: null, fileName: 'a.nsz', fileSize: 1, range: null,
      deviceId: '   ', at: new Date(),
    })
    expect(s.clientId).toBe(clientIdOf('10.0.0.5', 'curl/8'))
  })
})
