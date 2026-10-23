import { getTranslations } from 'next-intl/server'
import { LibraryIssuesPanel } from '@/components/admin/LibraryIssuesPanel'
import { StorageCleanupPanel } from '@/components/admin/StorageCleanupPanel'
import { CurationClient } from '@/components/admin/CurationClient'

export const dynamic = 'force-dynamic'

// Integridad de la biblioteca (#141): ficheros, huérfanos del almacén y curación de nombres.
export default async function AdminIntegrityPage() {
  const t = await getTranslations('AdminCuration')

  return (
    <div className="space-y-10">
      <LibraryIssuesPanel />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Almacén</h2>
        <StorageCleanupPanel />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{t('title')}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{t('subtitle')}</p>
        </div>
        <div className="bg-secondary/40 border border-border rounded-xl p-4 text-sm text-muted-foreground">
          {t('explainer')}
        </div>
        <CurationClient />
      </section>
    </div>
  )
}
