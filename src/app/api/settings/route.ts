import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const settings = await db.setting.findMany()
  const map: Record<string, string> = {}
  settings.forEach((s) => { map[s.key] = s.value })
  return NextResponse.json(map)
}

export async function PUT(req: Request) {
  const body: Record<string, string> = await req.json()
  const ops = Object.entries(body).map(([key, value]) =>
    db.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    })
  )
  await Promise.all(ops)
  return NextResponse.json({ ok: true })
}
