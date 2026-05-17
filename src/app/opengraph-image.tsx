import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt     = 'GameHub — Your personal game library'
export const size    = { width: 1200, height: 630 }
export const contentType = 'image/png'

const PLATFORMS = ['Switch', '3DS', 'NDS', 'Wii', 'PSP', 'PS Vita']

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#0d0d14',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '64px 72px',
          fontFamily: 'sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background grid dots */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'radial-gradient(circle, #ffffff12 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        {/* Glow blob */}
        <div
          style={{
            position: 'absolute',
            right: '-100px',
            top: '-120px',
            width: '600px',
            height: '600px',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, #6366f133 0%, transparent 70%)',
          }}
        />

        {/* Controller icon (unicode) */}
        <div
          style={{
            fontSize: 56,
            marginBottom: 24,
            display: 'flex',
          }}
        >
          🎮
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 80,
            fontWeight: 900,
            letterSpacing: '-2px',
            color: '#ffffff',
            lineHeight: 1,
            marginBottom: 20,
            display: 'flex',
          }}
        >
          GameHub
        </div>

        {/* Description */}
        <div
          style={{
            fontSize: 28,
            color: '#a1a1aa',
            fontWeight: 400,
            maxWidth: 680,
            lineHeight: 1.4,
            marginBottom: 48,
            display: 'flex',
          }}
        >
          Browse, manage and download your personal game collection — all in one place.
        </div>

        {/* Platform badges */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {PLATFORMS.map((p) => (
            <div
              key={p}
              style={{
                background: '#1e1e2e',
                border: '1px solid #333350',
                borderRadius: 8,
                padding: '8px 18px',
                fontSize: 18,
                color: '#c4c4e0',
                fontWeight: 600,
                display: 'flex',
              }}
            >
              {p}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  )
}
