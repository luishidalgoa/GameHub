import { getOrientations } from '@/lib/console-orientation'
import { ConsoleOrientationEditor } from '@/components/admin/ConsoleOrientationEditor'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Modelos 3D — GameHub' }

export default async function ModelsPage() {
  return <ConsoleOrientationEditor saved={await getOrientations()} />
}
