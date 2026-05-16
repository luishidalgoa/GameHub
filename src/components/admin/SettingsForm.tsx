'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Save, Loader2, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'

interface Platform {
  id: number
  slug: string
  name: string
  scanPath: string
  extensions: string
  scanMode: string
  enabled: boolean
  sortOrder: number
}

interface Props {
  platforms: Platform[]
  settings: Record<string, string>
}

const SCAN_MODES = [
  { value: 'flat',   label: 'Flat',   desc: 'Each file = one game (3DS, PSP, NDS…)' },
  { value: 'folder', label: 'Folder', desc: 'Each folder = one game + DLCs (Switch)' },
  { value: 'ports',  label: 'Ports',  desc: 'Root files + folders, no deep walk (Vita Ports)' },
]

const emptyPlatform = { slug: '', name: '', scanPath: '', extensions: '', scanMode: 'flat' }

export function SettingsForm({ platforms: initial, settings }: Props) {
  const router = useRouter()
  const [platforms, setPlatforms] = useState<Platform[]>(initial)
  const [rawgKey, setRawgKey] = useState(settings['rawg_api_key'] ?? '')
  const [maxDownloads, setMaxDownloads] = useState(settings['max_concurrent_downloads'] ?? '1')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [newPlatform, setNewPlatform] = useState(emptyPlatform)
  const [adding, setAdding] = useState(false)

  function update(id: number, field: string, value: string) {
    setPlatforms((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)))
  }

  const save = async () => {
    setSaving(true)

    await Promise.all([
      // Update each platform row
      ...platforms.map((p) =>
        fetch('/api/platforms', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id:         p.id,
            name:       p.name,
            scanPath:   p.scanPath,
            extensions: p.extensions,
            scanMode:   p.scanMode,
          }),
        })
      ),
      // Save general settings
      fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawg_api_key: rawgKey, max_concurrent_downloads: maxDownloads }),
      }),
    ])

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }

  const addPlatform = async () => {
    if (!newPlatform.slug || !newPlatform.name || !newPlatform.scanPath || !newPlatform.extensions) return
    setAdding(true)
    const res = await fetch('/api/platforms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newPlatform, sortOrder: platforms.length + 1 }),
    })
    if (res.ok) {
      const created = await res.json()
      setPlatforms((prev) => [...prev, created])
      setNewPlatform(emptyPlatform)
      setAddOpen(false)
      router.refresh()
    }
    setAdding(false)
  }

  const deletePlatform = async (id: number) => {
    setDeleting(id)
    await fetch('/api/platforms', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setPlatforms((prev) => prev.filter((p) => p.id !== id))
    setDeleting(null)
    router.refresh()
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Settings</h2>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saved ? 'Saved!' : saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Platform paths */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold">Platforms</h3>
          <button
            onClick={() => setAddOpen((o) => !o)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add platform
            {addOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          Configure scan paths, extensions and scan mode for each platform.
        </p>

        {/* Existing platforms */}
        <div className="space-y-5">
          {platforms.map((p) => (
            <div key={p.id} className="border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                {/* Name */}
                <input
                  type="text"
                  value={p.name}
                  onChange={(e) => update(p.id, 'name', e.target.value)}
                  placeholder="Display name"
                  className="flex-1 bg-secondary border border-border rounded-md px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {/* Scan mode */}
                <select
                  value={p.scanMode}
                  onChange={(e) => update(p.id, 'scanMode', e.target.value)}
                  className="bg-secondary border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {SCAN_MODES.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                {/* Delete */}
                <button
                  onClick={() => deletePlatform(p.id)}
                  disabled={deleting === p.id}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-950/30 transition-colors disabled:opacity-40"
                  title="Delete platform"
                >
                  {deleting === p.id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Trash2 className="w-4 h-4" />}
                </button>
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-3 items-center">
                {/* Scan path */}
                <input
                  type="text"
                  value={p.scanPath}
                  onChange={(e) => update(p.id, 'scanPath', e.target.value)}
                  placeholder="Scan path (e.g. F:\Switch\Games)"
                  className="w-full bg-secondary border border-border rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {/* Extensions */}
                <input
                  type="text"
                  value={p.extensions}
                  onChange={(e) => update(p.id, 'extensions', e.target.value)}
                  placeholder=".nsp,.nsz"
                  className="w-40 bg-secondary border border-border rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                <span className="font-mono text-muted-foreground/70">{p.slug}</span>
                {' · '}
                {SCAN_MODES.find((m) => m.value === p.scanMode)?.desc}
              </p>
            </div>
          ))}
        </div>

        {/* Add platform form */}
        {addOpen && (
          <div className="mt-5 border border-dashed border-border rounded-lg p-4 space-y-3">
            <p className="text-sm font-medium text-muted-foreground">New platform</p>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={newPlatform.name}
                onChange={(e) => setNewPlatform((p) => ({ ...p, name: e.target.value }))}
                placeholder="Display name (e.g. PlayStation 2)"
                className="bg-secondary border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="text"
                value={newPlatform.slug}
                onChange={(e) => setNewPlatform((p) => ({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                placeholder="slug (e.g. ps2)"
                className="bg-secondary border border-border rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-center">
              <input
                type="text"
                value={newPlatform.scanPath}
                onChange={(e) => setNewPlatform((p) => ({ ...p, scanPath: e.target.value }))}
                placeholder="Scan path (e.g. F:\PS2\Games)"
                className="bg-secondary border border-border rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="text"
                value={newPlatform.extensions}
                onChange={(e) => setNewPlatform((p) => ({ ...p, extensions: e.target.value }))}
                placeholder=".iso,.bin"
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
            <button
              onClick={addPlatform}
              disabled={adding || !newPlatform.slug || !newPlatform.name || !newPlatform.scanPath || !newPlatform.extensions}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {adding ? 'Adding…' : 'Add platform'}
            </button>
          </div>
        )}
      </div>

      {/* API Keys */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="font-semibold mb-4">API Keys</h3>
        <div>
          <label className="block text-sm font-medium mb-1.5">
            RAWG API Key
            <a
              href="https://rawg.io/apidocs"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 text-xs text-primary hover:underline"
            >
              Get free key →
            </a>
          </label>
          <input
            type="password"
            value={rawgKey}
            onChange={(e) => setRawgKey(e.target.value)}
            placeholder="Enter your RAWG API key…"
            className="w-full max-w-md bg-secondary border border-border rounded-md px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            Used for auto-fetching game metadata, covers and descriptions.
          </p>
        </div>
      </div>

      {/* Download Queue */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="font-semibold mb-1">Download Queue</h3>
        <p className="text-sm text-muted-foreground mb-5">
          Maximum simultaneous downloads allowed at the same time. Users beyond this limit are placed in a queue.
        </p>
        <div>
          <label className="block text-sm font-medium mb-1.5">Max concurrent downloads</label>
          <input
            type="number"
            min="1"
            max="20"
            value={maxDownloads}
            onChange={(e) => setMaxDownloads(e.target.value)}
            className="w-24 bg-secondary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            Recommended: 1–3 for a home server.
          </p>
        </div>

        <details className="mt-5">
          <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground select-none">
            nginx rate limiting config ↓
          </summary>
          <pre className="mt-3 bg-black/40 rounded-lg p-4 text-xs text-green-400 font-mono overflow-x-auto whitespace-pre">{`# In your nginx server block:
location /api/download/ {
    proxy_pass http://localhost:3000;
    limit_rate 5m;
    limit_conn_zone $binary_remote_addr zone=downloads:10m;
    limit_conn downloads 2;
    proxy_buffering off;
    proxy_read_timeout 3600s;
}`}</pre>
        </details>
      </div>
    </div>
  )
}
