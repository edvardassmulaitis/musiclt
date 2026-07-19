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
  const SEL = `
    id, source_url, artist_raw, album_title, album_wiki_link,
    release_year, release_month, release_day, genres_raw, label_raw,
    matched_artist_id, match_score, status, created_at, rescanned_at,
    preview_payload, preview_at,
    matched_artist:artists!wiki_album_candidates_matched_artist_id_fkey(id, name, slug, cover_image_url, score)
  `

  // Ne-pending būsenoms — paprastas sąrašas.
  if (status !== 'pending') {
    const { data, error } = await supabase.from('wiki_album_candidates').select(SEL).eq('status', status).limit(limit)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ candidates: data || [], total: (data || []).length })
  }

  // ── Pending: 2 fetch'ai (matched + unmatched), kad Tier 1 visada būtų viršuje
  //    (matched'ų nedaug — tik katalogo atlikėjai; unmatched gali būti daug). ──
  const [{ data: matchedRows }, { data: unmatchedRows }] = await Promise.all([
    supabase.from('wiki_album_candidates').select(SEL).eq('status', 'pending').not('matched_artist_id', 'is', null).limit(600),
    supabase.from('wiki_album_candidates').select(SEL).eq('status', 'pending').is('matched_artist_id', null).limit(400),
  ])
  const matched = (matchedRows || []) as any[]
  const unmatched = (unmatchedRows || []) as any[]

  // ── Dedupe matched prieš katalogą (albumas jau yra) → pažymim duplicate ──
  const artistIds = Array.from(new Set(matched.map(r => r.matched_artist_id).filter(Boolean)))
  const existing = new Set<string>()
  if (artistIds.length > 0) {
    const { data: albums } = await supabase.from('albums').select('artist_id, title').in('artist_id', artistIds)
    for (const a of (albums || []) as any[]) existing.add(`${a.artist_id}::${normalizeAlbumTitle(a.title || '')}`)
  }
  const dupIds: number[] = []
  const matchedKept = matched.filter(r => {
    const key = `${r.matched_artist_id}::${normalizeAlbumTitle(r.album_title || '')}`
    if (existing.has(key)) { dupIds.push(r.id); return false }
    return true
  })
  if (dupIds.length > 0) {
    supabase.from('wiki_album_candidates').update({ status: 'duplicate', reviewed_at: new Date().toISOString() }).in('id', dupIds).then(() => {})
  }

  const dateOf = (r: any) => (r.release_year || 0) * 10000 + (r.release_month || 0) * 100 + (r.release_day || 0)
  const scoreOf = (r: any) => (typeof r.matched_artist?.score === 'number' ? r.matched_artist.score : -1)
  const hasMb = (r: any) => { const p = r.preview_payload; return !!(p && (p.mb_release_id || p.source === 'musicbrainz' || p.source === 'apple' || p.source === 'wikipedia')) }

  // Tier: 1 matched · 2 unmatched+wiki · 3 unmatched+MB · 4 unmatched(tik data)
  const tierOf = (r: any): number => {
    if (r.matched_artist_id) return 1
    if (r.album_wiki_link) return 2
    if (hasMb(r)) return 3
    return 4
  }
  const withTier = (r: any) => ({ ...r, tier: tierOf(r) })

  // Tier 1 — pagal atlikėjo populiarumą (score) desc, tada data.
  matchedKept.sort((a, b) => (scoreOf(b) - scoreOf(a)) || (dateOf(b) - dateOf(a)))
  // Unmatched — pagal tier (2→3→4), tada data desc.
  unmatched.sort((a, b) => (tierOf(a) - tierOf(b)) || (dateOf(b) - dateOf(a)))

  const combined = [...matchedKept.map(withTier), ...unmatched.map(withTier)]
  return NextResponse.json({ candidates: combined.slice(0, limit), total: combined.length })
}
