import { describe, expect, it } from 'vitest'
import { AUTO_THRESHOLD, calcTitleConfidence } from '@/lib/metadata/scoring'

/** Casos reales de emparejamiento (#114): [titulo del juego, titulo del proveedor, debe aceptarse]. */
const CASES: Array<[string, string, boolean]> = [
  ["Kirby's Dream Land", "Kirbys Dream Land", true],
  ['Ratchet & Clank', 'Ratchet and Clank', true],
  ['Final Fantasy VII', 'Final Fantasy 7', true],
  ['Rocky II', 'Rocky 2', true],
  ['Super Mario Bros. 3', 'Super Mario Bros 3', true],
  ['Pokemon Y', 'Pokemon X', false],
  ['Super Mario World', 'Super Mario 64', false],
  ['Dragon Quest VII Reimagined', 'Dragon Quest VII', true],
]

describe('emparejamiento de titulos (#114)', () => {
  it.each(CASES)('"%s" frente a "%s" -> %s', (game, provider, accept) => {
    const score = calcTitleConfidence(game, provider, true)
    expect(score >= AUTO_THRESHOLD).toBe(accept)
  })
})
