/**
 * POST /api/admin/quick-add
 *
 * Admin „greitas pridėjimas" iš vienos nuorodos. Dviejų žingsnių srautas:
 *   1) mode='preview' (default) — parsina nuorodą, NIEKO nesukuria, grąžina
 *      laukus, kuriuos admin gali pataisyti.
 *   2) mode='commit' — sukuria su (galimai pataisytomis) reikšmėmis.
 *
 * Body: { url, mode?, overrides? }
 *   - YouTube nuoroda  → daina
 *   - Wikipedia nuoroda → albumas
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  detectUrlKind,
  previewTrack, previewAlbum,
  commitTrack, commitAlbum,
  type TrackOverrides, type AlbumOverrides,
} from '@/lib/quick-add'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user.role as string) || '')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const url: string = typeof body.url === 'string' ? body.url.trim() : ''
  const mode: 'preview' | 'commit' = body.mode === 'commit' ? 'commit' : 'preview'
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
    if (mode === 'preview') {
      const result = kind === 'track' ? await previewTrack(url) : await previewAlbum(url)
      return NextResponse.json(result, { status: result.ok ? 200 : 422 })
    }

    // commit
    const ov = (body.overrides && typeof body.overrides === 'object') ? body.overrides : {}
    const result = kind === 'track'
      ? await commitTrack(url, origin, ov as TrackOverrides)
      : await commitAlbum(url, origin, ov as AlbumOverrides)
    return NextResponse.json(result, { status: result.ok ? 200 : 422 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, kind, error: String(e?.message || e).slice(0, 300) }, { status: 500 })
  }
}
