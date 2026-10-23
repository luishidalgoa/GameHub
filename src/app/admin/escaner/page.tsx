import { db } from '@/lib/db'
import { ScanPanel } from '@/components/admin/ScanPanel'
import { MetadataBatchPanel } from '@/components/admin/MetadataBatchPanel'

export const dynamic = 'force-dynamic'

// Escáner y metadatos: buscar ROMs nuevos y rellenar sus datos por plataforma (#141).
export default async function AdminScannerPage() {
  const platforms = await db.platform.findMany({
    where: { enabled: true },
    select: { slug: true, name: true },
    orderBy: { sortOrder: 'asc' },
  })

  return (
    <div className="space-y-10">
      <ScanPanel />

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Metadatos</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Lotes automáticos de metadatos por plataforma.</p>
        </div>
        <MetadataBatchPanel platforms={platforms} />
      </section>
    </div>
  )
}
