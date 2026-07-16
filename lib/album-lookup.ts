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

import { analyzeRecording, fetchMbCoverUrl, type MbAlbumMatch } from './musicbrainz'
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

export type AlbumLookupResult = {
  suggestion: AlbumSuggestion | null
  /** Ar daina aptikta kaip single'as (MB release-group='Single', arba silpnas
   *  Apple heuristikos signalas, jei MB nieko neturėjo). Naudojama žymėti
   *  track.is_single (promote-only — žr. lib/quick-add.ts commitTrack). */
  is_single: boolean
}

/**
 * Šis kvietimas SĄMONINGAI nekviečiamas quick-add preview'o metu (buvo iki
 * 2026-07-16 — Edvardas atkreipė dėmesį, kad preview'as per ilgai užtrunka
 * laukiant kelių sekvencinių MusicBrainz/Apple užklausų). Dabar kviečiamas
 * ATSKIRU async endpoint'u (/api/admin/quick-add/album-suggestion) IŠ KARTO
 * po greito preview'o — klientas nelaukia, gali tuo metu redaguoti/commit'inti
 * arba pradėti kitą quick-add'ą; pasiūlymas tiesiog "įkrenta" į UI kai gatavas.
 * Best-effort visur — jokia klaida/timeout nemeta, tiesiog null/false.
 */
export async function findAlbumSuggestion(artistName: string, trackTitle: string): Promise<AlbumLookupResult> {
  const empty: AlbumLookupResult = { suggestion: null, is_single: false }
  if (!artistName?.trim() || !trackTitle?.trim()) return empty

  let mb: { albumMatch: MbAlbumMatch | null; isSingleRelease: boolean } | null = null
  try {
    mb = await withTimeout(analyzeRecording(artistName, trackTitle), TIMEOUT_MS, null)
  } catch {
    mb = null
  }

  if (mb) {
    const isSingle = mb.isSingleRelease
    const match = mb.albumMatch
    if (match && !match.isPlaceholderish) {
      const cover = await withTimeout(fetchMbCoverUrl(match.releaseId), 5000, null).catch(() => null)
      return {
        is_single: isSingle,
        suggestion: {
          source: 'musicbrainz', confidence: 'high',
          title: match.title, year: match.year, month: match.month, day: match.day,
          track_count: match.trackCount, cover_url: cover, mb_release_id: match.releaseId,
        },
      }
    }
    if (match) {
      // Rastas albumas, bet tracklist'as dar dalinis/placeholder'inis (retas
      // MB atvejis) — pasiūlom, bet NE auto-create.
      return {
        is_single: isSingle,
        suggestion: {
          source: 'musicbrainz', confidence: 'ambiguous',
          title: match.title, year: match.year, month: match.month, day: match.day,
          track_count: match.trackCount, cover_url: null, mb_release_id: match.releaseId,
        },
      }
    }
    // MB rado recording'ą, bet jokio albumo — jei ŽINOM, kad tai single'as,
    // grąžinam is_single be albumo pasiūlymo. Kitaip (nerado nieko apskritai)
    // krentam į Apple fallback žemiau.
    if (isSingle) return { suggestion: null, is_single: true }
  }

  // MusicBrainz neturėjo nieko — Apple Music fallback (tik signalas + silpna
  // single heuristika).
  const apple = await withTimeout(findAppleAlbumForTrack(artistName, trackTitle), TIMEOUT_MS, null).catch(() => null)
  if (apple && apple.trackCount > 1) {
    return {
      is_single: false,
      suggestion: {
        source: 'apple_music', confidence: 'ambiguous',
        title: apple.title, year: apple.year, month: apple.month, day: apple.day,
        track_count: apple.trackCount, cover_url: apple.coverUrl, mb_release_id: null,
      },
    }
  }

  return { suggestion: null, is_single: !!apple?.looksLikeSingle }
}
