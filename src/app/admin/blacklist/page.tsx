import Link from 'next/link'
import { listBlacklist } from '@/lib/blacklist'
import { BlacklistList } from '@/components/admin/BlacklistList'

export const dynamic = 'force-dynamic'

// Lista negra: los juegos de torrent que la sincronización no debe volver a traer.
export default async function AdminBlacklistPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const search = typeof searchParams.search === 'string' ? searchParams.search.trim() : ''
  const page = Math.max(1, parseInt(typeof searchParams.page === 'string' ? searchParams.page : '1', 10) || 1)
  const { items, total, pageSize } = await listBlacklist({ search, page, pageSize: 50 })
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const pageHref = (p: number) => `/admin/blacklist?${new URLSearchParams({ ...(search ? { search } : {}), page: String(p) }).toString()}`

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Lista negra</h2>
          <p className="text-sm text-muted-foreground">
            Juegos de torrent que la sincronización no vuelve a traer. Quitar uno lo devuelve a la biblioteca.
          </p>
        </div>
        <Link href="/admin/mantenimiento" className="text-sm text-violet-300 underline">← Mantenimiento</Link>
      </div>

      <form method="get" action="/admin/blacklist" className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="search"
          defaultValue={search}
          placeholder="Buscar por título"
          aria-label="Buscar por título"
          className="w-64 rounded-md border border-border bg-secondary px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button type="submit" className="rounded-md bg-secondary px-3 py-1.5 text-sm hover:bg-accent">Buscar</button>
        {search && <Link href="/admin/blacklist" className="text-sm text-muted-foreground underline">Quitar búsqueda</Link>}
      </form>

      <p className="mb-3 text-sm text-muted-foreground tabular-nums">{total.toLocaleString('es-ES')} entradas{search ? ` para «${search}»` : ''}</p>

      <BlacklistList items={items.map(i => ({ ...i, createdAt: i.createdAt.toISOString() }))} />

      {pages > 1 && (
        <nav aria-label="Páginas" className="mt-4 flex items-center justify-center gap-3 text-sm">
          {page > 1 && <Link href={pageHref(page - 1)} className="rounded-md bg-secondary px-3 py-1.5 hover:bg-accent">← Anterior</Link>}
          <span className="tabular-nums text-muted-foreground">Página {page} de {pages}</span>
          {page < pages && <Link href={pageHref(page + 1)} className="rounded-md bg-secondary px-3 py-1.5 hover:bg-accent">Siguiente →</Link>}
        </nav>
      )}
    </div>
  )
}
