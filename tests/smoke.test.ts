import { afterAll, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { fileToTitle } from '@/lib/utils'

describe('smoke', () => {
  it('quita la extension de ROM y las etiquetas, pero no el punto del titulo', () => {
    expect(fileToTitle('Dr. Mario (USA) [0100].nsp')).toBe('Dr. Mario')
  })

  it('la base de pruebas esta migrada y vacia', async () => {
    expect(await db.platform.count()).toBe(0)
  })

  afterAll(async () => {
    await db.$disconnect()
  })
})
