'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { ChevronDown, ChevronUp, ExternalLink, Loader2, Plus, Trash2 } from 'lucide-react'

interface RepoEntry {
  repo: string
  url: string
  programs?: Array<{ name: string; url: string }>
  error?: string
}

const KEY = '/api/admin/homebrew'
const fetcher = (url: string) => fetch(url).then((r) => r.json())

/**
 * Repos de homebrew que sirve la pestaña Homebrew de la app de Switch. Añadir y
 * quitar se guardan al momento; los programas son solo lectura: son los .nro de
 * la última release de cada repo, tal como los verá la app.
 */
export function HomebrewRepos() {
  const { data, isLoading } = useSWR<{ repos: RepoEntry[] }>(KEY, fetcher, { revalidateOnFocus: false })
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const add = async () => {
    const repo = draft.trim()
    if (!repo) return
    setBusy('add')
    setMessage(null)
    const res = await fetch(KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo }),
    })
    const body = await res.json().catch(() => ({}))
    setBusy(null)
    if (res.ok) {
      setDraft('')
      setMessage({ ok: true, text: `Añadido ${repo}` })
      mutate(KEY)
    } else {
      setMessage({ ok: false, text: body.error ?? 'No se pudo añadir' })
    }
  }

  const remove = async (repo: string) => {
    if (!confirm(`¿Quitar ${repo} de la pestaña Homebrew?`)) return
    setBusy(repo)
    setMessage(null)
    const res = await fetch(KEY, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo }),
    })
    const body = await res.json().catch(() => ({}))
    setBusy(null)
    if (res.ok) {
      setMessage({ ok: true, text: `Quitado ${repo}` })
      mutate(KEY)
    } else {
      setMessage({ ok: false, text: body.error ?? 'No se pudo quitar' })
    }
  }

  return (
    <div className="space-y-4 border-t border-border pt-5">
      <div>
        <h4 className="text-sm font-semibold">Repos de homebrew</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          La pestaña Homebrew de la app lee estos repos. Añadir y quitar se guardan al momento.
          Los programas son los .nro de la última release de cada uno.
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => { e.preventDefault(); void add() }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="owner/nombre"
          aria-label="Repo de GitHub a añadir"
          className="flex-1 min-w-0 bg-secondary border border-border rounded-md px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={busy !== null || !draft.trim()}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-40"
        >
          {busy === 'add' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Añadir
        </button>
      </form>

      {message && (
        <p role="status" className={`text-xs ${message.ok ? 'text-emerald-400' : 'text-destructive'}`}>
          {message.text}
        </p>
      )}

      {isLoading || !data ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando repos…
        </div>
      ) : data.repos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay repos. La app no mostrará ninguno en Homebrew.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {data.repos.map((r) => {
            const expanded = open === r.repo
            const count = r.programs?.length
            return (
              <li key={r.repo} className="px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : r.repo)}
                    aria-expanded={expanded}
                    disabled={count === undefined}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
                  >
                    <span className="truncate font-mono text-sm">{r.repo}</span>
                    <span className="flex-shrink-0 text-xs text-muted-foreground">
                      {r.error ? r.error : count === undefined ? '' : `${count} ${count === 1 ? 'programa' : 'programas'}`}
                    </span>
                    {count !== undefined && (expanded ? <ChevronUp className="h-3.5 w-3.5 flex-shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />)}
                  </button>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${r.repo} en GitHub`} className="text-muted-foreground hover:text-foreground">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => void remove(r.repo)}
                    disabled={busy !== null}
                    aria-label={`Quitar ${r.repo}`}
                    className="rounded p-1.5 text-muted-foreground hover:bg-red-950/30 hover:text-red-400 disabled:opacity-40"
                  >
                    {busy === r.repo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
                {expanded && count !== undefined && (
                  <ul className="mt-2 space-y-1 pl-2 text-xs">
                    {count === 0 && <li className="text-muted-foreground">La última release no tiene .nro.</li>}
                    {r.programs?.map((p) => (
                      <li key={p.url}>
                        <a href={p.url} target="_blank" rel="noopener noreferrer" className="font-mono hover:underline">{p.name}</a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
