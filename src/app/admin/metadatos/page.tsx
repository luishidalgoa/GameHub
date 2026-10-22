import { db } from '@/lib/db'
import { MetadataBatchPanel } from '@/components/admin/MetadataBatchPanel'

export const dynamic = 'force-dynamic'

// Metadatos: lotes automáticos por plataforma (#141).
export default async function AdminMetadataPage() {
  const platforms = await db.platform.findMany({
    where: { enabled: true },
    select: { slug: true, name: true },
    orderBy: { sortOrder: 'asc' },
  })
  return <MetadataBatchPanel platforms={platforms} />
}
