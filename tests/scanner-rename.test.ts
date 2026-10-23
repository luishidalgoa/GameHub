import { describe, it, expect } from 'vitest'
import { groupKeyOf, summarize } from '@/lib/scanner/preview'
import { gameGroupKey } from '@/lib/rom-tags'
import type { FileEntry } from '@/lib/scanner/walker'

const T1 = new Date('2026-01-01T00:00:00Z')
const ROOT = '/roms/switch'

function file(filePath: string, size = 10, mtime = T1): FileEntry {
  const fileName = filePath.split('/').pop()!
  return { filePath, fileName, fileSize: BigInt(size), fileMtime: mtime, extension: '.nsz', parentDir: filePath.slice(0, filePath.lastIndexOf('/')) }
}

describe('scan preview: a renamed file is the same game', () => {
  const oldName = 'Game Boy Advance - NSO [010012F017576000][v0] (0.10 GB).nsz'
  const newName = 'Game Boy Advance - NSO (2023) [010012F017576000][v0] (0.10 GB).nsz'

  it('keys the old and the new name the same way', () => {
    expect(gameGroupKey(oldName)).toBe(gameGroupKey(newName))
  })

  it('shows a renamed file as changed, and its old row as taken over, not gone', () => {
    const renamed = file(`${ROOT}/${newName}`, 100)
    const r = summarize({
      groups: [[renamed]],
      folderPaths: [],
      reachable: [ROOT],
      knownGames: new Map([[`${ROOT}/${oldName}`, { fileSize: BigInt(100), fileMtime: T1, isHidden: false, groupKey: gameGroupKey(oldName) }]]),
      knownDlcs: new Map(),
      mode: 'flat',
    })
    expect(r.files).toEqual({ new: 0, changed: 1, unchanged: 0 })
    expect(r.gone).toBe(0)
    expect(r.sample.changed).toEqual([`${ROOT}/${newName}`])
  })

  it('a file with no missing row of its key is still new', () => {
    const r = summarize({
      groups: [[file(`${ROOT}/Otro juego [0100AAAA00000000][v0].nsp`)]],
      folderPaths: [],
      reachable: [ROOT],
      knownGames: new Map([[`${ROOT}/${oldName}`, { fileSize: BigInt(100), fileMtime: T1, isHidden: false, groupKey: gameGroupKey(oldName) }]]),
      knownDlcs: new Map(),
      mode: 'flat',
    })
    expect(r.files.new).toBe(1)
    expect(r.gone).toBe(1)
  })

  it('a missing row is taken over only once', () => {
    const a = file(`${ROOT}/${newName}`, 100)
    const b = file(`${ROOT}/Game Boy Advance - NSO (2024) [010012F017576000][v0] (0.10 GB).nsz`, 100)
    const r = summarize({
      groups: [[a], [b]],
      folderPaths: [],
      reachable: [ROOT],
      knownGames: new Map([[`${ROOT}/${oldName}`, { fileSize: BigInt(100), fileMtime: T1, isHidden: false, groupKey: gameGroupKey(oldName) }]]),
      knownDlcs: new Map(),
      mode: 'flat',
    })
    expect(r.files.changed).toBe(1)
    expect(r.files.new).toBe(1)
    expect(r.gone).toBe(0)
  })

  it('a folder keeps its key when its files are renamed but keep the Title ID', () => {
    const before = [file(`${ROOT}/Among Us/Among Us [0100B0C013912000][v0].nsp`)]
    const after = [file(`${ROOT}/Among Us/Among Us (2020) [0100B0C013912000][v0].nsp`)]
    expect(groupKeyOf(after, 'folder')).toBe(groupKeyOf(before, 'folder'))
  })
})
