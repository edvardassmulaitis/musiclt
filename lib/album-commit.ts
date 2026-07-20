/**
 * Albumo sukūrimas naujam siūlymo flow'ui — BE priklausomybės nuo Wikipedia.
 * Du keliai:
 *   1) commitAlbumFromMb(releaseId, artistId) — pilnas tracklist'as iš MusicBrainz.
 *   2) commitShellAlbum(...) — „skeletas": tik title + data + viršelis (svarbaus
 *      atlikėjo BŪSIMAS albumas, kurio tracklist'o dar niekur nėra). Dainos
 *      prisidės vėliau (rankiniu būdu arba kito scan'o metu, kai MB atsiras).
 *
 * Abu tikrina dublikatą (tas pats atlikėjas + pavadinimas ilike) — negriauna
 * katalogo pakartotinu kūrimu.
 */

import { createAdminClient } from '@/lib/supabase'
import { createAlbum, updateAlbum, getAlbumById, type AlbumFull, type TrackInAlbum } from '@/lib/supabase-albums'
import { fetchReleaseTracklist, fetchMbCoverUrl, msToDuration } from '@/lib/musicbrainz'
import { normalizeAlbumTitle } from '@/lib/album-title'
import { enrichTrack } from '@/lib/yt-enrich'

/**
 * Praturtina naujai sukurto albumo dainas — kiekvienai suranda YouTube video
 * (+ views). Ribojama laiko biudžetu (`budgetMs`), kad neužstrigtų didelio
 * albumo (44 dainos) request'as: mažus (EP/albumas) apdoroja iškart, ilgą uodegą
 * paskui užbaigia foninis yt-backfill cron'as (tas pats mechanizmas kaip Wiki importui).
 * Best-effort: klaidos nesulaiko — grąžina kiek spėjo.
 */
export async function enrichAlbumTracks(albumId: number, origin?: string, budgetMs = 90000): Promise<{ enriched: number; lyrics: number; total: number }> {
  const supabase = createAdminClient()
  const { data: links } = await supabase.from('album_tracks').select('track_id, position').eq('album_id', albumId).order('position', { ascending: true })
  const ids = (links || []).map((r: any) => r.track_id).filter(Boolean)
  if (!ids.length) return { enriched: 0, lyrics: 0, total: 0 }
  const { data: tracks } = await supabase
    .from('tracks')
    .select('id, title, video_url, lyrics, artists!tracks_artist_id_fkey(name)')
    .in('id', ids)
  // Apdorojam dainas, kurioms trūksta video ARBA lyrics.
  const need = (tracks || []).filter((t: any) => !t.video_url || !t.lyrics)

  const start = Date.now()
  let enriched = 0, lyricsCount = 0
  for (const t of need as any[]) {
    if (Date.now() - start > budgetMs) break
    // 1) YouTube video (+ views)
    if (!t.video_url) {
      try {
        const r = await enrichTrack(t.id, false)
        if ((r as any)?.ok && (r as any)?.videoUrl) enriched++
      } catch { /* best-effort */ }
    }
    // 2) Lyrics (LRCLib per /api/search/lyrics) — jei dar nėra ir turim origin
    if (!t.lyrics && origin) {
      try {
        const artistName = (t.artists?.name || '') as string
        const lr = await fetch(`${origin}/api/search/lyrics?artist=${encodeURIComponent(artistName)}&title=${encodeURIComponent(t.title || '')}`, { signal: AbortSignal.timeout(12000) })
        if (lr.ok) {
          const lj = await lr.json()
          if (lj?.lyrics) { await supabase.from('tracks').update({ lyrics: lj.lyrics }).eq('id', t.id); lyricsCount++ }
        }
      } catch { /* best-effort */ }
    }
  }
  return { enriched, lyrics: lyricsCount, total: need.length }
}

export type AlbumCommitResult =
  | { ok: true; album_id: number; title: string; track_count: number; existed: boolean }
  | { ok: false; error: string }

function isUpcoming(y: number | null, m: number | null, d: number | null): boolean {
  if (!y) return false
  return Date.UTC(y, (m || 1) - 1, d || 1) > Date.now()
}

/** Ar atlikėjas jau turi tokio pavadinimo albumą (normalizuotas palyginimas —
 *  pagauna „Days of Ash" vs „Days of Ash EP"). Grąžina id arba null.
 *  Taip pat nuima atlikėjo prefiksą iš title (katalogas kartais saugo
 *  „Dua Lipa – Live from Mexico", o mes ieškom „Live from Mexico") — kad
 *  approve NEsukurtų dublikato prie jau esančio (dažnai skeleto). */
async function findExistingAlbum(supabase: any, artistId: number, title: string): Promise<number | null> {
  const want = normalizeAlbumTitle(title)
  if (!want) return null
  const { data: art } = await supabase.from('artists').select('name').eq('id', artistId).maybeSingle()
  const na = normalizeAlbumTitle(art?.name || '')
  const strip = (nt: string) => (na && nt.startsWith(na + ' ')) ? nt.slice(na.length + 1).trim() : nt
  const wantStripped = strip(want)
  const { data } = await supabase
    .from('albums')
    .select('id, title')
    .eq('artist_id', artistId)
    .limit(500)
  const hit = (data || []).find((a: any) => {
    const nt = normalizeAlbumTitle(a.title || '')
    return nt === want || strip(nt) === want || nt === wantStripped || strip(nt) === wantStripped
  })
  return hit ? (hit.id as number) : null
}

/** Ar albumas turi bent vieną dainą (album_tracks). */
async function albumHasTracks(supabase: any, albumId: number): Promise<boolean> {
  const { data } = await supabase.from('album_tracks').select('track_id').eq('album_id', albumId).limit(1)
  return (data || []).length > 0
}

/** Albumo tipų flag'ai iš MB tipų sąrašo (primary + secondary). Kelios reikšmės
 *  gali būti true vienu metu (pvz. Remix albumas). type_studio TIK jei tai
 *  grynas studijinis albumas (Album be live/remix/compilation/soundtrack). */
function typeFlagsFrom(primaryType: string | null, types: string[]) {
  const has = (t: string) => (types || []).some(x => (x || '').toLowerCase() === t.toLowerCase())
  const isEp = has('EP') || primaryType === 'EP'
  const single = primaryType === 'Single' || has('Single')
  const live = has('Live'), remix = has('Remix'), comp = has('Compilation')
  const sound = has('Soundtrack'), demo = has('Demo'), djmix = has('DJ-mix')
  const nonStudio = live || remix || comp || sound || djmix || has('Mixtape/Street')
  // Nežinomas tipas (nei primaryType, nei EP/Single/live/…) → DEFAULT studijinis,
  // kad albumas nebūtų „be tipo" (nerodomas prie studijinių). Anksčiau Apple-only
  // skeletai (be MB primaryType) likdavo visai be tipo.
  const unknownDefaultsToStudio = !primaryType && !isEp && !single && !nonStudio && !demo
  return {
    type_studio: (primaryType === 'Album' && !isEp && !nonStudio) || unknownDefaultsToStudio,
    type_ep: isEp,
    type_single: single,
    type_live: live,
    type_remix: remix,
    type_compilation: comp,
    type_soundtrack: sound,
    type_demo: demo,
    type_covers: false,
    type_holiday: false,
  }
}

/** Sukuria albumą iš MusicBrainz release'o (pilnas tracklist'as + viršelis).
 *  `types` — visi MB tipai (primary+secondary), kad teisingai pažymėtų remix/live/… */
export async function commitAlbumFromMb(releaseId: string, artistId: number, types: string[] = []): Promise<AlbumCommitResult> {
  const rel = await fetchReleaseTracklist(releaseId)
  if (!rel || !rel.tracks.length) return { ok: false, error: 'MusicBrainz release be tracklist\'o' }

  const supabase = createAdminClient()
  const cover = await fetchMbCoverUrl(releaseId).catch(() => null)
  const tracks: TrackInAlbum[] = rel.tracks.map((t) => ({
    title: t.title,
    sort_order: t.position,
    disc_number: t.discNumber,
    duration: msToDuration(t.length),
    type: 'normal',
    release_year: rel.year, release_month: rel.month, release_day: rel.day,
  }))

  const existing = await findExistingAlbum(supabase, artistId, rel.title)
  if (existing) {
    // Jei esamas albumas — „skeletas" (be dainų), o mes turim tracklistą → UŽPILDOM
    // (ir sutvarkom pavadinimą į švarų MB variantą), o NE dublikuojam. Jei jau turi
    // dainas — tikras dublikatas, paliekam.
    if (await albumHasTracks(supabase, existing)) {
      return { ok: true, album_id: existing, title: rel.title, track_count: rel.tracks.length, existed: true }
    }
    try {
      const full = await getAlbumById(existing)
      full.title = rel.title
      full.tracks = tracks
      full.is_upcoming = isUpcoming(rel.year, rel.month, rel.day)
      if (!full.cover_image_url && cover) full.cover_image_url = cover
      if (rel.year && !full.year) { full.year = rel.year; full.month = rel.month; full.day = rel.day }
      await updateAlbum(existing, full)
      return { ok: true, album_id: existing, title: rel.title, track_count: tracks.length, existed: false }
    } catch (e: any) {
      return { ok: false, error: `Shell fill failed: ${String(e?.message || e).slice(0, 200)}` }
    }
  }

  const allTypes = types.length ? types : [rel.primaryType].filter(Boolean) as string[]
  const albumData: AlbumFull = {
    title: rel.title, artist_id: artistId,
    year: rel.year, month: rel.month, day: rel.day,
    ...typeFlagsFrom(rel.primaryType, allTypes),
    cover_image_url: cover || undefined,
    source: 'musicbrainz',
    is_upcoming: isUpcoming(rel.year, rel.month, rel.day),
    tracks,
  }
  try {
    const id = await createAlbum(albumData)
    return { ok: true, album_id: id, title: rel.title, track_count: tracks.length, existed: false }
  } catch (e: any) {
    return { ok: false, error: `Album create failed: ${String(e?.message || e).slice(0, 200)}` }
  }
}

/** Sukuria „skeleto" albumą — tik pavadinimas + data + viršelis, be dainų.
 *  Būsimiems albumams, kurių tracklist'o dar niekur nėra. */
export async function commitShellAlbum(input: {
  artistId: number
  title: string
  year: number | null
  month: number | null
  day: number | null
  coverUrl?: string | null
  primaryType?: string | null
  types?: string[]
  source?: string
}): Promise<AlbumCommitResult> {
  const title = (input.title || '').trim()
  if (!title) return { ok: false, error: 'Trūksta albumo pavadinimo' }

  const supabase = createAdminClient()
  const existing = await findExistingAlbum(supabase, input.artistId, title)
  if (existing) return { ok: true, album_id: existing, title, track_count: 0, existed: true }

  const allTypes = (input.types && input.types.length) ? input.types : [input.primaryType].filter(Boolean) as string[]
  const albumData: AlbumFull = {
    title, artist_id: input.artistId,
    year: input.year, month: input.month, day: input.day,
    ...typeFlagsFrom(input.primaryType || (allTypes[0] || null), allTypes),
    cover_image_url: input.coverUrl || undefined,
    source: input.source || 'album-scout',
    is_upcoming: isUpcoming(input.year, input.month, input.day),
    tracks: [],
  }
  try {
    const id = await createAlbum(albumData)
    return { ok: true, album_id: id, title, track_count: 0, existed: false }
  } catch (e: any) {
    return { ok: false, error: `Album create failed: ${String(e?.message || e).slice(0, 200)}` }
  }
}
