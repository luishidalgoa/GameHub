/**
 * Runs once when the server starts (#61). The privacy page promises log periods
 * (IP 7 days, searches 30, downloads 90): those are only kept if something deletes
 * the old rows, and that must not depend on someone visiting the site.
 */
const DAY_MS = 24 * 60 * 60 * 1000

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { pruneLogs } = await import('@/lib/retention')
  const run = () => pruneLogs().catch(err => console.error('[retention] prune failed:', err))
  run()
  setInterval(run, DAY_MS).unref()
}
