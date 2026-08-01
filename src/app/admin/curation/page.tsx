import { getTranslations } from 'next-intl/server'
import { FileSignature } from 'lucide-react'
import { CurationClient } from '@/components/admin/CurationClient'

export const dynamic = 'force-dynamic'

export default async function CurationPage() {
  const t = await getTranslations('AdminCuration')

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <FileSignature className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-xl font-semibold">{t('title')}</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">{t('subtitle')}</p>
      </div>

      <div className="bg-secondary/40 border border-border rounded-xl p-4 mb-6 text-sm text-muted-foreground">
        {t('explainer')}
      </div>

      <CurationClient />
    </div>
  )
}
