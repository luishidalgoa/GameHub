import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Ko-fi sends a POST with Content-Type: application/x-www-form-urlencoded
 * The body contains a single field "data" whose value is a JSON string.
 *
 * Expected JSON fields:
 *   verification_token, type, kofi_transaction_id, amount, currency,
 *   from_name, message, is_subscription_payment, timestamp
 */
export async function POST(req: Request) {
  try {
    const text = await req.text()
    const params = new URLSearchParams(text)
    const raw = params.get('data')
    if (!raw) return NextResponse.json({ ok: false }, { status: 400 })

    const data = JSON.parse(raw)

    // Verify token matches the one stored in admin settings
    const tokenSetting = await db.setting.findUnique({ where: { key: 'kofi_webhook_token' } })
    if (!tokenSetting?.value || tokenSetting.value !== data.verification_token) {
      console.warn('[kofi webhook] token mismatch')
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    // Only process Donation and Subscription types
    if (!['Donation', 'Subscription', 'Commission'].includes(data.type)) {
      return NextResponse.json({ ok: true, skipped: true })
    }

    const externalId: string = data.kofi_transaction_id ?? ''

    // Deduplicate by externalId
    if (externalId) {
      const exists = await db.donation.findUnique({ where: { externalId } })
      if (exists) return NextResponse.json({ ok: true, duplicate: true })
    }

    await db.donation.create({
      data: {
        platform:   'kofi',
        amount:     parseFloat(data.amount ?? '0'),
        currency:   (data.currency ?? 'EUR').toUpperCase(),
        note:       data.message || null,
        fromName:   data.from_name || null,
        receivedAt: data.timestamp ? new Date(data.timestamp) : new Date(),
        source:     'webhook',
        externalId: externalId || null,
      },
    })

    console.log(`[kofi webhook] recorded ${data.amount} ${data.currency} from ${data.from_name}`)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[kofi webhook] error:', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
