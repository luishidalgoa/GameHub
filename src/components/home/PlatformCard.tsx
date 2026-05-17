'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { Platform } from '@/types/platform'

// Brand identity per platform slug
const PLATFORM_CONFIG: Record<string, {
  gradient: string       // Tailwind bg-gradient classes
  glow: string           // box-shadow color via inline style
  border: string
  accent: string
  emoji: string
}> = {
  switch: {
    gradient: 'from-red-700/50 via-red-900/60 to-zinc-900',
    glow: 'rgba(220,38,38,0.35)',
    border: 'border-red-700/40 hover:border-red-500/70',
    accent: 'text-red-400',
    emoji: '🎮',
  },
  '3ds': {
    gradient: 'from-red-600/40 via-orange-900/50 to-zinc-900',
    glow: 'rgba(239,68,68,0.30)',
    border: 'border-orange-700/40 hover:border-orange-500/70',
    accent: 'text-orange-400',
    emoji: '📱',
  },
  nds: {
    gradient: 'from-zinc-600/40 via-zinc-800/60 to-zinc-900',
    glow: 'rgba(161,161,170,0.25)',
    border: 'border-zinc-600/40 hover:border-zinc-400/60',
    accent: 'text-zinc-300',
    emoji: '🎯',
  },
  wii: {
    gradient: 'from-sky-600/40 via-cyan-900/50 to-zinc-900',
    glow: 'rgba(14,165,233,0.30)',
    border: 'border-sky-700/40 hover:border-sky-400/70',
    accent: 'text-sky-400',
    emoji: '🕹️',
  },
  psp: {
    gradient: 'from-blue-700/50 via-indigo-900/60 to-zinc-900',
    glow: 'rgba(59,130,246,0.35)',
    border: 'border-blue-700/40 hover:border-blue-500/70',
    accent: 'text-blue-400',
    emoji: '🎮',
  },
  psvita: {
    gradient: 'from-blue-800/50 via-violet-900/60 to-zinc-900',
    glow: 'rgba(139,92,246,0.35)',
    border: 'border-violet-700/40 hover:border-violet-500/70',
    accent: 'text-violet-400',
    emoji: '🎮',
  },
}

const FALLBACK = {
  gradient: 'from-zinc-800/60 via-zinc-900/80 to-zinc-900',
  glow: 'rgba(161,161,170,0.20)',
  border: 'border-zinc-700/30 hover:border-zinc-500/60',
  accent: 'text-zinc-400',
  emoji: '🎮',
}

const MAX_TILT = 12 // degrees

interface Props {
  platform: Platform
}

export function PlatformCard({ platform }: Props) {
  const cfg = PLATFORM_CONFIG[platform.slug] ?? FALLBACK
  const count = platform._count?.games ?? 0

  const cardRef = useRef<HTMLDivElement>(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const [hovered, setHovered] = useState(false)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const dx = (e.clientX - (rect.left + rect.width  / 2)) / (rect.width  / 2)
    const dy = (e.clientY - (rect.top  + rect.height / 2)) / (rect.height / 2)
    setTilt({ x: dy * -MAX_TILT, y: dx * MAX_TILT })
  }

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 })
    setHovered(false)
  }

  const isResting = tilt.x === 0 && tilt.y === 0

  return (
    <Link href={`/platform/${platform.slug}`}>
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={handleMouseLeave}
        style={{
          transform: `perspective(700px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) ${hovered ? 'translateY(-4px)' : ''}`,
          transition: isResting
            ? 'transform 0.45s cubic-bezier(0.23,1,0.32,1), box-shadow 0.45s ease'
            : 'transform 0.08s ease-out',
          boxShadow: hovered
            ? `0 16px 40px -8px ${cfg.glow}, 0 4px 16px -4px ${cfg.glow}`
            : '0 2px 8px rgba(0,0,0,0.4)',
        }}
        className={cn(
          'relative group cursor-pointer rounded-xl border bg-gradient-to-br p-6 overflow-hidden',
          cfg.gradient,
          cfg.border,
        )}
      >
        {/* Subtle shine layer that shifts with tilt */}
        <div
          className="pointer-events-none absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            background: `radial-gradient(circle at ${50 + tilt.y * 2}% ${50 + tilt.x * -2}%, rgba(255,255,255,0.06) 0%, transparent 70%)`,
          }}
        />

        <div className="relative z-10">
          <div className="flex items-start justify-between mb-4">
            <span className="text-4xl select-none">{cfg.emoji}</span>
            <span className={cn('text-3xl font-bold tabular-nums', cfg.accent)}>{count}</span>
          </div>
          <h3 className="font-semibold text-foreground text-base leading-tight">{platform.name}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {count === 1 ? '1 game' : `${count} games`}
          </p>

          <div className={cn(
            'absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-xs',
            cfg.accent
          )}>
            Browse →
          </div>
        </div>
      </div>
    </Link>
  )
}
