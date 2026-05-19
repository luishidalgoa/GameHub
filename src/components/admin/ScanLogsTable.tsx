'use client'

import { useState } from 'react'
import { ScanLogModal } from './ScanLogModal'
import { ChevronRight } from 'lucide-react'

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

export function ScanLogsTable({ logs, labels }: Props) {
  const [openId, setOpenId] = useState<number | null>(null)

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="pb-2 pr-4 font-medium">{labels.date}</th>
              <th className="pb-2 pr-4 font-medium">{labels.duration}</th>
              <th className="pb-2 pr-4 font-medium">{labels.found}</th>
              <th className="pb-2 pr-4 font-medium text-green-500">{labels.added}</th>
              <th className="pb-2 pr-4 font-medium text-blue-500">{labels.updated}</th>
              <th className="pb-2 pr-4 font-medium text-amber-500">{labels.stale}</th>
              <th className="pb-2 w-6" />
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
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
