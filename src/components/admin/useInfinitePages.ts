'use client'

import { useEffect, useRef } from 'react'
import useSWRInfinite from 'swr/infinite'

// The admin's infinite lists: one page per request, the next page when the reader
// reaches the end of what is loaded. Any list endpoint that answers
// { items, total, hasMore } for ?page=N works with it.

export interface PageResult<T> {
  items: T[]
  total: number
  hasMore: boolean
}

const SENTINEL_PX = 480

function fetchPage<T>(url: string): Promise<PageResult<T>> {
  return fetch(url).then(async r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json() as Promise<PageResult<T>>
  })
}

export function useInfinitePages<T>({ url, query, initialSize = 1 }: {
  url: string
  /** Filters and sort as a query string, without the page. */
  query: string
  /** How many pages to show first: more than one when a saved position is restored. */
  initialSize?: number
}) {
  const getKey = (index: number, prev: PageResult<T> | null) => {
    if (prev && !prev.hasMore) return null
    const qs = new URLSearchParams(query)
    qs.set('page', String(index + 1))
    return `${url}?${qs.toString()}`
  }

  const swr = useSWRInfinite<PageResult<T>>(getKey, fetchPage<T>, {
    revalidateFirstPage: false,
    revalidateOnFocus: false,
    initialSize,
  })
  const { data, setSize, isValidating } = swr

  const items: T[] = data ? data.flatMap(p => p.items) : []
  const total = data?.[0]?.total ?? null
  const hasMore = data ? data[data.length - 1].hasMore : false

  // Next page when the sentinel comes near the bottom of the screen.
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && hasMore && !isValidating) setSize(s => s + 1) },
      { rootMargin: `${SENTINEL_PX}px` },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasMore, isValidating, setSize])

  return {
    items,
    total,
    hasMore,
    loaded: data,
    size: swr.size,
    isLoading: swr.isLoading,
    isValidating,
    failed: swr.error != null,
    mutate: swr.mutate,
    sentinelRef,
  }
}
