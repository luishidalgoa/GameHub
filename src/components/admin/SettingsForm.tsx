'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Save, Loader2, Plus, Trash2, ChevronDown, ChevronUp, FolderPlus, X, FolderOpen, Wifi, CheckCircle2, XCircle, AlertCircle, Pencil, Check } from 'lucide-react'
import { FolderPickerModal } from './FolderPickerModal'
import { DonationSettingsForm } from './DonationSettingsForm'
import { HomebrewRepos } from './HomebrewRepos'
import { PlatformIconUploader } from './PlatformIconUploader'
import { parseEmulators, OS_ORDER, OS_LABEL, type EmulatorSet, type EmulatorOS } from '@/components/platform/EmulatorLinks'

const splitPaths = (s: string) => s.split('|').map(p => p.trim()).filter(Boolean)
const joinPaths  = (arr: string[]) => arr.filter(Boolean).join('|')

/** Serialize an EmulatorSet to JSON, keeping only entries with a real URL. */
const serializeEmulators = (set: EmulatorSet): string => {
  const out: EmulatorSet = {}
  for (const os of OS_ORDER) {
    const e   = set[os]
    const url = e?.url?.trim()
    if (url) out[os] = { url, ...(e?.name?.trim() ? { name: e.name.trim() } : {}) }
  }
  return JSON.stringify(out)
}

/**
 * Reusable scan-path list editor. Defined at module scope (NOT inside
 * SettingsForm) so React keeps the same component identity across renders —
 * otherwise every keystroke remounts the inputs and they lose focus.
 */
function PathEditor({
  paths,
  platformId,
  slug,
  onChange,
  onBrowse,
  t,
}: {
  paths: string[]
  platformId: number   // -1 for new platform form
  slug: string
  onChange: (paths: string[]) => void
  onBrowse: (platformId: number, pathIndex: number) => void
  t: ReturnType<typeof useTranslations>
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-medium">{t('scanPaths')}</span>
        <button
          type="button"
          onClick={() => onChange([...paths, ''])}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <FolderPlus className="w-3.5 h-3.5" /> {t('addPath')}
        </button>
      </div>
      {paths.length === 0 && (
        <p className="text-xs text-amber-500/80 italic">{t('noPaths')}</p>
      )}
      {paths.map((path, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input
            type="text"
            value={path}
            onChange={(e) => {
              const next = [...paths]
              next[idx] = e.target.value
              onChange(next)
            }}
            placeholder={`e.g. /mnt/F/${slug.toUpperCase()}/Games`}
            className="flex-1 min-w-0 bg-secondary border border-border rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="button"
            onClick={() => onBrowse(platformId, idx)}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex-shrink-0"
            title={t('browseFolder')}
          >
            <FolderOpen className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onChange(paths.filter((_, i) => i !== idx))}
            className="p-1.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-950/30 transition-colors flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

/** Shows the live shop URL using the host the admin is currently browsing. */
function ShopUrl() {
  const [host, setHost] = useState('<raspberry-ip>')
  useEffect(() => { if (typeof window !== 'undefined') setHost(window.location.host) }, [])
  return <>http://{host}/api/shop</>
}

/** Labelled <select> for choosing a metadata provider for one kind of data. */
function ProviderSelect({ label, value, onChange, options }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

/** Compact provider <select> for one platform, with "inherit" as the default. */
function PlatformProviderSelect({ label, value, inheritLabel, onChange, options }: {
  label: string
  value: string | null | undefined
  inheritLabel: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="bg-background border border-border rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="">{inheritLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}

interface Platform {
  id: number
  slug: string
  name: string
  scanPath: string
  extensions: string
  scanMode: string
  enabled: boolean
  sortOrder: number
  thumbnailWidth?: number
  thumbnailHeight?: number
  scanDlc: boolean
  // null / '' = hereda del ajuste global. Ver lib/metadata/matrix.ts
  providerCover?: string | null
  providerInfo?: string | null
  providerDescription?: string | null
  providerScreenshots?: string | null
  emulatorName?: string | null
  emulatorUrl?: string | null
  emulators?: string | null
  iconPath?: string | null
  _count?: { games: number }
}

interface Props {
  platforms: Platform[]
  settings: Record<string, string>
  donation: {
    donate_kofi: string
    donate_bmac: string
    donate_crypto: string
    donate_message: string
    donate_quarter_goal_eur: string
  }
}

const SCAN_MODES = [
  { value: 'flat',   label: 'Flat',   desc: 'Each file = one game (3DS, PSP, NDS…)' },
  { value: 'folder', label: 'Folder', desc: 'Each folder = one game + DLCs (Switch)' },
  { value: 'ports',  label: 'Ports',  desc: 'Root files + folders, no deep walk (Vita Ports)' },
]

const emptyNewPlatform = { slug: '', name: '', extensions: '', scanMode: 'flat', thumbnailWidth: 200, thumbnailHeight: 300, scanDlc: false }

type ScopeId = 'plataformas' | 'proveedores' | 'claves' | 's3' | 'cola' | 'tienda' | 'app' | 'donaciones'

/** Ámbitos agrupados, como en el diseño aprobado. */
const SCOPE_GROUPS: Array<{ label: string; items: Array<{ id: ScopeId; label: string }> }> = [
  { label: 'Biblioteca', items: [{ id: 'plataformas', label: 'Plataformas' }, { id: 'proveedores', label: 'Proveedores de metadatos' }] },
  { label: 'Conexiones', items: [{ id: 'claves', label: 'Claves API' }, { id: 's3', label: 'Almacenamiento S3' }] },
  { label: 'Descargas', items: [{ id: 'cola', label: 'Cola de descargas' }, { id: 'tienda', label: 'Tienda' }] },
  { label: 'Público', items: [{ id: 'donaciones', label: 'Donaciones' }, { id: 'app', label: 'URL de la app' }] },
]

/** Claves que guarda cada ámbito, con el valor que supone cuando no hay fila. */
const SCOPE_KEYS: Partial<Record<ScopeId, Array<[string, string]>>> = {
  claves: [['rawg_api_key', ''], ['google_search_api_key', ''], ['steamgriddb_key', ''], ['youtube_api_key', '']],
  proveedores: [['provider_cover', 'launchbox'], ['provider_info', 'launchbox'], ['provider_description', 'rawg'], ['provider_screenshots', 'launchbox']],
  s3: [['s3_endpoint_interno', ''], ['s3_endpoint_publico', ''], ['s3_access_key', ''], ['s3_secret_key', ''], ['s3_bucket_name', ''], ['s3_region', '']],
  cola: [['max_concurrent_downloads', '1'], ['download_limit_kib_per_s', '0']],
  tienda: [['shop_password', '']],
  app: [['app_url', process.env.NEXT_PUBLIC_APP_URL ?? '']],
}

/** Plataformas en un solo texto: sirve para saber si hay cambios sin guardar. */
const platformsSnapshot = (
  ps: Platform[],
  paths: Record<number, string[]>,
  emus: Record<number, EmulatorSet>,
) => JSON.stringify({ ps, paths, emus })

/** Barra de cada ámbito: cambios pendientes, guardar y descartar, y el error de esa sección. */
function SectionFrame({ dirty, saving, saved, error, onSave, onDiscard, children }: {
  dirty: boolean
  saving: boolean
  saved: boolean
  error?: string
  onSave: () => void
  onDiscard: () => void
  children: React.ReactNode
}) {
  return (
    <div className="space-y-4">
      {children}
      <div role="status" className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <span className={`text-sm ${dirty ? 'text-amber-400' : 'text-muted-foreground'}`}>
          {dirty ? 'Hay cambios sin guardar en esta sección.' : 'Sin cambios pendientes.'}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onDiscard}
            disabled={!dirty || saving}
            className="rounded-md border border-border px-3.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            Descartar
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || saving}
            className="flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saved ? 'Guardado' : saving ? 'Guardando…' : 'Guardar sección'}
          </button>
        </div>
      </div>
      {error && (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  )
}


export function SettingsForm({ platforms: initial, settings, donation }: Props) {
  const t = useTranslations('SettingsForm')
  const router = useRouter()

  const [platforms, setPlatforms] = useState<Platform[]>(initial)

  // Paths stored as string[] per platform — avoids all the split/join-on-empty-string bugs
  const [pathsMap, setPathsMap] = useState<Record<number, string[]>>(() =>
    Object.fromEntries(initial.map((p) => [p.id, splitPaths(p.scanPath)]))
  )

  const getPaths  = (id: number) => pathsMap[id] ?? []
  const setPaths  = (id: number, paths: string[]) =>
    setPathsMap((prev) => ({ ...prev, [id]: paths }))

  // Per-OS emulator links (migrates the deprecated single emulatorName/Url too)
  const [emulatorsMap, setEmulatorsMap] = useState<Record<number, EmulatorSet>>(() =>
    Object.fromEntries(initial.map((p) => [p.id, parseEmulators(p.emulators)]))
  )
  const getEmu = (id: number) => emulatorsMap[id] ?? {}
  const setEmu = (id: number, os: EmulatorOS, field: 'name' | 'url', value: string) =>
    setEmulatorsMap((prev) => {
      const cur   = prev[id] ?? {}
      const entry = { ...(cur[os] ?? { url: '' }), [field]: value }
      return { ...prev, [id]: { ...cur, [os]: entry } }
    })
  const setEmuEntry = (id: number, os: EmulatorOS, entry: { name?: string; url: string }) =>
    setEmulatorsMap((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [os]: entry } }))

  // Distinct emulators already entered across all platforms — offered for reuse.
  const existingEmulators = useMemo(() => {
    const seen = new Map<string, { name?: string; url: string }>()
    for (const set of Object.values(emulatorsMap)) {
      for (const os of OS_ORDER) {
        const e = set[os]
        const url = e?.url?.trim()
        if (url) {
          const name = e?.name?.trim() || undefined
          const key  = `${name ?? ''}|${url}`
          if (!seen.has(key)) seen.set(key, { name, url })
        }
      }
    }
    return [...seen.values()]
  }, [emulatorsMap])

  const [rawgKey,       setRawgKey]       = useState(settings['rawg_api_key']             ?? '')
  const [googleApiKey,  setGoogleApiKey]  = useState(settings['google_search_api_key']    ?? '')
  const [sgdbKey,       setSgdbKey]       = useState(settings['steamgriddb_key']           ?? '')
  const [youtubeKey,    setYoutubeKey]    = useState(settings['youtube_api_key']           ?? '')
  const [maxDownloads,  setMaxDownloads]  = useState(settings['max_concurrent_downloads'] ?? '1')
  const [downloadLimit, setDownloadLimit] = useState(settings['download_limit_kib_per_s'] ?? '0')

  // Metadata provider matrix (which source supplies each kind of data)
  const [provCover,       setProvCover]       = useState(settings['provider_cover']       ?? 'launchbox')
  const [provInfo,        setProvInfo]        = useState(settings['provider_info']        ?? 'launchbox')
  const [provDescription, setProvDescription] = useState(settings['provider_description'] ?? 'rawg')
  const [provScreenshots, setProvScreenshots] = useState(settings['provider_screenshots'] ?? 'launchbox')

  // S3 / MinIO
  const [s3Internal,   setS3Internal]   = useState(settings['s3_endpoint_interno'] ?? '')
  const [s3Public,     setS3Public]     = useState(settings['s3_endpoint_publico']  ?? '')
  const [s3AccessKey,  setS3AccessKey]  = useState(settings['s3_access_key']        ?? '')
  const [s3SecretKey,  setS3SecretKey]  = useState(settings['s3_secret_key']        ?? '')
  const [s3Bucket,     setS3Bucket]     = useState(settings['s3_bucket_name']       ?? '')
  const [s3Region,      setS3Region]      = useState(settings['s3_region']      ?? '')
  const [shopPassword,  setShopPassword]  = useState(settings['shop_password']  ?? '')
  const [appUrl,        setAppUrl]        = useState(settings['app_url']        ?? process.env.NEXT_PUBLIC_APP_URL ?? '')

  const [scope, setScope] = useState<ScopeId>('plataformas')
  const [sectionSaving, setSectionSaving] = useState<ScopeId | null>(null)
  const [sectionSaved, setSectionSaved] = useState<ScopeId | null>(null)
  const [sectionError, setSectionError] = useState<Partial<Record<ScopeId, string>>>({})

  // Lo que muestra cada ámbito de claves: sus campos de arriba.
  const live: Partial<Record<ScopeId, Record<string, string>>> = {
    claves:      { rawg_api_key: rawgKey, google_search_api_key: googleApiKey, steamgriddb_key: sgdbKey, youtube_api_key: youtubeKey },
    proveedores: { provider_cover: provCover, provider_info: provInfo, provider_description: provDescription, provider_screenshots: provScreenshots },
    s3:          { s3_endpoint_interno: s3Internal, s3_endpoint_publico: s3Public, s3_access_key: s3AccessKey, s3_secret_key: s3SecretKey, s3_bucket_name: s3Bucket, s3_region: s3Region },
    cola:        { max_concurrent_downloads: maxDownloads, download_limit_kib_per_s: downloadLimit },
    tienda:      { shop_password: shopPassword },
    app:         { app_url: appUrl },
  }

  // Línea base de las plataformas: cómo estaban al cargar o al último guardado.
  const [platformsBaseline, setPlatformsBaseline] = useState(() => platformsSnapshot(platforms, pathsMap, emulatorsMap))
  const [deleting, setDeleting] = useState<number | null>(null)
  const [addOpen,  setAddOpen]  = useState(false)
  const [adding,   setAdding]   = useState(false)

  // MinIO connection test
  type S3TestStep = { step: string; ok: boolean; detail?: string }
  type S3TestResult = { ok: boolean; config: Record<string, string>; steps: S3TestStep[] }
  const [s3Testing,    setS3Testing]    = useState(false)
  const [s3TestResult, setS3TestResult] = useState<S3TestResult | null>(null)
  const [s3TestError,  setS3TestError]  = useState<string | null>(null)

  const testS3 = async () => {
    setS3Testing(true)
    setS3TestResult(null)
    setS3TestError(null)
    try {
      const res  = await fetch('/api/admin/s3-test')
      const data = await res.json()
      if (!res.ok) setS3TestError(data.error ?? `HTTP ${res.status}`)
      else         setS3TestResult(data as S3TestResult)
    } catch (err) {
      setS3TestError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setS3Testing(false)
    }
  }

  // New platform draft
  const [newPlatform, setNewPlatform] = useState(emptyNewPlatform)
  const [newPaths,    setNewPaths]    = useState<string[]>([])

  // Folder picker: { platformId: -1 } means "new platform" form
  const [folderPicker, setFolderPicker] = useState<{ platformId: number; pathIndex: number } | null>(null)

  function updateField(id: number, field: string, value: string | number | boolean) {
    setPlatforms((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)))
  }

  // ── Slug rename (dedicated action: migrates MinIO covers + launchbox map) ──
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameBusy, setRenameBusy] = useState(false)

  const startRename = (id: number, current: string) => { setRenamingId(id); setRenameValue(current) }
  const cancelRename = () => { setRenamingId(null); setRenameValue('') }

  const commitRename = async (id: number) => {
    const next = renameValue.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '')
    const current = platforms.find((p) => p.id === id)?.slug
    if (!next || next === current) { cancelRename(); return }
    setRenameBusy(true)
    try {
      const res = await fetch('/api/platforms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, slug: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error ?? t('renameFailed'))
      } else {
        setPlatforms((prev) => prev.map((p) => (p.id === id ? { ...p, slug: next } : p)))
        cancelRename()
        router.refresh()
      }
    } catch {
      alert(t('renameFailed'))
    } finally {
      setRenameBusy(false)
    }
  }

  // Un ámbito se guarda por su cuenta: solo manda sus claves, o sus plataformas.
  const dirty = (id: ScopeId): boolean => {
    if (id === 'plataformas') return platformsSnapshot(platforms, pathsMap, emulatorsMap) !== platformsBaseline
    if (id === 'donaciones') return false
    return (SCOPE_KEYS[id] ?? []).some(([k, d]) => (live[id]?.[k] ?? '') !== (settings[k] ?? d))
  }

  const saveScope = async (id: ScopeId) => {
    setSectionSaving(id)
    setSectionError((e) => ({ ...e, [id]: undefined }))
    try {
      let failed: Response | null = null
      if (id === 'plataformas') {
        const responses = await Promise.all(
          platforms.map((p) =>
            fetch('/api/platforms', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id:              p.id,
                name:            p.name,
                scanPath:        joinPaths(getPaths(p.id)),
                extensions:      p.extensions,
                scanMode:        p.scanMode,
                thumbnailWidth:  p.thumbnailWidth ?? 200,
                thumbnailHeight: p.thumbnailHeight ?? 300,
                scanDlc:         p.scanDlc,
                // '' (la opción "heredar") se guarda como NULL, no como cadena
                // vacía: NULL es lo que significa "usa el ajuste global".
                providerCover:       p.providerCover       || null,
                providerInfo:        p.providerInfo        || null,
                providerDescription: p.providerDescription || null,
                providerScreenshots: p.providerScreenshots || null,
                emulators:       serializeEmulators(getEmu(p.id)),
                // Clear the deprecated single fields once migrated into `emulators`
                emulatorName:    null,
                emulatorUrl:     null,
              }),
            })
          )
        )
        failed = responses.find((r) => !r.ok) ?? null
      } else {
        const body = Object.fromEntries((SCOPE_KEYS[id] ?? []).map(([k]) => [k, live[id]?.[k] ?? '']))
        const res = await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        failed = res.ok ? null : res
      }

      // fetch() does NOT reject on HTTP 500: check the status and show the real error.
      if (failed) {
        let msg = t('saveError')
        try {
          const d = await failed.json()
          if (d?.error) msg = d.error
        } catch { /* non-JSON body: keep the generic message */ }
        setSectionError((e) => ({ ...e, [id]: msg }))
        return
      }

      if (id === 'plataformas') setPlatformsBaseline(platformsSnapshot(platforms, pathsMap, emulatorsMap))
      setSectionSaved(id)
      setTimeout(() => setSectionSaved(null), 2000)
      router.refresh()
    } catch (err) {
      console.error('Settings save failed:', err)
      setSectionError((e) => ({ ...e, [id]: t('saveError') }))
    } finally {
      setSectionSaving(null)
    }
  }

  const discardScope = (id: ScopeId) => {
    switch (id) {
      case 'plataformas':
        setPlatforms(initial)
        setPathsMap(Object.fromEntries(initial.map((p) => [p.id, splitPaths(p.scanPath)])))
        setEmulatorsMap(Object.fromEntries(initial.map((p) => [p.id, parseEmulators(p.emulators)])))
        break
      case 'claves':
        setRawgKey(settings['rawg_api_key'] ?? '')
        setGoogleApiKey(settings['google_search_api_key'] ?? '')
        setSgdbKey(settings['steamgriddb_key'] ?? '')
        setYoutubeKey(settings['youtube_api_key'] ?? '')
        break
      case 'proveedores':
        setProvCover(settings['provider_cover'] ?? 'launchbox')
        setProvInfo(settings['provider_info'] ?? 'launchbox')
        setProvDescription(settings['provider_description'] ?? 'rawg')
        setProvScreenshots(settings['provider_screenshots'] ?? 'launchbox')
        break
      case 's3':
        setS3Internal(settings['s3_endpoint_interno'] ?? '')
        setS3Public(settings['s3_endpoint_publico'] ?? '')
        setS3AccessKey(settings['s3_access_key'] ?? '')
        setS3SecretKey(settings['s3_secret_key'] ?? '')
        setS3Bucket(settings['s3_bucket_name'] ?? '')
        setS3Region(settings['s3_region'] ?? '')
        break
      case 'cola':
        setMaxDownloads(settings['max_concurrent_downloads'] ?? '1')
        setDownloadLimit(settings['download_limit_kib_per_s'] ?? '0')
        break
      case 'tienda':
        setShopPassword(settings['shop_password'] ?? '')
        break
      case 'app':
        setAppUrl(settings['app_url'] ?? process.env.NEXT_PUBLIC_APP_URL ?? '')
        break
    }
    setSectionError((e) => ({ ...e, [id]: undefined }))
  }

  const addPlatform = async () => {
    if (!newPlatform.slug || !newPlatform.name || !newPlatform.extensions) return
    setAdding(true)
    const res = await fetch('/api/platforms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...newPlatform,
        scanPath:  joinPaths(newPaths),
        sortOrder: platforms.length + 1,
      }),
    })
    if (res.ok) {
      const created = await res.json()
      setPlatforms((prev) => [...prev, created])
      setPathsMap((prev) => ({ ...prev, [created.id]: newPaths.filter(Boolean) }))
      setNewPlatform(emptyNewPlatform)
      setNewPaths([])
      setAddOpen(false)
      router.refresh()
    }
    setAdding(false)
  }

  const deletePlatform = async (id: number) => {
    const p = platforms.find((x) => x.id === id)
    const count = p?._count?.games ?? 0
    if (!confirm(t('deleteConfirm', { name: p?.name ?? '', count }))) return
    setDeleting(id)
    const res = await fetch('/api/platforms', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(err.error ?? t('deleteFailed'))
      setDeleting(null)
      return
    }
    setPlatforms((prev) => prev.filter((p) => p.id !== id))
    setPathsMap((prev) => { const next = { ...prev }; delete next[id]; return next })
    setDeleting(null)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">{t('title')}</h2>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Ámbitos de configuración" className="flex flex-col gap-5 lg:sticky lg:top-4 lg:self-start">
          {SCOPE_GROUPS.map((g) => (
            <div key={g.label} className="flex flex-col gap-0.5">
              <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">{g.label}</p>
              {g.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-current={scope === item.id ? 'true' : undefined}
                  onClick={() => setScope(item.id)}
                  className={`flex items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    scope === item.id ? 'bg-accent font-semibold text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  }`}
                >
                  <span>{item.label}</span>
                  {dirty(item.id) && <span aria-label="Cambios sin guardar" className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400" />}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="min-w-0 space-y-8">

      {scope === 'plataformas' && (
        <SectionFrame
          dirty={dirty('plataformas')}
          saving={sectionSaving === 'plataformas'}
          saved={sectionSaved === 'plataformas'}
          error={sectionError.plataformas}
          onSave={() => void saveScope('plataformas')}
          onDiscard={() => discardScope('plataformas')}
        >
      {/* Platform paths */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <h3 className="font-semibold">{t('platforms')}</h3>
          <button
            onClick={() => setAddOpen((o) => !o)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('addPlatform')}
            {addOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-5">{t('platformsDesc')}</p>

        <div className="space-y-5">
          {platforms.map((p) => (
            <div key={p.id} className="border border-border rounded-lg p-4 space-y-3">
              {/* Name + ScanMode + Delete */}
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  value={p.name}
                  onChange={(e) => updateField(p.id, 'name', e.target.value)}
                  placeholder="Display name"
                  className="flex-1 min-w-[120px] bg-secondary border border-border rounded-md px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <select
                  value={p.scanMode}
                  onChange={(e) => updateField(p.id, 'scanMode', e.target.value)}
                  className="bg-secondary border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {SCAN_MODES.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => deletePlatform(p.id)}
                  disabled={deleting === p.id}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-950/30 transition-colors disabled:opacity-40"
                  title={t('deletePlatform')}
                >
                  {deleting === p.id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Trash2 className="w-4 h-4" />}
                </button>
              </div>

              {/* Icon */}
              <PlatformIconUploader
                platformId={p.id}
                slug={p.slug}
                iconPath={p.iconPath}
                onChange={(iconPath) => { updateField(p.id, 'iconPath', iconPath ?? ''); router.refresh() }}
                label={t('iconUpload')}
                hint={t('iconHint')}
                removeLabel={t('iconRemove')}
              />

              {/* Paths */}
              <PathEditor
                paths={getPaths(p.id)}
                platformId={p.id}
                slug={p.slug}
                onChange={(paths) => setPaths(p.id, paths)}
                onBrowse={(platformId, pathIndex) => setFolderPicker({ platformId, pathIndex })}
                t={t}
              />

              {/* Extensions */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground font-medium flex-shrink-0">{t('extensions')}</span>
                <input
                  type="text"
                  value={p.extensions}
                  onChange={(e) => updateField(p.id, 'extensions', e.target.value)}
                  placeholder=".nsp,.nsz"
                  className="w-full bg-secondary border border-border rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Thumbnail size */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">{t('thumbWidth')}</label>
                  <input
                    type="number" min="50" max="500"
                    value={p.thumbnailWidth ?? 200}
                    onChange={(e) => updateField(p.id, 'thumbnailWidth', parseInt(e.target.value))}
                    className="w-full bg-secondary border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">{t('thumbHeight')}</label>
                  <input
                    type="number" min="50" max="800"
                    value={p.thumbnailHeight ?? 300}
                    onChange={(e) => updateField(p.id, 'thumbnailHeight', parseInt(e.target.value))}
                    className="w-full bg-secondary border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              {/* Emulator download links per OS (shown on the platform page; the
                  visitor's OS is auto-detected). */}
              <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground font-medium">{t('emulatorsLabel')}</span>
                {OS_ORDER.map((os) => (
                  <div key={os} className="flex items-center gap-2">
                    <span className="w-16 text-xs text-muted-foreground flex-shrink-0">{OS_LABEL[os]}</span>
                    <input
                      type="text"
                      value={getEmu(p.id)[os]?.name ?? ''}
                      onChange={(e) => setEmu(p.id, os, 'name', e.target.value)}
                      placeholder={t('emulatorNamePlaceholder')}
                      className="w-28 sm:w-32 flex-shrink-0 bg-secondary border border-border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <input
                      type="url"
                      value={getEmu(p.id)[os]?.url ?? ''}
                      onChange={(e) => setEmu(p.id, os, 'url', e.target.value)}
                      placeholder="https://…"
                      className="flex-1 min-w-0 bg-secondary border border-border rounded-md px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    {existingEmulators.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => {
                          const em = existingEmulators[Number(e.target.value)]
                          if (em) setEmuEntry(p.id, os, { name: em.name, url: em.url })
                        }}
                        title={t('emulatorReuse')}
                        className="flex-shrink-0 w-9 bg-secondary border border-border rounded-md px-1 py-1.5 text-sm text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                      >
                        <option value="">↺</option>
                        {existingEmulators.map((em, i) => (
                          <option key={i} value={i}>{em.name ?? em.url}</option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>

              {/* DLC / Update scan toggle */}
              <label className="flex items-center gap-2.5 cursor-pointer select-none w-fit">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={p.scanDlc}
                    onChange={(e) => updateField(p.id, 'scanDlc', e.target.checked)}
                  />
                  <div className={`w-9 h-5 rounded-full transition-colors ${p.scanDlc ? 'bg-primary' : 'bg-secondary border border-border'}`} />
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${p.scanDlc ? 'translate-x-4' : ''}`} />
                </div>
                <span className="text-xs text-muted-foreground">{t('scanDlcLabel')}</span>
              </label>

              {/* Proveedores de metadatos de ESTA plataforma. Vacío = hereda el global:
                  la fuente buena depende de la consola (libretro no tiene Switch,
                  LaunchBox flojea con lanzamientos solo japoneses). */}
              <details className="rounded-md border border-border bg-background/40">
                <summary className="cursor-pointer px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
                  {t('platformProviders')}
                  {(p.providerCover || p.providerInfo || p.providerDescription || p.providerScreenshots) && (
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                      {t('platformProvidersOverridden')}
                    </span>
                  )}
                </summary>
                <div className="px-3 pb-3 pt-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <PlatformProviderSelect
                    label={t('providerCover')} value={p.providerCover}
                    inheritLabel={t('inheritGlobal')}
                    onChange={(v) => updateField(p.id, 'providerCover', v)}
                    options={[
                      { value: 'libretro',    label: t('srcLibretro') },
                      { value: 'launchbox',   label: t('srcLaunchbox') },
                      { value: 'steamgriddb', label: t('srcSteamgriddb') },
                      { value: 'rawg',        label: t('srcRawg') },
                    ]}
                  />
                  <PlatformProviderSelect
                    label={t('providerInfo')} value={p.providerInfo}
                    inheritLabel={t('inheritGlobal')}
                    onChange={(v) => updateField(p.id, 'providerInfo', v)}
                    options={[
                      { value: 'launchbox', label: t('srcLaunchbox') },
                      { value: 'rawg',      label: t('srcRawg') },
                    ]}
                  />
                  <PlatformProviderSelect
                    label={t('providerDescription')} value={p.providerDescription}
                    inheritLabel={t('inheritGlobal')}
                    onChange={(v) => updateField(p.id, 'providerDescription', v)}
                    options={[
                      { value: 'launchbox', label: t('srcLaunchbox') },
                      { value: 'rawg',      label: t('srcRawg') },
                    ]}
                  />
                  <PlatformProviderSelect
                    label={t('providerScreenshots')} value={p.providerScreenshots}
                    inheritLabel={t('inheritGlobal')}
                    onChange={(v) => updateField(p.id, 'providerScreenshots', v)}
                    options={[
                      { value: 'launchbox', label: t('srcLaunchbox') },
                      { value: 'rawg',      label: t('srcRawg') },
                      { value: 'none',      label: t('srcNone') },
                    ]}
                  />
                </div>
              </details>

              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                {renamingId === p.id ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="text-muted-foreground/70">slug:</span>
                    <input
                      type="text"
                      value={renameValue}
                      autoFocus
                      disabled={renameBusy}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); commitRename(p.id) }
                        if (e.key === 'Escape') cancelRename()
                      }}
                      className="font-mono bg-secondary border border-border rounded px-1.5 py-0.5 text-xs w-44 focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button
                      type="button"
                      onClick={() => commitRename(p.id)}
                      disabled={renameBusy}
                      className="p-1 rounded text-green-500 hover:bg-green-950/30 disabled:opacity-40"
                      title={t('renameApply')}
                    >
                      {renameBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={cancelRename}
                      disabled={renameBusy}
                      className="p-1 rounded text-muted-foreground hover:bg-accent disabled:opacity-40"
                      title={t('renameCancel')}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => startRename(p.id, p.slug)}
                    className="inline-flex items-center gap-1 font-mono text-muted-foreground/70 hover:text-foreground transition-colors"
                    title={t('renameSlug')}
                  >
                    {p.slug}
                    <Pencil className="w-3 h-3 opacity-60" />
                  </button>
                )}
                <span>· {SCAN_MODES.find((m) => m.value === p.scanMode)?.desc}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Add platform form — identical layout to existing platform cards */}
        {addOpen && (
          <div className="mt-5 border border-dashed border-border rounded-lg p-4 space-y-3">
            <p className="text-sm font-medium text-muted-foreground">{t('newPlatform')}</p>

            {/* Name + Slug + ScanMode */}
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={newPlatform.name}
                onChange={(e) => setNewPlatform((p) => ({ ...p, name: e.target.value }))}
                placeholder={t('displayName')}
                className="flex-1 bg-secondary border border-border rounded-md px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="text"
                value={newPlatform.slug}
                onChange={(e) => setNewPlatform((p) => ({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                placeholder={t('slug')}
                className="w-32 bg-secondary border border-border rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <select
                value={newPlatform.scanMode}
                onChange={(e) => setNewPlatform((p) => ({ ...p, scanMode: e.target.value }))}
                className="bg-secondary border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {SCAN_MODES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            {/* Paths */}
            <PathEditor
              paths={newPaths}
              platformId={-1}
              slug={newPlatform.slug || 'platform'}
              onChange={setNewPaths}
              onBrowse={(platformId, pathIndex) => setFolderPicker({ platformId, pathIndex })}
              t={t}
            />

            {/* Extensions */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground font-medium flex-shrink-0">{t('extensions')}</span>
              <input
                type="text"
                value={newPlatform.extensions}
                onChange={(e) => setNewPlatform((p) => ({ ...p, extensions: e.target.value }))}
                placeholder=".iso,.bin"
                className="w-full bg-secondary border border-border rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Thumbnail size */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">{t('thumbWidth')}</label>
                <input
                  type="number" min="50" max="500"
                  value={newPlatform.thumbnailWidth}
                  onChange={(e) => setNewPlatform((p) => ({ ...p, thumbnailWidth: parseInt(e.target.value) }))}
                  className="w-full bg-secondary border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">{t('thumbHeight')}</label>
                <input
                  type="number" min="50" max="800"
                  value={newPlatform.thumbnailHeight}
                  onChange={(e) => setNewPlatform((p) => ({ ...p, thumbnailHeight: parseInt(e.target.value) }))}
                  className="w-full bg-secondary border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            {/* DLC / Update scan toggle */}
            <label className="flex items-center gap-2.5 cursor-pointer select-none w-fit">
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={newPlatform.scanDlc}
                  onChange={(e) => setNewPlatform((p) => ({ ...p, scanDlc: e.target.checked }))}
                />
                <div className={`w-9 h-5 rounded-full transition-colors ${newPlatform.scanDlc ? 'bg-primary' : 'bg-secondary border border-border'}`} />
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${newPlatform.scanDlc ? 'translate-x-4' : ''}`} />
              </div>
              <span className="text-xs text-muted-foreground">{t('scanDlcLabel')}</span>
            </label>

            <button
              onClick={addPlatform}
              disabled={adding || !newPlatform.slug || !newPlatform.name || !newPlatform.extensions}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {adding ? t('addingPlatform') : t('addPlatform')}
            </button>
          </div>
        )}
      </div>
        </SectionFrame>
      )}

      {scope === 'claves' && (
        <SectionFrame
          dirty={dirty('claves')}
          saving={sectionSaving === 'claves'}
          saved={sectionSaved === 'claves'}
          error={sectionError.claves}
          onSave={() => void saveScope('claves')}
          onDiscard={() => discardScope('claves')}
        >
      {/* API Keys */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-6">
        <h3 className="font-semibold">{t('apiKeys')}</h3>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            {t('rawgKeyLabel')}
            <a href="https://rawg.io/apidocs" target="_blank" rel="noopener noreferrer" className="ml-2 text-xs text-primary hover:underline">
              Get free key →
            </a>
          </label>
          <input
            type="password"
            value={rawgKey}
            onChange={(e) => setRawgKey(e.target.value)}
            placeholder={t('rawgKeyPlaceholder')}
            className="w-full max-w-md bg-secondary border border-border rounded-md px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground mt-1.5">{t('rawgKeyDesc')}</p>
        </div>

        <div className="border-t border-border pt-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium">{t('sgdbLabel')}</p>
            <a href="https://www.steamgriddb.com/profile/preferences/api" target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
              Get free key →
            </a>
          </div>
          <p className="text-xs text-muted-foreground mb-3">{t('sgdbDesc')}</p>
          <input
            type="password"
            value={sgdbKey}
            onChange={(e) => setSgdbKey(e.target.value)}
            placeholder={t('sgdbKeyPlaceholder')}
            className="w-full max-w-md bg-secondary border border-border rounded-md px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
          />
        </div>

        <div className="border-t border-border pt-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium">{t('youtubeLabel')}</p>
            <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
              Enable API →
            </a>
          </div>
          <p className="text-xs text-muted-foreground mb-3">{t('youtubeDesc')}</p>
          <input
            type="password"
            value={youtubeKey}
            onChange={(e) => setYoutubeKey(e.target.value)}
            placeholder={t('youtubeKeyPlaceholder')}
            className="w-full max-w-md bg-secondary border border-border rounded-md px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
          />
        </div>
      </div>
        </SectionFrame>
      )}

      {scope === 'proveedores' && (
        <SectionFrame
          dirty={dirty('proveedores')}
          saving={sectionSaving === 'proveedores'}
          saved={sectionSaved === 'proveedores'}
          error={sectionError.proveedores}
          onSave={() => void saveScope('proveedores')}
          onDiscard={() => discardScope('proveedores')}
        >
      {/* Metadata provider matrix */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-5">
        <div>
          <h3 className="font-semibold">{t('providersTitle')}</h3>
          <p className="text-xs text-muted-foreground mt-1">{t('providersDesc')}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <ProviderSelect
            label={t('providerCover')}
            value={provCover}
            onChange={setProvCover}
            options={[
              { value: 'libretro',    label: t('srcLibretro') },
              { value: 'launchbox',   label: t('srcLaunchbox') },
              { value: 'steamgriddb', label: t('srcSteamgriddb') },
              { value: 'rawg',        label: t('srcRawg') },
            ]}
          />
          <ProviderSelect
            label={t('providerInfo')}
            value={provInfo}
            onChange={setProvInfo}
            options={[
              { value: 'launchbox', label: t('srcLaunchbox') },
              { value: 'rawg',      label: t('srcRawg') },
            ]}
          />
          <ProviderSelect
            label={t('providerDescription')}
            value={provDescription}
            onChange={setProvDescription}
            options={[
              { value: 'rawg',      label: t('srcRawg') },
              { value: 'launchbox', label: t('srcLaunchbox') },
            ]}
          />
          <ProviderSelect
            label={t('providerScreenshots')}
            value={provScreenshots}
            onChange={setProvScreenshots}
            options={[
              { value: 'launchbox', label: t('srcLaunchbox') },
              { value: 'rawg',      label: t('srcRawg') },
              { value: 'none',      label: t('srcNone') },
            ]}
          />
        </div>
      </div>
        </SectionFrame>
      )}

      {scope === 's3' && (
        <SectionFrame
          dirty={dirty('s3')}
          saving={sectionSaving === 's3'}
          saved={sectionSaved === 's3'}
          error={sectionError.s3}
          onSave={() => void saveScope('s3')}
          onDiscard={() => discardScope('s3')}
        >
      {/* S3 / MinIO Storage */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-5">
        <div>
          <h3 className="font-semibold">{t('s3Title')}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">{t('s3Desc')}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('s3Internal')}</label>
            <input
              type="text"
              value={s3Internal}
              onChange={e => setS3Internal(e.target.value)}
              placeholder="http://minio:9000"
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">{t('s3InternalHint')}</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">{t('s3Public')}</label>
            <input
              type="text"
              value={s3Public}
              onChange={e => setS3Public(e.target.value)}
              placeholder="https://s3.yourdomain.com"
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">{t('s3PublicHint')}</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">{t('s3Bucket')}</label>
            <input
              type="text"
              value={s3Bucket}
              onChange={e => setS3Bucket(e.target.value)}
              placeholder="gamehub"
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div />

          <div>
            <label className="block text-sm font-medium mb-1.5">{t('s3AccessKey')}</label>
            <input
              type="text"
              value={s3AccessKey}
              onChange={e => setS3AccessKey(e.target.value)}
              placeholder="access-key-id"
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">{t('s3SecretKey')}</label>
            <input
              type="password"
              value={s3SecretKey}
              onChange={e => setS3SecretKey(e.target.value)}
              placeholder="secret-key"
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">{t('s3Region')}</label>
            <input
              type="text"
              value={s3Region}
              onChange={e => setS3Region(e.target.value)}
              placeholder="us-east-1"
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">{t('s3RegionHint')}</p>
          </div>
        </div>

        {s3Public && s3Bucket && (
          <p className="text-xs text-muted-foreground font-mono bg-secondary/50 rounded px-3 py-2">
            {t('s3Preview')}{' '}
            <span className="text-foreground">
              {s3Public.replace(/\/$/, '')}/{s3Bucket}/covers/&lt;platform&gt;/&lt;id&gt;.webp
            </span>
          </p>
        )}

        {/* ── MinIO connection test ──────────────────────────────────────── */}
        <div className="border-t border-border pt-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={testS3}
              disabled={s3Testing}
              className="flex items-center gap-2 px-4 py-2 bg-secondary border border-border rounded-md text-sm hover:bg-accent transition-colors disabled:opacity-50"
            >
              {s3Testing
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Wifi className="w-4 h-4" />}
              {s3Testing ? 'Comprobando…' : 'Comprobar conexión MinIO'}
            </button>

            {s3TestResult && !s3Testing && (
              <span className={`flex items-center gap-1.5 text-sm font-medium ${s3TestResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                {s3TestResult.ok
                  ? <CheckCircle2 className="w-4 h-4" />
                  : <XCircle className="w-4 h-4" />}
                {s3TestResult.ok ? 'Conexión OK' : 'Error de conexión'}
              </span>
            )}
            {s3TestError && !s3Testing && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-red-400">
                <XCircle className="w-4 h-4" /> {s3TestError}
              </span>
            )}
          </div>

          {/* Detailed results */}
          {s3TestResult && (
            <div className="mt-3 rounded-lg border border-border bg-secondary/40 p-3 space-y-1.5 text-xs font-mono">
              {/* Config summary */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-muted-foreground mb-2">
                <span>endpoint interno: <span className="text-foreground">{s3TestResult.config.internalEndpoint}</span></span>
                <span>bucket: <span className="text-foreground">{s3TestResult.config.bucketName}</span></span>
                <span>access key: <span className="text-foreground">{s3TestResult.config.accessKey}</span></span>
                <span>region: <span className="text-foreground">{s3TestResult.config.region}</span></span>
              </div>
              <div className="border-t border-border/50 pt-2 space-y-1">
                {s3TestResult.steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-2">
                    {step.ok
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 mt-0.5 shrink-0" />
                      : <XCircle     className="w-3.5 h-3.5 text-red-400   mt-0.5 shrink-0" />}
                    <span className={step.ok ? 'text-foreground' : 'text-red-300'}>
                      {step.step}
                      {step.detail && <span className="ml-2 text-muted-foreground">({step.detail})</span>}
                    </span>
                  </div>
                ))}
              </div>
              {!s3TestResult.ok && (
                <div className="border-t border-border/50 pt-2 flex items-start gap-1.5 text-amber-400">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    Asegúrate de que el endpoint interno sea accesible desde el contenedor Docker
                    (p.ej. <span className="text-foreground">http://192.168.1.x:9000</span> en lugar de <span className="text-foreground">http://minio:9000</span>
                    si MinIO está en una red Docker diferente).
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
        </SectionFrame>
      )}

      {scope === 'cola' && (
        <SectionFrame
          dirty={dirty('cola')}
          saving={sectionSaving === 'cola'}
          saved={sectionSaved === 'cola'}
          error={sectionError.cola}
          onSave={() => void saveScope('cola')}
          onDiscard={() => discardScope('cola')}
        >
      {/* Download Queue */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="font-semibold mb-1">{t('downloadQueue')}</h3>
        <p className="text-sm text-muted-foreground mb-5">{t('downloadQueueDesc')}</p>
        <div>
          <label className="block text-sm font-medium mb-1.5">{t('maxDownloads')}</label>
          <input
            type="number" min="1" max="20"
            value={maxDownloads}
            onChange={(e) => setMaxDownloads(e.target.value)}
            className="w-24 bg-secondary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground mt-1.5">{t('maxDownloadsHint')}</p>
        </div>
        <div className="mt-5">
          <label className="block text-sm font-medium mb-1.5">{t('downloadSpeedLimit')}</label>
          <input
            type="number" min="0" step="1"
            value={downloadLimit}
            onChange={(e) => setDownloadLimit(e.target.value)}
            className="w-24 bg-secondary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground mt-1.5">{t('downloadSpeedLimitHint')}</p>
        </div>
      </div>
        </SectionFrame>
      )}

      {scope === 'tienda' && (
        <SectionFrame
          dirty={dirty('tienda')}
          saving={sectionSaving === 'tienda'}
          saved={sectionSaved === 'tienda'}
          error={sectionError.tienda}
          onSave={() => void saveScope('tienda')}
          onDiscard={() => discardScope('tienda')}
        >
      {/* Tienda — la consume GameHubNX */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div>
          <h3 className="font-semibold">{t('shopTitle')}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">{t('shopDesc')}</p>
        </div>
        {/* La contrasena SE QUEDA aunque Tinfoil y CyberFoil ya no se
            documenten: es lo unico que protege la biblioteca. Quitar el campo
            no habria dado de baja nada, habria dejado el ajuste congelado en lo
            que hubiera y sin forma de cambiarlo. */}
        <div>
          <label className="block text-sm font-medium mb-1.5">{t('shopPassword')}</label>
          <input
            type="password"
            value={shopPassword}
            onChange={(e) => setShopPassword(e.target.value)}
            placeholder={t('shopPasswordPlaceholder')}
            className="w-full max-w-sm bg-secondary border border-border rounded-md px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground mt-1">{t('shopPasswordHint')}</p>
        </div>
        <div className="text-xs font-mono bg-secondary/60 rounded-lg px-4 py-3 space-y-1.5 text-muted-foreground">
          <p className="font-medium text-foreground text-sm mb-2">{t('shopSetup')}</p>
          <p className="pt-1 text-foreground"><ShopUrl /></p>
        </div>
        <HomebrewRepos />
      </div>
        </SectionFrame>
      )}
      {scope === 'donaciones' && <DonationSettingsForm initial={donation} />}
      {scope === 'app' && (
        <SectionFrame
          dirty={dirty('app')}
          saving={sectionSaving === 'app'}
          saved={sectionSaved === 'app'}
          error={sectionError.app}
          onSave={() => void saveScope('app')}
          onDiscard={() => discardScope('app')}
        >
        <div className="bg-card border border-border rounded-xl p-6">
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium">{t('appUrlLabel')}</p>
          </div>
          <p className="text-xs text-muted-foreground mb-3">{t('appUrlDesc')}</p>
          <input
            type="text"
            value={appUrl}
            onChange={(e) => setAppUrl(e.target.value)}
            placeholder="https://gamehub.example.com"
            className="w-full max-w-md bg-secondary border border-border rounded-md px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        </div>
        </SectionFrame>
      )}

      {/* Folder picker modal */}
      {folderPicker && (
        <FolderPickerModal
          onSelect={(selected) => {
            if (folderPicker.platformId === -1) {
              const next = [...newPaths]
              next[folderPicker.pathIndex] = selected
              setNewPaths(next)
            } else {
              const next = [...getPaths(folderPicker.platformId)]
              next[folderPicker.pathIndex] = selected
              setPaths(folderPicker.platformId, next)
            }
            setFolderPicker(null)
          }}
          onClose={() => setFolderPicker(null)}
        />
      )}
        </div>
      </div>
    </div>
  )
}
