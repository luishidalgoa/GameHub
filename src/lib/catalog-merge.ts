import type { PrismaClient } from '@prisma/client'

/**
 * Merges one company into another (#143): its games and its aliases move to the kept
 * company, the duplicate's key becomes an alias of the kept one, and the duplicate is
 * removed. A name the games still carry then resolves to the kept company.
 */
export async function mergeCompanies(client: PrismaClient, fromId: number, intoId: number): Promise<{ games: number; aliases: number }> {
  if (fromId === intoId) throw new Error('same company')
  return client.$transaction(async tx => {
    const from = await tx.company.findUnique({ where: { id: fromId }, select: { key: true } })
    const into = await tx.company.findUnique({ where: { id: intoId }, select: { id: true } })
    if (!from || !into) throw new Error('company not found')

    const published = await tx.game.updateMany({ where: { publisherCompanyId: fromId }, data: { publisherCompanyId: intoId } })
    const developed = await tx.game.updateMany({ where: { developerCompanyId: fromId }, data: { developerCompanyId: intoId } })
    const aliases = await tx.companyAlias.updateMany({ where: { companyId: fromId }, data: { companyId: intoId } })
    await tx.companyAlias.upsert({
      where: { key: from.key },
      update: { companyId: intoId },
      create: { key: from.key, companyId: intoId },
    })
    await tx.company.delete({ where: { id: fromId } })
    return { games: published.count + developed.count, aliases: aliases.count }
  })
}
