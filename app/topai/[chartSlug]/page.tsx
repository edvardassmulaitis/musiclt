import { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'
import { proxyImg } from '@/lib/img-proxy'

export const dynamic = 'force-dynamic'

/* slug = `${source}-${chart_key}` (pvz. „agata-singles", „spotify-lt_weekly"). */
async function loadChart(slug: string) {
  const sb = createAdminClient()
  const { data: charts } = await sb
    .from('external_charts')
    .select('id, source, chart_key, title, subtitle, accent, scope, size, source_url, attribution, period_label')
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
        id, position, prev_position, weeks_on_chart, is_new,
        artist_name, title, cover_url, resolve_state, track_id, album_id,
        tracks:track_id ( id, slug, title, cover_url, artists:artist_id ( slug, name ) ),
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

  const entries = rows.map((e: any) => {
    const ent = isAlbum
      ? (Array.isArray(e.albums) ? e.albums[0] : e.albums)
      : (Array.isArray(e.tracks) ? e.tracks[0] : e.tracks)
    const ar = ent ? (Array.isArray(ent.artists) ? ent.artists[0] : ent.artists) : null
    let href: string | null = null
    if (ent) {
      const base = isAlbum ? 'albumai' : 'dainos'
      href = ar?.slug ? `/${base}/${ar.slug}-${ent.slug}-${ent.id}` : `/${base}/${ent.slug}-${ent.id}`
    }
    return {
      position: e.position, prevPosition: e.prev_position ?? null,
      artistName: e.artist_name, title: e.title,
      coverUrl: ent?.cover_url || ent?.cover_image_url || e.cover_url || null,
      href,
      // susietas atlikėjas (jei yra) — kad ir atlikėjo vardas vestų į profilį
      artistHref: ar?.slug ? `/atlikejai/${ar.slug}` : null,
      artistMatched: ar?.name || null,
    }
  })

  return { chart, isAlbum, entries }
}

export async function generateMetadata({ params }: { params: Promise<{ chartSlug: string }> }): Promise<Metadata> {
  const { chartSlug } = await params
  const data = await loadChart(chartSlug)
  if (!data) return { title: 'Topas nerastas | music.lt' }
  return {
    title: `${data.chart.title} — pilnas topas | music.lt`,
    description: data.chart.subtitle || `Pilnas ${data.chart.title} reitingas — music.lt`,
  }
}

function trendGlyph(pos: number, prev: number | null): { ch: string; cls: string } | null {
  if (prev == null) return { ch: 'NEW', cls: 'is-new' }
  if (prev > pos) return { ch: '▲', cls: 'is-up' }
  if (prev < pos) return { ch: '▼', cls: 'is-down' }
  return { ch: '–', cls: 'is-same' }
}

export default async function ChartFullPage({ params }: { params: Promise<{ chartSlug: string }> }) {
  const { chartSlug } = await params
  const data = await loadChart(chartSlug)
  if (!data) notFound()
  const { chart, isAlbum, entries } = data
  const matchedN = entries.filter(e => e.href).length

  return (
    <div className="tf-wrap" style={{ ['--c' as any]: chart.accent || '#6366f1' }}>
      <div className="tf-head">
        <Link href="/topai" className="tf-back">← Visi topai</Link>
        <h1 className="tf-title">{chart.title}</h1>
        {chart.subtitle && <p className="tf-sub">{chart.subtitle}</p>}
        <div className="tf-meta">
          <span className="tf-size">TOP {chart.size}</span>
          {chart.attribution && <span className="tf-attr">{chart.attribution}</span>}
          {chart.period_label && <span className="tf-attr">· {chart.period_label}</span>}
          {chart.source_url && (
            <a href={chart.source_url} target="_blank" rel="noopener noreferrer nofollow" className="tf-src">Šaltinis →</a>
          )}
        </div>
        <p className="tf-note">{isAlbum ? 'Albumai' : 'Dainos'} su nuoroda yra mūsų kataloge — paspausk ir pateksi į puslapį.</p>
      </div>

      <ol className="tf-list">
        {entries.map(e => {
          const t = trendGlyph(e.position, e.prevPosition)
          const Row = (
            <>
              <span className="tf-pos">{e.position}</span>
              <span className="tf-cover">{e.coverUrl ? <img src={proxyImg(e.coverUrl, 96)} alt="" /> : <span className="tf-cover-ph">♪</span>}</span>
              <span className="tf-info">
                <span className="tf-row-title">{e.title}</span>
                <span className="tf-row-artist">{e.artistName}</span>
              </span>
              {t && <span className={`tf-trend ${t.cls}`}>{t.ch}</span>}
              {e.href && <span className="tf-go" aria-hidden>›</span>}
            </>
          )
          return e.href ? (
            <li key={e.position} className="tf-row is-link">
              <Link href={e.href} className="tf-row-inner">{Row}</Link>
            </li>
          ) : (
            <li key={e.position} className="tf-row"><div className="tf-row-inner">{Row}</div></li>
          )
        })}
      </ol>

      {entries.length === 0 && <p className="tf-empty">Šis topas dar tuščias.</p>}
      <p className="tf-foot">{matchedN} iš {entries.length} įrašų susieta su katalogu.</p>

      <style>{styles}</style>
    </div>
  )
}

const styles = `
  .tf-wrap { max-width: 760px; margin: 0 auto; padding: 24px 16px 64px; }
  .tf-back { display: inline-block; font-size: 13px; font-weight: 600; color: var(--text-muted); text-decoration: none; margin-bottom: 14px; }
  .tf-back:hover { color: var(--c); }
  .tf-title { margin: 0; font-family: 'Outfit', sans-serif; font-size: 26px; font-weight: 900; letter-spacing: -0.02em; color: var(--text-primary); }
  .tf-sub { margin: 6px 0 0; font-size: 13.5px; color: var(--text-muted); }
  .tf-meta { margin-top: 12px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 11.5px; color: var(--text-muted); }
  .tf-size { font-weight: 800; color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent); padding: 3px 9px; border-radius: 999px; }
  .tf-src { color: var(--c); font-weight: 700; text-decoration: none; }
  .tf-note { margin: 14px 0 0; font-size: 12px; color: var(--text-muted); background: var(--surface-subtle, rgba(0,0,0,0.03)); padding: 8px 12px; border-radius: 10px; }
  .tf-list { list-style: none; margin: 18px 0 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .tf-row { border-radius: 12px; }
  .tf-row-inner { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border-radius: 12px; text-decoration: none; color: inherit; transition: background 0.14s; }
  .tf-row.is-link .tf-row-inner:hover { background: color-mix(in srgb, var(--c) 8%, transparent); }
  .tf-row.is-link .tf-row-title { color: var(--text-primary); }
  .tf-pos { width: 28px; flex-shrink: 0; text-align: center; font-family: 'Outfit', sans-serif; font-size: 15px; font-weight: 800; color: var(--text-muted); font-variant-numeric: tabular-nums; }
  .tf-cover { width: 44px; height: 44px; flex-shrink: 0; border-radius: 8px; overflow: hidden; background: var(--surface-subtle, rgba(0,0,0,0.05)); display: flex; align-items: center; justify-content: center; }
  .tf-cover img { width: 100%; height: 100%; object-fit: cover; }
  .tf-cover-ph { color: var(--text-muted); font-size: 18px; }
  .tf-info { min-width: 0; flex: 1; display: flex; flex-direction: column; }
  .tf-row-title { font-size: 14px; font-weight: 700; color: var(--text-primary); line-height: 1.25; }
  .tf-row-artist { font-size: 12px; color: var(--text-muted); }
  .tf-trend { flex-shrink: 0; font-size: 11px; font-weight: 800; width: 34px; text-align: right; }
  .tf-trend.is-up { color: #16a34a; } .tf-trend.is-down { color: #dc2626; }
  .tf-trend.is-same { color: var(--text-muted); } .tf-trend.is-new { color: var(--c); font-size: 9px; }
  .tf-go { flex-shrink: 0; font-size: 20px; font-weight: 700; color: var(--c); width: 14px; text-align: center; }
  .tf-empty, .tf-foot { margin-top: 20px; font-size: 12.5px; color: var(--text-muted); text-align: center; }
`
