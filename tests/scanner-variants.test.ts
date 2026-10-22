import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { db } from '@/lib/db'
import { runScan } from '@/lib/scanner'

// Two files of one game (two revisions, two regions) share a group key. Each has
// to keep its own row across scans. Before this was fixed, every scan handed the
// row of one file to the other, so the file left out showed up as "new" again.
describe('scanner: variants of one game keep their own paths', () => {
  it('a sibling still on disk is not taken over by another file', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-variants-'))
    try {
      const esp1 = path.join(root, 'Game Title (1994) (ESP-1).smc')
      const esp2 = path.join(root, 'Game Title (1994) (ESP-2).smc')
      fs.writeFileSync(esp1, 'ONE')
      fs.writeFileSync(esp2, 'TWO-LONGER')

      const platform = await db.platform.upsert({
        where: { slug: 'test-variants' }, update: { scanPath: root },
        create: { slug: 'test-variants', name: 'Variants', sortOrder: 992, scanPath: root, extensions: '.smc', scanMode: 'flat' },
      })
      const visible = async () => (await db.game.findMany({
        where: { platformId: platform.id, isHidden: false },
        select: { filePath: true },
      })).map(g => g.filePath).sort()

      await runScan('manual', 'test-variants')
      const first = await visible()
      await runScan('manual', 'test-variants')
      const second = await visible()

      expect(second).toEqual(first)
      // Both files stay known: one is the visible game, the other a region edition
      // of it. Which one is the visible game is the consolidation's choice (by region
      // and size), so the test does not assume it.
      const editions = (await db.gameDlc.findMany({ where: { game: { platformId: platform.id } }, select: { filePath: true } }))
        .map(d => d.filePath)
      const known = [...first, ...editions].sort()
      expect(known).toEqual([esp1, esp2].sort())
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  }, 120000)
})
