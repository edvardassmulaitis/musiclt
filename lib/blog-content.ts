// lib/blog-content.ts
//
// Server-side body HTML processing for blog post pages.
// Migrated diary post'ai (iš senos music.lt) turi muziką EMBEDDED tiesiogiai
// body HTML'e dviem būdais:
//   1. <iframe src="https://www.youtube.com/embed/..." />
//   2. <iframe src="https://open.spotify.com/embed/track/..." />
//   3. Legacy "favorite" widget table — music.lt thumb + title/artist link'ai
//      (mod=9 daina, mod=5 atlikėjas, mod=10 albumas)
//
// Mūsų sprendimas: visus juos IŠTRAUKIAM iš body į atskirą struktūruotą sąrašą,
// kad UI galėtų render'inti unified "Susijusi muzika" player'į dešinėje, o
// body teksto srautas liktų švarus.

export type ExtractedTrack = {
  /** Source — kuriame body sluoksnyje rastas šitas embed'as. */
  source: 'youtube' | 'spotify' | 'music_lt'
  /** Primary key: YT video id / Spotify track id / music.lt legacy id. */
  key: string
  /** Display fields, kai turim (iš parsing'o). */
  title?: string
  artist_name?: string
  cover_url?: string
  /** Direct embed URL kuris veikia iframe'e. */
  embed_url: string
  /** Source URL — backup nuoroda. UI nepatariama rodyti per save —
   *  vietoj to naudojam `db_track` jeigu užsimena. */
  source_url?: string
  /** music.lt legacy ID (kai turim) — naudosime DB resolution'ui ateityje. */
  legacy_id?: number
  legacy_kind?: 'track' | 'artist' | 'album'
  /** Server-side resolved DB track (jei match'inasi spotify_id/video_url su
   *  tracks lentele). Naudojama UI nuorodai į /dainos/<slug> page'ą, kuris
   *  rodo identiškai tą patį turinį (player + lyrics + comments) kaip artist
   *  page'o TrackInfoModal. */
  db_track?: {
    id: number
    slug: string | null
    artist_slug?: string | null
  }
}

export type BlogContentExtracted = {
  /** Body HTML su pašalintais iframe'ais ir favorite widget'u. */
  cleanedHtml: string
  /** Visi rasti music embed'ai, eilėje pagal pasirodymo body'je vietą. */
  music: ExtractedTrack[]
}

const YT_EMBED_RE = /<iframe[^>]+src=["']https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]+)[^"']*["'][^>]*>(?:<\/iframe>)?/gi
const SPOTIFY_EMBED_RE = /<iframe[^>]+src=["']https:\/\/open\.spotify\.com\/embed\/(track|album|artist)\/([A-Za-z0-9]+)[^"']*["'][^>]*>(?:<\/iframe>)?/gi

/** Music.lt "favorite" widget legacy table — paprastai randasi BODY END'e
 *  (scraper ėmė pertekliniam content table'e). Atpažįstam per `favorite_<MOD>_link<ID>_<kind>`
 *  + `thumbs_gray_small.png` markerį. Striktiška: jei nepasitvirtina visi
 *  markeriai, table'as paliekamas (nesame tikri, kad tai mūsų taikinys). */
const LEGACY_WIDGET_TABLE_RE = /<table[^>]*>(?:(?!<\/table>)[\s\S])*?favorite_(?:5|9|10)_link\d+_(?:dainos|atlikejai|albumai)(?:(?!<\/table>)[\s\S])*?<\/table>/gi

/** Single row matcher (po stripp'inimo galim re-parsint visą widget kabliuku
 *  ID'us + display name'us — daugiau metadata UI'ui). */
const LEGACY_WIDGET_ROW_RE = /<tr[^>]*>(?:(?!<\/tr>)[\s\S])*?favorite_(\d+)_link(\d+)_(\w+)(?:(?!<\/tr>)[\s\S])*?<\/tr>/gi
const TRACK_LINK_RE = /<a[^>]+href=["'][^"']*\/lt\/(daina|grupe|albumas)\/[^/"]+\/(\d+)\/["'][^>]*(?:title=["']([^"']*)["'])?[^>]*>([^<]+?)<\/a>/i

/** Resolve'ina extracted music į DB tracks pagal spotify_id arba YouTube video ID.
 *  Match'inami pavieniai track'ai per tracks.spotify_id arba tracks.video_url ILIKE.
 *  Grąžina enriched copy'ą su `db_track` užpildytais (kai match'inasi) — kitiems
 *  paliekamas undefined. UI pagal tai sprendžia ar rodyti „Daugiau" pill (nuorodą
 *  į pilną /dainos/<slug> page'ą su lyrics + komentarais). */
export async function resolveEmbedsToDbTracks(
  tracks: ExtractedTrack[],
  sb: { from: (t: string) => any },
): Promise<ExtractedTrack[]> {
  const spotifyIds = tracks
    .filter(t => t.source === 'spotify' && t.key.startsWith('sp:track:'))
    .map(t => t.key.replace('sp:track:', ''))
  const ytIds = tracks
    .filter(t => t.source === 'youtube')
    .map(t => t.key.replace('yt:', ''))

  if (spotifyIds.length === 0 && ytIds.length === 0) return tracks

  type TrackRow = { id: number; slug: string | null; spotify_id: string | null; video_url: string | null;
                    artists: { slug: string | null } | { slug: string | null }[] | null }

  const [spotifyRes, ytRes] = await Promise.all([
    spotifyIds.length
      ? sb.from('tracks')
          .select('id, slug, spotify_id, video_url, artists:artist_id(slug)')
          .in('spotify_id', spotifyIds)
      : Promise.resolve({ data: [] as TrackRow[] }),
    ytIds.length
      ? // Match per video_url contains youtu.be/<id> or watch?v=<id> — using OR'd ilike
        sb.from('tracks')
          .select('id, slug, spotify_id, video_url, artists:artist_id(slug)')
          .or(ytIds.map(id => `video_url.ilike.%${id}%`).join(','))
      : Promise.resolve({ data: [] as TrackRow[] }),
  ])

  const bySpotify = new Map<string, TrackRow>()
  for (const row of (spotifyRes.data || [])) {
    if (row.spotify_id) bySpotify.set(row.spotify_id, row)
  }
  const byYt = new Map<string, TrackRow>()
  for (const row of (ytRes.data || [])) {
    const u = row.video_url || ''
    for (const id of ytIds) {
      if (u.includes(id)) {
        byYt.set(id, row)
        break
      }
    }
  }

  return tracks.map(t => {
    if (t.source === 'spotify') {
      const sid = t.key.replace('sp:track:', '')
      const row = bySpotify.get(sid)
      if (row) {
        const artist = Array.isArray(row.artists) ? row.artists[0] : row.artists
        return { ...t, db_track: { id: row.id, slug: row.slug, artist_slug: artist?.slug ?? null } }
      }
    }
    if (t.source === 'youtube') {
      const yid = t.key.replace('yt:', '')
      const row = byYt.get(yid)
      if (row) {
        const artist = Array.isArray(row.artists) ? row.artists[0] : row.artists
        return { ...t, db_track: { id: row.id, slug: row.slug, artist_slug: artist?.slug ?? null } }
      }
    }
    return t
  })
}


/** Praturtina ExtractedTrack'us su Spotify/YouTube oEmbed metadata.
 *  Tikslas: žinoti realų track title + artist iš embed URL'o.
 *  Spotify oEmbed grąžina `title` formatu "Artist - Track" — split'inam.
 *  YouTube oEmbed grąžina `title` + `author_name` atskirai.
 *
 *  Veikia paraleliai per Promise.all. Next.js fetch cache automatic'ai
 *  cachina rezultatus, tad next request'as gauna metadata be HTTP.
 *  Klaidos (timeout, 4xx) ignored — track lieka be metadata. */
export async function enrichTracksWithOembed(tracks: ExtractedTrack[]): Promise<ExtractedTrack[]> {
  const results = await Promise.allSettled(tracks.map(async (t) => {
    if (t.title) return t  // jau turim (legacy widget rows)
    try {
      if (t.source === 'spotify') {
        const id = t.key.split(':').pop() || ''
        const kind = t.key.split(':')[1] || 'track'
        // Paraleliai: oEmbed (mažas JSON su title + thumb) + track page'as
        // (og:description turi `Artist · Album · Song · YYYY` pattern'ą).
        const [oembedRes, pageRes] = await Promise.all([
          fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/${kind}/${id}`, {
            next: { revalidate: 60 * 60 * 24 * 7 },
          }).catch(() => null),
          fetch(`https://open.spotify.com/${kind}/${id}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            next: { revalidate: 60 * 60 * 24 * 7 },
          }).catch(() => null),
        ])
        let title: string | undefined
        let cover: string | undefined
        let artist: string | undefined
        if (oembedRes?.ok) {
          const d = await oembedRes.json() as { title?: string; thumbnail_url?: string }
          title = d.title
          cover = d.thumbnail_url
        }
        if (pageRes?.ok) {
          const html = await pageRes.text()
          // og:description = "Artist · Album · Song · YYYY" (tracks);
          //                  "Album · Artist · Year"        (albums);
          //                  "Listeners · Followers"        (artists)
          const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']+)["']/i)
          if (ogDescMatch) {
            const desc = ogDescMatch[1]
            const parts = desc.split(' · ').map(s => s.trim()).filter(Boolean)
            if (kind === 'track' && parts.length >= 3) {
              artist = parts[0]
            } else if (kind === 'album' && parts.length >= 2) {
              artist = parts[1]
            }
          }
          // Fallback title iš og:title
          if (!title) {
            const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
            if (ogTitleMatch) title = ogTitleMatch[1]
          }
        }
        return {
          ...t,
          title: title || t.title,
          artist_name: artist || t.artist_name,
          cover_url: cover || t.cover_url,
        }
      }
      if (t.source === 'youtube') {
        const ytId = t.key.split(':').pop() || ''
        const r = await fetch(`https://www.youtube.com/oembed?url=https://youtube.com/watch?v=${ytId}&format=json`, {
          next: { revalidate: 60 * 60 * 24 * 7 },
        })
        if (!r.ok) return t
        const d = await r.json() as { title?: string; author_name?: string; thumbnail_url?: string }
        return {
          ...t,
          title: d.title || t.title,
          artist_name: d.author_name || t.artist_name,
          cover_url: d.thumbnail_url || t.cover_url,
        }
      }
    } catch {/* silent */ }
    return t
  }))
  return results.map((r, i) => r.status === 'fulfilled' ? r.value : tracks[i])
}


export function extractMusicFromBody(html: string): BlogContentExtracted {
  if (!html) return { cleanedHtml: '', music: [] }

  // Patterns: track ordering reflects iteration over `html`. Sukam vienu pass'u,
  // bet po iteracijos paliekam original string nepakeistą — keičiam vėliau visu
  // batch'u (replace all). Tai apsaugo nuo offset drift'o tarpiniam string'e.
  type Hit = { start: number; end: number; track: ExtractedTrack }
  const hits: Hit[] = []

  // YouTube
  YT_EMBED_RE.lastIndex = 0
  for (let m: RegExpExecArray | null; (m = YT_EMBED_RE.exec(html)) !== null; ) {
    const ytId = m[1]
    hits.push({
      start: m.index,
      end: m.index + m[0].length,
      track: {
        source: 'youtube',
        key: `yt:${ytId}`,
        embed_url: `https://www.youtube-nocookie.com/embed/${ytId}?rel=0`,
        source_url: `https://youtube.com/watch?v=${ytId}`,
        cover_url: `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`,
      },
    })
  }

  // Spotify
  SPOTIFY_EMBED_RE.lastIndex = 0
  for (let m: RegExpExecArray | null; (m = SPOTIFY_EMBED_RE.exec(html)) !== null; ) {
    const kind = m[1]
    const id = m[2]
    hits.push({
      start: m.index,
      end: m.index + m[0].length,
      track: {
        source: 'spotify',
        key: `sp:${kind}:${id}`,
        embed_url: `https://open.spotify.com/embed/${kind}/${id}?utm_source=mlt`,
        source_url: `https://open.spotify.com/${kind}/${id}`,
      },
    })
  }

  // Legacy favorite widget — parsint rows į music_lt entries. Strip'inam VISĄ
  // table'ą (ne row-by-row), bet metadata'ą imam iš row'ų.
  //
  // EDGE CASE: scraper'is kartais cut'ino body PRIEŠ </table>, tad table'as
  // gali būti unclosed. Detektuojam per `<table[^>]*>` markerį TIK jei viduje
  // yra `favorite_<mod>_link<id>` ID pattern — kitaip lieka regular table'as.
  // Strip'inam iki `</table>` arba iki end-of-string (kas pirmesnis).
  const tableMatches: Array<{ start: number; end: number }> = []
  const OPEN_TABLE_RE = /<table[^>]*>/gi
  OPEN_TABLE_RE.lastIndex = 0
  for (let m: RegExpExecArray | null; (m = OPEN_TABLE_RE.exec(html)) !== null; ) {
    const openStart = m.index
    const closeIdx = html.indexOf('</table>', m.index)
    const endIdx = closeIdx >= 0 ? closeIdx + '</table>'.length : html.length
    const tableHtml = html.slice(openStart, endIdx)
    // Tik widget'us su `favorite_<mod>_link<id>_<anything>` ID pattern strip'inam.
    // music.lt naudoja `_dainos` suffix'ą visiems mod'ams (5=artist, 9=track,
    // 10=album), ne tik dainoms. Todėl kind sufiksas tikrinamas plačiai (\w+).
    if (!/favorite_(?:5|9|10)_link\d+_\w+/i.test(tableHtml)) continue
    tableMatches.push({ start: openStart, end: endIdx })
    // Re-parse rows in this table
    LEGACY_WIDGET_ROW_RE.lastIndex = 0
    for (let rm: RegExpExecArray | null; (rm = LEGACY_WIDGET_ROW_RE.exec(tableHtml)) !== null; ) {
      const mod = parseInt(rm[1])
      const legacyId = parseInt(rm[2])
      const kindMap: Record<number, 'track' | 'artist' | 'album'> = { 5: 'artist', 9: 'track', 10: 'album' }
      const kind = kindMap[mod]
      if (!kind) continue

      const rowHtml = rm[0]
      // Cover: <img src="...groups/X/Y/small/Z.jpg" .../>
      const coverMatch = rowHtml.match(/<img[^>]+src=["']([^"']*\/(?:groups|albumai|tracks)\/[^"']+)["']/i)
      const cover = coverMatch ? coverMatch[1] : undefined

      // Title + artist iš text link'ų — du dažniausi pattern'ai:
      //   Track row: <a href="/lt/grupe/..."><b>ArtistName</b></a> - <a href="/lt/daina/...">TrackName</a>
      //   Artist row: <a href="/lt/grupe/..."><b>ArtistName</b></a>
      //   Album row: <a href="/lt/grupe/..."><b>ArtistName</b></a> - <a href="/lt/albumas/...">AlbumName</a>
      let title: string | undefined
      let artist_name: string | undefined
      const linksInRow: Array<{ kind: string; id: number; text: string }> = []
      const allLinkRe = /<a[^>]+href=["'][^"']*\/lt\/(daina|grupe|albumas)\/[^/"]+\/(\d+)\/["'][^>]*>([\s\S]*?)<\/a>/gi
      for (let lm: RegExpExecArray | null; (lm = allLinkRe.exec(rowHtml)) !== null; ) {
        const text = lm[3].replace(/<[^>]+>/g, '').trim()
        linksInRow.push({ kind: lm[1], id: parseInt(lm[2]), text })
      }
      if (kind === 'track') {
        const trackLink = linksInRow.find(l => l.kind === 'daina' && l.id === legacyId)
        const artistLink = linksInRow.find(l => l.kind === 'grupe')
        title = trackLink?.text
        artist_name = artistLink?.text
      } else if (kind === 'album') {
        const albumLink = linksInRow.find(l => l.kind === 'albumas' && l.id === legacyId)
        const artistLink = linksInRow.find(l => l.kind === 'grupe')
        title = albumLink?.text
        artist_name = artistLink?.text
      } else if (kind === 'artist') {
        const artistLink = linksInRow.find(l => l.kind === 'grupe' && l.id === legacyId)
        title = artistLink?.text
      }

      // Note: hits start = parent table start; ordering preserved.
      hits.push({
        start: m.index + (rm.index || 0),
        end:   m.index + (rm.index || 0) + rowHtml.length,
        track: {
          source: 'music_lt',
          key: `mlt:${kind}:${legacyId}`,
          title,
          artist_name,
          cover_url: cover,
          // Direct embed nelaikom — music.lt nedavė iframe'o, tik thumb. UI naudoja
          // legacy_id resolve'inti į track page'ą, jei track bus migruotas. Tuo
          // tarpu rodom tik display info (artist + title).
          embed_url: '',
          source_url: undefined,
          legacy_id: legacyId,
          legacy_kind: kind,
        },
      })
    }
  }

  // Sort hits by start position
  hits.sort((a, b) => a.start - b.start)
  const music = hits.map(h => h.track)

  // Strip TIK legacy favorite widget table'us — iframe'ai LIEKA body'je,
  // kad autoriaus pozicionavimas (kur jis YouTube/Spotify embed'us įdėjo
  // tarp paragrafų) būtų išsaugotas. Sidebar'as gauna metadata kopijas,
  // bet originaliai patalpa straipsnyje neperkraunama.
  const stripRanges: Array<{ start: number; end: number }> = []
  for (const t of tableMatches) stripRanges.push(t)
  stripRanges.sort((a, b) => b.start - a.start)
  let cleaned = html
  for (const { start, end } of stripRanges) {
    cleaned = cleaned.slice(0, start) + cleaned.slice(end)
  }
  // Tidy: post-iframe `<p>...</p>` wrappers ofttimes empty after strip → drop them
  cleaned = cleaned.replace(/<p[^>]*>\s*<\/p>/gi, '')
  // Empty paragraphs su tik &nbsp; ar whitespace
  cleaned = cleaned.replace(/<p[^>]*>(?:&nbsp;|\s)*<\/p>/gi, '')
  // Drop'inam malformed dangling tags like </img></hr></hr></hr> (scraper artifact)
  cleaned = cleaned.replace(/<\/(img|hr|br|input)>/gi, '')
  // Drop'inam KIEKVIENĄ HR separator'ią — anksčiau buvo widget'o boundary'us,
  // po strip'inimo lieka tušti (visi blog posts iš senos sistemos turi tris
  // <hr> seką prieš favorite widget'ą, dabar atrodo kaip random separator'iai).
  cleaned = cleaned.replace(/<hr[^>]*\/?>/gi, '')
  // Empty span'ai
  cleaned = cleaned.replace(/<span[^>]*>\s*<\/span>/gi, '')
  // jRating widget / registration prompts (kartais leak'ina iš music.lt)
  cleaned = cleaned.replace(/<div[^>]*id=["']jRating["'][^>]*>[\s\S]*?<\/div>/gi, '')
  // Stray noscript
  cleaned = cleaned.replace(/<noscript>[\s\S]*?<\/noscript>/gi, '')
  // Trailing whitespace
  cleaned = cleaned.replace(/\s+$/g, '')

  return { cleanedHtml: cleaned, music }
}
