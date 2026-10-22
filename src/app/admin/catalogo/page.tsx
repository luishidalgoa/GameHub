import Link from 'next/link'

export const dynamic = 'force-dynamic'

// Catálogo: editoras y orientación de los modelos 3D. La fusión de editoras llega en #143 (#141).
export default function AdminCatalogPage() {
  return (
    <div className="space-y-4">
      <Link href="/admin/editoras" className="block rounded-xl border border-border bg-card p-5 hover:bg-secondary/50">
        <h2 className="font-semibold">Editoras de la portada</h2>
        <p className="mt-1 text-sm text-muted-foreground">Logos y personajes de las teselas de editoras.</p>
      </Link>
      <Link href="/admin/modelos" className="block rounded-xl border border-border bg-card p-5 hover:bg-secondary/50">
        <h2 className="font-semibold">Orientación de los modelos 3D</h2>
        <p className="mt-1 text-sm text-muted-foreground">Gira cada consola hasta que mire de frente; la portada usa lo que guardes.</p>
      </Link>
    </div>
  )
}
