'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Download, Clock, Users, CheckCircle, XCircle, Loader2 } from 'lucide-react'

interface QueueState {
  token: string
  status: 'waiting' | 'ready' | 'downloading' | 'done' | 'expired'
  position: number
  expiresAt?: number
  gameId?: number
  dlcId?: number
  redirectUrl?: string
  shortenerPending?: boolean
}

export default function QueuePage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [state, setState] = useState<QueueState | null>(null)
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState<number | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [redirectedToAd, setRedirectedToAd] = useState(false) // <-- Control de redirección única

  const poll = useCallback(async () => {
    const res = await fetch(`/api/queue/${token}`)
    if (!res.ok) {
      setError('Token not found or expired')
      return
    }
    const data: QueueState = await res.json()
    setState(data)

    if (data.expiresAt) {
      setCountdown(Math.max(0, Math.round((data.expiresAt - Date.now()) / 1000)))
    }
  }, [token])

  // Initial load from sessionStorage (set by the download button)
  useEffect(() => {
    poll()
  }, [poll])

  // Poll every 2s while waiting
  useEffect(() => {
    if (!state || state.status === 'done' || state.status === 'expired') return

    const interval = setInterval(poll, 2000)
    return () => clearInterval(interval)
  }, [state, poll])

  // Countdown timer for "ready" state
  useEffect(() => {
    if (state?.status !== 'ready') return
    const t = setInterval(() => {
      setCountdown((c) => (c !== null && c > 0 ? c - 1 : 0))
    }, 1000)
    return () => clearInterval(t)
  }, [state?.status])

  const startDownload = useCallback(() => {
    if (!state || state.status !== 'ready' || redirectedToAd) return

    // If shortener is still pending (API failed), wait — poll will retry
    if (state.shortenerPending) return

    if (state.redirectUrl) {
      setRedirectedToAd(true)
      window.location.href = state.redirectUrl
      return
    }

    // Localhost fallback: direct download (no shortener)
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      setDownloading(true)
      const url = state.dlcId
        ? `/api/download/dlc/${state.dlcId}?token=${token}`
        : `/api/download/${state.gameId}?token=${token}`
      const a = document.createElement('a')
      a.href = url
      a.click()
      setTimeout(() => { setDownloading(false); poll() }, 3000)
    }
  }, [state, token, poll, redirectedToAd])

  // Auto-start download when ready
  useEffect(() => {
    if (state?.status === 'ready' && !downloading && !redirectedToAd) {
      startDownload()
    }
  }, [state?.status, downloading, redirectedToAd, startDownload])

  if (error) {
    return (
      <QueueCard icon={<XCircle className="w-12 h-12 text-destructive" />} title="Token expired or not found">
        <p className="text-sm text-muted-foreground mt-2">
          This download link has expired. Go back and request a new download.
        </p>
        <button
          onClick={() => router.back()}
          className="mt-4 px-4 py-2 bg-secondary rounded-md text-sm hover:bg-accent transition-colors"
        >
          Go back
        </button>
      </QueueCard>
    )
  }

  if (!state) {
    return (
      <QueueCard icon={<Loader2 className="w-12 h-12 text-muted-foreground animate-spin" />} title="Connecting…">
      </QueueCard>
    )
  }

  if (state.status === 'waiting') {
    return (
      <QueueCard
        icon={<Clock className="w-12 h-12 text-amber-400" />}
        title="You're in the queue"
      >
        <div className="mt-6 flex items-center justify-center">
          <div className="text-6xl font-bold tabular-nums text-amber-400">
            #{state.position}
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-3">
          Position in queue. The download will start automatically when it's your turn.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Checking every 2 seconds…
        </div>
      </QueueCard>
    )
  }

  if (state.status === 'ready' || state.status === 'downloading') {
    return (
      <QueueCard
        icon={<Download className={`w-12 h-12 ${state.shortenerPending ? 'text-amber-400' : 'text-green-400 animate-bounce'}`} />}
        title={state.shortenerPending ? 'Preparing your link…' : 'Your download is starting!'}
      >
        <p className="text-sm text-muted-foreground mt-2">
          {state.shortenerPending
            ? 'Connecting to the download provider, please wait…'
            : 'The file is being sent to your browser now.'}
        </p>
        {countdown !== null && countdown > 0 && (
          <p className="text-xs text-amber-400 mt-3">
            This link expires in {countdown}s if the download doesn't start.
          </p>
        )}
        <button
          onClick={startDownload}
          className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-md text-sm font-medium transition-colors"
        >
          <Download className="w-4 h-4" />
          Download manually
        </button>
      </QueueCard>
    )
  }

  if (state.status === 'done') {
    return (
      <QueueCard
        icon={<CheckCircle className="w-12 h-12 text-green-400" />}
        title="Download complete"
      >
        <p className="text-sm text-muted-foreground mt-2">
          Your file has been sent. Check your downloads folder.
        </p>
        <button
          onClick={() => router.push('/')}
          className="mt-4 px-4 py-2 bg-secondary rounded-md text-sm hover:bg-accent transition-colors"
        >
          Back to library
        </button>
      </QueueCard>
    )
  }

  return (
    <QueueCard icon={<XCircle className="w-12 h-12 text-destructive" />} title="Token expired">
      <p className="text-sm text-muted-foreground mt-2">
        You didn't claim the download in time. Please try again.
      </p>
      <button
        onClick={() => router.back()}
        className="mt-4 px-4 py-2 bg-secondary rounded-md text-sm hover:bg-accent transition-colors"
      >
        Go back
      </button>
    </QueueCard>
  )
}

function QueueCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children?: React.ReactNode
}) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-card border border-border rounded-2xl p-10 max-w-sm w-full text-center shadow-xl">
        <div className="flex justify-center mb-4">{icon}</div>
        <h1 className="text-xl font-bold">{title}</h1>
        {children}
      </div>
    </div>
  )
}