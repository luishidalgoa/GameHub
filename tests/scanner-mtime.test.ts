import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { statFile, isUnchanged, unitStat, walkDirectory } from '@/lib/scanner/walker'

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamehub-mtime-'))
})
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

/** Writes a file and pins its mtime so the test does not depend on the clock. */
function put(file: string, body: string, mtime: Date) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, body)
  fs.utimesSync(file, mtime, mtime)
}

describe('scanner: a changed file is one with a different size or mtime', () => {
  it('a file replaced with the same size but a new mtime is changed', () => {
    const file = path.join(root, 'game.nsp')
    put(file, 'AAAA', new Date('2026-01-01T00:00:00Z'))
    const before = statFile(file)

    put(file, 'BBBB', new Date('2026-06-01T00:00:00Z'))
    const after = statFile(file)

    expect(after.fileSize).toBe(before.fileSize)
    expect(isUnchanged({ ...before }, after)).toBe(false)
  })

  it('the same file with nothing touched is unchanged', () => {
    const file = path.join(root, 'game.nsp')
    put(file, 'AAAA', new Date('2026-01-01T00:00:00Z'))
    const first = statFile(file)
    expect(isUnchanged({ ...first }, statFile(file))).toBe(true)
  })

  it('a row written before mtime was stored is re-examined once', () => {
    const file = path.join(root, 'game.nsp')
    put(file, 'AAAA', new Date('2026-01-01T00:00:00Z'))
    expect(isUnchanged({ fileSize: BigInt(4), fileMtime: null }, statFile(file))).toBe(false)
  })

  it('a size change is changed even when the mtime matches', () => {
    const file = path.join(root, 'game.nsp')
    put(file, 'AAAA', new Date('2026-01-01T00:00:00Z'))
    const first = statFile(file)
    expect(isUnchanged({ fileSize: BigInt(99), fileMtime: first.fileMtime }, first)).toBe(false)
  })
})

describe('scanner: a folder unit carries the newest mtime of its files', () => {
  it('a replaced file inside the folder moves the unit mtime, even though the folder mtime does not', () => {
    const unit = path.join(root, 'Mod pack')
    put(path.join(unit, 'a.bin'), 'AAAA', new Date('2026-01-01T00:00:00Z'))
    put(path.join(unit, 'b.bin'), 'BBBB', new Date('2026-02-01T00:00:00Z'))
    const before = unitStat(unit)
    expect(before.fileMtime.toISOString()).toBe('2026-02-01T00:00:00.000Z')

    put(path.join(unit, 'a.bin'), 'CCCC', new Date('2026-09-01T00:00:00Z'))
    const after = unitStat(unit)

    expect(after.fileMtime.toISOString()).toBe('2026-09-01T00:00:00.000Z')
    expect(after.fileSize).toBe(BigInt(8))
  })

  it('walkDirectory yields each file with its own mtime', () => {
    put(path.join(root, 'one.nsp'), 'X', new Date('2026-03-03T00:00:00Z'))
    const [entry] = [...walkDirectory(root, ['.nsp'])]
    expect(entry.fileMtime.toISOString()).toBe('2026-03-03T00:00:00.000Z')
  })
})
