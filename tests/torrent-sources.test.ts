import { describe, it, expect, vi } from 'vitest'
import { parseSourceConfigs, sourceConfigError, type SourceConfig } from '@/lib/external/source-types'

const valid: SourceConfig = {
  key: 'minerva-psp',
  type: 'minerva-directory',
  url: 'https://minerva-archive.org/browse/No-Intro/Sony%20-%20PlayStation%20Portable%20(PSN)%20(Decrypted)/',
  enabled: true,
}

describe('sourceConfigError', () => {
  it('acepta una fuente bien formada', () => {
    expect(sourceConfigError(valid)).toBeNull()
  })

  it('rechaza una clave con dos puntos, mayúsculas o vacía', () => {
    expect(sourceConfigError({ ...valid, key: 'minerva:psp' })).not.toBeNull()
    expect(sourceConfigError({ ...valid, key: 'Minerva-PSP' })).not.toBeNull()
    expect(sourceConfigError({ ...valid, key: '' })).not.toBeNull()
  })

  it('rechaza un tipo desconocido', () => {
    expect(sourceConfigError({ ...valid, type: 'ftp' as SourceConfig['type'] })).not.toBeNull()
  })

  it('exige https y el host del tipo', () => {
    expect(sourceConfigError({ ...valid, url: 'http://minerva-archive.org/browse/' })).not.toBeNull()
    expect(sourceConfigError({ ...valid, url: 'https://example.com/browse/' })).not.toBeNull()
    expect(sourceConfigError({ ...valid, url: 'no es una url' })).not.toBeNull()
  })

  it('exige enabled booleano', () => {
    expect(sourceConfigError({ ...valid, enabled: 'yes' as unknown as boolean })).not.toBeNull()
  })
})

describe('parseSourceConfigs', () => {
  it('devuelve lista vacía sin datos o con JSON roto', () => {
    expect(parseSourceConfigs(null)).toEqual([])
    expect(parseSourceConfigs('')).toEqual([])
    expect(parseSourceConfigs('{no json')).toEqual([])
    expect(parseSourceConfigs('{"a":1}')).toEqual([])
  })

  it('conserva el orden y descarta las entradas inválidas', () => {
    const raw = JSON.stringify([
      valid,
      { ...valid, key: 'Mala Clave' },
      { ...valid, key: 'segunda', enabled: false },
    ])
    expect(parseSourceConfigs(raw).map(s => s.key)).toEqual(['minerva-psp', 'segunda'])
  })
})

vi.mock('@/lib/db', () => ({ db: {} }))

import { identityOf } from '@/lib/external/torrents'

describe('identidad de un juego torrent', () => {
  it('varias variantes con el mismo nombre corto son un solo juego', () => {
    const a = identityOf({ titleId: null, titleKey: '16t', source: 'minerva-mega-drive', sourceKey: 'topic:2582703' })
    const b = identityOf({ titleId: null, titleKey: '16t', source: 'minerva-mega-drive', sourceKey: 'topic:2579111' })
    expect(a).toBe(b)
  })

  it('sin nombre, cada entrada conserva su propia identidad', () => {
    const a = identityOf({ titleId: null, titleKey: '', source: 'minerva-mega-drive', sourceKey: 'topic:1' })
    const b = identityOf({ titleId: null, titleKey: '', source: 'minerva-mega-drive', sourceKey: 'topic:2' })
    expect(a).not.toBe(b)
  })
})

describe('identidad antigua por topic', () => {
  it('sin nombre, la identidad es la de siempre: topic:<fuente>:<id>', () => {
    expect(identityOf({ titleId: null, titleKey: '', source: 'minerva-mega-drive', sourceKey: 'topic:2582703' }))
      .toBe('topic:minerva-mega-drive:topic:2582703')
  })
})
