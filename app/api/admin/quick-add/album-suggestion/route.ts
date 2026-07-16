/**
 * POST /api/admin/quick-add/album-suggestion
 *
 * Atskiras endpoint'as albumo pasiūlymui (MusicBrainz → Apple Music fallback,
 * žr. lib/album-lookup.ts) — SĄMONINGAI atskirtas nuo `/api/admin/quick-add`
 * preview'o (2026-07-16, Edvardo pastaba: preview'as per ilgai užtrukdavo
 * laukiant kelių sekvencinių išorinių užklausų). Klientas kviečia šitą IŠ
 * KARTO po greito preview'o, asinchroniškai — UI nesulaikomas, admin gali
 * tuo metu redaguoti/commit'inti arba pradėti kitą quick-add'ą.
 *
 * Body: { artist_name: string, title: string }
 * →     { ok: true, suggestion: AlbumSuggestion | null, is_single: boolean }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { findAlbumSuggestion } from '@/lib/album-lookup'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user.role as string) || '')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const artistName: string = typeof body.artist_name === 'string' ? body.artist_name.trim() : ''
  const title: string = typeof body.title === 'string' ? body.title.trim() : ''
  if (!artistName || !title) {
    return NextResponse.json({ ok: false, error: 'Trūksta artist_name/title' }, { status: 400 })
  }

  try {
    const { suggestion, is_single } = await findAlbumSuggestion(artistName, title)
    return NextResponse.json({ ok: true, suggestion, is_single })
  } catch (e: any) {
    // Best-effort endpoint'as — klaida čia niekad neturi laužyti UI, tiesiog
    // grąžinam "nieko nerasta" su 200, kad klientas ramiai tęstų be badge'o.
    return NextResponse.json({ ok: true, suggestion: null, is_single: false, warning: String(e?.message || e).slice(0, 200) })
  }
}
