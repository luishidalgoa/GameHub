import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/** Every route.ts under a folder, recursively. */
function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return routeFiles(full)
    return e.name === 'route.ts' ? [full] : []
  })
}

const read = (file: string) => fs.readFileSync(file, 'utf8')

describe('rutas que exponen o cambian datos del admin', () => {
  it('toda ruta de /api/admin llama a adminGuard', () => {
    const offenders = routeFiles(path.resolve('src/app/api/admin'))
      .filter(file => !read(file).includes('adminGuard('))
      .map(file => path.relative(process.cwd(), file))
    expect(offenders).toEqual([])
  })

  it.each([
    'src/app/api/scanner/stream/route.ts',
    'src/app/api/metadata/[id]/route.ts',
  ])('%s llama a adminGuard', file => {
    expect(read(path.resolve(file))).toContain('adminGuard(')
  })
})
