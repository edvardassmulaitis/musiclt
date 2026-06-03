/**
 * POST /api/admin/artist-import
 *
 * Atlikėjo JSON importas (žr. lib/artist-import.ts + spec).
 *
 * Request body:
 * {
 *   json:        string | object   // įklijuotas JSON (artist_patch, links, ...)
 *   apply?:      boolean           // false (default) = preview, true = apply
 *   artist_id?:  number            // pasirinktas target kai keli match'ai;
 *                                  //   0 = priverstinai kurti naują
 * }
 *
 * Response (preview): { ok, preview }
 * Response (apply):   { ok, summary }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { validateImportJson, buildPreview, applyImport } from '@/lib/artist-import'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Neteisingas request body' }, { status: 400 })
  }

  const { json, apply, artist_id } = body || {}
  const validation = validateImportJson(json)
  if (!validation.ok || !validation.payload) {
    return NextResponse.json({ error: 'Validacijos klaidos', errors: validation.errors }, { status: 400 })
  }

  const sb = createAdminClient()
  const forceArtistId = artist_id === undefined ? undefined : Number(artist_id)

  try {
    if (apply) {
      const summary = await applyImport(sb, validation.payload, {
        forceArtistId,
        importedBy: (session.user as any).email || (session.user as any).id || null,
      })
      return NextResponse.json({ ok: true, summary })
    }
    const preview = await buildPreview(sb, validation.payload, forceArtistId)
    return NextResponse.json({ ok: true, preview })
  } catch (e: any) {
    console.error('[artist-import] error:', e?.message)
    return NextResponse.json({ error: e?.message || 'Serverio klaida' }, { status: 500 })
  }
}
