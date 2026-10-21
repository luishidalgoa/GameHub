import { defineConfig } from 'vitest/config'
import path from 'node:path'
import os from 'node:os'

// Every run gets its own SQLite file: the migrations are applied to it in
// tests/global-setup.ts, and nothing here touches the real gamehub.db.
const testDb = path.join(os.tmpdir(), `gamehub-test-${process.pid}.db`)
process.env.DATABASE_URL = `file:${testDb}`

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    fileParallelism: false,
  },
})
