'use client'

import { useState } from 'react'
import { Save, Eye, EyeOff, Globe, KeyRound, Tag, Loader2, PlugZap, ShieldOff } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  initial: {
    shortener_url:        string
    shortener_key:        string
    shortener_param:      string
    shortener_bypass_ips: string
  }
}

// Fires a toast via the global set by <Toaster /> in layout
function toast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  const w = window as unknown as { __toast?: (m: string, t?: string) => void }
  w.__toast?.(message, type)
}

export function RoutingProviderForm({ initial }: Props) {
  const [url,        setUrl]        = useState(initial.shortener_url)
  const [key,        setKey]        = useState(initial.shortener_key)
  const [param,      setParam]      = useState(initial.shortener_param)
  const [bypassIps,  setBypassIps]  = useState(initial.shortener_bypass_ips)
  const [showKey,    setShowKey]    = useState(false)
  const [saving,     setSaving]     = useState(false)

  // ── Save ────────────────────────────────────────────────────────────────────

  const save = async () => {
    if (!url.trim()) {
      toast('Verification Server URL is required.', 'error')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          shortener_url:        url.trim(),
          shortener_key:        key.trim(),
          shortener_param:      param.trim(),
          shortener_bypass_ips: bypassIps.trim(),
        }),
      })
      if (!res.ok) throw new Error('Server error')
      toast('Routing provider settings saved.', 'success')
    } catch {
      toast('Failed to save settings. Check server logs.', 'error')
    } finally {
      setSaving(false)
    }
  }

  // ── Preview URL ─────────────────────────────────────────────────────────────

  const exampleTarget = 'https://yourdomain.com/api/download/execute?id=42&token=abc123'
  const previewUrl = url
    ? (() => {
        try {
          const u = new URL(url)
          if (key.trim())   u.searchParams.set(key.trim()   || 'api_key', '••••••••')
          if (param.trim()) u.searchParams.set(param.trim() || 'url',     encodeURIComponent(exampleTarget))
          return u.toString()
        } catch {
          return null
        }
      })()
    : null

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <PlugZap className="w-4 h-4 text-primary" />
            Routing Provider
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            External gateway used to route download requests. The backend will call this URL before
            redirecting users to their download.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Save className="w-4 h-4" />
          }
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Fields */}
      <div className="space-y-5">

        {/* shortener_url */}
        <Field
          icon={<Globe className="w-4 h-4" />}
          label="Verification Server URL"
          hint="The full base URL of the external API endpoint."
          htmlFor="s-url"
        >
          <input
            id="s-url"
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://api.example.com/v1/route"
            className={inputCls}
          />
        </Field>

        {/* shortener_key */}
        <Field
          icon={<KeyRound className="w-4 h-4" />}
          label="Authentication Key / API Key"
          hint="Query string parameter name that carries your API key (e.g. auth_key, apikey, key)."
          htmlFor="s-key"
        >
          <div className="relative">
            <input
              id="s-key"
              type={showKey ? 'text' : 'password'}
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder="auth_key"
              className={cn(inputCls, 'pr-10 font-mono')}
            />
            <button
              type="button"
              onClick={() => setShowKey(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showKey ? 'Hide key' : 'Show key'}
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </Field>

        {/* shortener_param */}
        <Field
          icon={<Tag className="w-4 h-4" />}
          label="Destination Parameter"
          hint="Query string parameter name where the target URL is passed (e.g. url, dest, s, link)."
          htmlFor="s-param"
        >
          <input
            id="s-param"
            type="text"
            value={param}
            onChange={e => setParam(e.target.value)}
            placeholder="url"
            className={cn(inputCls, 'max-w-xs font-mono')}
          />
        </Field>
        {/* shortener_bypass_ips */}
        <Field
          icon={<ShieldOff className="w-4 h-4" />}
          label="Bypass IPs (skip shortener)"
          hint="Comma-separated IP prefixes that skip the shortener and download directly. RFC-1918 private ranges (192.168.x.x, 10.x.x.x, 172.16-31.x.x) are always bypassed automatically."
          htmlFor="s-bypass"
        >
          <input
            id="s-bypass"
            type="text"
            value={bypassIps}
            onChange={e => setBypassIps(e.target.value)}
            placeholder="203.0.113.10, 198.51.100."
            className={cn(inputCls, 'font-mono')}
          />
        </Field>

      </div>

      {/* Live preview */}
      {previewUrl ? (
        <div className="rounded-lg border border-border bg-black/30 p-4 space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Resulting request preview
          </p>
          <p className="text-xs font-mono text-green-400 break-all leading-relaxed">
            GET {previewUrl}
          </p>
        </div>
      ) : url && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <p className="text-xs text-destructive">
            Invalid URL format — make sure to include the protocol (https://).
          </p>
        </div>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const inputCls =
  'w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm ' +
  'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ' +
  'transition-colors'

function Field({
  icon,
  label,
  hint,
  htmlFor,
  children,
}: {
  icon:     React.ReactNode
  label:    string
  hint:     string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="flex items-center gap-2 text-sm font-medium"
      >
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </label>
      {children}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}
