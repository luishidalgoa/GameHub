// Next.js instrumentation hook — runs once when the server process starts.
// We use it to auto-resume background jobs (scan / metadata) that were left
// 'running' by a crash or restart, so they continue from where they stopped.
export async function register() {
  // Only on the Node.js server runtime (not edge, not the browser).
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  try {
    const { resumeInterruptedJobs } = await import('@/lib/jobs/runner')
    await resumeInterruptedJobs()
  } catch (err) {
    // Never let a resume failure block server startup.
    console.error('[instrumentation] resumeInterruptedJobs failed:', err)
  }
}
