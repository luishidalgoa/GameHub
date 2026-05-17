'use client'

import { useTranslations } from 'next-intl'
import { Gamepad2 } from 'lucide-react'

interface Props {
  title?: string
  description?: string
}

export function EmptyState({ title, description }: Props) {
  const t = useTranslations('EmptyState')
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Gamepad2 className="w-12 h-12 text-muted-foreground/40 mb-4" />
      <h3 className="text-lg font-semibold text-muted-foreground">{title ?? t('title')}</h3>
      <p className="text-sm text-muted-foreground/70 mt-1 max-w-xs">{description ?? t('description')}</p>
    </div>
  )
}
