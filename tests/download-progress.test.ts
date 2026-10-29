import { describe, it, expect } from 'vitest'
import { downloadKindLabel, downloadKindOf, downloadProgress, measureSpeed } from '@/lib/traffic-stats'

const base = { fileSize: 1_000_000, startedAt: 0, now: 10_000, bytesSent: 0, position: 0, bytesPerSecond: 0 }

describe('downloadProgress', () => {
  it('calcula el progreso y el tiempo restante a la velocidad de ahora', () => {
    const p = downloadProgress({ ...base, bytesSent: 250_000, position: 250_000, bytesPerSecond: 100_000, lastByteAt: 9_000 })
    expect(p.progress).toBeCloseTo(0.25)
    expect(p.bytesPerSecond).toBe(100_000)
    expect(p.etaSeconds).toBe(8)
    expect(p.complete).toBe(false)
  })

  it('una descarga parada más de 10 s tiene velocidad 0 y sin tiempo restante', () => {
    const p = downloadProgress({ ...base, bytesSent: 250_000, position: 250_000, bytesPerSecond: 100_000, lastByteAt: -1_000 })
    expect(p.bytesPerSecond).toBe(0)
    expect(p.etaSeconds).toBeNull()
  })

  it('la velocidad media sale del tiempo entre el primer y el último byte', () => {
    const p = downloadProgress({ ...base, bytesSent: 1_000_000, position: 1_000_000, lastByteAt: 5_000 })
    expect(p.averageBps).toBe(200_000)
    expect(p.complete).toBe(true)
  })

  it('el progreso no pasa de 1 aunque se envíen más bytes que el tamaño', () => {
    const p = downloadProgress({ ...base, bytesSent: 1_200_000, position: 1_200_000, lastByteAt: 9_000 })
    expect(p.progress).toBe(1)
  })
})

describe('tipo de descarga', () => {
  it('sin dlcId es el juego base', () => {
    expect(downloadKindOf(null, null)).toBe('base')
  })

  it('un complemento guarda su tipo: dlc, update, mod o region', () => {
    expect(downloadKindOf(7, 'update')).toBe('update')
    expect(downloadKindOf(7, 'mod')).toBe('mod')
    expect(downloadKindOf(7, 'region')).toBe('region')
  })

  it('un complemento sin tipo guardado cuenta como DLC', () => {
    expect(downloadKindOf(7, null)).toBe('dlc')
  })

  it('cada tipo tiene su nombre en pantalla, y uno desconocido se muestra tal cual', () => {
    expect(downloadKindLabel('base')).toBe('Juego base')
    expect(downloadKindLabel('update')).toBe('Actualización')
    expect(downloadKindLabel('otro')).toBe('otro')
  })
})

describe('reanudación y velocidad', () => {
  it('una reanudación en el 78 % muestra el 78 %, no los bytes desde que se reanudó', () => {
    const p = downloadProgress({ ...base, fileSize: 7_000_000_000, bytesSent: 128_000_000, position: 5_830_000_000, bytesPerSecond: 3_000_000, lastByteAt: 9_900 })
    expect(p.progress).toBeCloseTo(0.833, 2)
    expect(p.etaSeconds).toBe(390)
  })

  it('la velocidad sale de dos lecturas: 3 MB/s aunque los tramos lleguen a golpes', () => {
    const first = measureSpeed(undefined, 0, 0)
    const second = measureSpeed(first, 3_000_000, 1000)
    expect(second.bytesPerSecond).toBe(3_000_000)
  })

  it('una lectura muy cercana no cambia la medida: se conserva la anterior', () => {
    const first = measureSpeed(undefined, 0, 0)
    const second = measureSpeed(first, 3_000_000, 1000)
    const third = measureSpeed(second, 3_000_500, 1400)
    expect(third).toBe(second)
  })
})
