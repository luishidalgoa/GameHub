export interface ScanProgress {
  type: string
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
