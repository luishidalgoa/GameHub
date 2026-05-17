'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Folder, ChevronRight, ArrowLeft, HardDrive, Loader2, X } from 'lucide-react'

interface FsEntry {
  name: string
  path: string
}

interface BrowseResult {
  path: string
  parent: string | null
  entries: FsEntry[]
}

interface Props {
  onSelect: (path: string) => void
  onClose: () => void
}

export function FolderPickerModal({ onSelect, onClose }: Props) {
  const t = useTranslations('FolderPicker')
  const [result, setResult] = useState<BrowseResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const browse = async (browsePath?: string) => {
    setLoading(true)
    setError('')
    const url = browsePath
      ? `/api/admin/fs/browse?path=${encodeURIComponent(browsePath)}`
      : '/api/admin/fs/browse'
    const res = await fetch(url)
    const data = await res.json()
    setLoading(false)
    if (!res.ok) setError(data.error ?? 'Error')
    else setResult(data)
  }

  useEffect(() => { browse() }, [])

  const isRoot = !result?.path

  // Build breadcrumb segments from path
  const breadcrumbs: { label: string; path: string }[] = []
  if (result?.path) {
    const sep = result.path.includes('\\') ? '\\' : '/'
    const parts = result.path.split(/[\\/]/).filter(Boolean)
    if (sep === '\\') {
      let acc = ''
      parts.forEach((p, i) => {
        acc = i === 0 ? `${p}\\` : `${acc}${p}\\`
        breadcrumbs.push({ label: p, path: acc })
      })
    } else {
      let acc = '/'
      parts.forEach((p) => {
        acc = `${acc}${p}/`
        breadcrumbs.push({ label: p, path: acc })
      })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg flex flex-col"
        style={{ maxHeight: '80vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-sm">{t('title')}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Breadcrumb */}
        <div className="px-4 py-2 border-b border-border bg-secondary/30 flex items-center gap-0.5 flex-wrap min-h-[36px]">
          {isRoot ? (
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <HardDrive className="w-3 h-3" />
              {t('drives')}
            </span>
          ) : (
            <>
              <button
                onClick={() => browse()}
                className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                title={t('drives')}
              >
                <HardDrive className="w-3 h-3" />
              </button>
              {breadcrumbs.map((bc, i) => (
                <span key={bc.path} className="flex items-center gap-0.5">
                  <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
                  <button
                    onClick={() => i < breadcrumbs.length - 1 && browse(bc.path)}
                    className={`text-xs px-0.5 rounded transition-colors ${
                      i === breadcrumbs.length - 1
                        ? 'text-foreground font-medium cursor-default'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {bc.label}
                  </button>
                </span>
              ))}
            </>
          )}
        </div>

        {/* Directory listing */}
        <div className="flex-1 overflow-y-auto p-2 min-h-0">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {error && (
            <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded px-3 py-2 m-1">
              {error}
            </p>
          )}
          {!loading && !error && result && (
            result.entries.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">{t('noSubfolders')}</p>
            ) : (
              <div className="space-y-0.5">
                {result.parent !== null && (
                  <button
                    onClick={() => browse(result.parent ?? undefined)}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md hover:bg-accent transition-colors text-left text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="text-xs">..</span>
                  </button>
                )}
                {result.entries.map((entry) => (
                  <button
                    key={entry.path}
                    onClick={() => browse(entry.path)}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md hover:bg-accent transition-colors text-left group"
                  >
                    <Folder className="w-3.5 h-3.5 flex-shrink-0 text-yellow-500/60 group-hover:text-yellow-500 transition-colors" />
                    <span className="text-xs text-foreground/80 group-hover:text-foreground truncate">{entry.name}</span>
                    <ChevronRight className="w-3 h-3 text-muted-foreground/30 ml-auto flex-shrink-0 group-hover:text-muted-foreground transition-colors" />
                  </button>
                ))}
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-4 py-3 border-t border-border bg-secondary/20">
          <span className="text-xs text-muted-foreground font-mono truncate flex-1 min-w-0">
            {result?.path || '—'}
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-md bg-secondary hover:bg-accent transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              onClick={() => result?.path && onSelect(result.path)}
              disabled={!result?.path}
              className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {t('select')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
