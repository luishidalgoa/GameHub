import { OrphanCoversPanel } from '@/components/admin/OrphanCoversPanel'
import { StorageCleanupPanel } from '@/components/admin/StorageCleanupPanel'

export const dynamic = 'force-dynamic'

// Almacén: portadas y ficheros que ya nadie referencia (#141).
export default function AdminStoragePage() {
  return (
    <div className="space-y-8">
      <StorageCleanupPanel />
      <OrphanCoversPanel />
    </div>
  )
}
