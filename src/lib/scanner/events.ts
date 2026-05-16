import { EventEmitter } from 'events'

export type ScanEventType =
  | 'scan_start'
  | 'platform_start'
  | 'file_found'
  | 'platform_done'
  | 'scan_complete'
  | 'scan_error'

export interface ScanEvent {
  type: ScanEventType
  platform?: string
  filePath?: string
  isNew?: boolean
  count?: number
  total?: number
  added?: number
  updated?: number
  stale?: number
  message?: string
  logId?: number
}

// Use globalThis so the same EventEmitter instance is shared across
// Next.js route handler bundles (same issue as globalThis download queue).
const g = globalThis as typeof globalThis & { __scanBus?: EventEmitter }
if (!g.__scanBus) {
  g.__scanBus = new EventEmitter()
  g.__scanBus.setMaxListeners(50)
}

export const scanBus: EventEmitter = g.__scanBus
