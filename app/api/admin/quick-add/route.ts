/**
 * POST /api/admin/quick-add
 *
 * Admin „greitas pridėjimas" iš vienos nuorodos. Body: { url }.
 *   - YouTube nuoroda  → sukuria dainą (atlikėjo auto-detect + enrich)
 *   - Wikipedia nuoroda → sukuria albumą iš Wiki (atlikėjas + tracklist)
 *
 * Tipas atpažįstamas automatiškai pagal URL. Vienas laukas, jokio papildomo
 * spaudymo — žr. components/AdminQuickAdd.tsx.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { detectUrlKind, quickAddTrack, quickAddAlbum } from '@/lib/quick-add'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user.role as string) || '')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const url: string = typeof body.url === 'string' ? body.url.trim() : ''
  if (!url) return NextResponse.json({ ok: false, error: 'Įvesk nuorodą' }, { status: 400 })

  const kind = detectUrlKind(url)
  if (kind === 'unknown') {
    return NextResponse.json({
      ok: false,
      kind: 'unknown',
      error: 'Nepalaikoma nuoroda. Įmesk YouTube (dainai) arba Wikipedia albumo (albumui) nuorodą.',
    }, { status: 400 })
  }

  const origin = req.nextUrl.origin

  try {
    const result = kind === 'track'
      ? await quickAddTrack(url, origin)
      : await quickAddAlbum(url)
    return NextResponse.json(result, { status: result.ok ? 200 : 422 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, kind, error: String(e?.message || e).slice(0, 300) }, { status: 500 })
  }
}
