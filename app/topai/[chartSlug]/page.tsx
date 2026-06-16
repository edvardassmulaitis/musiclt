import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'
import ChartFullView, { type FullEntry, type FullChart } from '@/components/ChartFullView'

export const dynamic = 'force-dynamic'

/** YouTube video id iš video_url. */
function ytId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = String(url).match(/(?:v=|youtu\.be\/|embed\/|shorts\/|\/vi\/)([\w-]{11})/)
  return m ? m[1] : null
}
function ytThumb(url: string | null | undefined): string | null {
  const id = ytId(url)
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null
}

/* Konsensuso šaltinio raktas → žmoniškas pavadinimas. */
const SOURCE_LABEL: Record<string, string> = {
  agata: 'AGATA', apple: 'Apple Music', spotify: 'Spotify', billboard: 'Billboard',
  official_uk: 'Official UK', mama: 'M.A.M.A', shazam: 'Shazam', youtube: 'YouTube',
}

/* slug → šalies kodas vėliavai (mirror'as /topai hub'o logikos). null = pasaulis. */
const CHART_COUNTRY: Record<string, string | null> = {
  'consensus-lt': 'lt', 'consensus-us': 'us', 'consensus-uk': 'gb',
  'consensus-world': null, 'consensus-shazam_world': null, 'consensus-albums': null,
  'agata-singles': 'lt', 'apple-lt_songs': 'lt', 'spotify-lt': 'lt', 'mama-top40': 'lt', 'shazam-lt': 'lt', 'agata-albums': 'lt',
  'spotify-global': null, 'billboard-global200': null,
  'apple-us_songs': 'us', 'spotify-us': 'us', 'billboard-hot100': 'us', 'shazam-us': 'us', 'billboard-albums': 'us',
  'apple-gb_songs': 'gb', 'spotify-uk': 'gb', 'official_uk-singles': 'gb', 'shazam-uk': 'gb', 'official_uk-albums': 'gb',
  'shazam-de': 'de', 'shazam-fr': 'fr', 'shazam-br': 'br', 'shazam-es': 'es', 'shazam-mx': 'mx',
}

/* slug = `${source}-${chart_key}` (pvz. „agata-singles", „consensus-us"). */
async function loadChart(slug: string) {
  const sb = createAdminClient()
  const { data: charts } = await sb
    .from('external_charts')
    .select('id, source, chart_key, title, subtitle, accent, scope, size, source_url, attribution, period_label, country')
    .eq('is_current', true)
  const chart = (charts || []).find((c: any) => `${c.source}-${c.chart_key}` === slug)
  if (!chart) return null
  const isAlbum = chart.chart_key === 'albums'

  const rows: any[] = []
  let from = 0
  for (;;) {
    const { data } = await sb
      .from('external_chart_entries')
      .select(`
        id, position, prev_position, weeks_on_chart, is_new, meta,
        artist_name, title, cover_url, resolve_state, track_id, album_id,
        tracks:track_id ( id, slug, title, cover_url, video_url, artists:artist_id ( slug, name ) ),
        albums:album_id ( id, slug, title, cover_image_url, artists:artist_id ( slug, name ) )
      `)
      .eq('chart_id', chart.id)
      .order('position', { ascending: true })
      .range(from, from + 999)
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < 1000) break
    from += 1000
  }

  const entries: FullEntry[] = rows.map((e: any) => {
    const ent = isAlbum
      ? (Array.isArray(e.albums) ? e.albums[0] : e.albums)
      : (Array.isArray(e.tracks) ? e.tracks[0] : e.tracks)
    const ar = ent ? (Array.isArray(ent.artists) ? ent.artists[0] : ent.artists) : null
    let href: string | null = null
    if (ent) {
      const base = isAlbum ? 'albumai' : 'dainos'
      href = ar?.slug ? `/${base}/${ar.slug}-${ent.slug}-${ent.id}` : `/${base}/${ent.slug}-${ent.id}`
    }
    const metaSrcs: string[] = Array.isArray(e.meta?.sources)
      ? Array.from(new Set(e.meta.sources.map((s: any) => SOURCE_LABEL[s.source] || s.source)))
      : []
    // SVARBU: jei įrašas SUTVARKYTAS (priskirtas katalogo entity) — rodom
    // katalogo title/atlikėją (švarų, kaip dainos puslapyje), NE scrape'intą
    // tekstą („(w/ Jennie)", VISKAS DIDŽIOSIOMIS ir pan.). Fallback į raw tik
    // kai įrašas dar nepriskirtas.
    const cleanTitle = ent?.title || e.title
    const cleanArtist = ar?.name || e.artist_name
    return {
      position: e.position, prevPosition: e.prev_position ?? null,
      artistName: cleanArtist, title: cleanTitle,
      coverUrl: ent?.cover_url || ent?.cover_image_url || ytThumb(ent?.video_url) || e.cover_url || null,
      href,
      sources: metaSrcs,
      videoId: isAlbum ? null : ytId(ent?.video_url),
      query: `${cleanArtist} ${cleanTitle}`,
    }
  })

  // Konsensuso topui — surenkam šaltinių chart'us (nuorodoms „Sudaryta iš").
  let sourceCharts: { title: string; slug: string }[] = []
  if (chart.source === 'consensus') {
    const pairs = new Set<string>()
    for (const r of rows) for (const s of (r.meta?.sources || [])) pairs.add(`${s.source}:${s.chart_key}`)
    if (pairs.size > 0) {
      const wantSrc = Array.from(new Set(Array.from(pairs).map(p => p.split(':')[0])))
      const { data: scs } = await sb
        .from('external_charts').select('source, chart_key, title')
        .eq('is_current', true).in('source', wantSrc)
      sourceCharts = (scs || [])
        .filter((c: any) => pairs.has(`${c.source}:${c.chart_key}`))
        .map((c: any) => ({ title: c.title, slug: `${c.source}-${c.chart_key}` }))
    }
  }

  // Vėliavai: pirma slug map'as (mirror'as hub'o), tada DB country (2 raidės), kitaip null.
  const dbCc = typeof chart.country === 'string' && /^[a-z]{2}$/i.test(chart.country) ? chart.country.toLowerCase() : null
  const flagCountry = slug in CHART_COUNTRY ? CHART_COUNTRY[slug] : dbCc

  const full: FullChart = {
    title: chart.title, subtitle: chart.subtitle ?? null, accent: chart.accent || '#6366f1',
    size: chart.size ?? entries.length, attribution: chart.attribution ?? null,
    periodLabel: chart.period_label ?? null, sourceUrl: chart.source_url ?? null,
    isConsensus: chart.source === 'consensus', isAlbum, country: flagCountry, sourceCharts,
  }
  return { full, entries }
}

export async function generateMetadata({ params }: { params: Promise<{ chartSlug: string }> }): Promise<Metadata> {
  const { chartSlug } = await params
  const data = await loadChart(chartSlug)
  if (!data) return { title: 'Topas nerastas | music.lt' }
  return {
    title: `${data.full.title} — pilnas topas | music.lt`,
    description: data.full.subtitle || `Pilnas ${data.full.title} reitingas — music.lt`,
  }
}

export default async function ChartFullPage({ params }: { params: Promise<{ chartSlug: string }> }) {
  const { chartSlug } = await params
  const data = await loadChart(chartSlug)
  if (!data) notFound()
  return <ChartFullView chart={data.full} entries={data.entries} />
}
