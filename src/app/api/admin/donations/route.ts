import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const [all, recent, byPlatform, byMonth] = await Promise.all([
    // Aggregate totals per currency
    db.donation.groupBy({
      by: ['currency'],
      _sum: { amount: true },
      _count: { id: true },
    }),

    // 50 most recent entries
    db.donation.findMany({
      orderBy: { receivedAt: 'desc' },
      take: 50,
    }),

    // Breakdown by platform (all time)
    db.donation.groupBy({
      by: ['platform', 'currency'],
      _sum: { amount: true },
      _count: { id: true },
    }),

    // Raw rows for monthly aggregation (last 6 months)
    db.donation.findMany({
      where: { receivedAt: { gte: sixMonthsAgo } },
      select: { amount: true, currency: true, receivedAt: true },
    }),
  ])

  // Build month buckets for the last 6 months
  const months: { label: string; total: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    const label = d.toLocaleDateString('en', { month: 'short', year: '2-digit' })
    const total = byMonth
      .filter((r) => {
        const rd = new Date(r.receivedAt)
        return rd.getFullYear() === d.getFullYear() && rd.getMonth() === d.getMonth()
      })
      .reduce((s, r) => s + r.amount, 0)
    months.push({ label, total: Math.round(total * 100) / 100 })
  }

  // This month total
  const now = new Date()
  const thisMonthTotal = byMonth
    .filter((r) => {
      const rd = new Date(r.receivedAt)
      return rd.getFullYear() === now.getFullYear() && rd.getMonth() === now.getMonth()
    })
    .reduce((s, r) => s + r.amount, 0)

  return NextResponse.json({ totals: all, recent, byPlatform, months, thisMonthTotal: Math.round(thisMonthTotal * 100) / 100 })
}

export async function POST(req: Request) {
  const body = await req.json()
  const { platform, amount, currency, note, fromName, receivedAt } = body
  if (!platform || !amount) {
    return NextResponse.json({ error: 'platform and amount are required' }, { status: 400 })
  }
  const donation = await db.donation.create({
    data: {
      platform,
      amount:     parseFloat(amount),
      currency:   currency ?? 'EUR',
      note:       note    || null,
      fromName:   fromName || null,
      receivedAt: receivedAt ? new Date(receivedAt) : new Date(),
      source:     'manual',
    },
  })
  return NextResponse.json(donation, { status: 201 })
}

export async function DELETE(req: Request) {
  const { id } = await req.json()
  await db.donation.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
