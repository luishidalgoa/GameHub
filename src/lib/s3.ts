import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { db } from './db'

export interface S3Config {
  internalEndpoint: string
  publicEndpoint:   string
  accessKey:        string
  secretKey:        string
  bucketName:       string
  region:           string
}

// Env-var fallbacks — overridden by DB settings when present
const ENV_DEFAULTS: S3Config = {
  internalEndpoint: process.env.S3_ENDPOINT_INTERNO ?? 'http://minio:9000',
  publicEndpoint:   process.env.S3_ENDPOINT_PUBLICO ?? '',
  accessKey:        process.env.S3_ACCESS_KEY        ?? '',
  secretKey:        process.env.S3_SECRET_KEY        ?? '',
  bucketName:       process.env.S3_BUCKET_NAME       ?? 'gamehub',
  region:           process.env.S3_REGION            ?? 'us-east-1',
}

const DB_KEYS = [
  's3_endpoint_interno',
  's3_endpoint_publico',
  's3_access_key',
  's3_secret_key',
  's3_bucket_name',
  's3_region',
] as const

/** Read S3 config: DB values take priority over env-var fallbacks. */
export async function getS3Config(): Promise<S3Config> {
  const rows = await db.setting.findMany({ where: { key: { in: [...DB_KEYS] } } })
  const m: Record<string, string> = {}
  rows.forEach(r => { m[r.key] = r.value })
  return {
    internalEndpoint: m['s3_endpoint_interno'] || ENV_DEFAULTS.internalEndpoint,
    publicEndpoint:   m['s3_endpoint_publico'] || ENV_DEFAULTS.publicEndpoint,
    accessKey:        m['s3_access_key']        || ENV_DEFAULTS.accessKey,
    secretKey:        m['s3_secret_key']        || ENV_DEFAULTS.secretKey,
    bucketName:       m['s3_bucket_name']       || ENV_DEFAULTS.bucketName,
    region:           m['s3_region']            || ENV_DEFAULTS.region,
  }
}

/** Create an S3Client pointed at the INTERNAL endpoint (backend use only). */
export function makeS3Client(config: S3Config): S3Client {
  return new S3Client({
    endpoint:       config.internalEndpoint,
    region:         config.region,
    credentials:    { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
    forcePathStyle: true, // required for MinIO
  })
}

/**
 * Resolve a stored coverPath value to a public-facing URL.
 *
 *  - null / undefined         → null
 *  - already http/https URL   → return as-is (external cover like coverUrl)
 *  - starts with /covers/     → return as-is (legacy local path, dev-only)
 *  - S3 key (e.g. covers/…)   → build full public URL
 */
export function resolveCoverPath(
  coverPath: string | null | undefined,
  config: S3Config,
): string | null {
  if (!coverPath) return null
  if (coverPath.startsWith('http://') || coverPath.startsWith('https://')) return coverPath
  if (coverPath.startsWith('/covers/')) return coverPath // legacy local
  const base = config.publicEndpoint.replace(/\/$/, '')
  return `${base}/${config.bucketName}/${coverPath}`
}

/** Convenience: resolve a single game's cover (prefers coverPath over coverUrl). */
export function resolveGameCover<T extends { coverPath: string | null; coverUrl: string | null }>(
  game: T,
  config: S3Config,
): string | null {
  return resolveCoverPath(game.coverPath, config) ?? game.coverUrl ?? null
}

// ── S3 operations ─────────────────────────────────────────────────────────────

async function objectExists(client: S3Client, bucket: string, key: string): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return true
  } catch {
    return false
  }
}

export async function uploadToS3(
  buffer:      Buffer,
  key:         string,
  contentType  = 'image/webp',
  config?:     S3Config,
): Promise<void> {
  const cfg    = config ?? await getS3Config()
  const client = makeS3Client(cfg)
  await client.send(new PutObjectCommand({
    Bucket:      cfg.bucketName,
    Key:         key,
    Body:        buffer,
    ContentType: contentType,
  }))
}

/**
 * Upload buffer as both display and original.
 * The original is only written once (preserved across crop adjustments).
 */
export async function uploadCoverToS3(
  buffer:      Buffer,
  key:         string,
  originalKey: string,
  config?:     S3Config,
): Promise<void> {
  const cfg    = config ?? await getS3Config()
  const client = makeS3Client(cfg)
  const bucket = cfg.bucketName

  const alreadyHasOriginal = await objectExists(client, bucket, originalKey)

  if (!alreadyHasOriginal) {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: originalKey, Body: buffer, ContentType: 'image/webp' }))
  }
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: 'image/webp' }))
}

export async function deleteFromS3(key: string, config?: S3Config): Promise<void> {
  if (!key || key.startsWith('/') || key.startsWith('http')) return
  const cfg    = config ?? await getS3Config()
  const client = makeS3Client(cfg)
  try {
    await client.send(new DeleteObjectCommand({ Bucket: cfg.bucketName, Key: key }))
  } catch { /* ignore missing objects */ }
}
