/**
 * The 3D console models of the home page, by platform slug. Every file in
 * public/models is a Sketchfab download, optimized with glTF Transform (meshopt
 * and 1024 px WebP textures: 42 MB down to about 2 MB for the eight). The authors
 * are credited on /creditos; the Wii model is CC-BY-SA, so its adapted file is
 * shared under that same license.
 */
/** Lo que el visor necesita para mostrar un modelo: de fábrica o subido por el administrador. */
export interface ViewerModel {
  slug: string
  /** URL del GLB. */
  file: string
  /** Euler angles (radians) that stand the model upright with its front toward +Z. */
  baseRotation?: [number, number, number]
}

export interface ConsoleModel extends ViewerModel {
  name: string
  author: string
  authorUrl: string
  license: 'CC-BY-4.0' | 'CC-BY-SA-4.0'
  licenseUrl: string
  source: string
}

const BY = 'https://creativecommons.org/licenses/by/4.0/'
const BY_SA = 'https://creativecommons.org/licenses/by-sa/4.0/'

export const CONSOLE_MODELS: Record<string, ConsoleModel> = {
  switch: {
    slug: 'switch', name: 'Nintendo Switch', file: '/models/switch.glb',
    author: 'gabrieljuan0322', authorUrl: 'https://sketchfab.com/gabrieljuan0322',
    license: 'CC-BY-4.0', licenseUrl: BY,
    source: 'https://sketchfab.com/3d-models/nintendo-switch-b94e6a6a8c564fee81c2d794da6c5712',
  },
  nds: {
    slug: 'nds', name: 'Nintendo DS Lite', file: '/models/ds-lite.glb',
    author: 'Cianon', authorUrl: 'https://sketchfab.com/Cianon',
    license: 'CC-BY-4.0', licenseUrl: BY,
    source: 'https://sketchfab.com/3d-models/nintendo-ds-lite-ca529eb7208746e89b7a28fd2246659d',
  },
  '3ds': {
    slug: '3ds', name: 'Nintendo 3DS XL', file: '/models/3ds.glb',
    author: 'Joshua P. (Pansdaz)', authorUrl: 'https://sketchfab.com/Pansdaz',
    license: 'CC-BY-4.0', licenseUrl: BY,
    source: 'https://sketchfab.com/3d-models/nintendo-3ds-xl-6cf20040dc0e44559c3e69723945afcc',
  },
  gba: {
    slug: 'gba', name: 'Game Boy Advance', file: '/models/gba.glb',
    author: 'yassineCGI', authorUrl: 'https://sketchfab.com/yassineCGI',
    license: 'CC-BY-4.0', licenseUrl: BY,
    source: 'https://sketchfab.com/3d-models/gameboy-advance-zelda-concept-2c77feea6c1a42d0b20adea68d09b756',
    // Its screen faces the model's +X axis: quarter turn so it faces the camera.
    baseRotation: [0, -Math.PI / 2, 0],
  },
  'super-nintendo-entertainment-system': {
    slug: 'super-nintendo-entertainment-system', name: 'Super Nintendo', file: '/models/snes.glb',
    author: 'Hellbrush', authorUrl: 'https://sketchfab.com/hellbrush',
    license: 'CC-BY-4.0', licenseUrl: BY,
    source: 'https://sketchfab.com/3d-models/snes-6c83b715a5f24baaa6f53bd8f3d705db',
    // Lies flat: tipped toward the camera so the top, with its cartridge slot, shows.
    baseRotation: [0.9, 0, 0],
  },
  wii: {
    slug: 'wii', name: 'Nintendo Wii', file: '/models/wii.glb',
    author: 'lazercar', authorUrl: 'https://sketchfab.com/lazercar',
    license: 'CC-BY-SA-4.0', licenseUrl: BY_SA,
    source: 'https://sketchfab.com/3d-models/nintendo-wii-f2f30aa248c64c4ba542115fce2a5e13',
  },
  psp: {
    slug: 'psp', name: 'Sony PSP', file: '/models/psp.glb',
    author: 'Ilya Ostrovsky (strov)', authorUrl: 'https://sketchfab.com/strov',
    license: 'CC-BY-4.0', licenseUrl: BY,
    source: 'https://sketchfab.com/3d-models/sony-psp-dca89d10ec304d0cab76837750df7761',
    baseRotation: [0.61, -0.09, 0.1],
  },
  psvita: {
    slug: 'psvita', name: 'PS Vita', file: '/models/psvita.glb',
    author: 'mxiv', authorUrl: 'https://sketchfab.com/mxiv',
    license: 'CC-BY-4.0', licenseUrl: BY,
    source: 'https://sketchfab.com/3d-models/ps-vita-d0241d08cee04a169148c275cecc1a5b',
    baseRotation: [1.52, 0.05, 0.47],
  },
}

/** The model with the orientation the owner set in the editor, when there is one. */
export function withOrientation<T extends ViewerModel>(model: T, saved: Record<string, [number, number, number]>): T {
  const rotation = saved[model.slug]
  return rotation ? { ...model, baseRotation: rotation } : model
}

/**
 * The model for a platform: the one uploaded for it when there is one, else the bundled one.
 * The Vita ports platform shares the Vita's.
 */
export function consoleModelFor(platformSlug: string, uploadedFile?: string | null): ViewerModel | null {
  if (uploadedFile) return { slug: platformSlug, file: uploadedFile }
  if (platformSlug === 'psvita-ports') return CONSOLE_MODELS.psvita
  if (platformSlug === 'game-boy') return CONSOLE_MODELS.gba
  return CONSOLE_MODELS[platformSlug] ?? null
}
