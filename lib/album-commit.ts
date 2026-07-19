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
import { createAlbum, type AlbumFull, type TrackInAlbum } from '@/lib/supabase-albums'
import { fetchReleaseTracklist, fetchMbCoverUrl, msToDuration } from '@/lib/musicbrainz'
import { normalizeAlbumTitle } from '@/lib/album-title'

export type AlbumCommitResult =
  | { ok: true; album_id: number; title: string; track_count: number; existed: boolean }
  | { ok: false; error: string }

function isUpcoming(y: number | null, m: number | null, d: number | null): boolean {
  if (!y) return false
  return Date.UTC(y, (m || 1) - 1, d || 1) > Date.now()
}

/** Ar atlikėjas jau turi tokio pavadinimo albumą (normalizuotas palyginimas —
 *  pagauna „Days of Ash" vs „Days of Ash EP"). Grąžina id arba null. */
async function findExistingAlbum(supabase: any, artistId: number, title: string): Promise<number | null> {
  const want = normalizeAlbumTitle(title)
  if (!want) return null
  const { data } = await supabase
    .from('albums')
    .select('id, title')
    .eq('artist_id', artistId)
    .limit(500)
  const hit = (data || []).find((a: any) => normalizeAlbumTitle(a.title || '') === want)
  return hit ? (hit.id as number) : null
}

/** Albumo tipų flag'ai iš MB tipų sąrašo (primary + secondary). Kelios reikšmės
 *  gali būti true vienu metu (pvz. Remix albumas). type_studio TIK jei tai
 *  grynas studijinis albumas (Album be live/remix/compilation/soundtrack). */
function typeFlagsFrom(primaryType: string | null, types: string[]) {
  const has = (t: string) => (types || []).some(x => (x || '').toLowerCase() === t.toLowerCase())
  const isEp = has('EP') || primaryType === 'EP'
  const live = has('Live'), remix = has('Remix'), comp = has('Compilation')
  const sound = has('Soundtrack'), demo = has('Demo'), djmix = has('DJ-mix')
  const nonStudio = live || remix || comp || sound || djmix || has('Mixtape/Street')
  return {
    type_studio: primaryType === 'Album' && !isEp && !nonStudio,
    type_ep: isEp,
    type_single: primaryType === 'Single',
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
  const existing = await findExistingAlbum(supabase, artistId, rel.title)
  if (existing) return { ok: true, album_id: existing, title: rel.title, track_count: rel.tracks.length, existed: true }

  const cover = await fetchMbCoverUrl(releaseId).catch(() => null)
  const tracks: TrackInAlbum[] = rel.tracks.map((t) => ({
    title: t.title,
    sort_order: t.position,
    disc_number: t.discNumber,
    duration: msToDuration(t.length),
    type: 'normal',
    release_year: rel.year, release_month: rel.month, release_day: rel.day,
  }))

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
