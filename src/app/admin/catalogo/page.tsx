import Link from 'next/link'
import { db } from '@/lib/db'
import { CompanyCatalog, type CompanyRow } from '@/components/admin/CompanyCatalog'

export const dynamic = 'force-dynamic'

// Catálogo (#143): editoras, dueños de las sub-editoras y modelos 3D.
export default async function AdminCatalogPage() {
  const companies = await db.company.findMany({
    select: { id: true, name: true, parentId: true, _count: { select: { publishedGames: true } } },
  })
  // An owner's games are its sub-editoras' games too (#143), so an owner with no games of its own still shows.
  // Games are counted where they are linked; an owner's total adds its sub-editoras' games (#143).
  const subGames = new Map<number, number>()
  for (const c of companies) {
    if (c.parentId !== null) subGames.set(c.parentId, (subGames.get(c.parentId) ?? 0) + c._count.publishedGames)
  }
  const rows: CompanyRow[] = companies
    .map(c => {
      const games = c._count.publishedGames
      return { id: c.id, name: c.name, parentId: c.parentId, games, total: games + (subGames.get(c.id) ?? 0) }
    })
    .filter(c => c.total > 0)

  return (
    <div className="space-y-4">
      <Link href="/admin/editoras" className="block rounded-xl border border-border bg-card p-5 hover:bg-secondary/50">
        <h2 className="font-semibold">Editoras de la portada</h2>
        <p className="mt-1 text-sm text-muted-foreground">Logos y personajes de las teselas de editoras.</p>
      </Link>
      <Link href="/admin/arte" className="block rounded-xl border border-border bg-card p-5 hover:bg-secondary/50">
        <h2 className="font-semibold">Arte de los juegos</h2>
        <p className="mt-1 text-sm text-muted-foreground">Fondos, logos y capturas que faltan, y el arte de cada juego en su panel.</p>
      </Link>
      <Link href="/admin/modelos" className="block rounded-xl border border-border bg-card p-5 hover:bg-secondary/50">
        <h2 className="font-semibold">Orientación de los modelos 3D</h2>
        <p className="mt-1 text-sm text-muted-foreground">Gira cada consola hasta que mire de frente; la portada usa lo que guardes.</p>
      </Link>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div>
          <h2 className="font-semibold">Editoras</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Editoras tal como las trae LaunchBox. Pulsa una para ver sus nombres, su dueño y las editoras que le pertenecen.
          </p>
        </div>
        <CompanyCatalog companies={rows} />
      </div>
    </div>
  )
}
