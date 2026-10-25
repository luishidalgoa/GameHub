'use client'

import { useState } from 'react'
import { ScanLogModal } from './ScanLogModal'
import { ChevronRight } from 'lucide-react'
import { nextSort, sortRows, type SortState } from '@/lib/admin-sort'

interface ScanLogRow {
  id:          number
  startedAt:   string
  finishedAt:  string | null
  gamesFound:  number
  gamesAdded:  number
  gamesUpdated: number
  gamesStale:  number
}

interface Props {
  logs: ScanLogRow[]
  labels: {
    date:     string
    duration: string
    found:    string
    added:    string
    updated:  string
    stale:    string
  }
}

type LogKey = 'date' | 'duration' | 'found' | 'added' | 'updated' | 'stale'

function durationSeconds(log: ScanLogRow): number | null {
  return log.finishedAt ? Math.round((new Date(log.finishedAt).getTime() - new Date(log.startedAt).getTime()) / 1000) : null
}

function logValue(log: ScanLogRow, key: LogKey): number | null {
  switch (key) {
    case 'date': return new Date(log.startedAt).getTime()
    case 'duration': return durationSeconds(log)
    case 'found': return log.gamesFound
    case 'added': return log.gamesAdded
    case 'updated': return log.gamesUpdated
    case 'stale': return log.gamesStale
  }
}

export function ScanLogsTable({ logs, labels }: Props) {
  const [openId, setOpenId] = useState<number | null>(null)
  const [sort, setSort] = useState<SortState<LogKey>>({ key: 'date', dir: 'desc' })
  const sorted = sortRows(logs, sort, logValue)
  const head = (key: LogKey, label: string, className: string) => (
    <th className={`pb-2 pr-4 font-medium ${className}`} aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => setSort(nextSort(sort, key))} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        <span aria-hidden="true" className="text-[10px]">{sort.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  )

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              {head('date', labels.date, '')}
              {head('duration', labels.duration, '')}
              {head('found', labels.found, '')}
              {head('added', labels.added, 'text-green-500')}
              {head('updated', labels.updated, 'text-blue-500')}
              {head('stale', labels.stale, 'text-amber-500')}
              <th className="pb-2 w-6" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((log) => {
              const duration = log.finishedAt
                ? `${Math.round((new Date(log.finishedAt).getTime() - new Date(log.startedAt).getTime()) / 1000)}s`
                : '—'
              return (
                <tr
                  key={log.id}
                  className="border-b border-border/50 last:border-0 hover:bg-muted/20 cursor-pointer transition-colors group"
                  onClick={() => setOpenId(log.id)}
                >
                  <td className="py-2 pr-4 text-muted-foreground">
                    {new Date(log.startedAt).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">{duration}</td>
                  <td className="py-2 pr-4">{log.gamesFound}</td>
                  <td className="py-2 pr-4 text-green-500">{log.gamesAdded}</td>
                  <td className="py-2 pr-4 text-blue-500">{log.gamesUpdated}</td>
                  <td className="py-2 pr-4 text-amber-500">{log.gamesStale}</td>
                  <td className="py-2">
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {openId !== null && (
        <ScanLogModal logId={openId} onClose={() => setOpenId(null)} />
      )}
    </>
  )
}
