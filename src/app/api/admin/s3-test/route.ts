/**
 * GET /api/admin/s3-test
 * Admin-session protected.  Tests the current MinIO / S3 config end-to-end:
 *   1. Reads config from DB / env
 *   2. Tries a HeadBucket to verify credentials + bucket exists
 *   3. Writes a tiny test object and reads it back
 *   4. Deletes the test object
 *
 * Returns a JSON report so you can paste it when reporting issues.
 */
import { NextResponse }                            from 'next/server'
import { S3Client, HeadBucketCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getS3Config, makeS3Client }               from '@/lib/s3'
import { isAdminSession }                          from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const authenticated = await isAdminSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = await getS3Config()
  const safe   = {
    internalEndpoint: config.internalEndpoint,
    publicEndpoint:   config.publicEndpoint,
    bucketName:       config.bucketName,
    region:           config.region,
    accessKey:        config.accessKey ? `${config.accessKey.slice(0, 4)}…` : '(empty)',
    secretKey:        config.secretKey ? '(set)' : '(empty)',
  }

  const steps: Array<{ step: string; ok: boolean; detail?: string }> = []
  let client: S3Client | null = null

  try {
    client = makeS3Client(config)
    steps.push({ step: 'build S3 client', ok: true })
  } catch (err) {
    steps.push({ step: 'build S3 client', ok: false, detail: String(err) })
    return NextResponse.json({ config: safe, steps })
  }

  // ── 1. HeadBucket ────────────────────────────────────────────────────────────
  try {
    await client.send(new HeadBucketCommand({ Bucket: config.bucketName }))
    steps.push({ step: `HeadBucket "${config.bucketName}"`, ok: true })
  } catch (err) {
    steps.push({ step: `HeadBucket "${config.bucketName}"`, ok: false, detail: String(err) })
    return NextResponse.json({ config: safe, steps })
  }

  // ── 2. PutObject (tiny test file) ────────────────────────────────────────────
  const testKey  = 'gamehub-s3-test.txt'
  const testBody = Buffer.from(`gamehub-test-${Date.now()}`)
  try {
    await client.send(new PutObjectCommand({
      Bucket:      config.bucketName,
      Key:         testKey,
      Body:        testBody,
      ContentType: 'text/plain',
    }))
    steps.push({ step: 'PutObject (test write)', ok: true })
  } catch (err) {
    steps.push({ step: 'PutObject (test write)', ok: false, detail: String(err) })
    return NextResponse.json({ config: safe, steps })
  }

  // ── 3. GetObject ─────────────────────────────────────────────────────────────
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: config.bucketName, Key: testKey }))
    const body = await res.Body?.transformToString()
    steps.push({ step: 'GetObject (read back)', ok: true, detail: body?.slice(0, 60) })
  } catch (err) {
    steps.push({ step: 'GetObject (read back)', ok: false, detail: String(err) })
  }

  // ── 4. DeleteObject (cleanup) ────────────────────────────────────────────────
  try {
    await client.send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: testKey }))
    steps.push({ step: 'DeleteObject (cleanup)', ok: true })
  } catch (err) {
    steps.push({ step: 'DeleteObject (cleanup)', ok: false, detail: String(err) })
  }

  const allOk = steps.every((s) => s.ok)
  return NextResponse.json({ ok: allOk, config: safe, steps })
}
