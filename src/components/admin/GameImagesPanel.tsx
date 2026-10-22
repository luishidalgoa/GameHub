'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import useSWR from 'swr'
import { useTranslations } from 'next-intl'
import { Upload, Link2, Trash2, Check, ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react'
import { CoverUploader } from './CoverUploader'
import { toast } from '@/components/shared/Toaster'
import type { GameArt, ArtImage, ShotEntry } from '@/lib/game-art'
import { artTitle, slotOf, type ArtCategory } from '@/lib/art-catalog'
import type { MetadataSources } from '@/lib/metadata/sources'

const TABS: ArtCategory[] = ['cover', 'banner', 'fanart', 'logo', 'screenshot', 'box', 'media', 'other']
/** Categories the owner can only look at: LaunchBox's packaging and advertising art. */
const REFERENCE: ArtCategory[] = ['box', 'media', 'other']
type Slot = 'banner' | 'fanart' | 'logo'
/** The game field that holds each slot, as the locks name it. */
const SLOT_FIELD: Record<Slot, string> = { banner: 'backdropPath', fanart: 'backdropPath', logo: 'logoPath' }

const fetcher = (url: string) => fetch(url).then(r => r.json())

/** A request the editor makes: the JSON answer, or an Error carrying the server's message. */
async function call<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? res.statusText)
  return data as T
}

const btn = 'inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-sm transition-colors disabled:opacity-50'
const btnPrimary = `${btn} bg-primary text-primary-foreground font-medium hover:bg-primary/90`
const btnSecondary = `${btn} bg-secondary border border-border hover:bg-accent`
const btnDanger = `${btn} border border-destructive/40 text-destructive hover:bg-destructive/10`

interface Props {
  gameId: number
  gameTitle: string
  platformSlug?: string
  coverPath: string | null
  onCover: (path: string, sources?: MetadataSources) => void
  thumbnailWidth: number
  thumbnailHeight: number
  /** Lets the owner hand a field back to the automatic flows. */
  onRelease: (field: string) => Promise<void> | void
  /**
   * The reference panel of the art page: pictures come only from the library and from LaunchBox
   * ("Buscar arte"); the owner does not upload here, that happens in the game's sheet.
   */
  panel?: boolean
}

export function GameImagesPanel({ gameId, gameTitle, platformSlug, coverPath, onCover, thumbnailWidth, thumbnailHeight, onRelease, panel = false }: Props) {
  const t = useTranslations('GameEditor')
  const base = `/api/admin/games/${gameId}`
  const { data: art, mutate } = useSWR<GameArt>(`${base}/images`, fetcher, { revalidateOnFocus: false })
  const [tab, setTab] = useState<ArtCategory>('banner')
  const [busy, setBusy] = useState<string | null>(null)
  const [undo, setUndo] = useState<{ text: string; run: () => Promise<void> } | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const run = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key)
    try {
      await fn()
      await mutate()
      if (done) toast(done)
    } catch (e) {
      toast(e instanceof Error ? e.message : t('imgError'), 'error')
    } finally {
      setBusy(null)
    }
  }

  const offerUndo = (text: string, restore: () => Promise<unknown>) => {
    if (undoTimer.current) clearTimeout(undoTimer.current)
    setUndo({ text, run: async () => { await restore(); await mutate(); setUndo(null) } })
    undoTimer.current = setTimeout(() => setUndo(null), 9 * 60 * 1000)
  }

  /**
   * Brings images into the category that is open, from the clipboard or a drop: a file, or a link.
   * Every category takes one except "other", which is for reference only.
   */
  const bringIn = (files: File[], urls: string[]) => {
    if (panel || REFERENCE.includes(tab)) { toast(t('imgPasteNotHere'), 'info'); return }
    void run('paste', async () => {
      if (tab === 'screenshot') {
        const form = new FormData()
        files.forEach(f => form.append('file', f))
        urls.forEach(u => form.append('url', u))
        await call(`${base}/screenshots`, { method: 'POST', body: form })
      } else if (tab === 'cover') {
        let init: RequestInit
        if (files[0]) {
          const form = new FormData()
          form.append('gameId', String(gameId)); form.append('file', files[0]); form.append('source', 'upload')
          init = { method: 'POST', body: form }
        } else {
          init = post({ gameId, url: urls[0], source: 'url' })
        }
        const r = await call<{ coverPath: string; sources?: MetadataSources }>('/api/covers', init)
        onCover(r.coverPath, r.sources)
      } else {
        const form = new FormData()
        form.append('kind', tab)
        if (files[0]) form.append('file', files[0]); else form.append('url', urls[0])
        await call(`${base}/art`, { method: 'POST', body: form })
      }
    }, t('imgSaved'))
  }

  // Ctrl+V anywhere in the section: an image on the clipboard, or a link when no field has the focus.
  const pasteRef = useRef<(e: ClipboardEvent) => void>(() => {})
  pasteRef.current = (e: ClipboardEvent) => {
    if (panel) return
    const target = e.target as HTMLElement | null
    const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    const files = Array.from(e.clipboardData?.files ?? []).filter(f => f.type.startsWith('image/'))
    if (files.length) { e.preventDefault(); bringIn(files, []); return }
    if (typing) return
    const text = e.clipboardData?.getData('text')?.trim()
    if (text && /^https?:\/\/\S+$/i.test(text)) { e.preventDefault(); bringIn([], [text]) }
  }
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => pasteRef.current(e)
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])

  if (!art) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground py-8"><Loader2 className="w-4 h-4 animate-spin" />{t('imgLoading')}</div>
  }

  const library = (cat: ArtCategory) => art.images.filter(i => i.category === cat && (cat !== 'banner' && cat !== 'fanart' && cat !== 'logo' || slotOf(i.kind)))
  const count = (cat: ArtCategory) =>
    cat === 'cover' ? (art.cover ? 1 : 0) + library('cover').length
    : cat === 'screenshot' ? art.screenshots.length
    : library(cat).length
  const label = (cat: ArtCategory) => t(`cat_${cat}`)

  // "Buscar arte": reads LaunchBox's images for this game again and stores them. Metadata is not touched.
  const fill = () => run('fill', async () => {
    const r = await call<{ outcome: string }>(`${base}/art/fill`, { method: 'POST' })
    toast(r.outcome === 'applied' ? t('imgFillDone') : t('imgFillNone'), r.outcome === 'applied' ? 'success' : 'info')
  })

  return (
    <div
      className="space-y-6"
      onDragOver={e => { if (!panel && e.dataTransfer.types.includes('Files')) e.preventDefault() }}
      onDrop={e => {
        if (panel) return
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
        if (files.length) { e.preventDefault(); bringIn(files, []) }
      }}
    >
      <div>
        <h2 className="text-lg font-semibold">{t('sectionImages')}</h2>
        <p className="text-sm text-muted-foreground max-w-prose mt-1">{t('imgIntro')}</p>
        {!REFERENCE.includes(tab) && <p className="text-sm text-muted-foreground max-w-prose mt-1">{t('imgPasteHint', { category: label(tab) })}</p>}
        {busy === 'paste' && <p className="flex items-center gap-2 text-sm mt-2"><Loader2 className="w-4 h-4 animate-spin" />{t('imgPasting')}</p>}
      </div>

      {panel && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{t('imgPanelHint')}</p>
          <button type="button" className={btnPrimary} disabled={busy !== null} onClick={() => void fill()}>
            {busy === 'fill' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {t('imgFill')}
          </button>
        </div>
      )}

      <div role="tablist" aria-label={t('imgCategory')} className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map(c => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={tab === c}
            onClick={() => setTab(c)}
            className={`px-3.5 py-2.5 text-sm border-b-2 -mb-px transition-colors ${tab === c ? 'border-primary text-foreground font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {label(c)} <span className="text-muted-foreground font-normal">{count(c)}</span>
          </button>
        ))}
      </div>

      {tab === 'cover' && (
        <div className="space-y-6">
          {!panel && (
            <CoverUploader
              gameId={gameId}
              gameTitle={gameTitle}
              platformSlug={platformSlug}
              currentCover={coverPath}
              onUploaded={(path, next) => { onCover(path, next); void mutate() }}
              thumbnailWidth={thumbnailWidth}
              thumbnailHeight={thumbnailHeight}
            />
          )}
          <Library
            title={t('imgLibraryOf', { category: label('cover') })}
            images={library('cover')}
            activeId={null}
            busy={busy}
            onUse={img => run(`use-${img.id}`, async () => {
              const r = await call<{ coverPath?: string }>(`${base}/art/activate`, post({ imageId: img.id }))
              if (r.coverPath) onCover(r.coverPath)
            }, t('imgCoverChanged'))}
          />
        </div>
      )}

      {(tab === 'banner' || tab === 'fanart' || tab === 'logo') && (
        <SlotPanel
          key={tab}
          slot={tab}
          art={art}
          images={library(tab)}
          busy={busy}
          base={base}
          label={label(tab)}
          onRelease={async () => { await onRelease(SLOT_FIELD[tab]); await mutate() }}
          run={run}
          offerUndo={offerUndo}
          panel={panel}
        />
      )}

      {tab === 'screenshot' && (
        <ScreenshotsPanel art={art} base={base} gameId={gameId} busy={busy} run={run} offerUndo={offerUndo} onCover={onCover} panel={panel} />
      )}

      {REFERENCE.includes(tab) && (
        <ReferencePanel images={library(tab)} hint={t(`imgRefHint_${tab}`)} />
      )}

      {undo && (
        <div role="status" className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 text-sm shadow-lg">
          <span>{undo.text}</span>
          <button type="button" onClick={() => void undo.run()} className="font-semibold text-primary hover:underline">{t('imgUndo')}</button>
        </div>
      )}
    </div>
  )
}

const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

// ── Banner, fanart and logo: one active image, a library, and ways to bring a new one ──────────

function SlotPanel({ slot, art, images, busy, base, label, onRelease, run, offerUndo, panel }: {
  panel: boolean
  slot: Slot
  art: GameArt
  images: ArtImage[]
  busy: string | null
  base: string
  label: string
  onRelease: () => Promise<void>
  run: (key: string, fn: () => Promise<unknown>, done?: string) => Promise<void>
  offerUndo: (text: string, restore: () => Promise<unknown>) => void
}) {
  const t = useTranslations('GameEditor')
  const fileRef = useRef<HTMLInputElement>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [link, setLink] = useState('')

  // The banner and the fanart share the game's backdrop: the active one is whichever kind it holds.
  const backdrop = art.backdrop
  const active = slot === 'logo' ? art.logo
    : backdrop && ((slot === 'banner') === (backdrop.kind === 'banner')) ? backdrop : null
  const otherActive = slot !== 'logo' && backdrop && !active
  const field = SLOT_FIELD[slot]
  const locked = art.locks.includes(field)
  const activeImage = active?.imageId != null ? art.images.find(i => i.id === active.imageId) : undefined
  const canRemove = !!activeImage

  const upload = (file?: File, url?: string) => run(`upload-${slot}`, async () => {
    const form = new FormData()
    form.append('kind', slot)
    if (file) form.append('file', file)
    if (url) form.append('url', url)
    await call(`${base}/art`, { method: 'POST', body: form })
    setLink(''); setLinkOpen(false)
  }, t('imgSaved'))

  const remove = (img: ArtImage) => run(`remove-${img.id}`, async () => {
    await call(`${base}/art?imageId=${img.id}`, { method: 'DELETE' })
    offerUndo(t('imgRemoved', { category: label }), () => call(`${base}/art/restore?imageId=${img.id}`, { method: 'POST' }))
  })

  return (
    <div className="flex flex-wrap gap-10 items-start">
      <section className="flex-1 min-w-[320px] max-w-2xl space-y-4" aria-labelledby={`active-${slot}`}>
        <div className="flex items-baseline justify-between gap-3">
          <h3 id={`active-${slot}`} className="text-[15px] font-semibold">{t('imgActive', { category: label })}</h3>
          {active && (locked
            ? <button type="button" onClick={() => void onRelease()} className="text-xs text-amber-300 hover:underline">{t('imgManual')} · {t('imgRelease')}</button>
            : <span className="text-xs text-muted-foreground">{t('imgAuto')}</span>)}
        </div>

        {active ? (
          <div className={`rounded-xl border border-border overflow-hidden ${slot === 'logo' ? 'bg-[repeating-conic-gradient(#1c1c24_0%_25%,#15151b_0%_50%)] bg-[length:16px_16px]' : 'bg-secondary'}`} style={{ aspectRatio: slot === 'logo' ? '16 / 7' : '16 / 9' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={active.url} alt={t('imgActive', { category: label })} className={`w-full h-full ${slot === 'logo' ? 'object-contain' : 'object-cover'}`} />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border grid place-items-center text-sm text-muted-foreground px-6 text-center" style={{ aspectRatio: slot === 'logo' ? '16 / 7' : '16 / 9' }}>
            {otherActive ? t('imgOtherActive', { other: t(slot === 'banner' ? 'cat_fanart' : 'cat_banner') }) : t('imgNone', { category: label })}
          </div>
        )}
        <p className="text-sm text-muted-foreground">{t(`imgUse_${slot}`)}</p>

        <div className="flex flex-wrap gap-2.5">
          {!panel && (
            <button type="button" className={btnPrimary} disabled={busy !== null} onClick={() => fileRef.current?.click()}>
              {busy === `upload-${slot}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {t('imgUpload')}
            </button>
          )}
          {!panel && (
            <button type="button" className={btnSecondary} disabled={busy !== null} onClick={() => setLinkOpen(o => !o)}>
              <Link2 className="w-4 h-4" />{t('imgPasteLink')}
            </button>
          )}
          {canRemove && activeImage && (
            <button type="button" className={btnDanger} disabled={busy !== null} onClick={() => void remove(activeImage)}>
              <Trash2 className="w-4 h-4" />{t('imgRemove')}
            </button>
          )}
          {!panel && (
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label={t('imgUpload')}
              onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }}
            />
          )}
        </div>

        {!panel && linkOpen && (
          <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (link.trim()) void upload(undefined, link.trim()) }}>
            <input
              value={link}
              onChange={e => setLink(e.target.value)}
              placeholder="https://…"
              aria-label={t('imgPasteLink')}
              className="flex-1 bg-secondary border border-border rounded-md px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
            <button type="submit" className={btnSecondary} disabled={busy !== null || !link.trim()}>{t('imgDownload')}</button>
          </form>
        )}

        {active && slot !== 'logo' && art.palette && art.palette.length > 0 && (
          <div className="flex items-center gap-3 border-t border-border pt-4">
            <span className="text-sm text-muted-foreground">{t('imgPalette')}</span>
            <span className="flex gap-1.5">
              {art.palette.map((c, i) => <span key={i} className="w-7 h-7 rounded-full border border-border" style={{ background: c }} role="img" aria-label={c} />)}
            </span>
          </div>
        )}
      </section>

      <div className="flex-1 min-w-[300px] max-w-md">
        <Library
          title={t('imgLibraryOf', { category: label })}
          images={images}
          activeId={active?.imageId ?? null}
          busy={busy}
          onUse={img => run(`use-${img.id}`, () => call(`${base}/art/activate`, post({ imageId: img.id })), t('imgSaved'))}
          onRemove={remove}
          extra={panel ? undefined : (
            <button type="button" onClick={() => fileRef.current?.click()} className="aspect-video rounded-lg border-2 border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors">
              + {t('imgUploadAnother')}
            </button>
          )}
        />
      </div>
    </div>
  )
}

// ── The library of a category: choose one to make it the active image ───────────────────────

function Library({ title, images, activeId, busy, onUse, onRemove, extra }: {
  title: string
  images: ArtImage[]
  activeId: number | null
  busy: string | null
  onUse: (img: ArtImage) => void
  onRemove?: (img: ArtImage) => void
  extra?: ReactNode
}) {
  const t = useTranslations('GameEditor')
  return (
    <section className="space-y-3" aria-label={title}>
      <h3 className="text-[15px] font-semibold">{title} <span className="text-muted-foreground font-normal">{images.length}</span></h3>
      {images.length === 0 && !extra && <p className="text-sm text-muted-foreground">{t('imgLibraryEmpty')}</p>}
      <div role="radiogroup" aria-label={title} className="grid grid-cols-2 gap-3">
        {images.map(img => {
          const on = img.id === activeId
          return (
            <div key={img.id} className="space-y-1.5">
              <button
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={t('imgUseThis')}
                disabled={busy !== null || on}
                onClick={() => onUse(img)}
                className={`relative block w-full aspect-video rounded-lg overflow-hidden bg-secondary border-2 transition-colors ${on ? 'border-primary' : 'border-border hover:border-muted-foreground'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" loading="lazy" className="w-full h-full object-contain" />
                {on && <span className="absolute top-1.5 right-1.5 grid place-items-center w-5 h-5 rounded-full bg-primary text-primary-foreground"><Check className="w-3 h-3" /></span>}
                {busy === `use-${img.id}` && <span className="absolute inset-0 grid place-items-center bg-black/50"><Loader2 className="w-4 h-4 animate-spin" /></span>}
              </button>
              <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                <span className="truncate">
                  {img.manual ? t('imgSourceManual') : 'LaunchBox'}{img.width && img.height ? ` · ${img.width} × ${img.height}` : ''}{img.region ? ` · ${img.region}` : ''}
                </span>
                {onRemove && (
                  <button type="button" onClick={() => onRemove(img)} disabled={busy !== null} className="text-destructive hover:underline flex-shrink-0">{t('imgRemove')}</button>
                )}
              </div>
            </div>
          )
        })}
        {extra}
      </div>
    </section>
  )
}

// ── Screenshots: the list the public page shows, in its order ──────────────────────────────

function ScreenshotsPanel({ art, base, gameId, busy, run, offerUndo, onCover, panel }: {
  panel: boolean
  art: GameArt
  base: string
  gameId: number
  busy: string | null
  run: (key: string, fn: () => Promise<unknown>, done?: string) => Promise<void>
  offerUndo: (text: string, restore: () => Promise<unknown>) => void
  onCover: (path: string, sources?: MetadataSources) => void
}) {
  const t = useTranslations('GameEditor')
  const fileRef = useRef<HTMLInputElement>(null)
  const [linksOpen, setLinksOpen] = useState(false)
  const [links, setLinks] = useState('')
  const [drag, setDrag] = useState<number | null>(null)
  const shots = art.screenshots
  const external = shots.filter(s => s.external).length

  const put = (values: string[]) => call(`${base}/screenshots`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ list: values }) })
  const values = shots.map(s => s.value)

  const reorder = (from: number, to: number) => {
    if (from === to || to < 0 || to >= shots.length) return
    const next = [...values]
    next.splice(to, 0, next.splice(from, 1)[0])
    void run('reorder', () => put(next))
  }

  const remove = (i: number) => run(`shot-${i}`, async () => {
    await put(values.filter((_, idx) => idx !== i))
    offerUndo(t('imgShotRemoved'), () => put(values))
  })

  const add = (files: File[], urls: string[]) => run('add-shots', async () => {
    const form = new FormData()
    files.forEach(f => form.append('file', f))
    urls.forEach(u => form.append('url', u))
    await call(`${base}/screenshots`, { method: 'POST', body: form })
    setLinks(''); setLinksOpen(false)
  }, t('imgSaved'))

  /** The bytes of one screenshot: a link the server can fetch, or the file itself when it is in the bucket. */
  const asForm = async (s: ShotEntry, fields: Record<string, string>) => {
    const form = new FormData()
    Object.entries(fields).forEach(([k, v]) => form.append(k, v))
    if (s.external) form.append('url', s.value)
    else form.append('file', await (await fetch(s.url)).blob(), 'screenshot.webp')
    return form
  }

  const asBanner = (s: ShotEntry, i: number) => run(`banner-${i}`, async () => {
    await call(`${base}/art`, { method: 'POST', body: await asForm(s, { kind: 'banner' }) })
  }, t('imgSaved'))

  const asCover = (s: ShotEntry, i: number) => run(`cover-${i}`, async () => {
    const data = s.external
      ? await call<{ coverPath: string }>('/api/covers', post({ gameId, url: s.value, source: 'screenshot' }))
      : await call<{ coverPath: string }>('/api/covers', { method: 'POST', body: await asForm(s, { gameId: String(gameId), source: 'screenshot' }) })
    onCover(data.coverPath)
  }, t('imgCoverChanged'))

  const storeAll = () => run('store', async () => {
    const res = await call<{ failed: number }>(`${base}/screenshots/store`, { method: 'POST' })
    if (res.failed > 0) toast(t('imgStoreFailed', { count: res.failed }), 'error')
  }, t('imgStored'))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2.5">
        {!panel && (
          <button type="button" className={btnPrimary} disabled={busy !== null} onClick={() => fileRef.current?.click()}>
            {busy === 'add-shots' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {t('imgAddShots')}
          </button>
        )}
        {!panel && (
          <button type="button" className={btnSecondary} disabled={busy !== null} onClick={() => setLinksOpen(o => !o)}>
            <Link2 className="w-4 h-4" />{t('imgPasteLinks')}
          </button>
        )}
        {!panel && (
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            aria-label={t('imgAddShots')}
            onChange={e => { const f = Array.from(e.target.files ?? []); if (f.length) void add(f, []); e.target.value = '' }}
          />
        )}
        {external > 0 && (
          <span className="ml-auto text-sm text-amber-300">
            {t('imgExternalNote', { external, total: shots.length })}{' '}
            <button type="button" onClick={() => void storeAll()} disabled={busy !== null} className="underline hover:no-underline">
              {busy === 'store' ? t('imgStoring') : t('imgStore')}
            </button>
          </span>
        )}
      </div>

      {!panel && linksOpen && (
        <form className="space-y-2 max-w-xl" onSubmit={e => { e.preventDefault(); const urls = links.split(/\s+/).filter(Boolean); if (urls.length) void add([], urls) }}>
          <textarea
            value={links}
            onChange={e => setLinks(e.target.value)}
            rows={3}
            placeholder={t('imgLinksPlaceholder')}
            aria-label={t('imgPasteLinks')}
            className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            autoFocus
          />
          <button type="submit" className={btnSecondary} disabled={busy !== null || !links.trim()}>{t('imgDownload')}</button>
        </form>
      )}

      {shots.length === 0 ? (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border px-4 py-8 text-center">{t('imgNoShots')}</p>
      ) : (
        <ol aria-label={t('imgShotsOrder')} className="grid grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-6">
          {shots.map((s, i) => (
            <li
              key={s.value}
              draggable
              onDragStart={() => setDrag(i)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => { if (drag !== null) reorder(drag, i); setDrag(null) }}
              className={`space-y-2 ${drag === i ? 'opacity-40' : ''}`}
            >
              <div className="relative aspect-video rounded-lg overflow-hidden bg-secondary border border-border cursor-grab">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.url} alt={t('imgShotAlt', { n: i + 1 })} loading="lazy" className="w-full h-full object-cover" />
                <span className="absolute top-2 left-2 rounded bg-background/80 px-2 py-0.5 text-xs">{i + 1}</span>
                <span className={`absolute top-2 right-2 rounded bg-background/80 px-2 py-0.5 text-xs ${s.external ? 'text-amber-300' : 'text-emerald-300'}`}>
                  {s.external ? t('imgExternal') : t('imgInStorage')}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                <button type="button" onClick={() => void asBanner(s, i)} disabled={busy !== null} className="text-primary hover:underline">{t('imgUseAsBanner')}</button>
                <button type="button" onClick={() => void asCover(s, i)} disabled={busy !== null} className="text-primary hover:underline">{t('imgUseAsCover')}</button>
                <span className="ml-auto flex items-center gap-1">
                  <button type="button" aria-label={t('imgMoveBack')} disabled={busy !== null || i === 0} onClick={() => reorder(i, i - 1)} className="p-1 rounded hover:bg-accent disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                  <button type="button" aria-label={t('imgMoveForward')} disabled={busy !== null || i === shots.length - 1} onClick={() => reorder(i, i + 1)} className="p-1 rounded hover:bg-accent disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
                  <button type="button" onClick={() => void remove(i)} disabled={busy !== null} className="ml-1 text-destructive hover:underline">{t('imgRemove')}</button>
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-muted-foreground max-w-prose">{t('imgShotsHint')}</p>
    </div>
  )
}

// ── Reference categories: packaging, media and everything else LaunchBox has ────────────────

/** Read-only: the images grouped under the data model's name for each kind. */
function ReferencePanel({ images, hint }: { images: ArtImage[]; hint: string }) {
  const t = useTranslations('GameEditor')
  if (images.length === 0) return <p className="text-sm text-muted-foreground">{t('imgLibraryEmpty')}</p>
  const byKind = new Map<string, ArtImage[]>()
  for (const img of images) byKind.set(img.kind, [...(byKind.get(img.kind) ?? []), img])
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground max-w-prose">{hint}</p>
      {[...byKind.entries()].map(([kind, list]) => (
        <section key={kind} className="space-y-3" aria-label={artTitle(kind)}>
          <h3 className="text-[15px] font-semibold">{artTitle(kind)} <span className="text-muted-foreground font-normal">{list.length}</span></h3>
          <ul className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {list.map(img => (
              <li key={img.id} className="space-y-1.5">
                <a href={img.url} target="_blank" rel="noopener noreferrer" className="block aspect-video rounded-lg overflow-hidden bg-secondary border border-border hover:border-muted-foreground transition-colors">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={artTitle(kind)} loading="lazy" className="w-full h-full object-contain" />
                </a>
                <p className="text-xs text-muted-foreground truncate">{img.region ? `${img.region} · ` : ''}{img.width && img.height ? `${img.width} × ${img.height}` : ''}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
