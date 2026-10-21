import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

/** Applies the Prisma migrations to the per-run test database before any test. */
export default function setup() {
  const file = process.env.DATABASE_URL!.replace(/^file:/, '')
  fs.rmSync(file, { force: true })
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: process.env,
    stdio: 'pipe',
  })
  return () => fs.rmSync(file, { force: true })
}
