'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Cookie, X } from 'lucide-react'
import { getConsent, setConsent, type ConsentValue } from '@/lib/cookie-consent'

export function CookieConsent() {
  const t = useTranslations('CookieConsent')
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (getConsent() === null) setVisible(true)
  }, [])

  const accept = (value: ConsentValue) => {
    setConsent(value)
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed bottom-0 left-0 right-0 z-50 md:left-56"
    >
      <div className="mx-auto max-w-4xl m-3">
        <div className="bg-card border border-border rounded-xl shadow-2xl shadow-black/60 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
          <Cookie className="w-5 h-5 text-primary flex-shrink-0 hidden sm:block" />

          <p className="text-sm text-muted-foreground flex-1 leading-relaxed">
            {t('description')}{' '}
            <Link href="/privacy" className="text-primary hover:underline underline-offset-2">
              {t('privacyLink')}
            </Link>
          </p>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => accept('necessary')}
              className="px-3 py-1.5 text-sm rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              {t('necessaryOnly')}
            </button>
            <button
              onClick={() => accept('all')}
              className="px-4 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-medium transition-colors"
            >
              {t('acceptAll')}
            </button>
            <button
              onClick={() => accept('necessary')}
              aria-label={t('dismiss')}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
