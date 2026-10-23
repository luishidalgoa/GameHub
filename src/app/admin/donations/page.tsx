'use client'

import useSWR, { mutate } from 'swr'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import {
  Heart, Plus, Trash2, Loader2, Coffee, Bitcoin, TrendingUp, Calendar,
  Webhook, Copy, Check, X, Target,
} from 'lucide-react'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// PayPal se da de baja: sus donaciones antiguas siguen con su etiqueta, pero ya no se puede añadir ninguna.
const PLATFORM_LABELS: Record<string, string> = {
  kofi:   'Ko-fi',
  paypal: 'PayPal',
  bmac:   'Buy Me a Coffee',
  crypto: 'Crypto',
  manual: 'Manual',
}
const ADDABLE_PLATFORMS = Object.entries(PLATFORM_LABELS).filter(([v]) => v !== 'paypal')

const PLATFORM_COLORS: Record<string, string> = {
  kofi:   '#06b6d4',
  paypal: '#3b82f6',
  bmac:   '#f59e0b',
  crypto: '#f97316',
  manual: '#8b5cf6',
}

const PLATFORM_ICON: Record<string, React.ReactNode> = {
  kofi:   <Coffee className="w-3.5 h-3.5" />,
  paypal: <span className="text-xs font-bold">PP</span>,
  bmac:   <Coffee className="w-3.5 h-3.5" />,
  crypto: <Bitcoin className="w-3.5 h-3.5" />,
  manual: <Heart className="w-3.5 h-3.5" />,
}

const euros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })

interface DonationRow {
  id: number
  platform: string
  amount: number
  currency: string
  note: string | null
  fromName: string | null
  receivedAt: string
  source: string
}

interface GoalProgress {
  label: string
  goal: number
  raised: number
  percent: number
  firstLayer: number
  secondLayer: number
}

interface DonationData {
  totals: Array<{ currency: string; _sum: { amount: number }; _count: { id: number } }>
  recent: DonationRow[]
  byPlatform: Array<{ platform: string; currency: string; _sum: { amount: number }; _count: { id: number } }>
  months: Array<{ label: string; total: number }>
  thisMonthTotal: number
  goal: GoalProgress | null
}

const emptyForm = { platform: 'kofi', amount: '', currency: 'EUR', fromName: '', note: '', receivedAt: '' }

export default function DonationsPage() {
  const t = useTranslations('Donations')
  const { data, isLoading } = useSWR<DonationData>('/api/admin/donations', fetcher, { refreshInterval: 30_000 })
  const [showAdd, setShowAdd]   = useState(false)
  const [form, setForm]         = useState(emptyForm)
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [showWebhook, setShowWebhook] = useState(false)
  const [copied, setCopied]     = useState(false)
  const [webhookToken, setWebhookToken] = useState('')
  const [savingToken, setSavingToken]   = useState(false)
  const [tokenSaved, setTokenSaved]     = useState(false)

  // The add form is a side panel: Escape closes it, like the games panel.
  useEffect(() => {
    if (!showAdd) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowAdd(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showAdd])

  const submit = async () => {
    if (!form.platform || !form.amount) return
    setSaving(true)
    await fetch('/api/admin/donations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, receivedAt: form.receivedAt || undefined }),
    })
    setSaving(false)
    setForm(emptyForm)
    setShowAdd(false)
    mutate('/api/admin/donations')
  }

  const del = async (id: number) => {
    setDeleting(id)
    await fetch('/api/admin/donations', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setDeleting(null)
    mutate('/api/admin/donations')
  }

  const saveToken = async () => {
    setSavingToken(true)
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kofi_webhook_token: webhookToken }),
    })
    setSavingToken(false)
    setTokenSaved(true)
    setTimeout(() => setTokenSaved(false), 2000)
  }

  const copyWebhookUrl = () => {
    const url = `${window.location.origin}/api/webhooks/kofi`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const primaryTotal = data.totals[0]
  const totalCount   = data.totals.reduce((s, t2) => s + t2._count.id, 0)
  const lastWebhook  = data.recent.find((d) => d.source === 'webhook')

  return (
    <div className="w-full space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Heart className="w-5 h-5 text-red-400" /> {t('title')}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">{t('subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowWebhook((v) => !v)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm border border-border rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Webhook className="w-3.5 h-3.5" /> {t('kofiWebhook')}
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> {t('addDonation')}
          </button>
        </div>
      </div>

      {/* Webhook status: one line. The setup form opens below it on demand. */}
      <section aria-label="Estado del webhook de Ko-fi" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${lastWebhook ? 'bg-emerald-400' : 'bg-muted-foreground'}`} />
          <span>{lastWebhook ? 'Webhook de Ko-fi recibiendo avisos' : 'Ningún aviso de Ko-fi todavía'}</span>
          {lastWebhook && (
            <span className="text-muted-foreground">
              · último aviso {new Date(lastWebhook.receivedAt).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          /api/webhooks/kofi
        </span>
      </section>

      {showWebhook && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Webhook className="w-4 h-4 text-cyan-400" /> {t('webhookSetupTitle')}
          </h3>
          <p className="text-xs text-muted-foreground">{t('webhookSetupDesc')}</p>
          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
              {t('webhookUrlLabel')}
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-secondary border border-border rounded-md px-3 py-2 text-xs font-mono text-muted-foreground truncate">
                {typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/kofi` : '/api/webhooks/kofi'}
              </code>
              <button
                onClick={copyWebhookUrl}
                aria-label="Copiar la URL del webhook"
                className="p-2 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
              {t('webhookTokenLabel')}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={webhookToken}
                onChange={(e) => setWebhookToken(e.target.value)}
                placeholder={t('webhookTokenPlaceholder')}
                className="flex-1 bg-secondary border border-border rounded-md px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={saveToken}
                disabled={savingToken || !webhookToken}
                className="px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-40 transition-colors"
              >
                {savingToken ? <Loader2 className="w-4 h-4 animate-spin" /> : tokenSaved ? <Check className="w-4 h-4 text-green-400" /> : t('save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard
          icon={<Heart className="w-4 h-4 text-red-400" />}
          label={t('totalReceived')}
          value={primaryTotal
            ? `${primaryTotal._sum.amount?.toFixed(2) ?? '0.00'} ${primaryTotal.currency}`
            : '—'}
          sub={data.totals.slice(1).map((t2) => `${t2._sum.amount?.toFixed(2)} ${t2.currency}`).join(' · ') || 'De todos los años y plataformas, incluidas las antiguas de PayPal.'}
        />
        <StatCard
          icon={<Calendar className="w-4 h-4 text-blue-400" />}
          label={t('thisMonth')}
          value={`${data.thisMonthTotal.toFixed(2)} ${primaryTotal?.currency ?? 'EUR'}`}
          sub="Desde el día 1 del mes, en la moneda principal."
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4 text-green-400" />}
          label={t('donationsCount')}
          value={String(totalCount)}
          sub={t('allTime')}
        />
        <StatCard
          icon={<Heart className="w-4 h-4 text-purple-400" />}
          label={t('avgDonation')}
          value={totalCount > 0 && primaryTotal
            ? `${((primaryTotal._sum.amount ?? 0) / totalCount).toFixed(2)} ${primaryTotal.currency}`
            : '—'}
          sub="Total dividido entre el número de donaciones."
        />
      </div>

      {/* Quarterly goal: the same bar as the public donate page. */}
      {data.goal ? (
        <GoalBar goal={data.goal} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-2"><Target className="w-4 h-4" /> Sin objetivo trimestral.</span>
          <Link href="/admin/settings" className="text-primary hover:underline">Configurarlo en Ajustes →</Link>
        </div>
      )}

      {/* Body: history on the left, charts on the right. */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
        <section aria-labelledby="historial" className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 id="historial" className="text-sm font-semibold">{t('history')}</h2>
            <span className="text-xs text-muted-foreground">Últimas 50 · más recientes primero</span>
          </div>
          {data.recent.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">{t('emptyHistory')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                    <th scope="col" className="text-left px-4 py-2.5 font-medium">{t('colPlatform')}</th>
                    <th scope="col" className="text-right px-4 py-2.5 font-medium">{t('colAmount')}</th>
                    <th scope="col" className="text-left px-4 py-2.5 font-medium">{t('colFrom')}</th>
                    <th scope="col" className="text-left px-4 py-2.5 font-medium">{t('colNote')}</th>
                    <th scope="col" className="text-left px-4 py-2.5 font-medium">{t('colDate')}</th>
                    <th scope="col" className="text-left px-4 py-2.5 font-medium">{t('colSource')}</th>
                    <th scope="col" className="w-12 px-4 py-2.5"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {data.recent.map((d) => (
                    <tr key={d.id} className="hover:bg-accent/20">
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: PLATFORM_COLORS[d.platform] ?? '#888' }}>
                          {PLATFORM_ICON[d.platform]}
                          {PLATFORM_LABELS[d.platform] ?? d.platform}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {d.amount.toFixed(2)} <span className="text-xs font-normal text-muted-foreground">{d.currency}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{d.fromName || '—'}</td>
                      <td className="px-4 py-3 max-w-[220px] truncate text-muted-foreground">{d.note || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(d.receivedAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded border px-1.5 py-0.5 text-xs ${
                          d.source === 'webhook'
                            ? 'border-green-500/30 bg-green-500/10 text-green-400'
                            : 'border-border text-muted-foreground'
                        }`}>
                          {d.source}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => del(d.id)}
                          disabled={deleting === d.id}
                          aria-label="Eliminar esta donación"
                          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-red-950/30 hover:text-red-400 disabled:opacity-40"
                        >
                          {deleting === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="flex min-w-0 flex-col gap-5">
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">{t('monthlyChart')}</h2>
            {data.months.every((m) => m.total === 0) ? (
              <p className="py-6 text-center text-xs text-muted-foreground">{t('noDonations')}</p>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={data.months} barSize={24}>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip
                    contentStyle={{ background: '#1c1c27', border: '1px solid #333', borderRadius: 6, fontSize: 12 }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any) => [`${Number(v).toFixed(2)} ${primaryTotal?.currency ?? ''}`, 'Total']}
                  />
                  <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                    {data.months.map((_, i) => (
                      <Cell key={i} fill={i === data.months.length - 1 ? '#6366f1' : '#6366f160'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">{t('byPlatform')}</h2>
            {data.byPlatform.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">{t('noDonations')}</p>
            ) : (
              <div className="mt-1 space-y-3">
                {data.byPlatform.map((p) => {
                  const maxAmount = Math.max(...data.byPlatform.map((x) => x._sum.amount ?? 0), 1)
                  const pct = ((p._sum.amount ?? 0) / maxAmount) * 100
                  const count = p._count.id
                  return (
                    <div key={`${p.platform}-${p.currency}`}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5" style={{ color: PLATFORM_COLORS[p.platform] ?? '#888' }}>
                          {PLATFORM_ICON[p.platform]}
                          {PLATFORM_LABELS[p.platform] ?? p.platform}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          {p._sum.amount?.toFixed(2)} {p.currency} · {count !== 1 ? t('donationCountPlural', { n: count }) : t('donationCount', { n: count })}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, background: PLATFORM_COLORS[p.platform] ?? '#6366f1' }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Manual entry: a side panel, so the page does not move while typing. */}
      {showAdd && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setShowAdd(false)} aria-hidden="true" />
          <aside role="dialog" aria-modal="true" aria-labelledby="add-title" className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-card shadow-2xl">
            <header className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 id="add-title" className="text-sm font-semibold">{t('manualEntry')}</h2>
              <button onClick={() => setShowAdd(false)} aria-label="Cerrar" className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </header>
            <form
              className="flex-1 space-y-4 overflow-y-auto px-5 py-5"
              onSubmit={(e) => { e.preventDefault(); void submit() }}
            >
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  {t('platform')}
                  <select
                    value={form.platform}
                    onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}
                    className="w-full rounded-md border border-border bg-secondary px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {ADDABLE_PLATFORMS.map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  {t('amount')}
                  <input
                    type="number" min="0.01" step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="5.00"
                    className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  {t('currency')}
                  <select
                    value={form.currency}
                    onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                    className="w-full rounded-md border border-border bg-secondary px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {['EUR', 'USD', 'GBP', 'BTC', 'ETH'].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  {t('dateOptional')}
                  <input
                    type="date"
                    value={form.receivedAt}
                    onChange={(e) => setForm((f) => ({ ...f, receivedAt: e.target.value }))}
                    className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                {t('fromOptional')}
                <input
                  type="text"
                  value={form.fromName}
                  onChange={(e) => setForm((f) => ({ ...f, fromName: e.target.value }))}
                  placeholder={t('fromPlaceholder')}
                  className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                {t('noteOptional')}
                <input
                  type="text"
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder={t('notePlaceholder')}
                  className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving || !form.amount}
                  className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {saving ? t('saving') : t('add')}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAdd(false); setForm(emptyForm) }}
                  className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {t('cancel')}
                </button>
              </div>
            </form>
          </aside>
        </>
      )}
    </div>
  )
}

/** The quarterly goal. Below it one green bar; past it a violet layer shows the excess. */
function GoalBar({ goal }: { goal: GoalProgress }) {
  const over = goal.percent > 100
  return (
    <section aria-label={`Objetivo ${goal.label}`} className="rounded-xl border border-border bg-card px-5 py-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Objetivo {goal.label}</h2>
        <span className="text-sm tabular-nums text-muted-foreground">
          {euros.format(goal.raised)} de {euros.format(goal.goal)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(goal.percent, 100)}
        className="relative h-3 w-full overflow-hidden rounded-full bg-secondary"
      >
        <div className="absolute inset-y-0 left-0 rounded-full bg-emerald-500" style={{ width: `${goal.firstLayer}%` }} />
        {goal.secondLayer > 0 && (
          <div className="absolute inset-y-0 left-0 rounded-full bg-violet-500" style={{ width: `${goal.secondLayer}%` }} />
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {over ? (
          <>¡Objetivo superado! <span className="font-semibold text-violet-400">{goal.percent} %</span></>
        ) : (
          <><span className="font-semibold text-emerald-400">{goal.percent} %</span> conseguido</>
        )}
        <span className="opacity-70"> · solo euros del trimestre en curso</span>
      </p>
    </section>
  )
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">{icon}{label}</div>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}
