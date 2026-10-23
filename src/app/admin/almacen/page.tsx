import { redirect } from 'next/navigation'

// El almacén vive en Integridad de la biblioteca; esta ruta sigue funcionando.
export default function AdminStoragePage() {
  redirect('/admin/integridad')
}
