import { describe, expect, it } from 'vitest'
import fixture from './fixtures/titulos-reales.json'
import { AUTO_THRESHOLD, calcTitleConfidence } from '@/lib/metadata/scoring'
import { fileToTitle } from '@/lib/utils'

// 150 juegos reales de la base de produccion (#114). Cada fila es un fichero y el
// titulo que la biblioteca guarda para ese mismo juego: deben emparejarse.
type Row = { fileName: string; title: string; platform: string }
const rows = fixture as Row[]

// Casos conocidos que no se emparejan todavia (#114). Cada uno tiene su motivo; el
// test falla si aparece un caso que no esta aqui, o si uno de estos empieza a
// emparejarse (hay que quitarlo de la lista).
const KNOWN_GAPS: Record<string, string> = {
  "Disney's Lilo & Stitch 2 (2004) (E) (M4).gba": 'subtitulo distinto en el proveedor',
  'Rise of the Guardians (2012) (Europe) (En,Fr,De,Es,It).nds': 'subtitulo distinto en el proveedor',
  'SpiderMan Battle for New York (2006) (USA).nds': 'guion en el nombre del proveedor',
  'Ripping Friends, The (2002) (U).gba': 'articulo al principio frente a al final',
  'Street Fighter 2 - The New Challengers (1992) (ESP).smc': 'subtitulo distinto en el proveedor',
  'Brain_Age_Train_Your_Brain (2005).nds': 'guiones bajos en el nombre del fichero',
  'Sonic Colours (2010) (Europe) (En,Ja,Fr,De,Es,It).rvz': 'Colours frente a Colors',
  'James Pond 3 - Operation Starfish (1994) (ESP).sfc': 'el titulo guardado tiene un error de escritura (Starfi5h)',
  'Inazuma Eleven 2 - Tormenta de Fuego (2012).nds': 'titulo traducido en el proveedor',
  'Total Soccer Manager (2001) (Europe) (En,Fr,De,Es,It,Nl).gba': 'el proveedor usa otro titulo para la misma version',
  'Nickelodeon Vol. 1 - GBA 4-Pack (U).gba': 'Vol. frente a Volume',
}

describe('titulos reales de la biblioteca (#114)', () => {
  it('cada fichero se empareja con su titulo guardado, salvo los casos conocidos', () => {
    const rejected = rows
      .filter(r => calcTitleConfidence(fileToTitle(r.fileName), r.title, true) < AUTO_THRESHOLD)
      .map(r => r.fileName)
    const unknown = rejected.filter(f => !(f in KNOWN_GAPS))
    const healed = Object.keys(KNOWN_GAPS).filter(f => !rejected.includes(f))
    expect(unknown).toEqual([])
    expect(healed).toEqual([])
  })
})
