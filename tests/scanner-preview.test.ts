import { describe, it, expect } from 'vitest'
import { summarize } from '@/lib/scanner/preview'
import type { FileEntry } from '@/lib/scanner/walker'

const T1 = new Date('2026-01-01T00:00:00Z')
const T2 = new Date('2026-06-01T00:00:00Z')

function file(filePath: string, size = 10, mtime = T1): FileEntry {
  return { filePath, fileName: filePath.split('/').pop()!, fileSize: BigInt(size), fileMtime: mtime, extension: '.nsp', parentDir: filePath.slice(0, filePath.lastIndexOf('/')) }
}

const ROOT = '/roms/switch'

describe('scan preview: what the next scan would do', () => {
  it('counts a file with no row as new, and lists it', () => {
    const r = summarize({ groups: [[file(`${ROOT}/a.nsp`)]], folderPaths: [], reachable: [ROOT], knownGames: new Map(), knownDlcs: new Map() })
    expect(r.files).toEqual({ new: 1, changed: 0, unchanged: 0 })
    expect(r.sample.new).toEqual([`${ROOT}/a.nsp`])
  })

  it('counts a row whose size and mtime still match as unchanged', () => {
    const f = file(`${ROOT}/a.nsp`)
    const r = summarize({ groups: [[f]], folderPaths: [], reachable: [ROOT], knownGames: new Map([[f.filePath, { fileSize: f.fileSize, fileMtime: T1 }]]), knownDlcs: new Map() })
    expect(r.files).toEqual({ new: 0, changed: 0, unchanged: 1 })
  })

  it('counts a same-size file with a newer mtime as changed', () => {
    const f = file(`${ROOT}/a.nsp`, 10, T2)
    const r = summarize({ groups: [[f]], folderPaths: [], reachable: [ROOT], knownGames: new Map([[f.filePath, { fileSize: f.fileSize, fileMtime: T1 }]]), knownDlcs: new Map() })
    expect(r.files).toEqual({ new: 0, changed: 1, unchanged: 0 })
    expect(r.sample.changed).toEqual([f.filePath])
  })

  it('a row whose file is gone under a reachable root is counted as gone', () => {
    const r = summarize({ groups: [], folderPaths: [], reachable: [ROOT], knownGames: new Map([[`${ROOT}/old.nsp`, { fileSize: BigInt(1), fileMtime: T1, isHidden: false }]]), knownDlcs: new Map() })
    expect(r.gone).toBe(1)
    expect(r.sample.gone).toEqual([`${ROOT}/old.nsp`])
  })

  it('a row under a root that is not reachable is not counted as gone', () => {
    const r = summarize({ groups: [], folderPaths: [], reachable: [], knownGames: new Map([[`${ROOT}/old.nsp`, { fileSize: BigInt(1), fileMtime: T1, isHidden: false }]]), knownDlcs: new Map() })
    expect(r.gone).toBe(0)
  })

  it('an already hidden row is not counted as gone again', () => {
    const r = summarize({ groups: [], folderPaths: [], reachable: [ROOT], knownGames: new Map([[`${ROOT}/old.nsp`, { fileSize: BigInt(1), fileMtime: T1, isHidden: true }]]), knownDlcs: new Map() })
    expect(r.gone).toBe(0)
  })

  it('a game stored under its folder path (no base file) is not gone while the folder is there', () => {
    const folder = `${ROOT}/Game`
    const r = summarize({
      groups: [[file(`${folder}/Game-DLC.nsp`)]],
      folderPaths: [folder],
      reachable: [ROOT],
      knownGames: new Map([[folder, { fileSize: BigInt(0), fileMtime: new Date(0), isHidden: false }]]),
      knownDlcs: new Map(),
    })
    expect(r.gone).toBe(0)
  })

  it('in a group with one new DLC, the known base still counts as unchanged and the DLC as new', () => {
    const base = file(`${ROOT}/Game/base.nsp`)
    const dlc = file(`${ROOT}/Game/dlc.nsp`)
    const r = summarize({
      groups: [[base, dlc]],
      folderPaths: [`${ROOT}/Game`],
      reachable: [ROOT],
      knownGames: new Map([[base.filePath, { fileSize: base.fileSize, fileMtime: T1 }]]),
      knownDlcs: new Map(),
    })
    expect(r.files).toEqual({ new: 1, changed: 0, unchanged: 1 })
  })

  it('a DLC row whose file is gone is counted as gone', () => {
    const r = summarize({ groups: [], folderPaths: [], reachable: [ROOT], knownGames: new Map(), knownDlcs: new Map([[`${ROOT}/Game/u.nsp`, { fileSize: BigInt(1), fileMtime: T1 }]]) })
    expect(r.gone).toBe(1)
  })
})
