'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  AlertTriangle, Check, FileEdit, Loader2, Pencil, RotateCcw, X,
} from 'lucide-react'
import type { RenameProposal } from '@/lib/curation'

interface Row extends RenameProposal {
  /** What will actually be written — starts as the proposal, editable. */
  value: string
  accepted: boolean
}

interface ApplyResult {
  plan: string
  accepted: number
  rejected: Array<{ id: number; reason: string }>
  pendingPlans: number
}

export function CurationClient() {
  const t = useTranslations('AdminCuration')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<ApplyResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/curation')
      .then(r => r.json())
      .then((d: { proposals: RenameProposal[] }) => {
        setRows(
          d.proposals.map(p => ({
            ...p,
            value: p.proposedName,
            // Risky ones arrive rejected: accepting them has to be a decision,
            // not the default that a tired reviewer clicks through.
            accepted: p.risk === null,
          })),
        )
      })
      .catch(() => setError(t('loadError')))
      .finally(() => setLoading(false))
  }, [t])

  const byPlatform = useMemo(() => {
    const m = new Map<string, Row[]>()
    for (const r of rows ?? []) {
      const list = m.get(r.platform) ?? []
      list.push(r)
      m.set(r.platform, list)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [rows])

  const acceptedCount = (rows ?? []).filter(r => r.accepted).length
  const riskyCount = (rows ?? []).filter(r => r.risk !== null).length

  const update = (id: number, patch: Partial<Row>) =>
    setRows(rs => (rs ?? []).map(r => (r.id === id ? { ...r, ...patch } : r)))

  const setPlatform = (platform: string, accepted: boolean) =>
    setRows(rs => (rs ?? []).map(r => (r.platform === platform ? { ...r, accepted } : r)))

  const apply = async () => {
    const items = (rows ?? [])
      .filter(r => r.accepted)
      .map(r => ({ id: r.id, proposedName: r.value }))
    if (items.length === 0) return
    if (!confirm(t('confirmApply', { count: items.length }))) return

    setSaving(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch('/api/admin/curation/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error ?? t('applyError'))
      else {
        setResult(data as ApplyResult)
        setRows(rs => (rs ?? []).filter(r => !r.accepted))
      }
    } catch {
      setError(t('applyError'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t('loading')}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {result && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-sm">
          <p className="font-medium text-emerald-400">
            {t('planWritten', { count: result.accepted, plan: result.plan })}
          </p>
          <p className="text-muted-foreground mt-1">{t('planNextStep')}</p>
          {result.rejected.length > 0 && (
            <p className="text-amber-400 mt-2">
              {t('planRejected', { count: result.rejected.length })}
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      {rows && rows.length === 0 && !result && (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <Check className="w-8 h-8 mx-auto text-emerald-400 mb-3" />
          <p className="font-medium">{t('allCurated')}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('allCuratedHint')}</p>
        </div>
      )}

      {rows && rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 sticky top-0 z-10 bg-background/95 backdrop-blur py-3 border-b border-border">
            <div className="text-sm text-muted-foreground">
              {t('summary', { accepted: acceptedCount, total: rows.length })}
              {riskyCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {t('riskySummary', { count: riskyCount })}
                </span>
              )}
            </div>
            <button
              onClick={apply}
              disabled={saving || acceptedCount === 0}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 rounded-md text-sm font-medium transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileEdit className="w-4 h-4" />}
              {t('apply', { count: acceptedCount })}
            </button>
          </div>

          {byPlatform.map(([platform, list]) => (
            <div key={platform} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
                <h3 className="font-semibold text-sm">
                  {platform}
                  <span className="ml-2 text-muted-foreground font-normal">
                    {t('nFiles', { count: list.length })}
                  </span>
                </h3>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    onClick={() => setPlatform(platform, true)}
                    className="px-2 py-1 rounded border border-border hover:bg-accent transition-colors"
                  >
                    {t('selectAll')}
                  </button>
                  <button
                    onClick={() => setPlatform(platform, false)}
                    className="px-2 py-1 rounded border border-border hover:bg-accent transition-colors"
                  >
                    {t('selectNone')}
                  </button>
                </div>
              </div>

              <ul className="divide-y divide-border">
                {list.map(row => (
                  <RowView
                    key={row.id}
                    row={row}
                    editing={editing === row.id}
                    onEdit={() => setEditing(row.id)}
                    onStopEdit={() => setEditing(null)}
                    onChange={v => update(row.id, { value: v })}
                    onToggle={() => update(row.id, { accepted: !row.accepted })}
                    onReset={() => update(row.id, { value: row.proposedName })}
                  />
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function RowView({
  row, editing, onEdit, onStopEdit, onChange, onToggle, onReset,
}: {
  row: Row
  editing: boolean
  onEdit: () => void
  onStopEdit: () => void
  onChange: (v: string) => void
  onToggle: () => void
  onReset: () => void
}) {
  const t = useTranslations('AdminCuration')
  const edited = row.value !== row.proposedName

  return (
    <li className={`px-4 py-3 ${row.accepted ? '' : 'opacity-50'}`}>
      <div className="flex items-start gap-3">
        <button
          onClick={onToggle}
          aria-label={row.accepted ? t('reject') : t('accept')}
          className={`mt-0.5 w-5 h-5 shrink-0 rounded border flex items-center justify-center transition-colors ${
            row.accepted
              ? 'bg-primary border-primary text-primary-foreground'
              : 'border-border hover:border-muted-foreground'
          }`}
        >
          {row.accepted ? <Check className="w-3.5 h-3.5" /> : <X className="w-3 h-3 opacity-40" />}
        </button>

        <div className="min-w-0 flex-1 font-mono text-xs leading-relaxed">
          <div className="text-muted-foreground break-all">{row.currentName}</div>

          {editing ? (
            <div className="flex items-center gap-2 mt-1">
              <input
                autoFocus
                value={row.value}
                onChange={e => onChange(e.target.value)}
                onBlur={onStopEdit}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === 'Escape') onStopEdit()
                }}
                className="flex-1 bg-secondary border border-border rounded px-2 py-1 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          ) : (
            <div className="flex items-start gap-2 mt-1">
              <span className="text-foreground break-all">
                <span className="text-muted-foreground">→ </span>
                {edited ? (
                  row.value
                ) : (
                  <>
                    {row.proposedName.slice(0, row.insertAt)}
                    <mark className="bg-emerald-500/20 text-emerald-300 rounded px-0.5">
                      {row.insertedText}
                    </mark>
                    {row.proposedName.slice(row.insertAt + row.insertedText.length)}
                  </>
                )}
              </span>
              <button
                onClick={onEdit}
                title={t('edit')}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              {edited && (
                <button
                  onClick={onReset}
                  title={t('resetEdit')}
                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {row.risk && (
            <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-amber-400 font-sans">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              {t(row.risk === 'shared-card' ? 'riskSharedCard' : 'riskNoSource')}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}
