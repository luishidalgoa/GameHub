/**
 * Curation worker — the only process in the deployment that can write to the
 * media library.
 *
 * It ships in the same image as the web app and shares its code, but runs as a
 * separate container with `network_mode: none`: no interface, no listening
 * port, no way out. The container that *is* exposed to the internet keeps /mnt
 * mounted read-only. Each half has exactly one of the two capabilities, and
 * neither has both.
 *
 *   ./data/curation/plan-*.json   ← the web app drops approved plans here
 *   ./data/curation/applied/      ← plans that went through cleanly
 *   ./data/curation/failed/       ← plans with at least one error, kept for review
 *   ./data/curation/undo/         ← undo maps, one per applied plan
 *
 * Usage:
 *   node worker/curation.js            apply everything pending, then exit
 *   node worker/curation.js --watch    apply, then keep watching (the compose default)
 *   node worker/curation.js --dry      show what would happen, touch nothing
 *   node worker/curation.js --revert <undo-map.json>
 */

import { readdir, rename, mkdir, readFile } from 'fs/promises'
import { watch } from 'fs'
import path from 'path'

import { applyPlan, revertPlan, type PlanEntry } from '@/lib/curation/apply'

function log(msg: string): void {
  const t = new Date().toISOString().slice(11, 19)
  console.log(`${t}  ${msg}`)
}

/**
 * Derived from DATABASE_URL so it follows the data volume wherever it is
 * mounted — the same derivation the plan API uses, deliberately.
 */
function dataRoot(): string {
  const url = process.env.DATABASE_URL ?? ''
  const file = url.replace(/^file:/, '').split('?')[0]
  return file ? path.dirname(path.resolve(file)) : '/data'
}

function planDir(root: string): string {
  return path.join(root, 'curation')
}

async function pendingPlans(dir: string): Promise<string[]> {
  try {
    const names = await readdir(dir)
    return names
      .filter(f => f.startsWith('plan-') && f.endsWith('.json'))
      .sort()
      .map(f => path.join(dir, f))
  } catch {
    return []
  }
}

async function readPlan(file: string): Promise<PlanEntry[] | null> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'))
    const entries = parsed?.entries
    return Array.isArray(entries) ? (entries as PlanEntry[]) : []
  } catch (err) {
    log(`  ! unreadable plan ${path.basename(file)}: ${err instanceof Error ? err.message : err}`)
    return null
  }
}

async function runOnce(dryRun: boolean): Promise<void> {
  const root = dataRoot()
  const dir = planDir(root)
  const plans = await pendingPlans(dir)

  if (plans.length === 0) {
    log('no pending plans')
    return
  }

  const applied = path.join(dir, 'applied')
  const failed = path.join(dir, 'failed')
  if (!dryRun) {
    await mkdir(applied, { recursive: true })
    await mkdir(failed, { recursive: true })
  }

  for (const file of plans) {
    const entries = await readPlan(file)
    if (entries === null) {
      // Unreadable: park it rather than retrying it forever on every wake-up.
      if (!dryRun) await rename(file, path.join(failed, path.basename(file))).catch(() => {})
      continue
    }

    log(`${path.basename(file)}: ${entries.length} entries`)
    const result = await applyPlan(entries, { dataRoot: root, dryRun, log })
    if (dryRun) continue

    const dest = result.failed > 0 ? failed : applied
    await rename(file, path.join(dest, path.basename(file))).catch(err =>
      log(`  ! could not archive the plan: ${err.message}`),
    )
    if (result.undoMap) log(`  to undo:  node worker/curation.js --revert ${result.undoMap}`)
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)

  const revertAt = argv.indexOf('--revert')
  if (revertAt !== -1) {
    const mapFile = argv[revertAt + 1]
    if (!mapFile) {
      console.error('--revert needs the path to an undo map')
      process.exit(2)
    }
    const entries = JSON.parse(await readFile(mapFile, 'utf8')) as PlanEntry[]
    await revertPlan(entries, log)
    return
  }

  const dryRun = argv.includes('--dry')
  await runOnce(dryRun)

  if (!argv.includes('--watch')) return

  const dir = planDir(dataRoot())
  await mkdir(dir, { recursive: true })
  log(`watching ${dir}`)

  // The app writes each plan under a temp name and renames it into place, so a
  // filename starting with "plan-" is always a complete file by the time we
  // see it. Runs are serialised through `busy`, and `again` remembers events
  // that arrived mid-run so nothing is missed.
  let busy = false
  let again = false
  const trigger = async () => {
    if (busy) {
      again = true
      return
    }
    busy = true
    try {
      do {
        again = false
        await runOnce(false)
      } while (again)
    } catch (err) {
      log(`! run failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      busy = false
    }
  }

  watch(dir, (_event, filename) => {
    if (filename && filename.startsWith('plan-') && filename.endsWith('.json')) {
      void trigger()
    }
  })

  // fs.watch can miss events on some filesystems; a slow sweep is the backstop.
  setInterval(() => void trigger(), 5 * 60_000)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
