'use client'

import useSWR, { mutate } from 'swr'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import {
  Heart, Plus, Trash2, Loader2, Coffee, Bitcoin, TrendingUp, Calendar,
  Webhook, Copy, Check,
} from 'lucide-react'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const PLATFORM_LABELS: Record<string, string> = {
  kofi:   'Ko-fi',
  paypal: 'PayPal',
  bmac:   'Buy Me a Coffee',
  crypto: 'Crypto',
  manual: 'Manual',
}

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

interface DonationData {
  totals: Array<{ currency: string; _sum: { amount: number }; _count: { id: number } }>
  recent: DonationRow[]
  byPlatform: Array<{ platform: string; currency: string; _sum: { amount: number }; _count: { id: number } }>
  months: Array<{ label: string; total: number }>
  thisMonthTotal: number
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

  return (
    <div className="max-w-4xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
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
            onClick={() => setShowAdd((v) => !v)}
            className="flex items-center gap-2 px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> {t('addDonation')}
          </button>
        </div>
      </div>

      {/* Ko-fi webhook setup */}
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

      {/* Add donation form */}
      {showAdd && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-sm">{t('manualEntry')}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">{t('platform')}</label>
              <select
                value={form.platform}
                onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}
                className="w-full bg-secondary border border-border rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {Object.entries(PLATFORM_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">{t('amount')}</label>
              <input
                type="number" min="0.01" step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="5.00"
                className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">{t('currency')}</label>
              <select
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                className="w-full bg-secondary border border-border rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {['EUR', 'USD', 'GBP', 'BTC', 'ETH'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">{t('dateOptional')}</label>
              <input
                type="date"
                value={form.receivedAt}
                onChange={(e) => setForm((f) => ({ ...f, receivedAt: e.target.value }))}
                className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">{t('fromOptional')}</label>
              <input
                type="text"
                value={form.fromName}
                onChange={(e) => setForm((f) => ({ ...f, fromName: e.target.value }))}
                placeholder={t('fromPlaceholder')}
                className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">{t('noteOptional')}</label>
              <input
                type="text"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder={t('notePlaceholder')}
                className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={saving || !form.amount}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {saving ? t('saving') : t('add')}
            </button>
            <button
              onClick={() => { setShowAdd(false); setForm(emptyForm) }}
              className="px-4 py-2 text-sm border border-border rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={<Heart className="w-4 h-4 text-red-400" />}
          label={t('totalReceived')}
          value={primaryTotal
            ? `${primaryTotal._sum.amount?.toFixed(2) ?? '0.00'} ${primaryTotal.currency}`
            : '—'}
          sub={data.totals.slice(1).map((t2) => `${t2._sum.amount?.toFixed(2)} ${t2.currency}`).join(' · ') || undefined}
        />
        <StatCard
          icon={<Calendar className="w-4 h-4 text-blue-400" />}
          label={t('thisMonth')}
          value={`${data.thisMonthTotal.toFixed(2)} ${primaryTotal?.currency ?? 'EUR'}`}
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
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-medium mb-4">{t('monthlyChart')}</h3>
          {data.months.every((m) => m.total === 0) ? (
            <p className="text-xs text-muted-foreground py-6 text-center">{t('noDonations')}</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.months} barSize={28}>
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
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-medium mb-4">{t('byPlatform')}</h3>
          {data.byPlatform.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">{t('noDonations')}</p>
          ) : (
            <div className="space-y-2.5 mt-1">
              {data.byPlatform.map((p) => {
                const maxAmount = Math.max(...data.byPlatform.map((x) => x._sum.amount ?? 0), 1)
                const pct = ((p._sum.amount ?? 0) / maxAmount) * 100
                const count = p._count.id
                return (
                  <div key={`${p.platform}-${p.currency}`}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="flex items-center gap-1.5" style={{ color: PLATFORM_COLORS[p.platform] ?? '#888' }}>
                        {PLATFORM_ICON[p.platform]}
                        {PLATFORM_LABELS[p.platform] ?? p.platform}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {p._sum.amount?.toFixed(2)} {p.currency} · {count !== 1 ? t('donationCountPlural', { n: count }) : t('donationCount', { n: count })}
                      </span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
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
        </div>
      </div>

      {/* Donation list */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="font-medium text-sm">{t('history')}</h3>
        </div>
        {data.recent.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">{t('emptyHistory')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                <th className="text-left px-5 py-2.5">{t('colPlatform')}</th>
                <th className="text-left px-5 py-2.5">{t('colAmount')}</th>
                <th className="text-left px-5 py-2.5 hidden sm:table-cell">{t('colFrom')}</th>
                <th className="text-left px-5 py-2.5 hidden md:table-cell">{t('colNote')}</th>
                <th className="text-left px-5 py-2.5">{t('colDate')}</th>
                <th className="text-left px-5 py-2.5 hidden sm:table-cell">{t('colSource')}</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {data.recent.map((d) => (
                <tr key={d.id} className="hover:bg-accent/20">
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: PLATFORM_COLORS[d.platform] ?? '#888' }}>
                      {PLATFORM_ICON[d.platform]}
                      {PLATFORM_LABELS[d.platform] ?? d.platform}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-semibold tabular-nums">
                    {d.amount.toFixed(2)} <span className="text-xs text-muted-foreground">{d.currency}</span>
                  </td>
                  <td className="px-5 py-3 hidden sm:table-cell text-muted-foreground">{d.fromName || '—'}</td>
                  <td className="px-5 py-3 hidden md:table-cell text-muted-foreground max-w-[160px] truncate">{d.note || '—'}</td>
                  <td className="px-5 py-3 text-muted-foreground whitespace-nowrap text-xs">
                    {new Date(d.receivedAt).toLocaleDateString('en', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-3 hidden sm:table-cell">
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${
                      d.source === 'webhook'
                        ? 'border-green-500/30 text-green-400 bg-green-500/10'
                        : 'border-border text-muted-foreground'
                    }`}>
                      {d.source}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => del(d.id)}
                      disabled={deleting === d.id}
                      className="p-1.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-950/30 transition-colors disabled:opacity-40"
                    >
                      {deleting === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
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
