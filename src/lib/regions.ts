/**
 * Region codes GameHub stores in Game.region. They are the canonical values of
 * the ROM-name reader (src/lib/rom-tags.ts), so a scanned game and a hand-edited
 * one end up with the same spelling.
 */
export const REGION_LABELS: Record<string, string> = {
  USA: 'Estados Unidos',
  EUR: 'Europa',
  JPN: 'Japón',
  World: 'Mundial',
  ESP: 'España',
  FRA: 'Francia',
  DEU: 'Alemania',
  ITA: 'Italia',
  NLD: 'Países Bajos',
  SWE: 'Suecia',
  AUS: 'Australia',
  KOR: 'Corea del Sur',
  CHN: 'China',
  TWN: 'Taiwán',
  BRA: 'Brasil',
  CAN: 'Canadá',
  GBR: 'Reino Unido',
  ASI: 'Asia',
  SCN: 'Escandinavia',
  RUS: 'Rusia',
  HKG: 'Hong Kong',
  POR: 'Portugal',
  MEX: 'México',
  NOR: 'Noruega',
  DEN: 'Dinamarca',
  FIN: 'Finlandia',
  POL: 'Polonia',
  GRC: 'Grecia',
  IND: 'India',
  LATAM: 'Latinoamérica',
  Unknown: 'Desconocida',
}

export const REGION_CODES = Object.keys(REGION_LABELS)
