import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

const KEYS = ['donate_kofi', 'donate_paypal', 'donate_bmac', 'donate_crypto', 'donate_message']

export async function GET() {
  const rows = await db.setting.findMany({ where: { key: { in: KEYS } } })
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return NextResponse.json({
    kofi:    map['donate_kofi']    ?? '',
    paypal:  map['donate_paypal']  ?? '',
    bmac:    map['donate_bmac']    ?? '',
    crypto:  map['donate_crypto']  ?? '',
    message: map['donate_message'] ?? '',
  })
}
