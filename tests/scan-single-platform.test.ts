import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { db } from '@/lib/db'
import { runScan } from '@/lib/scanner'

// Scanning one platform must not walk or hide anything in another (#138).
describe('scan one platform, leave the others alone', () => {
  it('a game of another platform whose file is gone stays visible until that platform is scanned', async () => {
    const rootA = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-one-a-'))
    const rootB = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-one-b-'))
    try {
      const aFile = path.join(rootA, 'a.nsp')
      const keepFile = path.join(rootB, 'keep.nsp')
      const goneFile = path.join(rootB, 'gone.nsp')
      fs.writeFileSync(aFile, 'A')
      fs.writeFileSync(keepFile, 'K')
      const aStat = fs.statSync(aFile)
      const keepStat = fs.statSync(keepFile)
      const old = new Date('2020-01-01T00:00:00Z')

      const pa = await db.platform.upsert({
        where: { slug: 'test-one-a' }, update: { scanPath: rootA },
        create: { slug: 'test-one-a', name: 'One A', sortOrder: 990, scanPath: rootA, extensions: '.nsp', scanMode: 'flat' },
      })
      const pb = await db.platform.upsert({
        where: { slug: 'test-one-b' }, update: { scanPath: rootB },
        create: { slug: 'test-one-b', name: 'One B', sortOrder: 991, scanPath: rootB, extensions: '.nsp', scanMode: 'flat' },
      })

      // Platform A is already up to date, so the scan of it adds nothing and
      // starts no metadata work.
      await db.game.create({ data: { filePath: aFile, fileName: 'a.nsp', fileSize: BigInt(aStat.size), fileMtime: aStat.mtime, platformId: pa.id, title: 'A', lastSeenAt: old } })
      // Platform B: one file still there, one that has gone from disk.
      await db.game.create({ data: { filePath: keepFile, fileName: 'keep.nsp', fileSize: BigInt(keepStat.size), fileMtime: keepStat.mtime, platformId: pb.id, title: 'Keep', lastSeenAt: old } })
      await db.game.create({ data: { filePath: goneFile, fileName: 'gone.nsp', fileSize: BigInt(1), platformId: pb.id, title: 'Gone', lastSeenAt: old } })

      await runScan('manual', 'test-one-a')

      const gone = await db.game.findUnique({ where: { filePath: goneFile } })
      expect(gone?.isHidden).toBe(false)
      expect(gone?.lastSeenAt.getTime()).toBe(old.getTime())

      // Control: scanning platform B itself does hide it, so the check above is real.
      await runScan('manual', 'test-one-b')
      const afterOwnScan = await db.game.findUnique({ where: { filePath: goneFile } })
      expect(afterOwnScan?.isHidden).toBe(true)
    } finally {
      fs.rmSync(rootA, { recursive: true, force: true })
      fs.rmSync(rootB, { recursive: true, force: true })
    }
  }, 120000)
})
