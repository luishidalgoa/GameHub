import { PrismaClient } from '@prisma/client'

// Override the db singleton for the standalone script
;(global as { prisma?: PrismaClient }).prisma = new PrismaClient()

import { runScan } from '../src/lib/scanner'
import { scanBus } from '../src/lib/scanner/events'

scanBus.on('scan', (event) => {
  if (event.type === 'file_found') {
    const flag = event.isNew ? '[NEW]' : '[UPD]'
    console.log(`  ${flag} ${event.filePath?.split(/[\\/]/).pop()}`)
  } else {
    console.log(JSON.stringify(event))
  }
})

runScan('cli')
  .then((logId) => {
    console.log(`\nScan log ID: ${logId}`)
    process.exit(0)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
