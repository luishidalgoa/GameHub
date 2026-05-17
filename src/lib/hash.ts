import { createHash } from 'crypto'
import { createReadStream } from 'fs'

/** Computes the SHA-256 hex digest of a file by streaming it. Non-blocking. */
export function computeSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash   = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data',  (chunk) => hash.update(chunk))
    stream.on('end',   ()      => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}
