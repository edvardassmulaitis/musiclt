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
  const yearParam = searchParams.get('year')

  const supabase = createAdminClient()
  const SEL = `
    id, source_url, artist_raw, album_title, album_wiki_link,
    release_year, release_month, release_day, genres_raw, label_raw,
    matched_artist_id, match_score, status, created_at, rescanned_at,
    preview_payload, preview_at, artist_pageviews,
    matched_artist:artists!wiki_album_candidates_matched_artist_id_fkey(id, name, slug, cover_image_url, score)
  `

  // Ne-pending būsenoms — paprastas sąrašas.
  if (status !== 'pending') {
    const { data, error } = await supabase.from('wiki_album_candidates').select(SEL).eq('status', status).limit(limit)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ candidates: data || [], total: (data || []).length })
  }

  // ── Metų suvestinė (tab'ams): kiek pending pagal metus ──
  const { data: yearRows } = await supabase
    .from('wiki_album_candidates').select('release_year').eq('status', 'pending').limit(5000)
  const yearCounts = new Map<number, number>()
  for (const r of (yearRows || []) as any[]) {
    const y = r.release_year
    if (y) yearCounts.set(y, (yearCounts.get(y) || 0) + 1)
  }
  const years = Array.from(yearCounts.entries()).map(([year, count]) => ({ year, count })).sort((a, b) => b.year - a.year)
  // Pasirinkti metai: param arba naujausi turimi.
  const year = yearParam ? parseInt(yearParam, 10) : (years[0]?.year ?? new Date().getUTCFullYear())

  // ── Pending: 2 fetch'ai (matched + unmatched), kad Tier 1 visada būtų viršuje
  //    (matched'ų nedaug — tik katalogo atlikėjai; unmatched gali būti daug). ──
  const [{ data: matchedRows }, { data: unmatchedRows }] = await Promise.all([
    supabase.from('wiki_album_candidates').select(SEL).eq('status', 'pending').eq('release_year', year).not('matched_artist_id', 'is', null).limit(600),
    supabase.from('wiki_album_candidates').select(SEL).eq('status', 'pending').eq('release_year', year).is('matched_artist_id', null).limit(400),
  ])
  const matched = (matchedRows || []) as any[]
  const unmatched = (unmatchedRows || []) as any[]

  // ── Dedupe matched prieš katalogą (albumas jau yra) → pažymim duplicate ──
  const artistIds = Array.from(new Set(matched.map(r => r.matched_artist_id).filter(Boolean)))
  // Atlikėjo vardas pagal id — „Atlikėjas – Title" prefikso nuėmimui dedup'e.
  const artistNameById = new Map<number, string>()
  for (const r of matched) {
    if (r.matched_artist_id && r.matched_artist?.name) artistNameById.set(r.matched_artist_id, r.matched_artist.name)
  }
  // Katalogo albumai → key → { id, empty }. „empty" = 0 dainų (skeletas): tokio
  // NEslepiam kaip dublikato, o parodom su žyma „jau yra — bus papildytas".
  const existing = new Map<string, { id: number; empty: boolean }>()
  if (artistIds.length > 0) {
    // SVARBU: `.in(...)` be range default'ina į 1000 eilučių — su ~400 atlikėjų albumų
    // būna daugiau, tad dalis albumų iškrisdavo iš dedup ir jų kandidatai vis dar
    // buvo siūlomi (Future/Dua Lipa/Myles Smith atvejai). Chunk + range → paimam VISUS.
    const albumRows: any[] = []
    for (let i = 0; i < artistIds.length; i += 100) {
      const chunk = artistIds.slice(i, i + 100)
      let from = 0
      for (;;) {
        const { data } = await supabase.from('albums').select('id, artist_id, title').in('artist_id', chunk).range(from, from + 999)
        const rows = (data || []) as any[]
        albumRows.push(...rows)
        if (rows.length < 1000) break
        from += 1000
      }
    }
    // Dainų skaičius per albumą (album_tracks) — track_count stulpelis nepalaikomas.
    const trackCount = new Map<number, number>()
    const albumIds = albumRows.map(a => a.id)
    for (let i = 0; i < albumIds.length; i += 100) {
      const chunk = albumIds.slice(i, i + 100)
      let from = 0
      for (;;) {
        const { data: at } = await supabase.from('album_tracks').select('album_id').in('album_id', chunk).range(from, from + 999)
        const rows = (at || []) as any[]
        for (const r of rows) trackCount.set(r.album_id, (trackCount.get(r.album_id) || 0) + 1)
        if (rows.length < 1000) break
        from += 1000
      }
    }
    for (const a of albumRows) {
      const nt = normalizeAlbumTitle(a.title || '')
      const rec = { id: a.id as number, empty: (trackCount.get(a.id) || 0) === 0 }
      if (!existing.has(`${a.artist_id}::${nt}`)) existing.set(`${a.artist_id}::${nt}`, rec)
      // Katalogo title'as su atlikėjo prefiksu („Dua Lipa – Live from Mexico") — įrašom
      // ir be prefikso, kad pagautų pliką kandidatą („Live from Mexico").
      const na = normalizeAlbumTitle(artistNameById.get(a.artist_id) || '')
      if (na && nt.startsWith(na + ' ')) {
        const stripped = nt.slice(na.length + 1).trim()
        if (stripped && !existing.has(`${a.artist_id}::${stripped}`)) existing.set(`${a.artist_id}::${stripped}`, rec)
      }
    }
  }
  const dupIds: number[] = []
  const matchedKept = matched.filter(r => {
    const nt = normalizeAlbumTitle(r.album_title || '')
    const na = normalizeAlbumTitle(artistNameById.get(r.matched_artist_id) || '')
    const strippedCand = (na && nt.startsWith(na + ' ')) ? nt.slice(na.length + 1).trim() : ''
    const hit = existing.get(`${r.matched_artist_id}::${nt}`) || (strippedCand ? existing.get(`${r.matched_artist_id}::${strippedCand}`) : undefined)
    if (hit) {
      if (!hit.empty) { dupIds.push(r.id); return false } // realus dublikatas (turi dainas) → slepiam
      r.existing_album = { id: hit.id, empty: true }      // skeletas → parodom, bus papildytas
    }
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

  // Wikipedia peržiūros/mėn (nesamačiams — populiarumo proxy „vertas/ne").
  const pvOf = (r: any) => (typeof r.artist_pageviews === 'number' ? r.artist_pageviews : -1)

  // Tier 1 — pagal atlikėjo populiarumą (score) desc, tada data.
  matchedKept.sort((a, b) => (scoreOf(b) - scoreOf(a)) || (dateOf(b) - dateOf(a)))
  // Unmatched — PIRMIAUSIA pagal Wikipedia peržiūras/mėn desc (vertingiausi viršuje;
  // dar neapskaičiuoti = -1 → apačioje), tada tier (2→3→4), tada data desc.
  unmatched.sort((a, b) => (pvOf(b) - pvOf(a)) || (tierOf(a) - tierOf(b)) || (dateOf(b) - dateOf(a)))

  const combined = [...matchedKept.map(withTier), ...unmatched.map(withTier)]
  return NextResponse.json({ candidates: combined.slice(0, limit), total: combined.length, years, year })
}
