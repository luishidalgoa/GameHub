import { db } from '@/lib/db'
import { getOrientations } from '@/lib/console-orientation'
import { consoleModelFor } from '@/lib/consoles'
import { resolveCoverPath } from '@/lib/cover-url'
import { ConsoleOrientationEditor, type EditorPlatform } from '@/components/admin/ConsoleOrientationEditor'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Modelos 3D — GameHub' }

export default async function ModelsPage() {
  const [platforms, saved] = await Promise.all([
    db.platform.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, slug: true, name: true, modelPath: true, posterPath: true } }),
    getOrientations(),
  ])
  const list: EditorPlatform[] = platforms.map(p => {
    const uploaded = p.modelPath ? resolveCoverPath(p.modelPath) : null
    const viewer = consoleModelFor(p.slug, uploaded)
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      uploaded: !!uploaded,
      posterUrl: p.posterPath ? resolveCoverPath(p.posterPath) : null,
      viewer: viewer ? { slug: viewer.slug, file: viewer.file, baseRotation: viewer.baseRotation } : null,
    }
  })
  return <ConsoleOrientationEditor platforms={list} saved={saved} />
}
