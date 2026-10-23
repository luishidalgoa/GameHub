import Link from 'next/link'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Mantenimiento (#144): escáner y metadatos, integridad y cementerio, en un solo sitio.
export default async function AdminMaintenancePage() {
  const removed = await db.game.count({ where: { isHidden: true } })

  const areas = [
    {
      href: '/admin/escaner',
      title: 'Escáner y metadatos',
      text: 'Buscar ROMs nuevos y rellenar sus datos por plataforma.',
      badge: 0,
    },
    {
      href: '/admin/integridad',
      title: 'Integridad de la biblioteca',
      text: 'Ficheros ilegibles, DLC sueltos, juegos sin base, huérfanos del almacén y renombres propuestos.',
      badge: 0,
    },
    {
      href: '/admin/graveyard',
      title: 'Cementerio',
      text: 'Juegos cuyo fichero ya no está. Recupéralos o archívalos.',
      badge: removed,
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {areas.map(a => (
        <Link key={a.href} href={a.href} className="relative block rounded-xl border border-border bg-card p-5 hover:bg-secondary/50">
          <h2 className="font-semibold">{a.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{a.text}</p>
          {a.badge > 0 && (
            <span
              aria-label={`${a.badge} juegos en el cementerio`}
              className="absolute right-3 top-3 min-w-5 rounded-full bg-orange-500 px-1.5 text-center text-xs font-semibold leading-5 text-white tabular-nums"
            >
              {a.badge}
            </span>
          )}
        </Link>
      ))}
    </div>
  )
}
