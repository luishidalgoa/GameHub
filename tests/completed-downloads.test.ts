import { describe, it, expect } from 'vitest'
import { completedDownloadsByGame, type AttemptRow } from '@/lib/traffic-stats'

const NOW = new Date('2026-11-07T12:00:00Z').getTime()
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000)
const row = (over: Partial<AttemptRow>): AttemptRow => ({
  id: 1, gameId: 7, ip: '192.168.0.16', dlcId: null, fileName: 'lis.nsz',
  fileSize: 1000, bytesSent: 0, frontier: 0, completed: false,
  startedAt: at(600), lastByteAt: null, ...over,
})

describe('a game counts once per finished download, not once per attempt', () => {
  it('a download that was paused and resumed three times is one completed download', () => {
    const rows = [
      row({ id: 1, startedAt: at(300), lastByteAt: at(290), bytesSent: 400, frontier: 400, completed: true }),
      row({ id: 2, startedAt: at(200), lastByteAt: at(190), bytesSent: 300, frontier: 700, completed: true }),
      row({ id: 3, startedAt: at(100), lastByteAt: at(90), bytesSent: 300, frontier: 1000, completed: true }),
    ]
    expect(completedDownloadsByGame(rows, NOW).get(7)).toBe(1)
  })

  it('an unfinished download counts for nothing yet', () => {
    const rows = [row({ id: 1, startedAt: at(300), lastByteAt: at(290), bytesSent: 400, frontier: 400, completed: true })]
    expect(completedDownloadsByGame(rows, NOW).get(7)).toBeUndefined()
  })

  it('two different downloads of the same game are two completed downloads', () => {
    const rows = [
      row({ id: 1, ip: '192.168.0.16', startedAt: at(300), lastByteAt: at(290), bytesSent: 1000, frontier: 1000, completed: true }),
      row({ id: 2, ip: '192.168.0.20', startedAt: at(200), lastByteAt: at(190), bytesSent: 1000, frontier: 1000, completed: true }),
    ]
    expect(completedDownloadsByGame(rows, NOW).get(7)).toBe(2)
  })

  it('a finished download with no byte counter counts when the client finished it', () => {
    const rows = [row({ id: 1, startedAt: at(300), lastByteAt: null, completed: true })]
    expect(completedDownloadsByGame(rows, NOW).get(7)).toBe(1)
  })
})
