import { redirect } from 'next/navigation'

// La curación de nombres vive en Integridad de la biblioteca; esta ruta sigue funcionando.
export default function CurationPage() {
  redirect('/admin/integridad')
}
