import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { POST as trackTorrent } from '@/app/api/track/torrent/route'
import { parseTorrentReport } from '@/lib/torrent-report'

// Una descarga torrent terminada en GameHubNX llega aquí y queda en el registro de descargas,
// igual que una directa. Datos sintéticos: la fuente y el infohash son del test.
const SOURCE = 'test-torrent-track'
const HASH = '9e2471d4ffbe0efecf4d5ada4f5c6607e57a2244'
const TITLE_ID = '0100CCCC00000001'
const EXTERNAL_KEY = `torrent:${SOURCE}:id:${TITLE_ID}`

let gameId = 0

function report(body: unknown, ua = 'GameHubNX/1.18.11') {
  return new Request('http://127.0.0.1/api/track/torrent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': ua },
    body: JSON.stringify(body),
  })
}

beforeAll(async () => {
  const platform = await db.platform.upsert({
    where: { slug: 'switch' },
    update: {},
    create: { slug: 'switch', name: 'Switch', scanPath: '/nonexistent', extensions: '.nsp,.nsz', scanMode: 'folder' },
  })
  await db.externalGame.create({
    data: {
      source: SOURCE, sourceKey: 'track', platformId: platform.id, title: 'TRACK TORRENT',
      titleId: TITLE_ID, magnet: `magnet:?xt=urn:btih:${HASH}`, sourceUrl: 'http://example.test/track',
      syncedAt: new Date(),
    },
  })
  const game = await db.game.create({
    data: {
      platformId: platform.id,
      filePath: `torrent://switch/id:${TITLE_ID}`,
      fileName: 'TRACK TORRENT.nsp',
      fileSize: BigInt(1234),
      title: 'TRACK TORRENT',
      titleId: TITLE_ID,
      source: 'torrent',
      externalKey: EXTERNAL_KEY,
    },
  })
  gameId = game.id
})

afterAll(async () => {
  await db.downloadLog.deleteMany({ where: { gameId } })
  await db.externalGame.deleteMany({ where: { source: SOURCE } })
  await db.game.deleteMany({ where: { externalKey: EXTERNAL_KEY } })
})

describe('parseTorrentReport', () => {
  it('acepta un infohash válido y normaliza a minúsculas', () => {
    expect(parseTorrentReport({ infoHash: HASH.toUpperCase(), name: 'x', size: 10 }))
      .toEqual({ infoHash: HASH, name: 'x', size: 10 })
  })

  it('rechaza un infohash mal formado o un cuerpo que no es un objeto', () => {
    expect(parseTorrentReport({ infoHash: 'abc' })).toBeNull()
    expect(parseTorrentReport({ infoHash: 'z'.repeat(40) })).toBeNull()
    expect(parseTorrentReport(null)).toBeNull()
    expect(parseTorrentReport('texto')).toBeNull()
  })

  it('descarta un tamaño negativo o no entero sin rechazar el aviso', () => {
    expect(parseTorrentReport({ infoHash: HASH, size: -1 })?.size).toBeNull()
    expect(parseTorrentReport({ infoHash: HASH, size: 1.5 })?.size).toBeNull()
  })
})

describe('POST /api/track/torrent', () => {
  it('registra una descarga completa del juego de la tienda', async () => {
    const res = await trackTorrent(report({ infoHash: HASH, name: 'TRACK TORRENT.nsp', size: 1234 }))
    expect(res.status).toBe(204)

    const rows = await db.downloadLog.findMany({ where: { gameId } })
    expect(rows).toHaveLength(1)
    expect(rows[0].completed).toBe(true)
    expect(rows[0].fileName).toBe('TRACK TORRENT.nsp')
    expect(rows[0].fileSize).toBe(BigInt(1234))
    expect(rows[0].bytesSent).toBe(BigInt(1234))
    expect(rows[0].client).toBe('gamehubnx')
    expect(rows[0].finishedAt).not.toBeNull()
  })

  it('no cuenta un infohash que no es de la tienda', async () => {
    const before = await db.downloadLog.count({ where: { gameId } })
    const res = await trackTorrent(report({ infoHash: 'f'.repeat(40), name: 'ajeno', size: 1 }))
    expect(res.status).toBe(404)
    expect(await db.downloadLog.count({ where: { gameId } })).toBe(before)
  })

  it('responde 400 a un cuerpo inválido', async () => {
    const res = await trackTorrent(report({ infoHash: 'nope' }))
    expect(res.status).toBe(400)
  })
})
