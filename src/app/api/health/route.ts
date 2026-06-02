import { NextResponse } from 'next/server'
import { HeadBucketCommand } from '@aws-sdk/client-s3'
import { db } from '@/lib/db'
import { getS3Config, makeS3Client } from '@/lib/s3'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Check { name: string; ok: boolean; detail?: string }

/**
 * GET /api/health — lightweight status of the core dependencies. Public but
 * leaks no secrets (only ok/down booleans). Returns 200 when everything that
 * MUST work is up, 503 otherwise — so an uptime monitor can alert on it.
 *
 *   - db:    a trivial SQLite query (required)
 *   - minio: HeadBucket on the configured bucket (required for cover storage)
 *   - rawg:  whether a RAWG key is configured (optional — info only, never fails)
 */
export async function GET() {
  const checks: Check[] = []

  // ── DB (required) ──
  let dbOk = false
  try {
    await db.$queryRaw`SELECT 1`
    dbOk = true
    checks.push({ name: 'db', ok: true })
  } catch (err) {
    checks.push({ name: 'db', ok: false, detail: err instanceof Error ? err.message : 'error' })
  }

  // ── MinIO / S3 (required) ──
  let minioOk = false
  try {
    const cfg = await getS3Config()
    if (!cfg.accessKey || !cfg.secretKey) {
      checks.push({ name: 'minio', ok: false, detail: 'not configured' })
    } else {
      const client = makeS3Client(cfg)
      await client.send(new HeadBucketCommand({ Bucket: cfg.bucketName }))
      minioOk = true
      checks.push({ name: 'minio', ok: true })
    }
  } catch (err) {
    checks.push({ name: 'minio', ok: false, detail: err instanceof Error ? err.message : 'error' })
  }

  // ── RAWG key (optional — informational, does not affect status) ──
  try {
    const row = await db.setting.findUnique({ where: { key: 'rawg_api_key' } })
    const configured = Boolean(row?.value || process.env.RAWG_API_KEY)
    checks.push({ name: 'rawg', ok: configured, detail: configured ? 'configured' : 'not configured' })
  } catch {
    checks.push({ name: 'rawg', ok: false, detail: 'unknown' })
  }

  // Status is healthy only when the REQUIRED deps are up.
  const required = dbOk && minioOk
  const status = required ? 'ok' : 'degraded'

  return NextResponse.json(
    { status, checks, time: new Date().toISOString() },
    { status: required ? 200 : 503 },
  )
}
