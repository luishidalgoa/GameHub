/**
 * GET /api/admin/library-issues
 * Filas de la biblioteca que la web afirma y no puede sostener.
 *
 * OJO: el middleware protege /api/admin por LISTA BLANCA, no por prefijo. Esta
 * ruta esta registrada ahi a proposito, porque devuelve rutas de fichero de
 * toda la biblioteca.
 */
import { NextResponse } from 'next/server'
import { findLibraryIssues } from '@/lib/library-issues'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    return NextResponse.json(await findLibraryIssues())
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Check failed' },
      { status: 500 },
    )
  }
}
