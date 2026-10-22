import Link from 'next/link'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Mantenimiento (#144): integridad, cementerio y curación de nombres, en un solo sitio.
export default async function AdminMaintenancePage() {
  const removed = await db.game.count({ where: { isHidden: true } })

  const areas = [
    {
      href: '/admin/integridad',
      title: 'Integridad de la biblioteca',
      text: 'Ficheros que no se pueden leer, actualizaciones y DLC sueltos, y juegos sin su base.',
    },
    {
      href: '/admin/graveyard',
      title: 'Cementerio',
      text: `Juegos cuyo fichero ya no está. Se pueden recuperar o archivar. Ahora mismo: ${removed}.`,
    },
    {
      href: '/admin/curation',
      title: 'Curación de nombres',
      text: 'Renombres propuestos a partir de los nombres de fichero, para revisar antes de aplicar.',
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {areas.map(a => (
        <Link key={a.href} href={a.href} className="block rounded-xl border border-border bg-card p-5 hover:bg-secondary/50">
          <h2 className="font-semibold">{a.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{a.text}</p>
        </Link>
      ))}
    </div>
  )
}
