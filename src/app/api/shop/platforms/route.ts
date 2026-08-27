/**
 * GET /api/shop/platforms
 * Que plataformas puede ofrecer la tienda, para que un cliente sepa que pedir.
 *
 * NO toca /api/shop, que es el indice compatible con Tinfoil/CyberFoil y sirve
 * solo paquetes de Switch. Meter ahi un .gba romperia a cualquier cliente que
 * lo consuma esperando lo que ese formato promete.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardShopRequest, shopBaseUrl } from '@/lib/shop-auth'
import { jpegImageUrl } from '@/lib/cover-url'
import { isSwitchFile, matchesExtensions, platformExtensions } from '@/lib/shop-files'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Emulador recomendado, del JSON que ya guarda la plataforma. */
function recommendedEmulator(raw: string | null): string | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, { name?: string }>
    for (const entry of Object.values(parsed))
      if (entry?.name) return entry.name
  } catch {
    // Un JSON malformado no es motivo para que el endpoint entero falle: la
    // plataforma se publica igual, solo que sin recomendacion.
  }
  return null
}

export async function GET(req: Request) {
  const denied = await guardShopRequest(req)
  if (denied) return denied

  const platforms = await db.platform.findMany({
    where:   { enabled: true },
    orderBy: { sortOrder: 'asc' },
    select: {
      slug: true, name: true, extensions: true, emulators: true,
      emulatorName: true, iconPath: true,
      games: { where: { isHidden: false }, select: { fileName: true } },
    },
  })

  const base = shopBaseUrl(req)
  const files = platforms.map((p) => {
    const exts = platformExtensions(p.extensions)
    // Cuenta de ficheros que ESTA plataforma sabe servir. No se comprueba el
    // disco: hacerlo aqui significaria un stat por juego de toda la biblioteca
    // en cada peticion. Es un techo, no una promesa -- el indice de la
    // plataforma descarta despues lo que no puede medir, igual que el de
    // Switch, asi que puede servir menos de los que dice esta cifra.
    const games = p.games.filter((g) => matchesExtensions(g.fileName, exts)).length
    return {
      slug:       p.slug,
      name:       p.name,
      extensions: [...exts],
      games,
      // Switch se INSTALA en la consola; el resto son ficheros que un emulador
      // abre. Es la distincion que decide toda la interfaz del cliente, asi que
      // se dice aqui en vez de dejar que cada cliente la deduzca del slug.
      native:     [...exts].some((e) => isSwitchFile('x' + e)),
      emulator:   recommendedEmulator(p.emulators) ?? p.emulatorName ?? null,
      // El icono que subio el administrador, servido en JPEG. Que lo ponga el
      // servidor evita que cada cliente dibuje su propio glifo y acabe
      // ensenando algo distinto de lo que se ve en la web.
      ...(p.iconPath ? { gh_icon: jpegImageUrl(base, p.iconPath) } : {}),
    }
  })

  return NextResponse.json({
    files,
    success: `GameHub Platforms · ${files.length} items`,
  })
}
