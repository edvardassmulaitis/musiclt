/**
 * Album release backfill — kai „skeleto"/būsimo albumo REALI išleidimo data ateina,
 * sistema pati pabando: (1) rasti tracklist'ą (jei dar skeletas be dainų) ir
 * (2) praturtinti VISAS albumo dainas — YouTube video + lyrics.
 *
 * Trigger'is: albumas su `is_upcoming = true`, kurio data (year/month/day) jau
 * praėjo. (commitShellAlbum/commitAlbumFromMb `is_upcoming` nustato kūrimo metu
 * pagal datą; jis NEatsinaujina savaime — tad būtent šitas perėjimas „busimas →
 * išleistas" ir yra signalas.)
 *
 * Tracklist'o SAUGUS default (Edvardo pasirinkimas 2026-07-19): MB tracklist'ą
 * imam TIK kai atitikmuo aiškus — searchAlbumByTitle jau reikalauja tikslaus
 * title+atlikėjo sutapimo, o mes dar reikalaujam METŲ sutapimo. Silpni atvejai
 * lieka skeletais (is_upcoming=true) — bus bandoma vėl kito run'o metu, kol MB
 * atsiras arba admin pridės ranka. Taip išvengiam neteisingų MB priskyrimų
 * (kaip Willow viršelio atvejis).
 *
 * Apimtis: TIK ką išleistus (upcoming→released perėjimas), ne senų albumų backfill.
 *
 * Kviečiamas GitHub Actions cron'o (Bearer INTERNAL_CRON_TOKEN), kasdien.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { searchAlbumByTitle, msToDuration } from '@/lib/musicbrainz'
import { getAlbumById, updateAlbum, type TrackInAlbum } from '@/lib/supabase-albums'
import { enrichAlbumTracks } from '@/lib/album-commit'
import { normalizeAlbumTitle } from '@/lib/album-title'

export const runtime = 'nodejs'
export const maxDuration = 300

const RUN_BUDGET_MS = 240000
const MAX_ALBUMS_PER_RUN = 40

function baseUrl(): string {
  return process.env.MUSICLT_BASE_URL || `https://${process.env.VERCEL_URL || 'musiclt.vercel.app'}`
}

/** Ar albumo išleidimo data jau atėjo (praėjo arba šiandien). */
function isReleased(y: number | null, m: number | null, d: number | null): boolean {
  if (!y) return false
  return Date.UTC(y, (m || 1) - 1, d || 1) <= Date.now()
}

/**
 * Reconcile: pending matched kandidatai, kurių albumas JAU yra kataloge, →
 * status='duplicate'. GET `/api/admin/wiki-album-candidates` dedup daro TIK
 * žiūrimiems metams (lazy), tad kai albumas pridedamas kitu keliu (pvz. atlikėjo
 * puslapio auto-import), o kandidatas jau buvo eilėje — jis lieka „pending" ir
 * nesamai siūlomas. Čia — kasdien, VISIEMS metams, ta pati normalizacija
 * (normalizeAlbumTitle + atlikėjo prefikso nuėmimas) kaip inbox dedup'e.
 */
async function reconcilePendingDuplicates(supabase: any): Promise<{ marked: number }> {
  const cands: any[] = []
  {
    const PAGE = 1000
    let from = 0
    for (;;) {
      const { data } = await supabase.from('wiki_album_candidates')
        .select('id, matched_artist_id, album_title')
        .eq('status', 'pending').not('matched_artist_id', 'is', null)
        .range(from, from + PAGE - 1)
      const rows = (data || []) as any[]
      cands.push(...rows)
      if (rows.length < PAGE || from > 20000) break
      from += PAGE
    }
  }
  if (!cands.length) return { marked: 0 }

  const artistIds = Array.from(new Set(cands.map((c) => c.matched_artist_id).filter(Boolean)))
  const nameById = new Map<number, string>()
  for (let i = 0; i < artistIds.length; i += 300) {
    const { data } = await supabase.from('artists').select('id, name').in('id', artistIds.slice(i, i + 300))
    for (const a of (data || []) as any[]) nameById.set(a.id, a.name || '')
  }
  // Tik albumai SU DAINOM žymimi dublikatais. Tušti „skeletai" NEslepiami —
  // juos inbox rodo su žyma „jau kataloge — bus papildytas" (kad būtų galima užpildyti).
  const albumRows: any[] = []
  for (let i = 0; i < artistIds.length; i += 200) {
    const { data } = await supabase.from('albums').select('id, artist_id, title').in('artist_id', artistIds.slice(i, i + 200))
    albumRows.push(...((data || []) as any[]))
  }
  const withTracks = new Set<number>()
  const albumIds = albumRows.map(a => a.id)
  for (let i = 0; i < albumIds.length; i += 300) {
    const { data: at } = await supabase.from('album_tracks').select('album_id').in('album_id', albumIds.slice(i, i + 300))
    for (const r of (at || []) as any[]) withTracks.add(r.album_id)
  }
  const albumsByArtist = new Map<number, Map<string, number>>()
  for (const a of albumRows) {
    if (!withTracks.has(a.id)) continue // skeletas be dainų — praleidžiam (nežymim dublikatu)
    let m = albumsByArtist.get(a.artist_id)
    if (!m) { m = new Map(); albumsByArtist.set(a.artist_id, m) }
    const nt = normalizeAlbumTitle(a.title || '')
    if (nt && !m.has(nt)) m.set(nt, a.id)
    const na = normalizeAlbumTitle(nameById.get(a.artist_id) || '')
    if (na && nt.startsWith(na + ' ')) { const s = nt.slice(na.length + 1).trim(); if (s && !m.has(s)) m.set(s, a.id) }
  }
  const dupIds: number[] = []
  for (const c of cands) {
    const m = albumsByArtist.get(c.matched_artist_id)
    if (!m) continue
    const nt = normalizeAlbumTitle(c.album_title || '')
    let albumId = m.get(nt)
    if (albumId === undefined) {
      const na = normalizeAlbumTitle(nameById.get(c.matched_artist_id) || '')
      if (na && nt.startsWith(na + ' ')) albumId = m.get(nt.slice(na.length + 1).trim())
    }
    if (albumId !== undefined) dupIds.push(c.id)
  }
  const nowIso = new Date().toISOString()
  for (let i = 0; i < dupIds.length; i += 500) {
    await supabase.from('wiki_album_candidates')
      .update({ status: 'duplicate', reviewed_at: nowIso })
      .in('id', dupIds.slice(i, i + 500))
  }
  return { marked: dupIds.length }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  const expected = process.env.INTERNAL_CRON_TOKEN
  if (!expected) return NextResponse.json({ error: 'INTERNAL_CRON_TOKEN not configured' }, { status: 503 })
  if (!token || token !== expected) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const origin = baseUrl()
  const supabase = createAdminClient()
  const startedAt = Date.now()

  const c = {
    considered: 0, released_marked: 0, tracklist_added: 0, tracks_enriched: 0,
    lyrics_added: 0, pending_tracklist: 0, reconciled_duplicates: 0,
    errors: 0, error_details: [] as string[], details: [] as any[],
  }

  // Pirma — nuvalom pending kandidatus, kurių albumas jau kataloge (bet kokiu keliu pridėtas).
  try {
    const rec = await reconcilePendingDuplicates(supabase)
    c.reconciled_duplicates = rec.marked
  } catch (e: any) {
    c.errors++
    c.error_details.push(`Reconcile failed: ${String(e?.message || e).slice(0, 200)}`)
  }

  // Būsimi albumai, kurių data jau atėjo. Upcoming'ų nedaug — filtruojam datą JS'e.
  const { data: rows, error } = await supabase
    .from('albums')
    .select('id, title, artist_id, year, month, day, track_count, cover_image_url, artists!albums_artist_id_fkey(name)')
    .eq('is_upcoming', true)
    .order('year', { ascending: true })
    .order('month', { ascending: true })
    .order('day', { ascending: true })
    .limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const due = (rows || []).filter((a: any) => isReleased(a.year, a.month, a.day)).slice(0, MAX_ALBUMS_PER_RUN)

  // TIKRAS dainų skaičius iš album_tracks (albums.track_count stulpelis NEpalaikomas —
  // visiems 0, tad juo pasitikėti negalima).
  const realTrackCount = new Map<number, number>()
  if (due.length > 0) {
    const { data: atRows } = await supabase.from('album_tracks').select('album_id').in('album_id', due.map((a: any) => a.id))
    for (const r of (atRows || []) as any[]) realTrackCount.set(r.album_id, (realTrackCount.get(r.album_id) || 0) + 1)
  }

  for (const a of due as any[]) {
    if (Date.now() - startedAt > RUN_BUDGET_MS) break
    c.considered++
    const artistName = (a.artists?.name || '') as string

    try {
      let trackCount = realTrackCount.get(a.id) || 0

      // ── MB tracklist'as (tik AIŠKUS atitikmuo: tikslus title+atlikėjas + metai) ──
      // Aktualu kai: (a) skeletas be dainų, arba (b) yra TIK keli pre-release singlai
      // (pvz. 1-2), o albumas jau išleistas ir MB turi pilną sąrašą — užpildom spragą.
      const mb = await searchAlbumByTitle(artistName, a.title, a.year).catch(() => null)
      const yearOk = !!mb && (!a.year || !mb.year || mb.year === a.year)

      if (mb && yearOk && mb.tracks.length > trackCount) {
        // Esamos dainos (pvz. jau išleisti singlai) — kad MERGE išsaugotų jų
        // YouTube/Spotify (lyrics sync'as ir taip neliečia). Rikiuojam pagal MB,
        // bet esamiems perduodam track_id + video_url + spotify_id → nepertrina.
        const { data: exRows } = await supabase
          .from('album_tracks')
          .select('track_id, tracks(title, slug, video_url, spotify_id)')
          .eq('album_id', a.id)
        const byKey = new Map<string, any>()
        for (const r of (exRows || []) as any[]) {
          const t = r.tracks
          if (!t) continue
          const rec = { track_id: r.track_id, video_url: t.video_url, spotify_id: t.spotify_id }
          if (t.title) byKey.set(normalizeAlbumTitle(t.title), rec)
          if (t.slug) byKey.set(`slug:${t.slug}`, rec)
        }
        const tracks: TrackInAlbum[] = mb.tracks.map((t) => {
          const ex = byKey.get(normalizeAlbumTitle(t.title))
          const base: TrackInAlbum = {
            title: t.title,
            sort_order: t.position,
            disc_number: t.discNumber,
            duration: msToDuration(t.length),
            type: 'normal',
            release_year: mb.year, release_month: mb.month, release_day: mb.day,
          }
          if (ex) {
            base.track_id = ex.track_id
            if (ex.video_url) base.video_url = ex.video_url
            if (ex.spotify_id) base.spotify_id = ex.spotify_id
          }
          return base
        })
        const full = await getAlbumById(a.id)
        full.tracks = tracks
        full.is_upcoming = false
        if (!full.cover_image_url && mb.coverUrl) full.cover_image_url = mb.coverUrl
        await updateAlbum(a.id, full)
        await supabase.from('albums').update({ track_count: tracks.length }).eq('id', a.id)
        trackCount = tracks.length
        c.tracklist_added++
      } else if (trackCount === 0) {
        // Tuščias ir nėra patikimo MB → paliekam skeletą (is_upcoming=true), bandysim vėl.
        c.pending_tracklist++
        c.details.push({ id: a.id, title: a.title, artist: artistName, status: 'pending_tracklist' })
        continue
      } else {
        // Turi dainas, MB neturi daugiau → tik pažymim, kad išleistas (+ viršelis jei trūksta).
        const patch: any = { is_upcoming: false }
        if (!a.cover_image_url && mb?.coverUrl) patch.cover_image_url = mb.coverUrl
        await supabase.from('albums').update(patch).eq('id', a.id)
      }
      c.released_marked++

      // ── Enrich VISOMS albumo dainoms: YouTube video + lyrics ──
      const enr = await enrichAlbumTracks(a.id, origin).catch(() => ({ enriched: 0, lyrics: 0, total: 0 }))
      c.tracks_enriched += enr.enriched
      c.lyrics_added += enr.lyrics
      c.details.push({ id: a.id, title: a.title, artist: artistName, status: 'released', tracks: trackCount, enriched: enr.enriched, lyrics: enr.lyrics })
    } catch (e: any) {
      c.errors++
      c.error_details.push(`Album #${a.id} (${a.title}): ${String(e?.message || e).slice(0, 200)}`)
    }
  }

  return NextResponse.json({ ok: true, summary: c })
}

// Rankiniam patikrinimui iš naršyklės (admin) — tas pats kaip POST.
export async function GET(req: NextRequest) {
  return POST(req)
}
