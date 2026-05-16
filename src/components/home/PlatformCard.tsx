import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { Platform } from '@/types/platform'

const PLATFORM_GRADIENTS: Record<string, string> = {
  switch:  'from-red-950/80 to-red-900/40 border-red-800/30 hover:border-red-600/60',
  '3ds':   'from-red-950/80 to-orange-900/30 border-orange-800/30 hover:border-orange-600/60',
  nds:     'from-orange-950/80 to-amber-900/30 border-amber-800/30 hover:border-amber-600/60',
  wii:     'from-sky-950/80 to-cyan-900/30 border-sky-800/30 hover:border-sky-600/60',
  psp:     'from-blue-950/80 to-indigo-900/30 border-blue-800/30 hover:border-blue-600/60',
  psvita:  'from-blue-950/80 to-violet-900/30 border-violet-800/30 hover:border-violet-600/60',
}

const PLATFORM_ACCENT: Record<string, string> = {
  switch: 'text-red-400',
  '3ds':  'text-orange-400',
  nds:    'text-amber-400',
  wii:    'text-sky-400',
  psp:    'text-blue-400',
  psvita: 'text-violet-400',
}

const PLATFORM_EMOJI: Record<string, string> = {
  switch: '🎮',
  '3ds':  '📱',
  nds:    '🎯',
  wii:    '🕹️',
  psp:    '🎮',
  psvita: '🎮',
}

interface Props {
  platform: Platform
}

export function PlatformCard({ platform }: Props) {
  const gradient = PLATFORM_GRADIENTS[platform.slug] ?? 'from-zinc-900/80 to-zinc-800/30 border-zinc-700/30'
  const accent = PLATFORM_ACCENT[platform.slug] ?? 'text-zinc-400'
  const emoji = PLATFORM_EMOJI[platform.slug] ?? '🎮'
  const count = platform._count?.games ?? 0

  return (
    <Link href={`/platform/${platform.slug}`}>
      <div
        className={cn(
          'relative group cursor-pointer rounded-xl border bg-gradient-to-br p-6',
          'transition-all duration-200 hover:-translate-y-1 hover:shadow-lg',
          gradient
        )}
      >
        <div className="flex items-start justify-between mb-4">
          <span className="text-4xl">{emoji}</span>
          <span className={cn('text-3xl font-bold tabular-nums', accent)}>{count}</span>
        </div>
        <h3 className="font-semibold text-foreground text-base leading-tight">{platform.name}</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          {count === 1 ? '1 game' : `${count} games`}
        </p>

        {/* Hover arrow */}
        <div className={cn(
          'absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-xs',
          accent
        )}>
          Browse →
        </div>
      </div>
    </Link>
  )
}
