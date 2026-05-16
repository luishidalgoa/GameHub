export type ScanMode = 'flat' | 'folder' | 'ports'

export interface PlatformConfig {
  slug: string
  name: string
  scanPath: string
  extensions: string[]
  sortOrder: number
  /** Controls how the scanner groups files into games. Default: 'flat' */
  scanMode?: ScanMode
  /** Regex to detect DLC/update subfolders (folder mode only) */
  dlcSubfolderPattern?: RegExp
}

export const PLATFORM_CONFIGS: PlatformConfig[] = [
  {
    slug:      'switch',
    name:      'Nintendo Switch',
    scanPath:  'F:\\Switch\\Games',
    extensions: ['.nsp', '.nsz'],
    sortOrder: 1,
    scanMode:  'folder',
    dlcSubfolderPattern: /dlc|update|patch/i,
  },
  {
    slug:      '3ds',
    name:      'Nintendo 3DS',
    scanPath:  'F:\\3DS\\Games',
    extensions: ['.cia', '.3ds'],
    sortOrder: 2,
  },
  {
    slug:      'nds',
    name:      'Nintendo DS',
    scanPath:  'F:\\NDS\\Games',
    extensions: ['.nds'],
    sortOrder: 3,
  },
  {
    slug:      'wii',
    name:      'Nintendo Wii',
    scanPath:  'F:\\WII\\Games',
    extensions: ['.rvz', '.wbfs', '.iso'],
    sortOrder: 4,
  },
  {
    slug:      'psp',
    name:      'PlayStation Portable',
    scanPath:  'F:\\PSP\\Games',
    extensions: ['.iso'],
    sortOrder: 5,
  },
  {
    // Standard PSVita games: one .vpk per game, flat structure
    slug:      'psvita',
    name:      'PlayStation Vita',
    scanPath:  'F:\\PSVITA\\Games',
    extensions: ['.vpk'],
    sortOrder: 6,
  },
  {
    // PSVita Ports: each port is a .zip (contains .vpk + data folder inside)
    // One .zip file at root = one game
    slug:      'psvita-ports',
    name:      'PS Vita Ports',
    scanPath:  'F:\\PSVITA\\Ports',
    extensions: ['.zip'],
    sortOrder: 7,
  },
]
