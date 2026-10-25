import Link from 'next/link'
import type { SortDir } from '@/lib/admin-sort'

/** Cabecera ordenable: un enlace que cambia el orden de la tabla y muestra la dirección activa. */
export function SortHeader({ label, href, active, dir, align = 'left' }: {
  label: string
  href: string
  active: boolean
  dir: SortDir
  align?: 'left' | 'right'
}) {
  return (
    <th scope="col" aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={`px-3 py-3 font-medium ${align === 'right' ? 'text-right' : ''}`}>
      <Link href={href} className={`inline-flex items-center gap-1 hover:text-foreground ${active ? 'text-foreground' : ''}`}>
        {label}
        <span aria-hidden="true" className="text-[10px]">{active ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </Link>
    </th>
  )
}
