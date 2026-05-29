/**
 * GET /api/metrics — Prometheus text exposition format.
 *
 * Exposes GameHub application metrics (traffic, downloads, library) so a
 * Prometheus server can scrape them and Grafana can chart them. This is the
 * APP-level exporter; for host metrics (CPU/RAM/disk of the Raspberry) run
 * node_exporter separately and scrape both.
 *
 * Access: bearer token when METRICS_TOKEN / the `metrics_token` setting is set
 * (use Prometheus `bearer_token`); otherwise LAN-only.
 */
import { db } from '@/lib/db'
import { isLanIp, clientIpFromPlainRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Sample { labels?: Record<string, string>; value: number }

function block(name: string, type: 'gauge' | 'counter', help: string, samples: Sample[]): string {
  const lines = [`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`]
  for (const s of samples) {
    const labels = s.labels && Object.keys(s.labels).length
      ? '{' + Object.entries(s.labels)
          .map(([k, v]) => `${k}="${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`)
          .join(',') + '}'
      : ''
    lines.push(`${name}${labels} ${Number.isFinite(s.value) ? s.value : 0}`)
  }
  return lines.join('\n')
}

export async function GET(req: Request) {
  // ── Auth: bearer token if configured, otherwise LAN-only ────────────────────
  const tokenRow = await db.setting.findUnique({ where: { key: 'metrics_token' } }).catch(() => null)
  const token    = tokenRow?.value || process.env.METRICS_TOKEN
  if (token) {
    if ((req.headers.get('authorization') ?? '') !== `Bearer ${token}`) {
      return new Response('Unauthorized\n', { status: 401 })
    }
  } else if (!isLanIp(clientIpFromPlainRequest(req))) {
    return new Response('Forbidden — LAN only. Set METRICS_TOKEN to allow remote scrape.\n', { status: 403 })
  }

  const now        = Date.now()
  const startToday = new Date(now); startToday.setHours(0, 0, 0, 0)
  const hourAgo    = new Date(now - 60 * 60 * 1000)
  const tenMinAgo  = new Date(now - 10 * 60 * 1000)

  const [
    platforms,
    requestsByStatus,
    latency,
    requestsToday,
    visitorsToday,
    activeNow,
    downloadsTotal,
    downloadsCompleted,
    downloadBytes,
    searchesTotal,
  ] = await Promise.all([
    db.platform.findMany({ select: { slug: true, _count: { select: { games: { where: { isHidden: false } } } } } }),
    db.requestLog.groupBy({ by: ['status'], _count: { id: true } }),
    db.requestLog.aggregate({ _avg: { durationMs: true }, where: { ts: { gte: hourAgo } } }),
    db.requestLog.count({ where: { ts: { gte: startToday } } }),
    db.requestLog.findMany({ where: { ts: { gte: startToday } }, distinct: ['ip'], select: { ip: true } }),
    db.requestLog.findMany({ where: { ts: { gte: tenMinAgo } }, distinct: ['ip'], select: { ip: true } }),
    db.downloadLog.count(),
    db.downloadLog.count({ where: { completed: true } }),
    db.downloadLog.aggregate({ _sum: { fileSize: true }, where: { completed: true } }),
    db.searchLog.count(),
  ])

  const totalGames = platforms.reduce((s, p) => s + (p._count?.games ?? 0), 0)

  const out = [
    block('gamehub_up', 'gauge', 'Always 1 — indicates the GameHub exporter is reachable.', [{ value: 1 }]),

    block('gamehub_games', 'gauge', 'Visible games, by platform.',
      platforms.map(p => ({ labels: { platform: p.slug }, value: p._count?.games ?? 0 }))),
    block('gamehub_games_visible_total', 'gauge', 'Total visible games across all platforms.', [{ value: totalGames }]),
    block('gamehub_platforms', 'gauge', 'Number of configured platforms.', [{ value: platforms.length }]),

    block('gamehub_http_requests_total', 'counter', 'HTTP requests logged, by status code.',
      requestsByStatus.map(r => ({ labels: { status: String(r.status) }, value: r._count.id }))),
    block('gamehub_http_request_duration_ms_avg', 'gauge', 'Average request latency over the last hour (ms).',
      [{ value: Math.round(latency._avg.durationMs ?? 0) }]),
    block('gamehub_http_requests_today', 'gauge', 'Requests logged since local midnight.', [{ value: requestsToday }]),

    block('gamehub_unique_visitors_today', 'gauge', 'Distinct client IPs since local midnight.', [{ value: visitorsToday.length }]),
    block('gamehub_active_visitors', 'gauge', 'Distinct client IPs seen in the last 10 minutes.', [{ value: activeNow.length }]),

    block('gamehub_downloads_total', 'counter', 'Download attempts logged (all time).', [{ value: downloadsTotal }]),
    block('gamehub_downloads_completed_total', 'counter', 'Completed downloads (all time).', [{ value: downloadsCompleted }]),
    block('gamehub_download_bytes_total', 'counter', 'Bytes served for completed downloads (all time).',
      [{ value: Number(downloadBytes._sum.fileSize ?? 0) }]),

    block('gamehub_searches_total', 'counter', 'Library searches logged (all time).', [{ value: searchesTotal }]),
  ]

  return new Response(out.join('\n\n') + '\n', {
    headers: {
      'Content-Type':  'text/plain; version=0.0.4; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
