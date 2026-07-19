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
    lyrics_added: 0, pending_tracklist: 0, errors: 0, error_details: [] as string[],
    details: [] as any[],
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

  for (const a of due as any[]) {
    if (Date.now() - startedAt > RUN_BUDGET_MS) break
    c.considered++
    const artistName = (a.artists?.name || '') as string

    try {
      let trackCount = a.track_count || 0

      // ── Skeletas (be dainų) → bandom rasti tracklist'ą MB (tik AIŠKUS atitikmuo) ──
      if (trackCount === 0) {
        const mb = await searchAlbumByTitle(artistName, a.title, a.year).catch(() => null)
        const yearOk = !!mb && (!a.year || !mb.year || mb.year === a.year)
        if (mb && mb.tracks.length > 0 && yearOk) {
          const tracks: TrackInAlbum[] = mb.tracks.map((t) => ({
            title: t.title,
            sort_order: t.position,
            disc_number: t.discNumber,
            duration: msToDuration(t.length),
            type: 'normal',
            release_year: mb.year, release_month: mb.month, release_day: mb.day,
          }))
          // Pilnas albumas (kad updateAlbum neužtrintų esamų laukų) + naujas tracklist.
          const full = await getAlbumById(a.id)
          full.tracks = tracks
          full.is_upcoming = false
          if (!full.cover_image_url && mb.coverUrl) full.cover_image_url = mb.coverUrl
          await updateAlbum(a.id, full)
          await supabase.from('albums').update({ track_count: tracks.length }).eq('id', a.id)
          trackCount = tracks.length
          c.tracklist_added++
        } else {
          // Nėra patikimo tracklist'o — paliekam skeletą (is_upcoming=true), bandysim vėl.
          c.pending_tracklist++
          c.details.push({ id: a.id, title: a.title, artist: artistName, status: 'pending_tracklist' })
          continue
        }
      } else {
        // Jau turi dainas → tik pažymim, kad išleistas.
        await supabase.from('albums').update({ is_upcoming: false }).eq('id', a.id)
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
