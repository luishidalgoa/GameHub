import type { PrismaClient } from '@prisma/client'

/**
 * Merges companies into another (#143): their games, aliases and sub-companies move to the
 * kept company, each duplicate's key becomes an alias of the kept one, and the duplicates are
 * removed. A name the games still carry then resolves to the kept company.
 */
export async function mergeCompanies(client: PrismaClient, from: number | number[], intoId: number): Promise<{ games: number; aliases: number }> {
  const fromIds = [...new Set(Array.isArray(from) ? from : [from])]
  if (fromIds.includes(intoId)) throw new Error('same company')
  return client.$transaction(async tx => {
    const origins = await tx.company.findMany({ where: { id: { in: fromIds } }, select: { id: true, key: true } })
    const into = await tx.company.findUnique({ where: { id: intoId }, select: { id: true, parentId: true } })
    if (!into || origins.length !== fromIds.length) throw new Error('company not found')

    const published = await tx.game.updateMany({ where: { publisherCompanyId: { in: fromIds } }, data: { publisherCompanyId: intoId } })
    const developed = await tx.game.updateMany({ where: { developerCompanyId: { in: fromIds } }, data: { developerCompanyId: intoId } })
    const aliases = await tx.companyAlias.updateMany({ where: { companyId: { in: fromIds } }, data: { companyId: intoId } })
    for (const origin of origins) {
      await tx.companyAlias.upsert({
        where: { key: origin.key },
        update: { companyId: intoId },
        create: { key: origin.key, companyId: intoId },
      })
    }
    // Sub-companies of the duplicates now belong to the kept one; the kept one never belongs to itself.
    await tx.company.updateMany({ where: { parentId: { in: fromIds }, id: { notIn: fromIds } }, data: { parentId: intoId } })
    if (into.parentId !== null && fromIds.includes(into.parentId)) {
      await tx.company.update({ where: { id: intoId }, data: { parentId: null } })
    }
    await tx.company.deleteMany({ where: { id: { in: fromIds } } })
    return { games: published.count + developed.count, aliases: aliases.count }
  })
}

/**
 * Sets (or clears, with null) the company that the given companies belong to. Refuses a loop:
 * a company cannot belong to itself, nor to one of its own sub-companies.
 */
export async function setOwner(client: PrismaClient, companyIds: number[], ownerId: number | null): Promise<{ updated: number }> {
  const ids = [...new Set(companyIds)]
  if (ids.length === 0) return { updated: 0 }
  return client.$transaction(async tx => {
    if (ownerId !== null) {
      if (ids.includes(ownerId)) throw new Error('a company cannot belong to itself')
      const owner = await tx.company.findUnique({ where: { id: ownerId }, select: { parentId: true } })
      if (!owner) throw new Error('owner not found')
      // Walk up from the owner: if any company above it is one being moved, the move would make a loop.
      let above = owner.parentId
      const seen = new Set<number>()
      while (above !== null && !seen.has(above)) {
        if (ids.includes(above)) throw new Error('that would make a loop of owners')
        seen.add(above)
        above = (await tx.company.findUnique({ where: { id: above }, select: { parentId: true } }))?.parentId ?? null
      }
    }
    const result = await tx.company.updateMany({ where: { id: { in: ids } }, data: { parentId: ownerId } })
    return { updated: result.count }
  })
}
