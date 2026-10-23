import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { kofiToDonation, parseKofiForm, tokenMatches } from '@/lib/donations/kofi'

export const dynamic = 'force-dynamic'

/**
 * Ko-fi → Donation. Ko-fi posts form-encoded `data=<json>`; the rules live in
 * src/lib/donations/kofi.ts. Public on purpose (Apache forwards everything):
 * the verification token is the only gate, so it is compared in constant time.
 *
 * Replies: 400 for a body we cannot read, 401 for a wrong token, 200 for every
 * payload we have judged (recorded, duplicate or skipped), 500 for a fault on
 * our side.
 */
export async function POST(req: Request) {
  try {
    const data = parseKofiForm(await req.text())
    if (!data) return NextResponse.json({ ok: false }, { status: 400 })

    const tokenSetting = await db.setting.findUnique({ where: { key: 'kofi_webhook_token' } })
    if (!tokenMatches(tokenSetting?.value, data.verification_token)) {
      console.warn('[kofi webhook] token mismatch')
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    const donation = kofiToDonation(data)
    if (!donation) return NextResponse.json({ ok: true, skipped: true })

    if (donation.externalId) {
      const exists = await db.donation.findUnique({ where: { externalId: donation.externalId } })
      if (exists) return NextResponse.json({ ok: true, duplicate: true })
    }

    try {
      await db.donation.create({ data: donation })
    } catch (err) {
      // Two deliveries of the same transaction can pass the lookup above at
      // once; the unique externalId makes the second insert fail. That is a
      // duplicate, not an error.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return NextResponse.json({ ok: true, duplicate: true })
      }
      throw err
    }

    // Only amount and currency: the donor's name and message stay out of logs.
    console.log(`[kofi webhook] recorded ${donation.amount} ${donation.currency}`)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[kofi webhook] error:', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
