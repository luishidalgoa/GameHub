import { ArtJobPanel } from '@/components/admin/ArtJobPanel'

export const dynamic = 'force-dynamic'

// Arte: descarga de imágenes por plataforma. La subida manual y la limpieza llegan en #142.
export default function AdminArtPage() {
  return <ArtJobPanel />
}
