import { describe, it, expect } from 'vitest'

import { AUTO_THRESHOLD, baseTitleOf, calcTitleConfidence } from '@/lib/metadata/scoring'

describe('spaces and punctuation do not split a title (#audit)', () => {
  it('"Joukyuu-hen" and "Joukyuuhen" are the same title on the same platform', () => {
    expect(calcTitleConfidence('Shiren Joukyuu-hen', 'Shiren Joukyuuhen', true)).toBeGreaterThanOrEqual(AUTO_THRESHOLD)
  })

  it('"Never Land" and "Neverland" are the same title on the same platform', () => {
    expect(calcTitleConfidence('Return to Neverland', 'Return to Never Land', true)).toBeGreaterThanOrEqual(AUTO_THRESHOLD)
  })
})

describe('a complement suffix is not part of the game title (#audit)', () => {
  it('"Toukiden - Kiwami - Additional Task Set 5" is the game "Toukiden - Kiwami"', () => {
    expect(baseTitleOf('Toukiden - Kiwami - Additional Task Set 5')).toBe('Toukiden - Kiwami')
    expect(calcTitleConfidence('Toukiden - Kiwami - Additional Task Set 5', 'Toukiden: Kiwami', true)).toBeGreaterThanOrEqual(AUTO_THRESHOLD)
  })

  it('a real subtitle is kept', () => {
    expect(baseTitleOf('Bleach - Heat the Soul 6')).toBe('Bleach - Heat the Soul 6')
    expect(baseTitleOf('Zone of the Enders - The 2nd Runner')).toBe('Zone of the Enders - The 2nd Runner')
  })

  it('the sequel guard still holds: "Kung Fu Panda 2" is not "Kung Fu Panda"', () => {
    expect(calcTitleConfidence('Kung Fu Panda 2', 'Kung Fu Panda', true)).toBeLessThan(AUTO_THRESHOLD)
  })
})

describe('number words and the expansion-disc suffix (#audit)', () => {
  it('"Biohazard Zero" is LaunchBox\'s "Biohazard 0" on the same platform', () => {
    expect(calcTitleConfidence('Biohazard Zero - Trial Edition', 'Biohazard 0 (Trial Edition)', true)).toBeGreaterThanOrEqual(AUTO_THRESHOLD)
  })

  it('"Pokemon Colosseum - Kakuchou Disc" is the game "Pokemon Colosseum"', () => {
    expect(baseTitleOf('Pokemon Colosseum - Kakuchou Disc')).toBe('Pokemon Colosseum')
  })
})
