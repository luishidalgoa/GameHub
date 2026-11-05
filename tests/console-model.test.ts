import { describe, it, expect } from 'vitest'
import { consoleModelFor, withOrientation } from '@/lib/consoles'

describe('consoleModelFor', () => {
  it('usa el modelo subido antes que el de fábrica', () => {
    expect(consoleModelFor('psp', '/api/covers/proxy/models/psp.glb?v=1')).toEqual({
      slug: 'psp', file: '/api/covers/proxy/models/psp.glb?v=1',
    })
  })

  it('sin modelo subido usa el de fábrica, con sus compartidos', () => {
    expect(consoleModelFor('psp')?.file).toBe('/models/psp.glb')
    expect(consoleModelFor('psvita-ports')?.slug).toBe('psvita')
  })

  it('una plataforma sin modelo ni subido no tiene visor', () => {
    expect(consoleModelFor('xbox')).toBeNull()
  })

  it('una plataforma sin modelo de fábrica puede tener el suyo subido', () => {
    expect(consoleModelFor('xbox', '/api/covers/proxy/models/xbox.glb')?.file).toBe('/api/covers/proxy/models/xbox.glb')
  })
})

describe('withOrientation', () => {
  it('aplica la orientación guardada por el slug del modelo', () => {
    const base = { slug: 'psp', file: '/models/psp.glb', baseRotation: [0, 0, 0] as [number, number, number] }
    expect(withOrientation(base, { psp: [1, 2, 3] }).baseRotation).toEqual([1, 2, 3])
    expect(withOrientation(base, {}).baseRotation).toEqual([0, 0, 0])
  })
})
