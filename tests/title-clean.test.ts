import { describe, it, expect } from 'vitest'
import { cleanSwitchTitle } from '@/lib/external/title-clean'

describe('cleanSwitchTitle', () => {
  it('quita las etiquetas de fichero y el idioma', () => {
    expect(cleanSwitchTitle('Cytus Alpha [NSP][ENG]')).toBe('Cytus Alpha')
    expect(cleanSwitchTitle('Swoosh Cat [NSZ][RUS/Multi17]')).toBe('Swoosh Cat')
  })

  it('quita anotaciones entre paréntesis, también las anidadas y las traducidas', () => {
    expect(cleanSwitchTitle('Mass Effect 1 (порт) [NRO][RUS/ENG]')).toBe('Mass Effect 1')
    expect(cleanSwitchTitle('Royal Hole Poco Academy (王立 穴ポコ学園, Ouritsu Anapoco Gakuen) [NSZ][JAP]')).toBe('Royal Hole Poco Academy')
    expect(cleanSwitchTitle('The Ur-Quan Masters MegaMod HD (порт uqm-megamod / Star Control II (2)) [NSP][ENG]')).toBe('The Ur-Quan Masters MegaMod HD')
  })

  it('quita los DLC y los añadidos tras «+»', () => {
    expect(cleanSwitchTitle('Mail Mole Xpress Deliveries + 2 DLC [NSP][RUS/Multi6]')).toBe('Mail Mole Xpress Deliveries')
    expect(cleanSwitchTitle('Sacred 2 Fallen Angel Remaster + Ice and Blood [NSZ][ENG]')).toBe('Sacred 2 Fallen Angel Remaster')
    expect(cleanSwitchTitle('Game Center CX Arino\'s Retro Game Challenge 1+2 Replay [NSZ][JAP]')).toBe('Game Center CX Arino\'s Retro Game Challenge 1+2 Replay')
  })

  it('en un paquete se queda con el primer título', () => {
    expect(cleanSwitchTitle('Bomber Crew / Space Crew [NSZ][RUS/Multi]')).toBe('Bomber Crew')
    expect(cleanSwitchTitle('Okayu Nyumu /おかゆにゅ～～む！~Okayunyumu! [NSP][ENG]')).toBe('Okayu Nyumu')
    expect(cleanSwitchTitle('South Park: The Stick of Truth + The Fractured But Whole / Южный парк [NSZ][RUS]')).toBe('South Park: The Stick of Truth')
  })

  it('quita la palabra de edición al final', () => {
    expect(cleanSwitchTitle('Mortal Kombat 1 (MK 1) Premium Definitive edition + DLC (вкл. T-1000) [NSZ][RUS/Multi8]')).toBe('Mortal Kombat 1')
    expect(cleanSwitchTitle('Opus Magnum Complete edition (De Re Metallica) [NSZ][ENG]')).toBe('Opus Magnum')
    expect(cleanSwitchTitle('Outward Definitive edition [NSZ][RUS/Multi12]')).toBe('Outward')
  })

  it('no deja un título vacío', () => {
    expect(cleanSwitchTitle('(solo anotación) [NSP]')).toBe('(solo anotación) [NSP]')
  })

  it('un número entre paréntesis es parte del nombre, salvo que siga a un romano', () => {
    expect(cleanSwitchTitle('Four (4) the Elements [NSZ][ENG]')).toBe('4 the Elements')
    expect(cleanSwitchTitle('Seven (7) Days of Rose [NSZ][ENG]')).toBe('7 Days of Rose')
    expect(cleanSwitchTitle('Fantasy General II (2) Invasion + DLC Onslaught [NSZ][ENG]')).toBe('Fantasy General II Invasion')
    expect(cleanSwitchTitle('Dungeon Nightmares I-II (2) Collection [NSZ][ENG]')).toBe('Dungeon Nightmares I-II Collection')
  })

  it('conserva títulos limpios tal cual', () => {
    expect(cleanSwitchTitle('The Renovator Origins [NSZ][RUS/Multi8]')).toBe('The Renovator Origins')
    expect(cleanSwitchTitle('Hannah\'s Day [NSP][RUS/Multi3]')).toBe('Hannah\'s Day')
  })
})
