import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: bigint | number): string {
  const n = typeof bytes === 'bigint' ? Number(bytes) : bytes
  if (n === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(n) / Math.log(k))
  return `${parseFloat((n / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export function toSortTitle(title: string): string {
  return title
    .replace(/^(The |A |An )/i, '')
    .trim()
    .toLowerCase()
}

// Region/language parsing moved to `@/lib/rom-tags` (parseRomTags / extractRegion),
// which understands multi-region and language tags. Imported there as needed.

export function cleanTitle(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
