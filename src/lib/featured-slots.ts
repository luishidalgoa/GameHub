import { db } from '@/lib/db'

/**
 * Deja el puesto `order` para `gameId`. Si lo ocupaba otro destacado, ese pasa al
 * puesto que tenía `gameId` (o queda automático si no tenía ninguno): así un
 * puesto nunca se repite y elegir uno ocupado rota los dos juegos.
 */
export async function claimFeaturedSlot(gameId: number, order: number | null): Promise<void> {
  if (order === null) return
  const [self, holder] = await Promise.all([
    db.game.findUnique({ where: { id: gameId }, select: { featuredOrder: true } }),
    db.game.findFirst({ where: { featuredOrder: order, isFeatured: true, id: { not: gameId } }, select: { id: true } }),
  ])
  if (!holder) return
  await db.game.update({ where: { id: holder.id }, data: { featuredOrder: self?.featuredOrder ?? null } })
}
