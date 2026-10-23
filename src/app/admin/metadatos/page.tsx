import { redirect } from 'next/navigation'

// Los metadatos viven en Escáner y metadatos; esta ruta sigue funcionando.
export default function AdminMetadataPage() {
  redirect('/admin/escaner')
}
