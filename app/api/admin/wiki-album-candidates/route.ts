/**
 * GET /api/admin/wiki-album-candidates?status=pending — Wiki album scout kandidatų
 * sąrašas review UI'ui.
 *
 * 2026-07-18:
 *  - Sortinama pagal ATLIKĖJO populiarumą (artists.score desc, nulls last) — kad
 *    populiariausių atlikėjų albumai būtų viršuje, o menkai žinomi/be atlikėjo — dugne.
 *  - Išmetami (ir pažymimi 'duplicate') kandidatai, kurių albumas JAU yra kataloge
 *    (artist_id + title) — tokie neaktualūs (kaip su dainom).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { normalizeAlbumTitle } from '@/lib/album-title'

export const runtime = 'nodejs'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['editor', 'admin', 'super_admin'].includes((session.user.role as string) || '')) return null
  return session
}

export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || 'pending'
  const limit = parseInt(searchParams.get('limit') || '50', 10)

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('wiki_album_candidates')
    .select(`
      id, source_url, artist_raw, album_title, album_wiki_link,
      release_year, release_month, release_day, genres_raw, label_raw,
      matched_artist_id, match_score, status, created_at, rescanned_at,
      matched_artist:artists!wiki_album_candidates_matched_artist_id_fkey(id, name, slug, cover_image_url, score)
    `)
    .eq('status', status)
    .limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data || []) as any[]

  // ── Dedupe prieš katalogą: albumas jau egzistuoja (artist_id + title) → neaktualus ──
  const artistIds = Array.from(new Set(rows.map(r => r.matched_artist_id).filter(Boolean)))
  const existing = new Set<string>()
  if (status === 'pending' && artistIds.length > 0) {
    const { data: albums } = await supabase
      .from('albums')
      .select('artist_id, title')
      .in('artist_id', artistIds)
    for (const a of (albums || []) as any[]) existing.add(`${a.artist_id}::${normalizeAlbumTitle(a.title || '')}`)
  }
  const dupIds: number[] = []
  const kept = rows.filter(r => {
    if (status !== 'pending' || !r.matched_artist_id) return true
    const key = `${r.matched_artist_id}::${normalizeAlbumTitle(r.album_title || '')}`
    if (existing.has(key)) { dupIds.push(r.id); return false }
    return true
  })
  // Best-effort: pažymim rastus dublikatus, kad kitąkart nebeskaičiuotų/nerodytų.
  if (dupIds.length > 0) {
    supabase.from('wiki_album_candidates').update({ status: 'duplicate', reviewed_at: new Date().toISOString() }).in('id', dupIds).then(() => {})
  }

  // ── Sort: atlikėjo populiarumas (score) desc, nulls last; tada data desc ──
  const scoreOf = (r: any) => {
    const s = r.matched_artist?.score
    return typeof s === 'number' ? s : -1
  }
  const dateOf = (r: any) => (r.release_year || 0) * 10000 + (r.release_month || 0) * 100 + (r.release_day || 0)
  kept.sort((a, b) => (scoreOf(b) - scoreOf(a)) || (dateOf(b) - dateOf(a)))

  return NextResponse.json({ candidates: kept.slice(0, limit), total: kept.length })
}
