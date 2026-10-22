import { OrphanCoversPanel } from '@/components/admin/OrphanCoversPanel'

export const dynamic = 'force-dynamic'

// Almacén: portadas y ficheros que ya nadie referencia (#141).
export default function AdminStoragePage() {
  return <OrphanCoversPanel />
}
