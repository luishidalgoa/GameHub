'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts'
import { AlertTriangle, Shield } from 'lucide-react'
import { formatBytes } from '@/lib/utils'

// Los identificadores son estables; lo que se ensena no tiene por que serlo.
// Tinfoil y CyberFoil se quedan: hay descargas archivadas con esos clientes.
const CLIENT_LABELS: Record<string, string> = {
  gamehubnx: 'GameHubNX',
  cyberfoil: 'CyberFoil',
  tinfoil: 'Tinfoil / DBI',
  browser: 'Navegador',
  other: 'Otro',
  unknown: 'Sin registrar',
}

const RETENTION_LABELS: Record<string, string> = {
  requestLog: 'Peticiones',
  searchLog: 'Búsquedas',
  downloadLog: 'Descargas',
  ip: 'Direcciones IP',
  ipCache: 'Geolocalización (caché)',
  diagnostics: 'Diagnósticos de clientes',
}

const ERROR_THRESHOLD_PERCENT = 1
const MASS_DOWNLOAD_THRESHOLD = 5

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface TrafficData {
  proxyTrusted: boolean
  summary: { pageViewsToday: number; uniqueVisitorsToday: number }
  pageViewsByDay: Array<{ day: string; count: number | null }>
  oldestRequestAt: string | null
  downloads: {
    completed: number
    abandoned: number
    inProgress: number
    successPercent: number | null
    byClient: Array<{ client: string; completed: number; abandoned: number; inProgress: number; successPercent: number | null }>
    topGames: Array<{ gameId: number; title: string; count: number; fileSize: string }>
    clientVersions: Array<{ version: string; count: number }>
  }
  recentSearches: Array<{ id: number; query: string; results: number; ts: string }>
  ipRegistry: Array<{
    ip: string; ts: string; country: string | null; city: string | null; flagEmoji: string | null
    isp: string | null; os: string; osVersion: string; deviceModel: string; device: string | null; browser: string | null
  }>
  rateLimitAlerts: Array<{ ip: string; count: number; window: string }>
  recentDiagnostics: Array<{ createdAt: string; kind: string; message: string; clientVersion: string | null }>
  retention: Record<string, number>
}

interface LiveData {
  activeNow: number
  requests1h: number
  errors1h: number
  errorPercent: number | null
  recentRequests: Array<{
    id: number; path: string; status: number; device: string | null; browser: string | null
    durationMs: number | null; ts: string; os: string; deviceModel: string
  }>
  recentSearches: Array<{ id: number; query: string; results: number; ts: string }>
  rateLimitAlerts: Array<{ ip: string; count: number; window: string }>
}

type View = 'resumen' | 'descargas' | 'seguridad'

const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'descargas', label: 'Descargas' },
  { id: 'seguridad', label: 'Seguridad' },
]

/** "hace 3 s", "hace 5 min"... Relative to now; the page refreshes its own data. */
function rel(ts: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000))
  if (s < 60) return `hace ${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.floor(h / 24)} d`
}

function Card({ label, value, note, alert }: { label: string; value: string; note: string; alert?: boolean }) {
  return (
    <div className={`bg-card border rounded-xl p-4 flex flex-col gap-1.5 ${alert ? 'border-red-500/40' : 'border-border'}`}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-2xl font-bold tabular-nums ${alert ? 'text-red-400' : ''}`}>{value}</span>
      <span className="text-xs text-muted-foreground">{note}</span>
    </div>
  )
}

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div>
        <h2 className="font-semibold text-sm">{title}</h2>
        {note && <p className="text-xs text-muted-foreground mt-0.5">{note}</p>}
      </div>
      {children}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground py-4 text-center">{children}</p>
}

/** Seven bars, one per day. A null day has no data and shows no bar, not a zero. */
function DayBars({ days, label }: { days: Array<{ day: string; count: number | null }>; label: string }) {
  const max = Math.max(1, ...days.map((d) => d.count ?? 0))
  return (
    <div role="img" aria-label={label} className="flex items-end gap-2 h-32">
      {days.map((d) => {
        const weekday = new Date(d.day).toLocaleDateString('es-ES', { weekday: 'short' })
        return (
          <div key={d.day} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
            {d.count === null ? (
              <span className="text-[10px] text-muted-foreground">sin datos</span>
            ) : (
              <span className="text-[10px] tabular-nums text-muted-foreground">{d.count}</span>
            )}
            {d.count !== null && (
              <span
                className="w-full bg-primary/70 rounded-t"
                style={{ height: `${Math.max(2, (d.count / max) * 100)}%` }}
              />
            )}
            <span className="text-[10px] text-muted-foreground capitalize">{weekday}</span>
          </div>
        )
      })}
    </div>
  )
}

function ResumenView({ data, live }: { data: TrafficData; live: LiveData | undefined }) {
  const errorPercent = live?.errorPercent ?? null
  const alertErrors = errorPercent !== null && errorPercent > ERROR_THRESHOLD_PERCENT
  const requests = live?.recentRequests ?? []
  const searches = live?.recentSearches ?? []

  return (
    <div className="space-y-6">
      {!data.proxyTrusted && (
        <div className="bg-amber-950/30 border border-amber-700/40 rounded-xl px-4 py-3 text-sm text-amber-300 flex gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            TRUST_PROXY está apagado: todas las visitas aparecen como 127.0.0.1 y los visitantes únicos no son
            fiables. Actívalo si GameHub está detrás de un proxy que reescriba X-Real-IP.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Card label="Páginas vistas hoy" value={String(data.summary.pageViewsToday)}
          note="Visitas registradas desde las 00:00. Cada recarga cuenta como otra." />
        <Card label="Visitantes únicos hoy" value={String(data.summary.uniqueVisitorsToday)}
          note="IP distintas desde las 00:00. Las IP se borran a los 7 días." />
        <Card label="Activos ahora" value={String(live?.activeNow ?? 0)}
          note="IP con alguna petición en los últimos 5 minutos. Se actualiza cada 3 s." />
        <Card label="Errores 5xx (1 h)" value={errorPercent === null ? '—' : `${errorPercent} %`}
          alert={alertErrors}
          note={live && live.requests1h > 0
            ? `${live.errors1h} de ${live.requests1h} peticiones. Umbral de alerta: ${ERROR_THRESHOLD_PERCENT} %.`
            : `Sin peticiones en la última hora. Umbral de alerta: ${ERROR_THRESHOLD_PERCENT} %.`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <Panel title="Últimas peticiones" note="Las 50 más recientes, con su código de respuesta.">
            {requests.length === 0 ? (
              <Empty>Sin peticiones registradas.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left px-2 py-2 font-medium">Hora</th>
                      <th className="text-left px-2 py-2 font-medium">Ruta</th>
                      <th className="text-left px-2 py-2 font-medium">Estado</th>
                      <th className="text-right px-2 py-2 font-medium">Duración</th>
                      <th className="text-left px-2 py-2 font-medium">Dispositivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((r) => (
                      <tr key={r.id} className="border-b border-border/40">
                        <td className="px-2 py-2 text-muted-foreground whitespace-nowrap">{rel(r.ts)}</td>
                        <td className="px-2 py-2 font-mono truncate max-w-[220px]">{r.path}</td>
                        <td className={`px-2 py-2 font-medium ${r.status >= 500 ? 'text-red-400' : r.status >= 400 ? 'text-amber-400' : 'text-green-400'}`}>{r.status}</td>
                        <td className="px-2 py-2 text-right text-muted-foreground">{r.durationMs != null ? `${r.durationMs} ms` : '—'}</td>
                        <td className="px-2 py-2">{r.deviceModel ? `${r.deviceModel} ${r.os}` : r.device ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <Panel title="Búsquedas recientes" note="Las 12 más recientes. Resultados y hace cuánto.">
          {searches.length === 0 ? (
            <Empty>Sin búsquedas recientes.</Empty>
          ) : (
            <ul className="divide-y divide-border/40 text-sm">
              {searches.slice(0, 12).map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2">
                  <span className="flex-1 min-w-0 font-medium truncate">{s.query}</span>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">{s.results} res.</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{rel(s.ts)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Visitas por día (7 días)"
        note={data.oldestRequestAt
          ? `Desde ${new Date(data.oldestRequestAt).toLocaleDateString('es-ES')}, el registro más antiguo que se conserva. Un día sin barra no tiene datos.`
          : 'Todavía no hay peticiones registradas.'}>
        <DayBars days={data.pageViewsByDay} label="Gráfico de barras: páginas vistas por día, últimos 7 días" />
      </Panel>
    </div>
  )
}

function DescargasView({ data }: { data: TrafficData }) {
  const { downloads } = data
  const hasGames = downloads.topGames.length > 0

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Últimos 30 días. Cada fila de descarga es un tramo, una petición de un fragmento del archivo, no una sesión
        completa. Hasta que exista el modelo de sesiones, las cifras cuentan tramos.
      </p>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Card label="Tramos completados" value={String(downloads.completed)} note="Petición cerrada hasta el final." />
        <Card label="En curso" value={String(downloads.inProgress)} note="Abiertos hace menos de 6 h. No cuentan como fallo." />
        <Card label="Abandonados" value={String(downloads.abandoned)} note="Sin terminar pasadas 6 h desde su inicio." />
        <Card label="Éxito" value={downloads.successPercent === null ? '—' : `${downloads.successPercent} %`}
          note="Completados sobre cerrados (completados + abandonados)." />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel title="Por cliente" note="Quién descarga y cuánto se termina.">
          {downloads.byClient.length === 0 ? (
            <Empty>Sin descargas en los últimos 30 días.</Empty>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-2 font-medium">Cliente</th>
                  <th className="text-right py-2 font-medium">Completados</th>
                  <th className="text-right py-2 font-medium">Abandonados</th>
                  <th className="text-right py-2 font-medium">En curso</th>
                  <th className="text-right py-2 font-medium">Éxito</th>
                </tr>
              </thead>
              <tbody>
                {downloads.byClient.map((c) => (
                  <tr key={c.client} className="border-b border-border/40">
                    <td className="py-2 font-medium">{CLIENT_LABELS[c.client] ?? c.client}</td>
                    <td className="py-2 text-right tabular-nums">{c.completed}</td>
                    <td className="py-2 text-right tabular-nums">{c.abandoned}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">{c.inProgress}</td>
                    <td className={`py-2 text-right tabular-nums ${c.successPercent !== null && c.successPercent < 80 ? 'text-amber-500' : ''}`}>
                      {c.successPercent === null ? '—' : `${c.successPercent} %`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Versiones de GameHubNX" note="Solo aparece la versión que el cliente declara de sí mismo.">
          {downloads.clientVersions.length === 0 ? (
            <Empty>Ninguna descarga declara versión.</Empty>
          ) : (
            <ul className="divide-y divide-border/40 text-sm">
              {downloads.clientVersions.map((v) => (
                <li key={v.version} className="flex justify-between py-2">
                  <span className="font-mono">{v.version}</span>
                  <span className="text-muted-foreground tabular-nums">{v.count} tramos</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Juegos más descargados" note="Tramos completados. El tamaño es el del archivo del juego, no bytes transferidos.">
        {!hasGames ? (
          <Empty>Sin descargas en los últimos 30 días.</Empty>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(180, downloads.topGames.length * 34)}>
            <BarChart
              data={downloads.topGames.map((g) => ({
                name: g.title.length > 24 ? g.title.slice(0, 22) + '…' : g.title,
                tramos: g.count,
                size: g.fileSize,
              }))}
              layout="vertical" barSize={16} margin={{ left: 8, right: 40 }}
            >
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={170} />
              <Tooltip
                contentStyle={{ background: '#1c1c27', border: '1px solid #333', borderRadius: 6, fontSize: 12 }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(val: any, _name: any, props: any) => [
                  `${val} tramos · archivo ${formatBytes(BigInt(props.payload?.size ?? '0'))}`, 'Descargas',
                ]}
              />
              <Bar dataKey="tramos" fill="#6366f1" radius={[0, 4, 4, 0]}>
                <LabelList dataKey="tramos" position="right" style={{ fontSize: 11, fill: '#9ca3af' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <Panel title="Embudo de descarga" note="Pendiente.">
        <p className="text-sm text-muted-foreground">
          Token pedido, listo, primer byte y completada necesitan registrar cada paso como evento, y hoy solo se guardan
          los tramos. Este bloque se activará con el modelo de eventos de la fase 4 del plan.
        </p>
      </Panel>
    </div>
  )
}

function SeguridadView({ data, live }: { data: TrafficData; live: LiveData | undefined }) {
  const alerts = live?.rateLimitAlerts ?? data.rateLimitAlerts

  return (
    <div className="space-y-6">
      {alerts.length > 0 ? (
        <div className="bg-red-950/30 border border-red-700/40 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-red-400 font-medium text-sm">
            <AlertTriangle className="w-4 h-4" />
            {alerts.length === 1 ? 'Una IP supera las descargas permitidas' : `${alerts.length} IP superan las descargas permitidas`}
          </div>
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li key={a.ip} className="flex items-center gap-3 text-sm bg-red-950/40 rounded px-3 py-2">
                <span className="font-mono text-xs text-red-300 flex-1">{a.ip}</span>
                <span className="text-red-400 font-medium tabular-nums">{a.count} descargas en 1 h</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-red-300/80">
            Regla: más de {MASS_DOWNLOAD_THRESHOLD} descargas por IP en una hora. Los 429 del límite de 60 peticiones
            cada 10 minutos no se registran todavía, así que no aparecen aquí.
          </p>
        </div>
      ) : (
        <div className="bg-green-950/20 border border-green-700/30 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-green-400">
          <Shield className="w-4 h-4" />
          Ninguna IP supera {MASS_DOWNLOAD_THRESHOLD} descargas en la última hora.
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <Panel title="Registro de IP" note="Últimos 7 días, una fila por dirección. Las IP se guardan sin pseudonimizar y se borran a los 7 días.">
            {data.ipRegistry.length === 0 ? (
              <Empty>Sin visitantes en los últimos 7 días.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left py-2 font-medium">IP</th>
                      <th className="text-left py-2 font-medium">Ubicación</th>
                      <th className="text-left py-2 font-medium">ISP</th>
                      <th className="text-left py-2 font-medium">Sistema</th>
                      <th className="text-left py-2 font-medium">Navegador</th>
                      <th className="text-left py-2 font-medium">Última vez</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ipRegistry.map((ip) => (
                      <tr key={ip.ip} className="border-b border-border/40">
                        <td className="py-2 font-mono">{ip.ip}</td>
                        <td className="py-2">
                          {ip.flagEmoji && <span className="mr-1">{ip.flagEmoji}</span>}
                          {ip.city && ip.country ? `${ip.city}, ${ip.country}` : ip.country ?? '—'}
                        </td>
                        <td className="py-2 text-muted-foreground truncate max-w-[160px]">{ip.isp ?? '—'}</td>
                        <td className="py-2">{ip.os}{ip.osVersion && <span className="text-muted-foreground ml-1">{ip.osVersion}</span>}</td>
                        <td className="py-2">{ip.browser ?? '—'}</td>
                        <td className="py-2 text-muted-foreground whitespace-nowrap">{rel(ip.ts)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <Panel title="Retención" note="Cuánto se guarda cada dato. Lo aplica un borrado diario.">
          <ul className="divide-y divide-border/40 text-sm">
            {Object.entries(data.retention).map(([key, days]) => (
              <li key={key} className="flex justify-between py-2">
                <span>{RETENTION_LABELS[key] ?? key}</span>
                <span className="text-muted-foreground tabular-nums">{days} días</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Diagnósticos de los clientes" note="Fallos que comunica GameHubNX, los 20 más recientes.">
        {data.recentDiagnostics.length === 0 ? (
          <Empty>Ningún cliente ha reportado fallos.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-2 font-medium">Fecha</th>
                  <th className="text-left py-2 font-medium">Tipo</th>
                  <th className="text-left py-2 font-medium">Versión</th>
                  <th className="text-left py-2 font-medium">Mensaje</th>
                </tr>
              </thead>
              <tbody>
                {data.recentDiagnostics.map((d, i) => (
                  <tr key={i} className="border-b border-border/40">
                    <td className="py-2 text-muted-foreground whitespace-nowrap">{new Date(d.createdAt).toLocaleString('es-ES')}</td>
                    <td className="py-2">{d.kind}</td>
                    <td className="py-2 font-mono">{d.clientVersion ?? '—'}</td>
                    <td className="py-2">{d.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}

export default function TrafficPage() {
  const [view, setView] = useState<View>('resumen')
  const { data, error } = useSWR<TrafficData>('/api/admin/traffic', fetcher, { refreshInterval: 30_000 })
  const { data: live } = useSWR<LiveData>('/api/admin/traffic/live', fetcher, { refreshInterval: 3_000 })

  if (error || (data && !data.summary)) {
    return <p className="text-sm text-red-400">No se pudieron cargar las estadísticas de tráfico.</p>
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Tráfico</h1>
          <p className="text-muted-foreground mt-1 text-sm">Lo que pasa ahora, las descargas y la seguridad del servidor.</p>
        </div>
        <div role="tablist" aria-label="Vista" className="inline-flex border border-border rounded-lg overflow-hidden self-start">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={`px-3.5 py-2 text-sm ${view === v.id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'resumen' && <ResumenView data={data} live={live} />}
      {view === 'descargas' && <DescargasView data={data} />}
      {view === 'seguridad' && <SeguridadView data={data} live={live} />}
    </div>
  )
}
