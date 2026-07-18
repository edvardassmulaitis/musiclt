/**
 * Apple Music (iTunes Search API) — vieša, be autentifikacijos
 * (`itunes.apple.com/search`, `/lookup`). Naudojama kaip ANTRINIS šaltinis
 * albumo paieškai quick-add flow'e, PO MusicBrainz (žr. lib/musicbrainz.ts,
 * lib/album-lookup.ts).
 *
 * Kodėl antrinis, ne pirminis: Apple Music greitai turi teisingą track_count +
 * release datą + aukštos kokybės oficialų viršelį iš pre-order/pre-save
 * metaduomenų feed'o, BET dažnai iki artimesnio anonso naudoja placeholder
 * pavadinimus neatskleistiems track'ams ("Track 5", "Track 6" — patikrinta
 * gyvai su Carly Rae Jepsen "Day and Night" 2026-07-16, žr.
 * MUSIC_DISCOVERY_AUTOMATION_PLAN.md). Todėl Apple duomenys NIEKADA
 * nenaudojami albumo/tracklist'o KŪRIMUI — tik kaip signalas admin'ui
 * ("priklauso būsimam albumui X") ir viršelio/datos šaltinis, kai
 * MusicBrainz dar neturi duomenų apie šį release'ą.
 */

function foldCompare(s: string): string {
  const nfd = (s || '').toLowerCase().normalize('NFD')
  let out = ''
  for (const ch of nfd) {
    const cp = ch.codePointAt(0) || 0
    if (cp >= 0x0300 && cp <= 0x036f) continue
    out += /[a-z0-9]/.test(ch) ? ch : ' '
  }
  return out.replace(/\s+/g, ' ').trim()
}

function upgradeArtwork(url: string | null | undefined): string | null {
  if (!url) return null
  return url.replace(/\d+x\d+bb\./, '1200x1200bb.')
}

export type AppleAlbumMatch = {
  collectionId: number
  title: string
  trackCount: number
  year: number | null
  month: number | null
  day: number | null
  coverUrl: string | null
  isUpcoming: boolean
  /** Silpnas signalas (be MB struktūrinio release-group tipo): kolekcijos
   *  pavadinimas baigiasi "- Single" arba turi tik 1 dainą. Naudojamas TIK
   *  kai MusicBrainz apskritai neturi šios dainos (žr. lib/album-lookup.ts). */
  looksLikeSingle: boolean
}

/** Ieško ALBUMO pagal atlikėją + albumo pavadinimą (entity=album). Grąžina
 *  metaduomenis (viršelis/data/track count) — NE tracklist'o turiniui (Apple
 *  pre-release dažnai "Track N" placeholder'iai). Naudojama naujo albumų flow'e
 *  kaip viršelio/datos fallback, kai MusicBrainz dar neturi release'o.
 *  Best-effort: klaidos/timeout atveju grąžina null, niekad nemeta. */
export async function searchAppleAlbum(artistName: string, albumTitle: string): Promise<AppleAlbumMatch | null> {
  const term = `${artistName} ${albumTitle}`.trim()
  if (!term) return null
  let json: any
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=album&limit=8&country=US`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return null
    json = await res.json()
  } catch {
    return null
  }
  const wantTitle = foldCompare(albumTitle)
  const wantArtist = foldCompare(artistName)
  const hit = (json?.results || []).find(
    (r: any) => foldCompare(r.collectionName || '').replace(/ (deluxe|expanded|explicit).*/,'').trim() === wantTitle && foldCompare(r.artistName || '') === wantArtist
  ) || (json?.results || []).find(
    (r: any) => foldCompare(r.collectionName || '') === wantTitle
  )
  if (!hit || !hit.collectionId) return null
  const relDate = hit.releaseDate ? new Date(hit.releaseDate) : null
  const validDate = relDate && !isNaN(relDate.getTime())
  const collectionName: string = hit.collectionName || ''
  return {
    collectionId: hit.collectionId,
    title: collectionName,
    trackCount: hit.trackCount || 0,
    year: validDate ? relDate!.getUTCFullYear() : null,
    month: validDate ? relDate!.getUTCMonth() + 1 : null,
    day: validDate ? relDate!.getUTCDate() : null,
    coverUrl: upgradeArtwork(hit.artworkUrl100),
    isUpcoming: validDate ? relDate!.getTime() > Date.now() : false,
    looksLikeSingle: (hit.trackCount || 0) <= 1 || /-\s*single\s*$/i.test(collectionName),
  }
}

/** Ieško track'o Apple Music kataloge, grąžina jo albumą (jei yra) —
 *  metaduomenims (viršelis/data/track count), NE tracklist'o turiniui.
 *  Best-effort: klaidos/timeout atveju grąžina null, niekad nemeta. */
export async function findAppleAlbumForTrack(artistName: string, trackTitle: string): Promise<AppleAlbumMatch | null> {
  const term = `${artistName} ${trackTitle}`.trim()
  if (!term) return null

  let json: any
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=5&country=US`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return null
    json = await res.json()
  } catch {
    return null
  }

  const wantTitle = foldCompare(trackTitle)
  const wantArtist = foldCompare(artistName)
  const hit = (json?.results || []).find(
    (r: any) => foldCompare(r.trackName || '') === wantTitle && foldCompare(r.artistName || '') === wantArtist
  )
  if (!hit || !hit.collectionId) return null

  const relDate = hit.releaseDate ? new Date(hit.releaseDate) : null
  const validDate = relDate && !isNaN(relDate.getTime())
  const collectionName: string = hit.collectionName || ''

  return {
    collectionId: hit.collectionId,
    title: collectionName,
    trackCount: hit.trackCount || 0,
    year: validDate ? relDate!.getUTCFullYear() : null,
    month: validDate ? relDate!.getUTCMonth() + 1 : null,
    day: validDate ? relDate!.getUTCDate() : null,
    coverUrl: upgradeArtwork(hit.artworkUrl100),
    isUpcoming: validDate ? relDate!.getTime() > Date.now() : false,
    looksLikeSingle: (hit.trackCount || 0) <= 1 || /-\s*single\s*$/i.test(collectionName),
  }
}
