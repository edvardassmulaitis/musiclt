/**
 * Albumo pasiūlymo orchestratorius quick-add track flow'ui (žr.
 * MUSIC_DISCOVERY_AUTOMATION_PLAN.md, punktas C — patikslinta po 2026-07-16
 * testo su realiu atveju).
 *
 * Šaltinių eiliškumas ir kodėl:
 *   1) MusicBrainz — jei turi PILNĄ (ne-placeholder) tracklist'ą, tai
 *      aukščiausio pasitikėjimo šaltinis: laisva API, recording→release
 *      ryšys tiesiogiai atsako "ar ši daina yra albume", dažnai greičiau
 *      pilnas nei Wikipedia track listing (kuris savaitėmis lieka tuščias
 *      skeletas po anonso).
 *   2) Apple Music (iTunes Search) fallback — kai MusicBrainz neturi arba
 *      turi dalinį/placeholder tracklist'ą. Naudojama TIK kaip signalas
 *      (pavadinimas/data/track count/viršelis) — NIEKADA tracklist'o kūrimui,
 *      nes Apple pre-release įrašuose dažnai "Track N" placeholder'iai.
 *   3) Wikipedia SĄMONINGAI čia nenaudojama pirminiu šaltiniu (esamas
 *      commitAlbum/fetchAlbumWiki kelias lieka albumo-per-Wiki-nuorodą
 *      flow'ui — kai admin PATS įmeta Wiki albumo linką, tas kelias
 *      nepakito). Wikipedia gali likti ateities enrichment'ui (aprašymas,
 *      žanrai), bet ne track↔album ryšio nustatymui.
 */

import { findAlbumForRecording, fetchMbCoverUrl, type MbAlbumMatch } from './musicbrainz'
import { findAppleAlbumForTrack } from './apple-music'

export type AlbumSuggestion = {
  source: 'musicbrainz' | 'apple_music'
  /** 'high' — auto-create saugu (pilnas realus tracklist'as, MB). 'ambiguous'
   *  — tik pasiūlymas, admin turi patvirtinti (dalinis MB arba bet koks Apple). */
  confidence: 'high' | 'ambiguous'
  title: string
  year: number | null
  month: number | null
  day: number | null
  track_count: number
  cover_url: string | null
  /** Reikalingas commit metu pilnam tracklist'o re-fetch'ui. Tik MusicBrainz šaltiniui. */
  mb_release_id: string | null
}

const TIMEOUT_MS = 9000

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))])
}

/**
 * Pagrindinė preview-fazės funkcija: patikrina, ar duota daina priklauso
 * kokiam nors albumui. Best-effort — jokia klaida/timeout nesulaiko quick-add
 * preview'o, tiesiog grąžina null (nerodomas pasiūlymas).
 */
export async function findAlbumSuggestion(artistName: string, trackTitle: string): Promise<AlbumSuggestion | null> {
  if (!artistName?.trim() || !trackTitle?.trim()) return null

  let mb: MbAlbumMatch | null = null
  try {
    mb = await withTimeout(findAlbumForRecording(artistName, trackTitle), TIMEOUT_MS, null)
  } catch {
    mb = null
  }

  if (mb) {
    if (!mb.isPlaceholderish) {
      const cover = await withTimeout(fetchMbCoverUrl(mb.releaseId), 5000, null).catch(() => null)
      return {
        source: 'musicbrainz',
        confidence: 'high',
        title: mb.title, year: mb.year, month: mb.month, day: mb.day,
        track_count: mb.trackCount, cover_url: cover, mb_release_id: mb.releaseId,
      }
    }
    // Rastas albumas, bet tracklist'as dar dalinis/placeholder'inis (retas
    // MB atvejis) — pasiūlom, bet NE auto-create.
    return {
      source: 'musicbrainz',
      confidence: 'ambiguous',
      title: mb.title, year: mb.year, month: mb.month, day: mb.day,
      track_count: mb.trackCount, cover_url: null, mb_release_id: mb.releaseId,
    }
  }

  // MusicBrainz neturėjo nieko — Apple Music fallback (tik signalas).
  const apple = await withTimeout(findAppleAlbumForTrack(artistName, trackTitle), TIMEOUT_MS, null).catch(() => null)
  if (apple && apple.trackCount > 1) {
    return {
      source: 'apple_music',
      confidence: 'ambiguous',
      title: apple.title, year: apple.year, month: apple.month, day: apple.day,
      track_count: apple.trackCount, cover_url: apple.coverUrl, mb_release_id: null,
    }
  }

  return null
}
