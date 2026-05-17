/**
 * MinIO connection test
 * Usage: node scripts/test-minio.mjs
 *
 * Reads S3 config from the DB (same source as the app), then:
 *   1. Uploads a tiny text object  →  gamehub/test-connection.txt
 *   2. Checks it exists (HeadObject)
 *   3. Deletes it
 *   4. Prints result and resolved public URL
 */

import { PrismaClient } from '@prisma/client'
import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

const db = new PrismaClient()

async function getConfig() {
  const rows = await db.setting.findMany({
    where: { key: { in: ['s3_endpoint_interno','s3_endpoint_publico','s3_access_key','s3_secret_key','s3_bucket_name','s3_region'] } },
  })
  const m = Object.fromEntries(rows.map(r => [r.key, r.value]))
  return {
    internalEndpoint: m['s3_endpoint_interno'] || process.env.S3_ENDPOINT_INTERNO || 'http://minio:9000',
    publicEndpoint:   m['s3_endpoint_publico'] || process.env.S3_ENDPOINT_PUBLICO || '',
    accessKey:        m['s3_access_key']        || process.env.S3_ACCESS_KEY        || '',
    secretKey:        m['s3_secret_key']        || process.env.S3_SECRET_KEY        || '',
    bucketName:       m['s3_bucket_name']       || process.env.S3_BUCKET_NAME       || 'gamehub',
    region:           m['s3_region']            || process.env.S3_REGION            || 'us-east-1',
  }
}

async function run() {
  const cfg = await getConfig()

  console.log('\n── MinIO config ──────────────────────────────────────────')
  console.log('  Internal endpoint :', cfg.internalEndpoint)
  console.log('  Public endpoint   :', cfg.publicEndpoint  || '(not set)')
  console.log('  Bucket            :', cfg.bucketName)
  console.log('  Region            :', cfg.region)
  console.log('  Access key        :', cfg.accessKey       || '(not set)')
  console.log('  Secret key        :', cfg.secretKey ? '***' : '(not set)')
  console.log('──────────────────────────────────────────────────────────\n')

  if (!cfg.accessKey || !cfg.secretKey) {
    console.error('✗  Access key or secret key is empty — configure them in Admin → Settings → S3 / MinIO Storage')
    process.exit(1)
  }

  const client = new S3Client({
    endpoint:       cfg.internalEndpoint,
    region:         cfg.region,
    credentials:    { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
    forcePathStyle: true,
  })

  const TEST_KEY = 'test-connection.txt'
  const bucket   = cfg.bucketName

  // 1. Upload
  process.stdout.write('1. Uploading test object ... ')
  try {
    await client.send(new PutObjectCommand({
      Bucket:      bucket,
      Key:         TEST_KEY,
      Body:        Buffer.from('GameHub MinIO connection test'),
      ContentType: 'text/plain',
    }))
    console.log('OK')
  } catch (err) {
    console.log('FAILED')
    console.error('\n✗  Upload error:', err.message)
    process.exit(1)
  }

  // 2. Verify exists
  process.stdout.write('2. Verifying object exists ... ')
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: TEST_KEY }))
    console.log('OK')
  } catch (err) {
    console.log('FAILED')
    console.error('\n✗  HeadObject error:', err.message)
    process.exit(1)
  }

  // 3. Delete
  process.stdout.write('3. Deleting test object   ... ')
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: TEST_KEY }))
    console.log('OK')
  } catch (err) {
    console.log('FAILED (non-fatal)')
    console.warn('   Warning:', err.message)
  }

  // 4. Public URL preview
  if (cfg.publicEndpoint) {
    const publicUrl = `${cfg.publicEndpoint.replace(/\/$/, '')}/${bucket}/covers/switch/1.webp`
    console.log(`\n✓  Connection successful!`)
    console.log(`   Cover URL example: ${publicUrl}`)
  } else {
    console.log(`\n✓  Connection successful!  (Public endpoint not set — covers won't be visible in browser)`)
  }
}

run()
  .catch(err => { console.error('\n✗  Unexpected error:', err); process.exit(1) })
  .finally(() => db.$disconnect())
