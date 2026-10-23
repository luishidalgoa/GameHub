'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Save, Loader2, ArrowLeft, Heart, Star, EyeOff, Search, ImageIcon, Link2, Github, Plus, Trash2, GitMerge } from 'lucide-react'
import useSWR from 'swr'
import { GameImagesPanel } from './GameImagesPanel'
import { MetadataFetchButton } from './MetadataFetchButton'
import { ScoreField } from './ScoreField'
import { TrailerField } from './TrailerField'
import { RegionSelect } from './RegionSelect'
import { parseExternalLinks, type ExternalLinkItem } from '@/components/game/ExternalLinks'
import { YouTubeEmbed } from '@/components/shared/YouTubeEmbed'
import { toast } from '@/components/shared/Toaster'
import type { Game } from '@/types/game'
import type { GameArt } from '@/lib/game-art'
import { ART_KINDS, artKindOf, artTitle } from '@/lib/art-catalog'
import { PROVIDER_LABEL, parseMetadataSources, type FieldSource, type MetadataSources } from '@/lib/metadata/sources'
import { parseLocks } from '@/lib/manual-fields'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const SECTIONS = ['datos', 'imagenes', 'trailer', 'archivo'] as const
type Section = (typeof SECTIONS)[number]

interface Props {
  game: Game
  thumbnailWidth?: number
  thumbnailHeight?: number
}

export function GameEditorForm({ game, thumbnailWidth = 200, thumbnailHeight = 300 }: Props) {
  const router = useRouter()
  const t = useTranslations('GameEditor')
  const [section, setSection] = useState<Section>('datos')
  const openSection = (id: Section) => {
    setSection(id)
    window.history.replaceState(null, '', `#${id}`)
  }
  // A link to #imagenes (or any section) opens on it.
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if ((SECTIONS as readonly string[]).includes(id)) setSection(id as Section)
  }, [])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [coverPath, setCoverPath] = useState(game.coverPath)

  const [form, setForm] = useState({
    title: game.title ?? '',
    description: game.description ?? '',
    customNotes: game.customNotes ?? '',
    genre: game.genre ?? '',
    region: game.region ?? '',
    languages: game.languages ?? '',
    releaseYear: game.releaseYear ? String(game.releaseYear) : '',
    developer: game.developer ?? '',
    titleId: game.titleId ?? '',
    publisher: game.publisher ?? '',
    trailerUrl: game.trailerUrl ?? '',
    score: game.rawgScore != null ? String(game.rawgScore) : '',
    isFavorite: game.isFavorite,
    isFeatured: game.isFeatured ?? false,
    isHidden: game.isHidden,
  })

  // Provenance of the score currently in the field: the source returned by the
  // chain, or 'manual' once the admin types/changes it by hand.
  const [scoreSource, setScoreSource] = useState<string | null>(game.scoreSource ?? null)

  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  // ── Metadata provenance (per-field source badges) ───────────────────────────
  // Stateful: applying a cover rewrites `cover`, and the badge has to follow the
  // picture immediately — the server prop only refreshes on a full reload.
  const [sources, setSources] = useState<MetadataSources>(() => parseMetadataSources(game.metadataSources))
  // Fields the owner set by hand: automatic flows leave them alone until released here.
  const [locks, setLocks] = useState<string[]>(() => parseLocks((game as { manualFields?: string | null }).manualFields))
  const releaseField = async (field: string) => {
    const res = await fetch(`/api/games/${game.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unlock: [field] }) })
    if (res.ok) setLocks((await res.json()).manualFields ? parseLocks((await res.clone().json()).manualFields) : [])
  }

  // ── External links ─────────────────────────────────────────────────────────
  const [links, setLinks] = useState<ExternalLinkItem[]>(parseExternalLinks(game.externalLinks))
  const addLink    = () => setLinks((p) => [...p, { title: '', description: '', url: '' }])
  const removeLink = (i: number) => setLinks((p) => p.filter((_, idx) => idx !== i))
  const setLink    = (i: number, key: keyof ExternalLinkItem, value: string) =>
    setLinks((p) => p.map((l, idx) => (idx === i ? { ...l, [key]: value } : l)))

  // ── Merge / absorb a duplicate game ──────────────────────────────────────────
  const [mergeQuery, setMergeQuery] = useState('')
  const [merging, setMerging] = useState(false)
  const { data: mergeResults } = useSWR<{ games: Array<{ id: number; title: string; fileSize: string }> }>(
    mergeQuery.trim().length > 1 && game.platform?.slug
      ? `/api/games?platform=${game.platform.slug}&search=${encodeURIComponent(mergeQuery)}&pageSize=10`
      : null,
    fetcher,
  )

  const absorbGame = async (sourceId: number, sourceTitle: string) => {
    if (!confirm(`¿Fusionar "${sourceTitle}" dentro de "${game.title}"? Sus archivos pasarán a este juego y la otra ficha se eliminará. Esta acción no se puede deshacer.`)) return
    setMerging(true)
    const res = await fetch('/api/games/merge', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ targetId: game.id, sourceId }),
    })
    setMerging(false)
    if (res.ok) {
      setMergeQuery('')
      router.refresh()
      window.location.reload()
    } else {
      const err = await res.json().catch(() => ({}))
      alert(`No se pudo fusionar: ${err.error ?? res.statusText}`)
    }
  }


  const save = async () => {
    setSaving(true)
    // The score field maps to rawgScore (+ scoreSource for provenance). We stamp
    // popularityFetchedAt so the idempotent popularity batch won't overwrite a
    // saved score on a later sync (unless "re-fetch"). A LaunchBox community
    // rating must NOT land in rawgMetacritic (which means "critic score"), so we
    // only set rawgMetacritic when the source is a critic one.
    const { score, ...rest } = form
    const scoreNum = score === '' ? null : parseInt(score, 10)
    const finalScore = Number.isNaN(scoreNum as number) ? null : scoreNum
    // If the value changed from what the chain returned, it's a manual edit.
    const effectiveSource = finalScore == null ? null : (scoreSource ?? 'manual')
    const isCritic = effectiveSource === 'rawg' || effectiveSource === 'metacritic' || effectiveSource === 'manual'
    const res = await fetch(`/api/games/${game.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...rest,
        releaseYear: rest.releaseYear ? parseInt(rest.releaseYear, 10) : null,
        externalLinks: JSON.stringify(links.filter((l) => l.url.trim())),
        rawgScore:           finalScore,
        rawgMetacritic:      isCritic ? finalScore : null,
        scoreSource:         effectiveSource,
        popularityFetchedAt: new Date().toISOString(),
      }),
    })
    if (res.ok) setLocks(parseLocks((await res.clone().json()).manualFields))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    toast(t('savedToast'))
    router.refresh()
  }

  const handleMetadataApplied = () => {
    // Refresh page to get updated data
    router.refresh()
    window.location.reload()
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-md hover:bg-accent transition-colors text-muted-foreground"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-semibold">{game.title}</h2>
            <p className="text-sm text-muted-foreground">{game.platform?.name} · {game.fileName}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <MetadataFetchButton gameId={game.id} onApplied={handleMetadataApplied} />
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saved ? t('saved') : saving ? t('saving') : t('saveChanges')}
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <nav aria-label={t('navAria')} className="lg:w-56 flex-shrink-0 flex lg:flex-col gap-1 overflow-x-auto text-sm">
          {SECTIONS.map((id) => (
            <button
              key={id}
              type="button"
              aria-current={section === id ? 'page' : undefined}
              onClick={() => openSection(id)}
              className={`px-3 py-2.5 rounded-lg text-left whitespace-nowrap transition-colors ${section === id ? 'bg-accent text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}`}
            >
              {t(`section_${id}`)}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 max-w-4xl">
          {section === 'datos' && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold">{t('sectionData')}</h2>
          <Field label={t('fieldTitle')}>
            <input
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              className={inputCls}
            />
          </Field>

          <Field label={t('fieldDescription')} badge={<SourceBadge source={sources.description} />}>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={6}
              className={`${inputCls} resize-y`}
            />
          </Field>

          <Field label={t('fieldCustomNotes')}>
            <textarea
              value={form.customNotes}
              onChange={(e) => set('customNotes', e.target.value)}
              rows={4}
              placeholder={t('fieldCustomNotesPlaceholder')}
              className={`${inputCls} resize-y`}
            />
            <p className="mt-1 text-xs text-muted-foreground">{t('fieldCustomNotesHint')}</p>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label={t('fieldGenre')} badge={<FieldBadge locked={locks.includes('genre')} source={sources.facts?.genre ?? sources.info} onRelease={() => releaseField('genre')} />}>
              <input value={form.genre} onChange={(e) => set('genre', e.target.value)} className={inputCls} placeholder={t('fieldGenrePlaceholder')} />
            </Field>
            <Field label={t('fieldRegion')}>
              <RegionSelect value={form.region} onChange={(v) => set('region', v)} className={inputCls} />
            </Field>
            <Field label={t('fieldLanguages')}>
              <input value={form.languages} onChange={(e) => set('languages', e.target.value)} className={inputCls} placeholder={t('fieldLanguagesPlaceholder')} />
            </Field>
            <Field label={t('fieldYear')} badge={<FieldBadge locked={locks.includes('releaseYear')} source={sources.facts?.releaseYear ?? sources.info} onRelease={() => releaseField('releaseYear')} />}>
              <input value={form.releaseYear} onChange={(e) => set('releaseYear', e.target.value)} className={inputCls} type="number" min="1970" max="2030" />
            </Field>
            <Field label={t('fieldDeveloper')} badge={<FieldBadge locked={locks.includes('developer')} source={sources.facts?.developer ?? sources.info} onRelease={() => releaseField('developer')} />}>
              <input value={form.developer} onChange={(e) => set('developer', e.target.value)} className={inputCls} />
            </Field>
            <Field label={t('fieldTitleId')} className="col-span-2">
              <input
                value={form.titleId}
                onChange={(e) => set('titleId', e.target.value)}
                className={`${inputCls} font-mono`}
                placeholder={t('fieldTitleIdPlaceholder')}
                maxLength={18}
                spellCheck={false}
              />
              <p className="mt-1 text-xs text-muted-foreground">{t('fieldTitleIdHint')}</p>
            </Field>
            <Field label={t('fieldPublisher')} className="col-span-2" badge={<FieldBadge locked={locks.includes('publisher')} source={sources.facts?.publisher ?? sources.info} onRelease={() => releaseField('publisher')} />}>
              <input value={form.publisher} onChange={(e) => set('publisher', e.target.value)} className={inputCls} />
            </Field>

            {/* Score (0–100) + "Buscar nota" (Metacritic) */}
            <Field label={t('fieldScore')} className="col-span-2">
              <ScoreField
                gameId={game.id}
                value={form.score}
                inputClassName={inputCls}
                onChange={(value, source) => { set('score', value); setScoreSource(source) }}
              />
            </Field>
          </div>

          {/* Flags */}
          <div className="bg-secondary/50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide text-xs">{t('flags')}</p>

            <Toggle
              icon={<Heart className="w-4 h-4" />}
              label={t('favorite')}
              onLabel={t('on')}
              offLabel={t('off')}
              value={form.isFavorite}
              onChange={(v) => set('isFavorite', v)}
              activeClass="text-red-400"
            />
            <Toggle
              icon={<Star className="w-4 h-4" />}
              label={t('featured')}
              onLabel={t('on')}
              offLabel={t('off')}
              value={form.isFeatured}
              onChange={(v) => set('isFeatured', v)}
              activeClass="text-amber-400"
            />
            <Toggle
              icon={<EyeOff className="w-4 h-4" />}
              label={t('hidden')}
              onLabel={t('on')}
              offLabel={t('off')}
              value={form.isHidden}
              onChange={(v) => set('isHidden', v)}
              activeClass="text-amber-400"
            />
          </div>


              <ImageSummary gameId={game.id} onOpen={() => openSection('imagenes')} />
            </div>
          )}

          {section === 'imagenes' && (
            <GameImagesPanel
              gameId={game.id}
              gameTitle={game.title}
              platformSlug={game.platform?.slug}
              coverPath={coverPath}
              onCover={(path, next) => { setCoverPath(path); if (next) setSources(next) }}
              thumbnailWidth={thumbnailWidth}
              thumbnailHeight={thumbnailHeight}
              onRelease={releaseField}
            />
          )}

          {section === 'trailer' && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold">{t('sectionTrailer')}</h2>
          <Field label={t('fieldTrailer')}>
            <TrailerField
              gameTitle={game.title}
              value={form.trailerUrl}
              inputClassName={inputCls}
              onChange={(url) => set('trailerUrl', url)}
            />
          </Field>

          {form.trailerUrl && (
            <YouTubeEmbed url={form.trailerUrl} className="aspect-video rounded-lg overflow-hidden" />
          )}

          {/* External links (community mods, translations, GitHub projects…) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <Link2 className="w-4 h-4 text-muted-foreground" />
                {t('externalLinks')}
              </p>
              <button
                type="button"
                onClick={addLink}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-secondary border border-border hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('addLink')}
              </button>
            </div>

            {links.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 bg-secondary/40 border border-border rounded-lg px-3 py-3">
                {t('externalLinksHint')}
              </p>
            ) : (
              <div className="space-y-3">
                {links.map((link, i) => {
                  const isGithub = /(^|\.)github\.com/i.test(link.url)
                  return (
                    <div key={i} className="bg-secondary/40 border border-border rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        {isGithub ? <Github className="w-4 h-4 text-foreground flex-shrink-0" /> : <Link2 className="w-4 h-4 text-primary flex-shrink-0" />}
                        <input
                          value={link.title}
                          onChange={(e) => setLink(i, 'title', e.target.value)}
                          placeholder={t('linkTitlePlaceholder')}
                          className="flex-1 bg-secondary border border-border rounded-md px-2.5 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        <button
                          type="button"
                          onClick={() => removeLink(i)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          aria-label="Remove link"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <input
                        value={link.url}
                        onChange={(e) => setLink(i, 'url', e.target.value)}
                        placeholder="https://github.com/usuario/proyecto"
                        className="w-full bg-secondary border border-border rounded-md px-2.5 py-1.5 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <textarea
                        value={link.description ?? ''}
                        onChange={(e) => setLink(i, 'description', e.target.value)}
                        placeholder={t('linkDescPlaceholder')}
                        rows={2}
                        className="w-full bg-secondary border border-border rounded-md px-2.5 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>


            </div>
          )}

          {section === 'archivo' && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold">{t('sectionFile')}</h2>
          {/* File path (read-only) */}
          <div className="bg-secondary/50 rounded-lg px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">{t('filePath')}</p>
            <p className="text-xs font-mono text-muted-foreground/70 break-all">{game.filePath}</p>
          </div>
          {/* Metadata info + provenance */}
          {game.metadataFetchedAt && (
            <div className="text-xs text-muted-foreground space-y-1">
              <div>{t('metadataFetched')} {new Date(game.metadataFetchedAt).toLocaleDateString()}</div>
              {(['cover', 'info', 'description', 'screenshots'] as const).some(k => sources[k]) && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-muted-foreground/50">{t('sourcesLabel')}</span>
                  {(['cover', 'info', 'description', 'screenshots'] as const)
                    .filter(k => sources[k])
                    .map(k => (
                      <span key={k} className="inline-flex items-center gap-1">
                        <span className="text-muted-foreground/50">{t(`source_${k}`)}</span>
                        <SourceBadge source={sources[k]} />
                      </span>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Merge / absorb duplicate */}
          <div className="bg-secondary/50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium flex items-center gap-2">
              <GitMerge className="w-4 h-4 text-muted-foreground" />
              {t('mergeTitle')}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">{t('mergeHint')}</p>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                value={mergeQuery}
                onChange={(e) => setMergeQuery(e.target.value)}
                placeholder={t('mergeSearchPlaceholder')}
                className="w-full bg-secondary border border-border rounded-md pl-8 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {merging && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('merging')}
              </div>
            )}

            {mergeResults?.games && mergeResults.games.length > 0 && (
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {mergeResults.games
                  .filter((g) => g.id !== game.id)
                  .map((g) => (
                    <div key={g.id} className="flex items-center gap-2 bg-secondary rounded-md px-2.5 py-1.5">
                      <span className="flex-1 truncate text-xs">{g.title}</span>
                      <button
                        type="button"
                        onClick={() => absorbGame(g.id, g.title)}
                        disabled={merging}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-50 transition-colors flex-shrink-0"
                      >
                        <GitMerge className="w-3 h-3" />
                        {t('mergeAbsorb')}
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>

            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const inputCls =
  'w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring'

function Field({
  label,
  children,
  className = '',
  badge,
}: {
  label: string
  children: React.ReactNode
  className?: string
  badge?: React.ReactNode
}) {
  return (
    <div className={className}>
      <label className="flex items-center gap-2 text-sm font-medium mb-1.5">
        {label}
        {badge}
      </label>
      {children}
    </div>
  )
}


/** Small pill showing where a field came from (or nothing if unknown). */
/** Badge of a fact field: "Tuyo" with a release button when the owner set it, otherwise where it came from. */
function FieldBadge({ locked, source, onRelease }: { locked: boolean; source?: FieldSource; onRelease: () => void }) {
  if (locked) {
    return (
      <button
        type="button"
        onClick={onRelease}
        title="Lo fijaste tú: los procesos automáticos no lo cambian. Pulsa para soltarlo."
        className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 leading-none hover:bg-amber-500/25"
      >
        Tuyo · soltar
      </button>
    )
  }
  return <SourceBadge source={source} />
}

function SourceBadge({ source }: { source?: FieldSource }) {
  if (!source) return null
  return (
    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-300 leading-none">
      {PROVIDER_LABEL[source] ?? source}
    </span>
  )
}

function Toggle({
  icon,
  label,
  onLabel,
  offLabel,
  value,
  onChange,
  activeClass,
}: {
  icon: React.ReactNode
  label: string
  onLabel: string
  offLabel: string
  value: boolean
  onChange: (v: boolean) => void
  activeClass: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
        value ? `bg-accent ${activeClass}` : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      }`}
    >
      {icon}
      <span>{label}</span>
      <span className={`ml-auto text-xs ${value ? '' : 'opacity-50'}`}>{value ? onLabel : offLabel}</span>
    </button>
  )
}


/**
 * The images at a glance, in the Details section: the game's slots (cover, banner, background,
 * logo, screenshots) under the data model's names, then every other category the game has.
 */
function ImageSummary({ gameId, onOpen }: { gameId: number; onOpen: () => void }) {
  const t = useTranslations('GameEditor')
  const { data: art } = useSWR<GameArt>(`/api/admin/games/${gameId}/images`, fetcher, { revalidateOnFocus: false })
  if (!art) return null

  const backdropIsBanner = art.backdrop?.kind === 'banner'
  const fanartUrl = art.backdrop && !backdropIsBanner ? art.backdrop.url : null
  const slots = [
    { key: 'cover', title: artTitle('box-front'), url: art.cover, note: '', missing: !art.cover },
    { key: 'banner', title: artTitle('banner'), url: backdropIsBanner ? art.backdrop!.url : null, note: '', missing: !backdropIsBanner },
    { key: 'fanart', title: artTitle('fanart'), url: fanartUrl, note: '', missing: !fanartUrl },
    { key: 'logo', title: artTitle('clear-logo'), url: art.logo?.url ?? null, note: '', missing: !art.logo },
    {
      key: 'shots', title: artTitle('screenshot-gameplay'), url: art.screenshots[0]?.url ?? null,
      note: art.screenshots.length ? t('imgSummaryShots', { count: art.screenshots.length, external: art.screenshots.filter(s => s.external).length }) : '',
      missing: art.screenshots.length === 0,
    },
  ]

  // Every other category the game has, by its catalogue kind (the model's name), with how many.
  const slotKinds = new Set(['box-front', 'banner', 'fanart', 'clear-logo', 'screenshot-gameplay'])
  const others = ART_KINDS
    .filter(k => !slotKinds.has(k.kind))
    .map(k => ({ kind: k.kind, title: k.title, list: art.images.filter(i => artKindOf(i.kind)?.kind === k.kind) }))
    .filter(r => r.list.length > 0)

  const Thumb = ({ url }: { url: string | null }) => url
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={url} alt="" className="w-14 h-10 rounded-md object-cover bg-secondary flex-shrink-0" />
    : <span className="w-14 h-10 rounded-md border border-dashed border-border flex-shrink-0" aria-hidden="true" />

  return (
    <section aria-labelledby="img-summary" className="border-t border-border pt-6 space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="img-summary" className="text-lg font-semibold">{t('sectionImages')}</h2>
        <button type="button" onClick={onOpen} className="text-sm text-primary hover:underline">{t('imgManage')}</button>
      </div>
      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-3 text-sm">
        {slots.map(r => (
          <li key={r.key} className="flex items-center gap-3">
            <Thumb url={r.url} />
            <span className="flex flex-col min-w-0">
              <span>{r.title}</span>
              {r.missing
                ? <span className="text-xs text-amber-300">{t('imgSummaryMissing')}</span>
                : r.note && <span className="text-xs text-muted-foreground">{r.note}</span>}
            </span>
          </li>
        ))}
        {others.map(r => (
          <li key={r.kind} className="flex items-center gap-3">
            <Thumb url={r.list[0].url} />
            <span className="flex flex-col min-w-0">
              <span>{r.title}</span>
              <span className="text-xs text-muted-foreground">{r.list.length}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
