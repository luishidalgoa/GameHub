// Single source of truth for per-platform visual identity (emoji fallback +
// accent/gradient colors). Previously this was duplicated — and slightly drifted
// — between PlatformCard.tsx (PLATFORM_CONFIG) and Sidebar.tsx (PLATFORM_ICONS +
// PLATFORM_COLORS). Both now import from here.
//
// The emoji is only a FALLBACK: when a platform has an uploaded icon
// (Platform.iconPath) the UI shows that instead. The colors still drive the
// card gradient and the sidebar active state regardless of icon.

export interface PlatformIdentity {
  emoji:    string   // fallback glyph when no icon uploaded
  accent:   string   // text color class (sidebar active + card count)
  gradient: string   // card background gradient (Tailwind)
  glow:     string   // card hover glow (rgba, inline box-shadow)
  border:   string   // card border classes
}

export const PLATFORM_IDENTITY: Record<string, PlatformIdentity> = {
  switch: {
    emoji: '🎮',
    accent: 'text-red-400',
    gradient: 'from-red-700/50 via-red-900/60 to-zinc-900',
    glow: 'rgba(220,38,38,0.35)',
    border: 'border-red-700/40 hover:border-red-500/70',
  },
  '3ds': {
    emoji: '📱',
    accent: 'text-orange-400',
    gradient: 'from-red-600/40 via-orange-900/50 to-zinc-900',
    glow: 'rgba(239,68,68,0.30)',
    border: 'border-orange-700/40 hover:border-orange-500/70',
  },
  nds: {
    emoji: '🎯',
    accent: 'text-zinc-300',
    gradient: 'from-zinc-600/40 via-zinc-800/60 to-zinc-900',
    glow: 'rgba(161,161,170,0.25)',
    border: 'border-zinc-600/40 hover:border-zinc-400/60',
  },
  wii: {
    emoji: '🕹️',
    accent: 'text-sky-400',
    gradient: 'from-sky-600/40 via-cyan-900/50 to-zinc-900',
    glow: 'rgba(14,165,233,0.30)',
    border: 'border-sky-700/40 hover:border-sky-400/70',
  },
  psp: {
    emoji: '🎮',
    accent: 'text-blue-400',
    gradient: 'from-blue-700/50 via-indigo-900/60 to-zinc-900',
    glow: 'rgba(59,130,246,0.35)',
    border: 'border-blue-700/40 hover:border-blue-500/70',
  },
  psvita: {
    emoji: '🎮',
    accent: 'text-violet-400',
    gradient: 'from-blue-800/50 via-violet-900/60 to-zinc-900',
    glow: 'rgba(139,92,246,0.35)',
    border: 'border-violet-700/40 hover:border-violet-500/70',
  },
}

export const FALLBACK_IDENTITY: PlatformIdentity = {
  emoji: '🎮',
  accent: 'text-zinc-400',
  gradient: 'from-zinc-800/60 via-zinc-900/80 to-zinc-900',
  glow: 'rgba(161,161,170,0.20)',
  border: 'border-zinc-700/30 hover:border-zinc-500/60',
}

export function getPlatformIdentity(slug: string): PlatformIdentity {
  return PLATFORM_IDENTITY[slug] ?? FALLBACK_IDENTITY
}
