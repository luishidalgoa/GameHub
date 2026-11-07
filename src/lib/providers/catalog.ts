// Catálogo único de las fuentes de datos de GameHub: qué proveedores existen, cómo se llaman y
// qué puede dar cada uno. Es lo único que escriben a mano quienes añaden una fuente: los
// componentes de búsqueda (metadatos, portadas, banners, logos, fondos y capturas), el editor de
// cadenas y los badges leen de aquí. Los adaptadores del servidor (src/lib/providers/*.ts) están
// tipados contra este catálogo: una fuente nueva sin adaptador no compila.
//
// Sin imports de servidor: lo usan los componentes de cliente.

export const METADATA_SOURCES = ['launchbox', 'rawg', 'steam', 'nintendo'] as const
export type MetadataSourceId = typeof METADATA_SOURCES[number]

export const IMAGE_SOURCES = ['launchbox', 'steamgriddb', 'libretro', 'rawg', 'steam', 'nintendo'] as const
export type ImageSourceId = typeof IMAGE_SOURCES[number]

/** Huecos de imagen de un juego: lo que el editor de imágenes rellena. */
export const IMAGE_SLOTS = ['cover', 'banner', 'logo', 'fanart', 'screenshot'] as const
export type ImageSlot = typeof IMAGE_SLOTS[number]

/** Nombre visible de cada fuente (metadatos o imágenes). */
export const SOURCE_LABEL: Record<MetadataSourceId | ImageSourceId, string> = {
  launchbox:   'LaunchBox',
  rawg:        'RAWG',
  steam:       'Steam',
  nintendo:    'Nintendo',
  steamgriddb: 'SteamGridDB',
  libretro:    'libretro',
}

/** Qué puede dar cada fuente de imágenes. Una fuente aparece en el buscador de un hueco solo si lo cubre. */
export const IMAGE_SOURCE_SLOTS: Record<ImageSourceId, readonly ImageSlot[]> = {
  launchbox:   ['cover', 'banner', 'logo', 'fanart', 'screenshot'],
  steamgriddb: ['cover', 'banner', 'logo', 'fanart'],
  libretro:    ['cover'],
  rawg:        ['cover', 'screenshot'],
  steam:       ['fanart'],
  // La tienda de Nintendo da la portada cuadrada de la eShop (formato secundario), el banner 2×1 y la galería.
  nintendo:    ['cover', 'banner', 'screenshot'],
}

/** Título del buscador de cada hueco («Buscar portadas», «Buscar banners»…). */
export const SLOT_SEARCH_LABEL: Record<ImageSlot, string> = {
  cover:      'portadas',
  banner:     'banners',
  logo:       'logos',
  fanart:     'fondos',
  screenshot: 'capturas',
}

/**
 * Consolas de Nintendo que tiene la tienda, por slug de plataforma de GameHub. Switch 2 es su propia
 * consola en la tienda: nunca se mezcla con Switch 1.
 */
export const NINTENDO_CONSOLE_SLUGS: Record<string, 'switch' | 'switch-2'> = {
  switch: 'switch',
  'switch-2': 'switch-2',
}
