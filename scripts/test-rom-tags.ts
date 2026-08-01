/** Comprobación del parser de etiquetas de ROM. Ejecutar: npx tsx scripts/test-rom-tags.ts */
import { parseRomTags } from '../src/lib/rom-tags'

const casos: Array<[string, string | null, string[]]> = [
  // — comportamiento que ya existía, no debe cambiar —
  ['Alvin and the Chipmunks (Europe) (En,Fr,De,Es,It).nds', 'EUR', ['en','fr','de','es','it']],
  ['Deadly Skies (E).gba',                                  'EUR', []],
  ['Super Mario World (U) [!].smc',                         'USA', []],
  ['Chrono Trigger (J).sfc',                                'JPN', []],

  // — nuevo: región entre corchetes (Switch / 3DS) —
  ['Animal Crossing New Horizons (2020) [01006F8002326000][US][v0].nsp', 'USA', []],
  ['Life is Strange Double Exposure (2024) [0100B2301F4A8000][v0][US].nsp', 'USA', []],
  ['Kirby and the Forgotten Land (2022) [01004D300C5AE000][v0].nsp', null, []],

  // — la trampa: banderas de volcado de GoodTools NO son regiones —
  ['Zelda (U) [b1].nes',            'USA', []],   // [b1] NO es Brasil
  ['Metroid (J) [a].nes',           'JPN', []],   // [a]  NO es Australia
  ['Castlevania (E) [f].nes',       'EUR', []],   // [f]  NO es Francia
  ['Algun Juego [b].smc',            null, []],   // sin región: nada que inventar

  // — nuevo: región con sufijo pegado —
  ['Black Thorne (1994) (ESP-1).smc',              'ESP', []],
  ['Dragon Ball Z - Hyper Dimension (1996) (ESP - CHIP).smc', 'ESP', []],

  // — no debe inventarse nada —
  ['2 in 1 - Looney Tunes Double Pack (2005).gba', null, []],
  ['Layton curious (2007).zip',                    null, []],
]

let ok = 0, mal = 0
for (const [nombre, region, idiomas] of casos) {
  const t = parseRomTags(nombre)
  const bienR = t.region === region
  const bienL = JSON.stringify(t.languages) === JSON.stringify(idiomas)
  if (bienR && bienL) { ok++; console.log(`  ✔ ${nombre.slice(0, 62)}`) }
  else {
    mal++
    console.log(`  ✘ ${nombre.slice(0, 62)}`)
    if (!bienR) console.log(`      región:  esperaba ${region}  obtuvo ${t.region}`)
    if (!bienL) console.log(`      idiomas: esperaba [${idiomas}]  obtuvo [${t.languages}]`)
  }
}
console.log(`\n  ${ok} correctos, ${mal} fallos`)
process.exit(mal === 0 ? 0 : 1)
