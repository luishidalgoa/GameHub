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

export function extractRegion(fileName: string): string | null {
  const m = fileName.match(/\((USA|U|Europe|E|Japan|J|World|W|Spain|S)\)/i)
  if (!m) return null
  const map: Record<string, string> = {
    usa: 'USA', u: 'USA',
    europe: 'EUR', e: 'EUR',
    japan: 'JPN', j: 'JPN',
    world: 'World', w: 'World',
    spain: 'ESP', s: 'ESP',
  }
  return map[m[1].toLowerCase()] ?? m[1].toUpperCase()
}

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
