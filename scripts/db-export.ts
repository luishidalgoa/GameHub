/**
 * scripts/db-export.ts
 *
 * Back up the local SQLite database to a timestamped file in the current
 * directory, ready to copy to another machine (e.g. the Raspberry Pi).
 *
 *   npm run db:export
 */
import fs from 'fs'
import path from 'path'

const dbPath = path.resolve(process.cwd(), 'prisma', 'gamehub.db')

if (!fs.existsSync(dbPath)) {
  console.error(`No se encontro la base de datos: ${dbPath}`)
  process.exit(1)
}

const stamp = new Date().toISOString().replace(/[:T]/g, '-').replace(/\..+$/, '')
const dest  = path.resolve(process.cwd(), `gamehub_backup_${stamp}.db`)

fs.copyFileSync(dbPath, dest)

const size = (fs.statSync(dest).size / 1024 / 1024).toFixed(1)
console.log(`Base de datos exportada (${size} MB):`)
console.log(`  ${dest}`)
console.log('Copia ese archivo a la otra maquina y alli ejecuta:  npm run db:import')
