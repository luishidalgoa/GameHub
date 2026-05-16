import { PrismaClient } from '@prisma/client'
import { PLATFORM_CONFIGS } from '../src/lib/scanner/platforms'

const db = new PrismaClient()

async function main() {
  console.log('Seeding platforms…')

  for (const config of PLATFORM_CONFIGS) {
    const platform = await db.platform.upsert({
      where: { slug: config.slug },
      update: {
        name: config.name,
        scanPath: config.scanPath,
        extensions: config.extensions.join(','),
        scanMode: config.scanMode ?? 'flat',
        sortOrder: config.sortOrder,
      },
      create: {
        slug: config.slug,
        name: config.name,
        scanPath: config.scanPath,
        extensions: config.extensions.join(','),
        scanMode: config.scanMode ?? 'flat',
        sortOrder: config.sortOrder,
      },
    })
    console.log(`  ✓ ${platform.name} (${platform.slug})`)
  }

  console.log('Done.')
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
