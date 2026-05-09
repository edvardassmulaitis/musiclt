import { NextRequest, NextResponse } from 'next/server'

// Lyrics search endpoint — naudoja LRCLib (https://lrclib.net), atvirą community-
// maintained lyrics service'ą su geru EN catalog'u (Coldplay/Beatles/etc.).
//
// Anksčiau naudojome api.lyrics.ovh, kuris path-encode'ina artist/title — dėl to
// title'ai su apostrofais („Don't Panic", „Everything's Not Lost") fail'indavo
// 404'u net kai daina katalog'e yra. LRCLib priima query string params, todėl
// apostrofai veikia patikimai.
//
// Match'inimas: case-insensitive + diakritikų stripping, kad „J Cole" match'intų
// „J. Cole" arba „Andrius Mamontovas" match'intų net jei title'as turi tipo.

const LRCLIB_HEADERS: HeadersInit = {
  'User-Agent': 'music.lt/1.0 (+contact: edvardas.smulaitis@gmail.com)',
  'Lrclib-Client': 'music.lt',
}

function normalize(s: string): string {
  // Lower + remove diacritics + collapse whitespace.
  return (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

type LrclibHit = {
  id?: number
  trackName?: string
  artistName?: string
  albumName?: string
  duration?: number
  plainLyrics?: string | null
  syncedLyrics?: string | null
}

async function tryGetEndpoint(artist: string, title: string, duration?: number): Promise<LrclibHit | null> {
  // /api/get reikalauja exact artist+track+duration match. Greitas hit'as kai
  // duration žinoma — kitaip 404. Pirma pamėginam jį.
  if (!duration) return null
  try {
    const params = new URLSearchParams({
      artist_name: artist,
      track_name: title,
      duration: String(Math.round(duration)),
    })
    const r = await fetch(`https://lrclib.net/api/get?${params}`, {
      headers: LRCLIB_HEADERS,
      // Don't cache — different tracks each call
      cache: 'no-store',
    })
    if (!r.ok) return null
    const d = (await r.json()) as LrclibHit
    if (d.plainLyrics || d.syncedLyrics) return d
    return null
  } catch {
    return null
  }
}

async function trySearchEndpoint(artist: string, title: string): Promise<LrclibHit | null> {
  try {
    const params = new URLSearchParams({
      artist_name: artist,
      track_name: title,
    })
    const r = await fetch(`https://lrclib.net/api/search?${params}`, {
      headers: LRCLIB_HEADERS,
      cache: 'no-store',
    })
    if (!r.ok) return null
    const results = (await r.json()) as LrclibHit[]
    if (!Array.isArray(results) || !results.length) return null
    // Pick best: artist substring match (case+diacritic insensitive) + exact
    // track name preferred, else first hit with any lyrics.
    const aNorm = normalize(artist)
    const tNorm = normalize(title)
    let best: LrclibHit | null = null
    for (const d of results) {
      if (!d.plainLyrics && !d.syncedLyrics) continue
      const da = normalize(d.artistName || '')
      const dt = normalize(d.trackName || '')
      // Patikslintas artist match — vienoje pusėje turi būti substring
      const artistOk = aNorm.includes(da) || da.includes(aNorm)
      if (!artistOk) continue
      if (dt === tNorm) return d  // exact match — return immediately
      if (!best) best = d
    }
    return best
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const artist = (searchParams.get('artist') || '').trim()
  const title = (searchParams.get('title') || '').trim()
  const durationRaw = searchParams.get('duration')
  const duration = durationRaw ? parseInt(durationRaw, 10) : undefined

  if (!artist || !title) return NextResponse.json({ lyrics: null })

  // 1. Greita /api/get pirmenybė kai duration žinoma
  const exactHit = await tryGetEndpoint(artist, title, duration)
  if (exactHit?.plainLyrics || exactHit?.syncedLyrics) {
    return NextResponse.json({
      lyrics: (exactHit.plainLyrics || '').trim() || null,
      synced: exactHit.syncedLyrics || null,
      source: 'lrclib',
      match: 'exact',
    })
  }

  // 2. Fallback: /api/search fuzzy
  const fuzzy = await trySearchEndpoint(artist, title)
  if (fuzzy?.plainLyrics || fuzzy?.syncedLyrics) {
    return NextResponse.json({
      lyrics: (fuzzy.plainLyrics || '').trim() || null,
      synced: fuzzy.syncedLyrics || null,
      source: 'lrclib',
      match: 'fuzzy',
    })
  }

  return NextResponse.json({ lyrics: null })
}
