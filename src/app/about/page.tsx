import Image from 'next/image'
import { ExternalLink, Github, Code2, Mail } from 'lucide-react'

export const metadata = { title: 'Hecho por — GameHub' }

const STACK = [
  {
    label: 'FRONTEND',
    items: ['Next.js 14 (App Router)', 'React 18', 'TypeScript', 'Tailwind CSS', 'SWR'],
  },
  {
    label: 'BACKEND',
    items: ['Next.js API Routes', 'Prisma ORM', 'SQLite', 'node-cron'],
  },
  {
    label: 'ALMACENAMIENTO',
    items: ['MinIO (S3-compatible)', 'Sistema de archivos local (ROMs)'],
  },
  {
    label: 'APIS',
    items: ['RAWG Metadata API', 'SteamGridDB', 'YouTube Data API v3'],
  },
]

const FEATURES = [
  'Biblioteca de ROMs con escaneo automático',
  'Metadatos + carátulas desde RAWG y SteamGridDB',
  'Descarga de ROMs con cola y control de tokens',
  'Panel de admin con tráfico y donaciones',
  'Infinite scroll, skeleton covers, lazy loading',
  'Tienda HTTP compatible con CyberFoil / Tinfoil',
]

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-12">

      {/* ── Hero card ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Hecho por
        </p>

        <div className="flex gap-4 items-start">
          {/* Avatar */}
          <div className="shrink-0">
            <Image
              src="/perfil.png"
              alt="Luis Hidalgo"
              width={72}
              height={72}
              className="rounded-full object-cover ring-2 ring-border"
              unoptimized
            />
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Luis Hidalgo</h1>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
              Desarrollador full-stack. Diseño y construyo productos web de principio a fin —
              de la base de datos a la interfaz, pasando por integraciones con IA, infra y diseño.
              GameHub es uno de esos proyectos.
            </p>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-wrap gap-2 mt-5">
          <a
            href="https://luishidalgoa.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Ver mi portfolio
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <a
            href="https://github.com/luishidalgoa"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-border bg-secondary text-sm font-medium hover:bg-accent transition-colors"
          >
            <Github className="w-4 h-4" />
            GitHub
          </a>

          <a
            href="https://github.com/luishidalgoa/GameHub"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-border bg-secondary text-sm font-medium hover:bg-accent transition-colors"
          >
            <Code2 className="w-4 h-4" />
            Código de este proyecto
          </a>
        </div>
      </div>

      {/* ── Two-col cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* About GameHub */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold text-base mb-3 flex items-center gap-2">
            <span className="text-primary">🎮</span> Sobre GameHub
          </h2>
          <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
            Una biblioteca personal autohospedada para gestionar y descargar ROMs desde cualquier
            dispositivo de la red local. Pensada para funcionar en una Raspberry Pi con acceso
            directo a discos duros externos.
          </p>
          <ul className="space-y-1.5">
            {FEATURES.map(f => (
              <li key={f} className="text-sm text-muted-foreground flex items-start gap-1.5">
                <span className="text-primary mt-0.5 shrink-0">·</span>
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Contact */}
        <div className="rounded-xl border border-border bg-card p-5 flex flex-col">
          <h2 className="font-semibold text-base mb-3 flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary" /> ¿Hablamos?
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed flex-1">
            Si quieres colaborar, contratarme o simplemente preguntarme algo sobre cómo está hecho
            esto, mi portfolio tiene todos los detalles (enlaces, experiencia, otros proyectos y
            formas de contacto).
          </p>
          <a
            href="https://luishidalgoa.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center justify-center gap-1.5 w-full px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Abrir luishidalgoa.vercel.app
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* ── Tech stack ────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-base mb-4 flex items-center gap-2">
          <span className="text-primary">🗄</span> Stack técnico de GameHub
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {STACK.map(col => (
            <div key={col.label}>
              <p className="text-[11px] font-bold uppercase tracking-wider text-primary mb-2">
                {col.label}
              </p>
              <ul className="space-y-1">
                {col.items.map(item => (
                  <li key={item} className="text-xs text-muted-foreground">
                    · {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
