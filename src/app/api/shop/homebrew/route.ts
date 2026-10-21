/**
 * GET /api/shop/homebrew
 *
 * Lista de repos de GitHub con homebrew para la pestana Homebrew de la app de
 * Switch. Son metadatos: los binarios los sirve GitHub, no nosotros.
 *
 * Response shape:
 *   version – formato de la respuesta; sube si cambia la forma
 *   repos   – [{ repo: "owner/name", url: "https://github.com/owner/name" }]
 */
import { NextResponse } from 'next/server'
import { guardShopRequest } from '@/lib/shop-auth'
import { validHomebrewRepos } from '@/lib/homebrew-repos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  const denied = await guardShopRequest(req)
  if (denied) return denied

  const repos = validHomebrewRepos().map((repo) => ({
    repo,
    url: `https://github.com/${repo}`,
  }))
  return NextResponse.json({ version: 1, repos })
}
