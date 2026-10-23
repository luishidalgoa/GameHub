'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, X } from 'lucide-react'

export interface CompanyRow { id: number; name: string; games: number; parentId: number | null }

interface Detail {
  id: number
  name: string
  games: number
  parent: { id: number; name: string } | null
  subsidiaries: { id: number; name: string; games: number }[]
  names: { text: string; games: number }[]
}

type Status = 'all' | 'loose' | 'owned' | 'owners'

const PAGE = 80
const STATUS_LABEL: Record<Status, string> = { all: 'Todas', loose: 'Sin relacionar', owned: 'Con dueño', owners: 'Dueñas' }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * Catálogo de editoras (#143). Cada fila es una editora tal como la trae LaunchBox. Desde el
 * panel se pueden fusionar en otra (es la misma), ponerle dueño (es un sello o estudio de
 * otra) o al revés: traer varias a esta.
 */
export function CompanyCatalog({ companies }: { companies: CompanyRow[] }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<Status>('all')
  const [ownerText, setOwnerText] = useState('')
  const [sort, setSort] = useState<'games' | 'name'>('games')
  const [shown, setShown] = useState(PAGE)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const byId = useMemo(() => new Map(companies.map(c => [c.id, c])), [companies])
  const subCount = useMemo(() => {
    const m = new Map<number, number>()
    for (const c of companies) if (c.parentId !== null) m.set(c.parentId, (m.get(c.parentId) ?? 0) + 1)
    return m
  }, [companies])
  const ownerId = useMemo(() => companies.find(c => c.name === ownerText.trim())?.id ?? null, [companies, ownerText])
  const bySort = useMemo(
    () => [...companies].sort((a, b) => (sort === 'games' ? b.games - a.games || a.name.localeCompare(b.name) : a.name.localeCompare(b.name))),
    [companies, sort],
  )

  const isOwner = (c: CompanyRow) => subCount.has(c.id)
  const counts = useMemo(() => ({
    all: companies.length,
    loose: companies.filter(c => c.parentId === null && !isOwner(c)).length,
    owned: companies.filter(c => c.parentId !== null).length,
    owners: companies.filter(c => isOwner(c)).length,
  }), [companies, subCount]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = norm(query)
    return bySort.filter(c => {
      if (ownerId !== null && c.id !== ownerId && c.parentId !== ownerId) return false
      if (status === 'loose' && (c.parentId !== null || isOwner(c))) return false
      if (status === 'owned' && c.parentId === null) return false
      if (status === 'owners' && !isOwner(c)) return false
      return !q || norm(c.name).includes(q)
    })
  }, [bySort, query, status, ownerId, subCount]) // eslint-disable-line react-hooks/exhaustive-deps

  const selected = selectedId === null ? null : byId.get(selectedId) ?? null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(STATUS_LABEL) as Status[]).map(s => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            onClick={() => { setStatus(s); setShown(PAGE) }}
            className={`px-3 py-1.5 rounded-md text-xs ${status === s ? 'bg-violet-600 text-white' : 'bg-secondary hover:bg-secondary/80'}`}
          >
            {STATUS_LABEL[s]} <span className="opacity-70 tabular-nums">{counts[s]}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Buscar
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setShown(PAGE) }}
            placeholder="Nombre de la editora"
            className="w-64 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Dueño (sus sub-editoras)
          <span className="flex items-center gap-1">
            <input
              list="company-owners"
              value={ownerText}
              onChange={e => { setOwnerText(e.target.value); setShown(PAGE) }}
              placeholder="Escribe para sugerir…"
              className="w-64 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
            />
            {ownerText && (
              <button type="button" onClick={() => setOwnerText('')} aria-label="Quitar filtro de dueño" className="p-1.5 rounded-md bg-secondary hover:bg-secondary/80">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </span>
          <datalist id="company-owners">
            {bySort.map(c => <option key={c.id} value={c.name} />)}
          </datalist>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Orden
          <select value={sort} onChange={e => setSort(e.target.value as 'games' | 'name')} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground">
            <option value="games">Más juegos</option>
            <option value="name">Nombre</option>
          </select>
        </label>
        <p className="ml-auto text-xs text-muted-foreground tabular-nums">{filtered.length} de {companies.length}</p>
      </div>

      <ul className="grid grid-cols-1 gap-x-6 xl:grid-cols-2">
        {filtered.slice(0, shown).map(c => {
          const parent = c.parentId === null ? null : byId.get(c.parentId) ?? null
          const subs = subCount.get(c.id) ?? 0
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setSelectedId(c.id)}
                aria-current={selectedId === c.id}
                className={`flex w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-left hover:bg-secondary/50 ${selectedId === c.id ? 'bg-secondary' : ''}`}
              >
                <span className="min-w-0 flex-1 truncate text-sm" title={c.name}>{c.name}</span>
                {parent && <span className="shrink-0 truncate text-xs text-violet-300 max-w-[40%]" title={parent.name}>de {parent.name}</span>}
                {subs > 0 && <span className="shrink-0 text-xs text-sky-300">{subs} sub.</span>}
                {!parent && subs === 0 && <span className="shrink-0 text-xs text-muted-foreground/60">sin relacionar</span>}
                <span className="shrink-0 w-20 text-right text-xs text-muted-foreground tabular-nums">{c.games} juegos</span>
              </button>
            </li>
          )
        })}
      </ul>

      {filtered.length > shown && (
        <button type="button" onClick={() => setShown(s => s + PAGE)} className="px-3 py-1.5 rounded-md text-xs bg-secondary hover:bg-secondary/80">
          Mostrar {Math.min(PAGE, filtered.length - shown)} más
        </button>
      )}

      {selected && (
        <CompanyPanel key={selected.id} company={selected} companies={companies} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}

function CompanyPanel({ company, companies, onClose }: { company: CompanyRow; companies: CompanyRow[]; onClose: () => void }) {
  const router = useRouter()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [targetQuery, setTargetQuery] = useState('')
  const [target, setTarget] = useState<CompanyRow | null>(null)
  const [pickQuery, setPickQuery] = useState('')
  const [picked, setPicked] = useState<CompanyRow[]>([])

  useEffect(() => {
    let alive = true
    fetch(`/api/admin/catalog/companies/${company.id}`)
      .then(r => r.json())
      .then(d => { if (alive && !d.error) setDetail(d) })
      .catch(() => {})
    return () => { alive = false }
  }, [company.id, reload])

  const search = (q: string, limit: number) => {
    const n = norm(q)
    if (!n) return []
    return companies
      .filter(c => c.id !== company.id && norm(c.name).includes(n))
      .sort((a, b) => b.games - a.games)
      .slice(0, limit)
  }
  const targetMatches = useMemo(() => search(targetQuery, 6), [targetQuery, companies]) // eslint-disable-line react-hooks/exhaustive-deps
  const pickMatches = useMemo(() => search(pickQuery, 30), [pickQuery, companies]) // eslint-disable-line react-hooks/exhaustive-deps
  const pickedIds = new Set(picked.map(c => c.id))

  async function send(path: string, body: object, done: string, closesSelf: boolean) {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? String(res.status))
      setPicked([])
      setTarget(null)
      setTargetQuery('')
      setPickQuery('')
      router.refresh()
      if (closesSelf) onClose()
      else {
        setMessage({ ok: true, text: done })
        setReload(r => r + 1)
      }
    } catch (err) {
      setMessage({ ok: false, text: `No se pudo: ${err instanceof Error ? err.message : 'error'}` })
    } finally {
      setBusy(false)
    }
  }

  function merge(from: CompanyRow[], into: CompanyRow, closesSelf: boolean) {
    const names = from.length === 1 ? `«${from[0].name}»` : `${from.length} editoras`
    const ok = window.confirm(`¿Fusionar ${names} en «${into.name}»? Sus juegos y sus nombres pasan a «${into.name}» y dejan de estar como editoras aparte.`)
    if (!ok) return
    const games = from.reduce((n, c) => n + c.games, 0)
    send('/api/admin/catalog/merge', { from: from.map(c => c.id), into: into.id }, `Fusionadas ${names} en «${into.name}»: ${games} juegos movidos.`, closesSelf)
  }

  function owner(companyIds: number[], ownerId: number | null, done: string) {
    send('/api/admin/catalog/owner', { companies: companyIds, owner: ownerId }, done, false)
  }

  const togglePick = (c: CompanyRow) =>
    setPicked(list => (list.some(p => p.id === c.id) ? list.filter(p => p.id !== c.id) : [...list, c]))

  return (
    <aside role="dialog" aria-modal="false" aria-labelledby="company-panel-title" className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-border bg-card shadow-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 id="company-panel-title" className="truncate text-lg font-semibold">{company.name}</h2>
          <p className="text-xs text-muted-foreground tabular-nums">{company.games} juegos{detail ? ` · ${detail.subsidiaries.length} sub-editoras` : ''}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-md bg-secondary hover:bg-secondary/80"><X className="w-4 h-4" /></button>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        {message && <p role="status" className={`text-sm ${message.ok ? 'text-green-500' : 'text-destructive'}`}>{message.text}</p>}

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Pertenece a</h3>
          {detail?.parent ? (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span>{detail.parent.name}</span>
              <button type="button" disabled={busy} onClick={() => owner([company.id], null, `«${company.name}» ya no pertenece a «${detail.parent?.name}».`)} className="px-2.5 py-1 rounded-md text-xs bg-secondary hover:bg-secondary/80 disabled:opacity-60">Quitar</button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Es una editora independiente.</p>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Sub-editoras {detail ? `(${detail.subsidiaries.length})` : ''}</h3>
          {detail && detail.subsidiaries.length === 0 && <p className="text-xs text-muted-foreground">Ninguna todavía.</p>}
          <ul className="divide-y divide-border">
            {detail?.subsidiaries.map(s => (
              <li key={s.id} className="flex items-center gap-3 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{s.games} juegos</span>
                <button type="button" disabled={busy} onClick={() => owner([s.id], null, `«${s.name}» ya no es sub-editora.`)} className="px-2 py-1 rounded-md text-xs bg-secondary hover:bg-secondary/80 disabled:opacity-60">Quitar</button>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Nombres en sus juegos</h3>
          <p className="text-xs text-muted-foreground">Cómo la escribe LaunchBox en cada juego. Un nombre compuesto como «Electronic Arts, EA SPORTS» cuenta como su primera editora.</p>
          <ul className="divide-y divide-border">
            {detail?.names.map(n => (
              <li key={n.text} className="flex items-center gap-3 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate" title={n.text}>{n.text || '(vacío)'}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{n.games}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-3 border-t border-border pt-5">
          <h3 className="text-sm font-medium">Esta editora es…</h3>
          <p className="text-xs text-muted-foreground">
            <strong className="font-medium text-foreground">Fusionar</strong>: es la misma editora. Sus juegos pasan a la elegida y esta desaparece de la lista. Los nombres siguen resolviéndose a la elegida en futuras importaciones.
            {' '}<strong className="font-medium text-foreground">Pertenece a</strong>: sigue en la lista, agrupada bajo la elegida.
          </p>
          {target ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
              <span className="truncate">{target.name} <span className="text-xs text-muted-foreground">· {target.games} juegos</span></span>
              <button type="button" onClick={() => setTarget(null)} className="text-xs text-muted-foreground hover:text-foreground">Cambiar</button>
            </div>
          ) : (
            <>
              <input value={targetQuery} onChange={e => setTargetQuery(e.target.value)} placeholder="Buscar la editora de destino…" className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground" />
              <ul className="divide-y divide-border">
                {targetMatches.map(c => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setTarget(c)} className="flex w-full items-center justify-between gap-3 py-1.5 text-left text-sm hover:text-violet-300">
                      <span className="truncate">{c.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{c.games} juegos</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {target && (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => merge([company], target, true)} className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-60">
                {busy && <RefreshCw className="w-3.5 h-3.5 animate-spin" />} Fusionar en «{target.name}»
              </button>
              <button type="button" disabled={busy} onClick={() => owner([company.id], target.id, `«${company.name}» pertenece ahora a «${target.name}».`)} className="px-3 py-1.5 rounded-md text-xs bg-secondary hover:bg-secondary/80 disabled:opacity-60">
                Pertenece a «{target.name}»
              </button>
            </div>
          )}
        </section>

        <section className="space-y-3 border-t border-border pt-5">
          <h3 className="text-sm font-medium">Otras editoras que son esta</h3>
          <p className="text-xs text-muted-foreground">Busca y marca varias. Después eliges si se fusionan aquí o pasan a ser sus sub-editoras.</p>
          <input value={pickQuery} onChange={e => setPickQuery(e.target.value)} placeholder="Buscar editoras…" className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground" />
          {picked.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {picked.map(c => (
                <button key={c.id} type="button" onClick={() => togglePick(c)} className="flex items-center gap-1 rounded-full bg-violet-950/60 px-2.5 py-1 text-xs text-violet-200">
                  {c.name} <X className="w-3 h-3" />
                </button>
              ))}
            </div>
          )}
          <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
            {pickMatches.map(c => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-1.5 text-sm hover:bg-secondary/50">
                  <input type="checkbox" checked={pickedIds.has(c.id)} onChange={() => togglePick(c)} className="accent-violet-600" />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{c.games}</span>
                </label>
              </li>
            ))}
          </ul>
          {picked.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => merge(picked, company, false)} className="px-3 py-1.5 rounded-md text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-60">
                Fusionar {picked.length} aquí
              </button>
              <button type="button" disabled={busy} onClick={() => owner(picked.map(c => c.id), company.id, `${picked.length} pasan a ser sub-editoras de «${company.name}».`)} className="px-3 py-1.5 rounded-md text-xs bg-secondary hover:bg-secondary/80 disabled:opacity-60">
                Hacer {picked.length} sub-editoras de aquí
              </button>
            </div>
          )}
        </section>
      </div>
    </aside>
  )
}
