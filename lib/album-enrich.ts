/**
 * Albumo praturtinimas naujam siūlymo flow'ui (Wiki album scout kandidatams).
 *
 * Tikslas: NEPRIKLAUSYTI nuo Wikipedia albumo straipsnio. Pagal atlikėją +
 * albumo pavadinimą (+ metus) bandom gauti tikrą tracklist'ą / viršelį / datą:
 *   1) MusicBrainz (searchAlbumByTitle) — jei turi tracklist'ą, tai geriausias
 *      šaltinis (tikri pavadinimai, data, Cover Art Archive viršelis).
 *   2) Apple Music (searchAppleAlbum) — viršelio/datos/track-count fallback,
 *      kai MB dar neturi release'o. Tracklist'o iš Apple NENAUDOJAM (placeholder'iai).
 *   3) 'shell' — jokio išorinio šaltinio: turim tik title + datą iš kandidato
 *      (svarbaus atlikėjo BŪSIMAS albumas). Vis tiek naudinga — sukuriam albumą
 *      su data ir viršeliu (jei Apple davė), dainos prisidės vėliau.
 *
 * Best-effort: bet kokia klaida → 'none'/'shell', niekada nemeta.
 */

import { searchAlbumByTitle } from './musicbrainz'
import { searchAppleAlbum } from './apple-music'

export type EnrichTrack = { position: number; title: string }

export type AlbumEnrichment = {
  source: 'wikipedia' | 'musicbrainz' | 'apple' | 'none'
  /** Nuoroda į šaltinį (MusicBrainz release-group / Apple Music albumas) — kad
   *  būtų galima atsidaryti ir patikrinti, net kai nėra Wikipedia straipsnio. */
  source_url: string | null
  cover_url: string | null
  year: number | null
  month: number | null
  day: number | null
  tracks: EnrichTrack[]
  track_count: number
  /** MusicBrainz release ID — reikalingas commit'ui su pilnu tracklist'u. */
  mb_release_id: string | null
  primary_type: string | null
  /** Visi tipai (primary + secondary): Album / EP / Remix / Live / Soundtrack / … */
  types: string[]
  is_upcoming: boolean
  /** 'high' — MB su tracklist'u (saugu vieno-click commit'ui). 'medium' — Apple
   *  metaduomenys (viršelis/data, be tikro tracklist'o). 'low' — nieko išoriško,
   *  tik kandidato title+data (shell). */
  confidence: 'high' | 'medium' | 'low'
}

function isUpcoming(y: number | null, m: number | null, d: number | null): boolean {
  if (!y) return false
  const t = Date.UTC(y, (m || 1) - 1, d || 1)
  return t > Date.now()
}

export async function enrichAlbum(
  artistName: string,
  albumTitle: string,
  preferYear?: number | null,
): Promise<AlbumEnrichment> {
  // 1) MusicBrainz — pilnas tracklist'as (jei yra).
  const mb = await searchAlbumByTitle(artistName, albumTitle, preferYear).catch(() => null)
  const mbUrl = mb?.releaseGroupId ? `https://musicbrainz.org/release-group/${mb.releaseGroupId}` : null
  const mbTypes = mb ? [mb.primaryType, ...(mb.secondaryTypes || [])].filter(Boolean) as string[] : []
  if (mb && mb.tracks.length > 0) {
    return {
      source: 'musicbrainz',
      source_url: mbUrl,
      cover_url: mb.coverUrl,
      year: mb.year, month: mb.month, day: mb.day,
      tracks: mb.tracks.map((t) => ({ position: t.position, title: t.title })),
      track_count: mb.tracks.length,
      mb_release_id: mb.releaseId,
      primary_type: mb.primaryType,
      types: mbTypes,
      is_upcoming: isUpcoming(mb.year, mb.month, mb.day),
      confidence: 'high',
    }
  }

  // 2) Apple — viršelis/data/track-count (be tikro tracklist'o).
  const apple = await searchAppleAlbum(artistName, albumTitle).catch(() => null)
  if (apple) {
    return {
      source: 'apple',
      source_url: apple.collectionId ? `https://music.apple.com/album/${apple.collectionId}` : null,
      cover_url: apple.coverUrl,
      year: apple.year, month: apple.month, day: apple.day,
      tracks: [],
      track_count: apple.trackCount || 0,
      mb_release_id: mb?.releaseId || null,
      primary_type: apple.looksLikeSingle ? 'Single' : null,
      types: apple.looksLikeSingle ? ['Single'] : [],
      is_upcoming: apple.isUpcoming,
      confidence: 'medium',
    }
  }

  // 3) Shell — nieko išoriško. Grąžinam MB viršelį/datą jei buvo (be tracklist'o),
  //    kitaip visai tuščią (kandidato title+data naudos commit'as).
  return {
    source: 'none',
    source_url: mbUrl,
    cover_url: mb?.coverUrl || null,
    year: mb?.year ?? null, month: mb?.month ?? null, day: mb?.day ?? null,
    tracks: [],
    track_count: 0,
    mb_release_id: mb?.releaseId || null,
    primary_type: mb?.primaryType || null,
    types: mbTypes,
    is_upcoming: false,
    confidence: 'low',
  }
}
