'use client'

import useSWR from 'swr'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LabelList,
} from 'recharts'
import { formatBytes } from '@/lib/utils'
import {
  Users, Eye, Zap, HardDrive, Clock, AlertTriangle,
  Search, Monitor, Shield, TrendingUp, Activity,
} from 'lucide-react'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const PLATFORM_LABELS: Record<string, string> = {
  switch: 'Switch', '3ds': '3DS', nds: 'NDS', wii: 'Wii', psp: 'PSP', psvita: 'PSVita',
}

const CHART_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899']

interface TrafficData {
  summary: {
    totalPageViews: number
    uniqueVisitorsToday: number
    pageViewsToday: number
    pageViewsWeek: number
    activeNow: number
    bounceRate: number
    avgLatencyMs: number
    totalDownloads: number
    totalBytesTransferred: string
  }
  sparklines: { pageViews: number[]; downloads: number[] }
  deviceBreakdown: Array<{ device: string | null; _count: { id: number } }>
  browserBreakdown: Array<{ browser: string | null; _count: { id: number } }>
  topPlatforms: Array<{ slug: string; count: number }>
  topPages: Array<{ path: string; _count: { id: number } }>
  topDownloads: Array<{ gameId: number; title: string; count: number; bytes: string }>
  downloadsByDevice: Array<{ title: string; desktop: number; mobile: number; tablet: number; console: number; unknown: number }>
  recentIps: Array<{
    ip: string; userAgent: string | null; device: string | null; browser: string | null
    ts: string; country: string | null; city: string | null; flagEmoji: string | null; isp: string | null
    os: string; osVersion: string; deviceModel: string
  }>
  errorCounts: Array<{ status: number; _count: { id: number } }>
}

interface LiveData {
  activeNow: number
  recentRequests: Array<{
    id: number; ip: string; path: string; status: number; device: string | null
    browser: string | null; durationMs: number | null; ts: string; bytes: number
    os: string; osVersion: string; deviceModel: string
  }>
  recentSearches: Array<{ id: number; query: string; ip: string; results: number; ts: string }>
  rateLimitAlerts: Array<{ ip: string; count: number; window: string }>
}

// Simple SVG sparkline
function Sparkline({ data, color = '#6366f1' }: { data: number[]; color?: string }) {
  if (!data || data.length < 2) return <div className="h-8 w-20" />
  const max = Math.max(...data, 1)
  const min = Math.min(...data)
  const range = max - min || 1
  const W = 80, H = 32, pad = 2
  const pts = data
    .map((v, i) => {
      const x = pad + (i / (data.length - 1)) * (W - pad * 2)
      const y = H - pad - ((v - min) / range) * (H - pad * 2)
      return `${x},${y}`
    })
    .join(' ')
  return (
    <svg width={W} height={H} className="opacity-80">
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={pts} />
    </svg>
  )
}

function StatCard({
  icon, label, value, sub, sparkline, sparklineColor, alert,
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string
  sparkline?: number[]; sparklineColor?: string; alert?: boolean
}) {
  return (
    <div className={`bg-card border rounded-xl p-4 ${alert ? 'border-red-500/40' : 'border-border'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className={`flex items-center gap-2 text-xs ${alert ? 'text-red-400' : 'text-muted-foreground'}`}>
          {icon}<span>{label}</span>
        </div>
        {sparkline && <Sparkline data={sparkline} color={sparklineColor} />}
      </div>
      <p className={`text-2xl font-bold tabular-nums ${alert ? 'text-red-400' : ''}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

function SectionTitle({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-primary">{icon}</span>
      <div>
        <h2 className="font-semibold text-base">{title}</h2>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  )
}

function rel(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function TrafficPage() {
  const { data, isLoading } = useSWR<TrafficData>('/api/admin/traffic', fetcher, { refreshInterval: 30_000 })
  const { data: live } = useSWR<LiveData>('/api/admin/traffic/live', fetcher, { refreshInterval: 3_000 })

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const { summary, sparklines, deviceBreakdown, browserBreakdown,
    topPlatforms, recentIps, errorCounts,
    topDownloads, downloadsByDevice } = data

  // Live data falls back to static snapshot until first live fetch completes
  const activeNow      = live?.activeNow      ?? summary.activeNow
  const recentRequests = live?.recentRequests  ?? []
  const recentSearches = live?.recentSearches  ?? []
  const rateLimitAlerts = live?.rateLimitAlerts ?? []

  const deviceData = deviceBreakdown.map((d) => ({
    name: d.device ?? 'unknown',
    value: d._count.id,
  }))

  const browserData = browserBreakdown.map((b) => ({
    name: b.browser ?? 'unknown',
    value: b._count.id,
  }))

  const platformData = topPlatforms.map((p) => ({
    name: PLATFORM_LABELS[p.slug] ?? p.slug,
    visits: p.count,
  }))

  return (
    <div className="max-w-7xl space-y-10">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Traffic Analysis</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Live data every 3s · stats every 30s · {activeNow} connection{activeNow !== 1 ? 's' : ''} active now
        </p>
      </div>

      {/* ── SECTION 1: General Traffic ─────────────────────────────────────── */}
      <section>
        <SectionTitle icon={<Activity className="w-4 h-4" />} title="General Traffic" sub="Sparklines show last 7 days" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <StatCard icon={<Eye className="w-4 h-4" />} label="Page views today"
            value={String(summary.pageViewsToday)} sub={`${summary.pageViewsWeek} this week`}
            sparkline={sparklines.pageViews} sparklineColor="#6366f1" />
          <StatCard icon={<Users className="w-4 h-4" />} label="Unique visitors today"
            value={String(summary.uniqueVisitorsToday)} sub={`${summary.bounceRate}% bounce rate`}
            sparkline={sparklines.pageViews.map((v) => Math.round(v * 0.6))} sparklineColor="#22c55e" />
          <StatCard icon={<Zap className="w-4 h-4" />} label="Active now"
            value={String(activeNow)} sub="Unique IPs last 10 min"
            alert={activeNow > 20} />
          <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Downloads"
            value={String(summary.totalDownloads)} sub={formatBytes(BigInt(summary.totalBytesTransferred))}
            sparkline={sparklines.downloads} sparklineColor="#f59e0b" />
        </div>
      </section>

      {/* ── SECTION 2: System & Performance ───────────────────────────────── */}
      <section>
        <SectionTitle icon={<Monitor className="w-4 h-4" />} title="System & Performance" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
          <StatCard icon={<Clock className="w-4 h-4" />} label="Avg response time"
            value={summary.avgLatencyMs ? `${summary.avgLatencyMs}ms` : '—'}
            sub="Last hour" alert={summary.avgLatencyMs > 2000} />
          <StatCard icon={<HardDrive className="w-4 h-4" />} label="Bandwidth transferred"
            value={formatBytes(BigInt(summary.totalBytesTransferred))} sub="Completed downloads" />
          <StatCard icon={<AlertTriangle className="w-4 h-4" />} label="HTTP errors (7d)"
            value={String(errorCounts.reduce((s, e) => s + e._count.id, 0))}
            sub={errorCounts.map((e) => `${e.status}×${e._count.id}`).join(' ')}
            alert={errorCounts.reduce((s, e) => s + e._count.id, 0) > 50} />
          <StatCard icon={<Eye className="w-4 h-4" />} label="Total page views"
            value={String(summary.totalPageViews)} sub="All time" />
        </div>

        {/* Recent request log */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="font-medium text-sm flex items-center gap-2">
              Request Log (last 50)
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-3 py-2">Path</th>
                  <th className="text-left px-3 py-2">IP</th>
                  <th className="text-left px-3 py-2 hidden md:table-cell">Status</th>
                  <th className="text-left px-3 py-2 hidden sm:table-cell">Device</th>
                  <th className="text-left px-3 py-2 hidden lg:table-cell">Latency</th>
                  <th className="text-left px-3 py-2">When</th>
                </tr>
              </thead>
              <tbody>
                {recentRequests.map((r) => (
                  <tr key={r.id} className="border-b border-border/40 hover:bg-accent/20">
                    <td className="px-3 py-2 font-mono truncate max-w-[160px]">{r.path}</td>
                    <td className="px-3 py-2 font-mono">{r.ip}</td>
                    <td className={`px-3 py-2 hidden md:table-cell font-medium ${r.status >= 500 ? 'text-red-400' : r.status >= 400 ? 'text-amber-400' : 'text-green-400'}`}>{r.status}</td>
                    <td className="px-3 py-2 hidden sm:table-cell">
                      {r.deviceModel
                        ? <span>{r.deviceModel}<span className="text-muted-foreground ml-1 text-xs">{r.os}</span></span>
                        : <span className="capitalize">{r.device ?? '—'}</span>}
                    </td>
                    <td className="px-3 py-2 hidden lg:table-cell text-muted-foreground">{r.durationMs != null ? `${r.durationMs}ms` : '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{rel(r.ts)}</td>
                  </tr>
                ))}
                {recentRequests.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No requests logged yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── SECTION 2.5: Download Charts ──────────────────────────────────── */}
      <section>
        <SectionTitle icon={<HardDrive className="w-4 h-4" />} title="Download Analytics" sub="Which games and from which devices" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

          {/* Top downloaded games */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-medium mb-4">Top Downloaded Games</h3>
            {topDownloads.length === 0 ? (
              <p className="text-xs text-muted-foreground">No downloads recorded yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(200, topDownloads.length * 36)}>
                <BarChart
                  data={topDownloads.map((d) => ({
                    name: d.title.length > 22 ? d.title.slice(0, 20) + '…' : d.title,
                    downloads: d.count,
                    bytes: d.bytes,
                  }))}
                  layout="vertical"
                  barSize={18}
                  margin={{ left: 8, right: 48 }}
                >
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
                  <Tooltip
                    contentStyle={{ background: '#1c1c27', border: '1px solid #333', borderRadius: 6, fontSize: 12 }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(val: any, _name: any, props: any) => [
                      `${val} downloads · ${formatBytes(BigInt(props.payload?.bytes ?? '0'))}`,
                      'Downloads',
                    ]}
                  />
                  <Bar dataKey="downloads" fill="#6366f1" radius={[0, 6, 6, 0]}>
                    <LabelList dataKey="downloads" position="right" style={{ fontSize: 11, fill: '#9ca3af' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Downloads by device per game (stacked bar) */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-medium mb-1">Downloads by Device</h3>
            <p className="text-xs text-muted-foreground mb-4">Top 8 games · stacked by device type</p>
            {downloadsByDevice.length === 0 ? (
              <p className="text-xs text-muted-foreground">No downloads recorded yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(200, downloadsByDevice.length * 36)}>
                <BarChart data={downloadsByDevice} layout="vertical" barSize={18} margin={{ left: 8, right: 16 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="title" tick={{ fontSize: 11 }} width={140} />
                  <Tooltip contentStyle={{ background: '#1c1c27', border: '1px solid #333', borderRadius: 6, fontSize: 12 }} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="desktop" name="Desktop" stackId="a" fill="#6366f1" />
                  <Bar dataKey="mobile" name="Mobile" stackId="a" fill="#22c55e" />
                  <Bar dataKey="tablet" name="Tablet" stackId="a" fill="#f59e0b" />
                  <Bar dataKey="console" name="Console" stackId="a" fill="#ef4444" />
                  <Bar dataKey="unknown" name="Unknown" stackId="a" fill="#6b7280" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      {/* ── SECTION 3: User Behaviour ──────────────────────────────────────── */}
      <section>
        <SectionTitle icon={<Search className="w-4 h-4" />} title="User Behaviour & Filters" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

          {/* Top platforms (bar chart) */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-medium mb-3">Top Consoles Browsed</h3>
            {platformData.length === 0 ? (
              <p className="text-xs text-muted-foreground">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={platformData} layout="vertical" barSize={14}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={50} />
                  <Tooltip contentStyle={{ background: '#1c1c27', border: '1px solid #333', borderRadius: 6, fontSize: 12 }} />
                  <Bar dataKey="visits" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Devices (pie) */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-medium mb-3">Devices</h3>
            {deviceData.length === 0 ? (
              <p className="text-xs text-muted-foreground">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={deviceData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} label={({ name, percent }) => `${name} ${Math.round((percent ?? 0) * 100)}%`} labelLine={false} fontSize={11}>
                    {deviceData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#1c1c27', border: '1px solid #333', borderRadius: 6, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Browsers (bar chart) */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-medium mb-3">Browsers</h3>
            {browserData.length === 0 ? (
              <p className="text-xs text-muted-foreground">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={browserData} layout="vertical" barSize={14}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={55} />
                  <Tooltip contentStyle={{ background: '#1c1c27', border: '1px solid #333', borderRadius: 6, fontSize: 12 }} />
                  <Bar dataKey="value" fill="#22c55e" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Recent searches */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="font-medium text-sm flex items-center gap-2">
              Live Search Queries
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            </h3>
          </div>
          <div className="divide-y divide-border/40 max-h-64 overflow-y-auto">
            {recentSearches.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">No searches yet</p>
            ) : recentSearches.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent/20">
                <Search className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                <span className="flex-1 font-medium">{s.query}</span>
                <span className="text-xs font-mono text-muted-foreground">{s.ip}</span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{rel(s.ts)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 4: Security ────────────────────────────────────────────── */}
      <section>
        <SectionTitle icon={<Shield className="w-4 h-4" />} title="Security Control" />

        {/* Rate limit alerts */}
        {rateLimitAlerts.length > 0 && (
          <div className="bg-red-950/30 border border-red-700/40 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 text-red-400 font-medium mb-3">
              <AlertTriangle className="w-4 h-4" />
              Rate Limit Alerts — {rateLimitAlerts.length} suspicious IP{rateLimitAlerts.length > 1 ? 's' : ''}
            </div>
            <div className="space-y-2">
              {rateLimitAlerts.map((a) => (
                <div key={a.ip} className="flex items-center gap-3 text-sm bg-red-950/40 rounded px-3 py-2">
                  <span className="font-mono text-xs text-red-300 flex-1">{a.ip}</span>
                  <span className="text-red-400 font-medium">{a.count} downloads / {a.window}</span>
                  <span className="text-xs text-red-500">⚠ Possible mass download</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {rateLimitAlerts.length === 0 && (
          <div className="bg-green-950/20 border border-green-700/30 rounded-xl px-4 py-3 mb-6 flex items-center gap-2 text-sm text-green-400">
            <Shield className="w-4 h-4" />
            No suspicious activity detected in the last hour
          </div>
        )}

        {/* IP registry */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="font-medium text-sm">IP Registry (last 7 days, unique)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-3 py-2">IP</th>
                  <th className="text-left px-3 py-2 hidden sm:table-cell">Location</th>
                  <th className="text-left px-3 py-2 hidden md:table-cell">ISP</th>
                  <th className="text-left px-3 py-2">OS</th>
                  <th className="text-left px-3 py-2 hidden sm:table-cell">Device</th>
                  <th className="text-left px-3 py-2 hidden lg:table-cell">Browser</th>
                  <th className="text-left px-3 py-2">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {recentIps.map((ip) => (
                  <tr key={ip.ip} className="border-b border-border/40 hover:bg-accent/20">
                    <td className="px-3 py-2.5 font-mono">{ip.ip}</td>
                    <td className="px-3 py-2.5 hidden sm:table-cell">
                      {ip.flagEmoji && <span className="mr-1">{ip.flagEmoji}</span>}
                      {ip.city && ip.country ? `${ip.city}, ${ip.country}` : ip.country ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell text-muted-foreground truncate max-w-[160px]">{ip.isp ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className="font-medium">{ip.os}</span>
                      {ip.osVersion && <span className="text-muted-foreground ml-1 text-xs">{ip.osVersion}</span>}
                    </td>
                    <td className="px-3 py-2.5 hidden sm:table-cell text-muted-foreground">
                      {ip.deviceModel || ip.device || '—'}
                    </td>
                    <td className="px-3 py-2.5 hidden lg:table-cell">{ip.browser ?? '—'}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{rel(ip.ts)}</td>
                  </tr>
                ))}
                {recentIps.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">No visitors yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  )
}
