'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

/**
 * «Volver» que deshace el último paso del historial: vuelve a la página desde la que se llegó.
 * Sin historial (se abrió directamente), va a `fallback`.
 */
export function BackLink({ fallback, label, className }: { fallback: string; label: string; className?: string }) {
  const router = useRouter()
  return (
    <Link
      href={fallback}
      onClick={e => {
        if (window.history.length > 1) {
          e.preventDefault()
          router.back()
        }
      }}
      className={className ?? 'inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors'}
    >
      <ArrowLeft className="w-4 h-4" />
      {label}
    </Link>
  )
}
