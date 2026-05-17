'use client'

import { useLocale } from 'next-intl'
import { Globe } from 'lucide-react'
import { cn } from '@/lib/utils'

const LOCALES = [
  { code: 'en', label: 'EN' },
  { code: 'es', label: 'ES' },
]

export function LanguageSwitcher() {
  const locale = useLocale()

  const setLocale = (code: string) => {
    if (code === locale) return
    document.cookie = `NEXT_LOCALE=${code}; path=/; max-age=31536000; SameSite=Lax`
    window.location.reload()
  }

  return (
    <div className="flex items-center gap-1 px-3 py-2">
      <Globe className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      <div className="flex items-center gap-0.5 ml-1">
        {LOCALES.map(({ code, label }) => (
          <button
            key={code}
            onClick={() => setLocale(code)}
            className={cn(
              'px-1.5 py-0.5 text-xs rounded font-medium transition-colors',
              locale === code
                ? 'bg-primary/20 text-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
