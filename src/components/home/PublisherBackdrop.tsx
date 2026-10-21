import type { BackdropStyle } from '@/lib/publisher-style'

/**
 * A publisher tile's painted background: a procedural motif in the brand's two
 * colors, drawn as SVG so it scales with the tile at any size. Nothing is loaded.
 */
export function PublisherBackdrop({ style, c1, c2, id }: {
  style: BackdropStyle
  c1: string
  c2: string
  /** Unique per tile, so the grain filter ids do not collide. */
  id: string
}) {
  const W = 300, H = 400
  const shapes: React.ReactNode[] = []

  switch (style) {
    case 'smoke':
      shapes.push(
        <radialGradient key="g" id={`${id}-g`} cx="50%" cy="34%" r="70%">
          <stop offset="0%" stopColor={c1} stopOpacity="0.95" />
          <stop offset="55%" stopColor={c2} stopOpacity="0.6" />
          <stop offset="100%" stopColor="#050506" stopOpacity="1" />
        </radialGradient>,
      )
      shapes.push(<rect key="s" width={W} height={H} fill={`url(#${id}-g)`} />)
      shapes.push(
        <filter key="f" id={`${id}-n`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>,
        <rect key="n" width={W} height={H} filter={`url(#${id}-n)`} opacity="0.22" style={{ mixBlendMode: 'overlay' }} />,
      )
      break
    case 'rays': {
      shapes.push(<rect key="b" width={W} height={H} fill={c2} />)
      const cx = 150, cy = 150
      for (let i = 0; i < 24; i++) {
        const a0 = (i / 24) * Math.PI * 2, a1 = ((i + 0.5) / 24) * Math.PI * 2
        const far = 600
        shapes.push(
          <polygon key={`r${i}`} fill={c1} opacity={i % 2 ? 0.22 : 0.1}
            points={`${cx},${cy} ${cx + Math.cos(a0) * far},${cy + Math.sin(a0) * far} ${cx + Math.cos(a1) * far},${cy + Math.sin(a1) * far}`} />,
        )
      }
      break
    }
    case 'burst': {
      shapes.push(<rect key="b" width={W} height={H} fill={c2} />)
      for (let i = 0; i < 16; i++) {
        const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 0.5) / 16) * Math.PI * 2
        shapes.push(
          <polygon key={`r${i}`} fill={c1} opacity="0.35"
            points={`150,150 ${150 + Math.cos(a0) * 500},${150 + Math.sin(a0) * 500} ${150 + Math.cos(a1) * 500},${150 + Math.sin(a1) * 500}`} />,
        )
      }
      shapes.push(<circle key="c" cx="150" cy="150" r="70" fill={c1} opacity="0.55" />)
      break
    }
    case 'contours':
      shapes.push(<rect key="b" width={W} height={H} fill={c2} />)
      for (let i = 1; i <= 16; i++) {
        shapes.push(
          <ellipse key={`e${i}`} cx="60" cy="330" rx={i * 22} ry={i * 15} fill="none" stroke={c1}
            strokeWidth="1.4" opacity={0.18 + (i % 3) * 0.08} transform="rotate(-18 60 330)" />,
        )
      }
      break
    case 'halftone':
      shapes.push(<rect key="b" width={W} height={H} fill={c2} />)
      for (let row = 0; row < 22; row++) {
        for (let col = 0; col < 18; col++) {
          const x = col * 17 + (row % 2) * 8.5, y = row * 19
          const d = Math.hypot(x - 300, y - 0) / 420
          const r = Math.max(0.6, 5.2 * (1 - d))
          shapes.push(<circle key={`h${row}-${col}`} cx={x} cy={y} r={r} fill={c1} opacity="0.55" />)
        }
      }
      break
    case 'slash':
      shapes.push(<rect key="b" width={W} height={H} fill={c2} />)
      for (let i = 0; i < 7; i++) {
        const x = -40 + i * 62
        shapes.push(
          <polygon key={`s${i}`} fill={c1} opacity={0.12 + (i % 3) * 0.1}
            points={`${x},${H} ${x + 22 + (i % 2) * 14},${H} ${x + 150},0 ${x + 128 - (i % 2) * 6},0`} />,
        )
      }
      break
    case 'stripes':
      shapes.push(<rect key="b" width={W} height={H} fill={c2} />)
      for (let i = 0; i < 14; i++) {
        shapes.push(<rect key={`t${i}`} x={i * 24} y="0" width="12" height={H} fill={c1} opacity="0.18" />)
      }
      break
    case 'grid':
      shapes.push(<rect key="b" width={W} height={H} fill={c2} />)
      for (let i = -6; i <= 14; i++) {
        shapes.push(
          <line key={`v${i}`} x1={150 + i * 8} y1={H} x2={150 + i * 40} y2={H * 0.45} stroke={c1} strokeWidth="1.2" opacity="0.35" />,
        )
      }
      for (let j = 0; j < 9; j++) {
        const y = H * 0.45 + Math.pow(j / 9, 1.8) * H * 0.55
        shapes.push(<line key={`h${j}`} x1="0" y1={y} x2={W} y2={y} stroke={c1} strokeWidth="1" opacity="0.3" />)
      }
      break
  }

  return (
    <svg aria-hidden viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice"
         className="absolute inset-0 h-full w-full">
      {shapes}
    </svg>
  )
}
