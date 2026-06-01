import { Metadata } from 'next'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase'
import { getCurrentWeekMonday } from '@/lib/top-week'
import { proxyImg } from '@/lib/img-proxy'

export const metadata: Metadata = {
  title: 'Muzikos topai — konsensuso reitingai, AGATA, Billboard, Shazam | music.lt',
  description: 'Visi muzikos topai vienoje vietoje. music.lt konsensuso reitingai apjungia Apple Music, Spotify, Billboard, AGATA ir Shazam į vieną tikslų vaizdą — Lietuvai, JAV, UK ir pasauliui.',
}

// Hub priklauso nuo live top40/top30 + išorinių chart'ų — turi būti dynamic.
export const dynamic = 'force-dynamic'

/* ───────────────────────────── Types ───────────────────────────── */
type Mini = {
  position: number
  title: string
  artistName: string
  artistSlug: string
  trackSlug: string | null
  coverUrl: string | null
  totalVotes: number
}

type ExtEntry = {
  position: number
  prevPosition: number | null
  artistName: string
  title: string
  coverUrl: string | null
}
type ExtChart = {
  source: string
  chartKey: string
  title: string
  subtitle: string | null
  accent: string
  scope: string
  size: number
  sourceUrl: string | null
  attribution: string | null
  periodLabel: string
  entries: ExtEntry[]
  sourceLabels: string[]   // konsensuso šaltinių žmoniški pavadinimai
}

/* Šaltinio raktas → žmoniškas pavadinimas (badge'ams). */
const SOURCE_LABEL: Record<string, string> = {
  agata: 'AGATA', apple: 'Apple Music', spotify: 'Spotify', billboard: 'Billboard',
  official_uk: 'Official UK', mama: 'M.A.M.A', shazam: 'Shazam', youtube: 'YouTube',
}
function sourceLabelsFromAttribution(attr: string | null): string[] {
  if (!attr) return []
  const after = attr.includes('·') ? attr.split('·').slice(1).join('·') : ''
  if (!after) return []
  return after.split(',').map(s => SOURCE_LABEL[s.trim()] || s.trim()).filter(Boolean)
}

/** YouTube thumbnail iš video_url (fallback kai track neturi cover_url). */
function ytThumb(url: string | null | undefined): string | null {
  if (!url) return null
  const m = String(url).match(/(?:v=|youtu\.be\/|embed\/|shorts\/|\/vi\/)([\w-]{11})/)
  return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : null
}

/* ───────────────────────── Core voting charts ───────────────────────── */
async function getMiniChart(topType: string, limit = 5): Promise<Mini[]> {
  const supabase = createAdminClient()
  const thisMonday = getCurrentWeekMonday()
  const { data: week } = await supabase
    .from('top_weeks')
    .select('id, is_finalized')
    .eq('top_type', topType)
    .eq('week_start', thisMonday)
    .maybeSingle()
  if (!week) return []

  const { data: rows } = await supabase
    .from('top_entries')
    .select(`
      position, total_votes,
      tracks:track_id ( slug, title, cover_url, artists:artist_id ( slug, name ) )
    `)
    .eq('week_id', week.id)
    .order(week.is_finalized ? 'position' : 'total_votes', { ascending: !!week.is_finalized })
    .limit(limit)

  return (rows || []).map((r: any, i: number) => {
    const tr = Array.isArray(r.tracks) ? r.tracks[0] : r.tracks
    const ar = tr ? (Array.isArray(tr.artists) ? tr.artists[0] : tr.artists) : null
    return {
      position: r.position ?? (i + 1),
      title: tr?.title ?? '—',
      artistName: ar?.name ?? '—',
      artistSlug: ar?.slug ?? '',
      trackSlug: tr?.slug ?? null,
      coverUrl: tr?.cover_url ?? null,
      totalVotes: r.total_votes ?? 0,
    }
  })
}

/* ───────────────────── External charts (defensive) ───────────────────── */
async function getExternalCharts(): Promise<ExtChart[]> {
  try {
    const supabase = createAdminClient()
    const { data: charts, error } = await supabase
      .from('external_charts')
      .select('id, source, chart_key, title, subtitle, accent, scope, size, source_url, attribution, period_label')
      .eq('is_current', true)
    if (error || !charts || charts.length === 0) return []

    const ids = charts.map((c: any) => c.id)
    const { data: entries } = await supabase
      .from('external_chart_entries')
      .select(`chart_id, position, prev_position, artist_name, title, cover_url,
        tracks:track_id ( cover_url, video_url ),
        albums:album_id ( cover_image_url )`)
      .in('chart_id', ids)
      .lte('position', 5)
      .order('position', { ascending: true })

    const byChart = new Map<number, ExtEntry[]>()
    for (const e of (entries || []) as any[]) {
      const tr = Array.isArray(e.tracks) ? e.tracks[0] : e.tracks
      const al = Array.isArray(e.albums) ? e.albums[0] : e.albums
      const arr = byChart.get(e.chart_id) || []
      arr.push({
        position: e.position,
        prevPosition: e.prev_position ?? null,
        artistName: e.artist_name,
        title: e.title,
        coverUrl: tr?.cover_url || al?.cover_image_url || ytThumb(tr?.video_url) || e.cover_url || null,
      })
      byChart.set(e.chart_id, arr)
    }

    return (charts as any[]).map(c => ({
      source: c.source,
      chartKey: c.chart_key,
      title: c.title,
      subtitle: c.subtitle ?? null,
      accent: c.accent ?? '#6366f1',
      scope: c.scope ?? 'lt',
      size: c.size ?? 100,
      sourceUrl: c.source_url ?? null,
      attribution: c.attribution ?? null,
      periodLabel: c.period_label,
      entries: byChart.get(c.id) || [],
      sourceLabels: c.source === 'consensus' ? sourceLabelsFromAttribution(c.attribution) : [],
    }))
  } catch {
    return []
  }
}

/* Konsensuso rinkų tvarka. */
const CONSENSUS_ORDER = ['lt', 'us', 'uk', 'world']
const TRENDING_ORDER = ['trending_lt', 'trending_global']

/* ───────────────────────────── Page ───────────────────────────── */
export default async function TopaiHubPage() {
  const [top40, top30, ext] = await Promise.all([
    getMiniChart('top40', 5),
    getMiniChart('lt_top30', 5),
    getExternalCharts(),
  ])

  const byKey = (s: string, k: string) => ext.find(c => c.source === s && c.chartKey === k)
  const consensus = CONSENSUS_ORDER.map(k => byKey('consensus', k)).filter(Boolean) as ExtChart[]
  const trending = TRENDING_ORDER.map(k => byKey('consensus', k)).filter(Boolean) as ExtChart[]
  const albums = ext.filter(c => c.chartKey === 'albums' && c.source !== 'consensus')
  // Žali šaltiniai (iš kurių sudaromas konsensusas) — be consensus ir be albumų.
  const rawSingles = ext.filter(c => c.source !== 'consensus' && c.chartKey !== 'albums')
  const rawLt = rawSingles.filter(c => c.scope === 'lt')
  const rawWorld = rawSingles.filter(c => c.scope === 'world')
  const rawSocial = rawSingles.filter(c => c.scope === 'social')

  return (
    <div className="tp">
      <style>{styles}</style>

      {/* ───────── Hero ───────── */}
      <header className="tp-hero">
        <div className="tp-hero-badge">
          <span className="tp-hero-dot" /> Atnaujinama kas savaitę
        </div>
        <h1 className="tp-hero-title">Muzikos topai</h1>
        <p className="tp-hero-sub">
          music.lt <strong>konsensuso reitingai</strong> apjungia Apple Music, Spotify, Billboard, AGATA ir
          Shazam į vieną tikslų vaizdą — kas iš tikrųjų populiariausia Lietuvoje, JAV, UK ir pasaulyje.
          Šalia — nuosavi <strong>TOP 40</strong> ir <strong>LT TOP 30</strong> bei visi šaltiniai atskirai.
        </p>
      </header>

      {/* ───────── PAGRINDINIAI (voting highlight) ───────── */}
      <section className="tp-section">
        <SectionHead label="Pagrindiniai topai" sub="music.lt savaitiniai reitingai — balsuok ir formuok rezultatą" />
        <div className="tp-feature-grid">
          <FeatureCard
            href="/top40" badge="Pagrindinis · Pasaulis" name="TOP 40"
            tagline="Karščiausi pasaulio hitai šią savaitę" accent="#f97316"
            entries={top40} footerLeft={top40.length > 0 ? `${top40.length} dainų top'e` : 'Formuojasi'} footerRight="Iki sekmadienio →"
          />
          <FeatureCard
            href="/top30" badge="Pagrindinis · Lietuva" name="LT TOP 30"
            tagline="Populiariausi lietuviški kūriniai" accent="#22c55e"
            entries={top30} footerLeft={top30.length > 0 ? `${top30.length} dainų top'e` : 'Formuojasi'} footerRight="Iki šeštadienio →"
          />
        </div>
      </section>

      {/* ───────── KONSENSUSO TOPAI (headline) ───────── */}
      {consensus.length > 0 && (
        <section className="tp-section" id="konsensusas">
          <SectionHead label="music.lt konsensusas" sub="Vienas reitingas iš visų rinkos šaltinių — tikra muzikos nuotrauka, ne kopija" />
          <div className="tp-cons-grid">
            {consensus.map(c => <ConsensusCard key={c.chartKey} chart={c} />)}
          </div>
        </section>
      )}

      {/* ───────── TRENDAI / ATRADIMAS ───────── */}
      {(trending.length > 0 || rawSocial.length > 0) && (
        <section className="tp-section" id="trendai">
          <SectionHead label="Trendai ir atradimas" sub="Kas sprogsta Shazam ir YouTube — greičiausiai populiarėjantys kūriniai" />
          {trending.length > 0 && (
            <div className="tp-cons-grid tp-cons-grid-sm">
              {trending.map(c => <ConsensusCard key={c.chartKey} chart={c} compact />)}
            </div>
          )}
          {rawSocial.length > 0 && (
            <div className="tp-src-grid" style={{ marginTop: trending.length ? 14 : 0 }}>
              {rawSocial.map(c => <SourceCard key={`${c.source}-${c.chartKey}`} chart={c} />)}
            </div>
          )}
        </section>
      )}

      {/* ───────── ALBUMAI ───────── */}
      {albums.length > 0 && (
        <section className="tp-section" id="albumai">
          <SectionHead label="Albumai" sub="Klausomiausi albumai — Lietuva, JAV ir UK" />
          <div className="tp-chart-grid">
            {albums.map(c => <ExtCard key={`${c.source}-${c.chartKey}`} chart={c} />)}
          </div>
        </section>
      )}

      {/* ───────── VISI ŠALTINIAI (antraeiliai) ───────── */}
      {rawSingles.length > 0 && (
        <section className="tp-section" id="saltiniai">
          <SectionHead label="Visi šaltiniai" sub="Žali reitingai, iš kurių sudaromas konsensusas — kiekvienas atskirai" />
          {rawLt.length > 0 && <SrcGroup title="Lietuva" charts={rawLt} />}
          {rawWorld.length > 0 && <SrcGroup title="Pasaulis" charts={rawWorld} />}
        </section>
      )}

      {/* ───────── DAUGIAU ───────── */}
      <section className="tp-section">
        <SectionHead label="Daugiau" sub="Apdovanojimai, balsavimai ir specializuoti reitingai" />
        <div className="tp-tile-grid">
          <Tile href="/apdovanojimai" name="Apdovanojimai" desc="M.A.M.A., Bravo ir kiti laureatai bei nominacijos." accent="#eab308" icon={ICON.award} />
          <Tile href="/balsavimai" name="Aktyvūs balsavimai" desc="Specialūs renginių, festivalių ir kategorijų reitingai." accent="#3b82f6" icon={ICON.vote} />
          <Tile href="/dienos-daina" name="Dienos daina" desc="Redakcijos ir bendruomenės renkama dienos daina." accent="#10b981" icon={ICON.song} />
          <Tile soon name="Lankytojų topai" desc="Susikurk savo TOP 10, dalinkis ir balsuok už kitų sąrašus." accent="#8b5cf6" icon={ICON.list} />
          <Tile soon name="Visų laikų topas" desc="Geriausios visų laikų dainos pagal bendruomenės balsus." accent="#f59e0b" icon={ICON.clock} />
          <Tile soon name="Žanrų topai" desc="Rokas, hip-hop, electronic, folk ir popsas atskirai." accent="#ec4899" icon={ICON.disc} />
        </div>
      </section>
    </div>
  )
}

/* ───────────────────────────── Components ───────────────────────────── */
function SectionHead({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="tp-sec-head">
      <h2 className="tp-sec-title">{label}</h2>
      {sub && <p className="tp-sec-sub">{sub}</p>}
    </div>
  )
}

function trendGlyph(pos: number, prev: number | null): { ch: string; cls: string } | null {
  if (prev == null) return { ch: 'NEW', cls: 'new' }
  if (prev > pos) return { ch: '▲', cls: 'up' }
  if (prev < pos) return { ch: '▼', cls: 'down' }
  return { ch: '–', cls: 'flat' }
}

function FeatureCard({ href, badge, name, tagline, accent, entries, footerLeft, footerRight }: {
  href: string; badge: string; name: string; tagline: string; accent: string
  entries: Mini[]; footerLeft: string; footerRight: string
}) {
  return (
    <Link href={href} className="tp-feature" style={{ ['--c' as any]: accent }}>
      <div className="tp-feature-head">
        <div className="tp-feature-meta">
          <span className="tp-feature-badge">{badge}</span>
          <h3 className="tp-feature-name">{name}</h3>
          <p className="tp-feature-tag">{tagline}</p>
        </div>
        <span className="tp-feature-cta">Žiūrėti →</span>
      </div>
      <div className="tp-feature-body">
        {entries.length === 0 ? (
          <div className="tp-empty">Sąrašas formuojasi</div>
        ) : entries.map(e => (
          <div key={e.position} className={`tp-row${e.position === 1 ? ' tp-row-1' : ''}`}>
            <span className="tp-pos">{e.position}</span>
            <span className="tp-cover">
              {e.coverUrl ? <img src={proxyImg(e.coverUrl, 80)} alt="" /> : '♪'}
            </span>
            <span className="tp-info">
              <span className="tp-title">{e.title}</span>
              <span className="tp-artist">{e.artistName}</span>
            </span>
            {e.totalVotes > 0 && <span className="tp-votes">{e.totalVotes} ♥</span>}
          </div>
        ))}
      </div>
      <div className="tp-feature-foot">
        <span><strong>{footerLeft}</strong></span>
        <span>{footerRight}</span>
      </div>
    </Link>
  )
}

/* Konsensuso kortelė — headline. Top 5 + šaltinių badge'ai + nuoroda į pilną. */
function ConsensusCard({ chart, compact }: { chart: ExtChart; compact?: boolean }) {
  const slug = `${chart.source}-${chart.chartKey}`
  const top = chart.entries.slice(0, compact ? 5 : 5)
  return (
    <Link href={`/topai/${slug}`} className={`tp-cons${compact ? ' is-compact' : ''}`} style={{ ['--c' as any]: chart.accent }}>
      <div className="tp-cons-head">
        <div className="tp-cons-meta">
          <span className="tp-cons-badge">Konsensusas</span>
          <h3 className="tp-cons-name">{chart.title}</h3>
          {chart.sourceLabels.length > 0 && (
            <div className="tp-cons-srcs">
              {chart.sourceLabels.map(s => <span key={s} className="tp-cons-src">{s}</span>)}
            </div>
          )}
        </div>
        <span className="tp-cons-cta">Pilnas →</span>
      </div>
      <div className="tp-cons-body">
        {top.length === 0 ? <div className="tp-empty">Formuojasi</div> : top.map(e => (
          <div key={e.position} className={`tp-row${e.position === 1 ? ' tp-row-1' : ''}`}>
            <span className="tp-pos">{e.position}</span>
            <span className="tp-cover">{e.coverUrl ? <img src={proxyImg(e.coverUrl, 80)} alt="" /> : '♪'}</span>
            <span className="tp-info">
              <span className="tp-title">{e.title}</span>
              <span className="tp-artist">{e.artistName}</span>
            </span>
          </div>
        ))}
      </div>
    </Link>
  )
}

/* Kompaktiška šaltinio kortelė (be entries) — „Visi šaltiniai" / social. */
function SourceCard({ chart }: { chart: ExtChart }) {
  const slug = `${chart.source}-${chart.chartKey}`
  return (
    <Link href={`/topai/${slug}`} className="tp-src" style={{ ['--c' as any]: chart.accent }}>
      <div className="tp-src-top">
        <span className="tp-src-dot" />
        <span className="tp-src-name">{chart.title}</span>
      </div>
      <div className="tp-src-foot">
        <span className="tp-src-size">TOP {chart.size}</span>
        <span className="tp-src-go">Žiūrėti →</span>
      </div>
    </Link>
  )
}

function SrcGroup({ title, charts }: { title: string; charts: ExtChart[] }) {
  return (
    <div className="tp-srcgrp">
      <h3 className="tp-srcgrp-title">{title}</h3>
      <div className="tp-src-grid">
        {charts.map(c => <SourceCard key={`${c.source}-${c.chartKey}`} chart={c} />)}
      </div>
    </div>
  )
}

function ExtCard({ chart }: { chart: ExtChart }) {
  return (
    <div className="tp-ext is-live" style={{ ['--c' as any]: chart.accent }}>
      <div className="tp-ext-head">
        <div className="tp-ext-meta">
          <h3 className="tp-ext-name">{chart.title}</h3>
          {chart.subtitle && <p className="tp-ext-sub">{chart.subtitle}</p>}
        </div>
        <span className="tp-ext-size">TOP {chart.size}</span>
      </div>
      <div className="tp-ext-body">
        {chart.entries.slice(0, 3).map(e => {
          const t = trendGlyph(e.position, e.prevPosition)
          return (
            <div key={e.position} className={`tp-row${e.position === 1 ? ' tp-row-1' : ''}`}>
              <span className="tp-pos">{e.position}</span>
              <span className="tp-cover">{e.coverUrl ? <img src={proxyImg(e.coverUrl, 80)} alt="" /> : '♪'}</span>
              <span className="tp-info">
                <span className="tp-title">{e.title}</span>
                <span className="tp-artist">{e.artistName}</span>
              </span>
              {t && <span className={`tp-trend ${t.cls}`}>{t.ch}</span>}
            </div>
          )
        })}
      </div>
      <div className="tp-ext-foot">
        <span className="tp-attr">{chart.attribution}{chart.periodLabel ? ` · ${chart.periodLabel}` : ''}</span>
        <Link href={`/topai/${chart.source}-${chart.chartKey}`} className="tp-ext-link tp-ext-full">Visas topas →</Link>
      </div>
    </div>
  )
}

function Tile({ href, name, desc, accent, icon, soon }: {
  href?: string; name: string; desc: string; accent: string; icon: React.ReactNode; soon?: boolean
}) {
  const inner = (
    <>
      {soon && <span className="tp-tile-soon">Netrukus</span>}
      <span className="tp-tile-icon">{icon}</span>
      <h3 className="tp-tile-name">{name}</h3>
      <p className="tp-tile-desc">{desc}</p>
    </>
  )
  if (soon || !href) return <div className="tp-tile soon" style={{ ['--c' as any]: accent }}>{inner}</div>
  return <Link href={href} className="tp-tile" style={{ ['--c' as any]: accent }}>{inner}</Link>
}

/* ───────────────────────────── Icons ───────────────────────────── */
const ICON = {
  award: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="9" r="6" /><path d="M8.21 13.89 7 22l5-3 5 3-1.21-8.11" /></svg>,
  vote: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 12 2 2 4-4" /><rect x="3" y="4" width="18" height="16" rx="2" /></svg>,
  song: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>,
  list: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>,
  clock: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
  disc: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></svg>,
}

/* ───────────────────────────── Styles ───────────────────────────── */
const styles = `
  .tp { max-width: 1280px; margin: 0 auto; padding: 42px 20px 88px; color: var(--text-primary); font-family: 'DM Sans', sans-serif; }

  /* Hero */
  .tp-hero { margin-bottom: 40px; }
  .tp-hero-badge {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 5px 12px; border-radius: 999px; margin-bottom: 16px;
    background: var(--bg-elevated); border: 1px solid var(--border-subtle);
    font-size: 11.5px; font-weight: 700; color: var(--text-muted); letter-spacing: 0.01em;
  }
  .tp-hero-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent-green); box-shadow: 0 0 0 3px rgba(34,197,94,0.18); }
  .tp-hero-title { margin: 0; font-family: 'Outfit', sans-serif; font-size: clamp(30px, 5vw, 46px); font-weight: 900; letter-spacing: -0.03em; line-height: 1.02; }
  .tp-hero-sub { margin: 14px 0 0; max-width: 74ch; color: var(--text-muted); font-size: 14.5px; line-height: 1.6; }
  .tp-hero-sub strong { color: var(--text-secondary); font-weight: 800; }

  /* Section */
  .tp-section { margin-top: 44px; scroll-margin-top: 84px; }
  .tp-sec-head { margin-bottom: 16px; }
  .tp-sec-title { margin: 0; font-family: 'Outfit', sans-serif; font-size: 20px; font-weight: 800; letter-spacing: -0.02em; }
  .tp-sec-sub { margin: 3px 0 0; color: var(--text-muted); font-size: 13px; }

  /* Shared rows */
  .tp-row { display: flex; align-items: center; gap: 11px; padding: 7px 6px; border-radius: 10px; }
  .tp-row + .tp-row { margin-top: 1px; }
  .tp-pos { width: 22px; flex-shrink: 0; text-align: center; font-weight: 900; font-size: 15px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
  .tp-row-1 .tp-pos { color: var(--c); font-size: 17px; }
  .tp-cover { width: 38px; height: 38px; border-radius: 8px; overflow: hidden; flex-shrink: 0; background: var(--bg-elevated); display: flex; align-items: center; justify-content: center; font-size: 14px; color: var(--text-muted); }
  .tp-cover img { width: 100%; height: 100%; object-fit: cover; }
  .tp-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .tp-title { font-size: 13px; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tp-artist { font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tp-votes { font-size: 11px; font-weight: 700; color: var(--text-secondary); flex-shrink: 0; }
  .tp-trend { font-size: 10px; font-weight: 800; flex-shrink: 0; width: 28px; text-align: right; }
  .tp-trend.up { color: var(--accent-green); }
  .tp-trend.down { color: var(--accent-red); }
  .tp-trend.flat { color: var(--text-muted); }
  .tp-trend.new { color: var(--c); font-size: 8.5px; letter-spacing: 0.04em; }
  .tp-empty { padding: 22px 0; text-align: center; color: var(--text-muted); font-size: 13px; }

  /* Feature cards (highlighted core charts) */
  .tp-feature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 820px) { .tp-feature-grid { grid-template-columns: 1fr; } }
  .tp-feature {
    --c: #f97316; position: relative; display: flex; flex-direction: column;
    background: var(--bg-surface); border: 1.5px solid var(--border-subtle); border-radius: 16px;
    overflow: hidden; text-decoration: none; transition: transform .18s, box-shadow .18s, border-color .18s;
  }
  .tp-feature::before { content: ''; position: absolute; inset: 0 0 auto; height: 3px; background: var(--c); opacity: 0.9; }
  .tp-feature:hover { transform: translateY(-3px); box-shadow: 0 22px 44px rgba(0,0,0,0.12); border-color: var(--c); }
  .tp-feature-head { padding: 20px 20px 14px; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; background: linear-gradient(135deg, color-mix(in srgb, var(--c) 9%, transparent) 0%, transparent 75%); }
  .tp-feature-meta { min-width: 0; }
  .tp-feature-badge { display: inline-block; padding: 3px 9px; border-radius: 999px; background: color-mix(in srgb, var(--c) 14%, transparent); color: var(--c); font-size: 9.5px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; }
  .tp-feature-name { margin: 8px 0 3px; font-family: 'Outfit', sans-serif; font-size: 27px; font-weight: 900; letter-spacing: -0.02em; color: var(--text-primary); }
  .tp-feature-tag { margin: 0; font-size: 12px; color: var(--text-muted); }
  .tp-feature-cta { flex-shrink: 0; padding: 7px 13px; border-radius: 9px; background: var(--c); color: #fff; font-size: 12px; font-weight: 700; }
  .tp-feature-body { padding: 12px 14px; flex: 1; }
  .tp-feature-foot { padding: 12px 16px; border-top: 1px solid var(--border-subtle); background: var(--bg-elevated); display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted); }
  .tp-feature-foot strong { color: var(--text-secondary); font-weight: 700; }

  /* Consensus cards (headline) */
  .tp-cons-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px; }
  .tp-cons-grid-sm { grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
  .tp-cons {
    --c: #6366f1; position: relative; display: flex; flex-direction: column;
    background: var(--bg-surface); border: 1.5px solid var(--border-subtle); border-radius: 15px;
    overflow: hidden; text-decoration: none; color: inherit; transition: transform .18s, box-shadow .18s, border-color .18s;
  }
  .tp-cons::before { content: ''; position: absolute; inset: 0 0 auto; height: 3px; background: var(--c); }
  .tp-cons:hover { transform: translateY(-3px); box-shadow: 0 18px 40px rgba(0,0,0,0.10); border-color: var(--c); }
  .tp-cons-head { padding: 16px 16px 12px; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; background: linear-gradient(135deg, color-mix(in srgb, var(--c) 8%, transparent) 0%, transparent 70%); }
  .tp-cons-meta { min-width: 0; }
  .tp-cons-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--c) 16%, transparent); color: var(--c); font-size: 9px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; }
  .tp-cons-name { margin: 7px 0 0; font-family: 'Outfit', sans-serif; font-size: 18px; font-weight: 900; letter-spacing: -0.02em; color: var(--text-primary); }
  .tp-cons-srcs { margin-top: 7px; display: flex; flex-wrap: wrap; gap: 4px; }
  .tp-cons-src { font-size: 9px; font-weight: 700; color: var(--text-muted); background: var(--bg-elevated); border: 1px solid var(--border-subtle); padding: 2px 6px; border-radius: 999px; }
  .tp-cons-cta { flex-shrink: 0; align-self: flex-start; padding: 5px 10px; border-radius: 8px; background: var(--c); color: #fff; font-size: 11px; font-weight: 700; }
  .tp-cons-body { padding: 10px 12px; flex: 1; }

  /* External chart cards */
  .tp-chart-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 14px; }
  .tp-ext {
    --c: #6366f1; display: flex; flex-direction: column; min-height: 200px;
    background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 14px; overflow: hidden;
    transition: border-color .18s, transform .18s, box-shadow .18s;
  }
  .tp-ext.is-live:hover { transform: translateY(-2px); box-shadow: 0 16px 34px rgba(0,0,0,0.08); border-color: var(--c); }
  .tp-ext-head { padding: 16px 16px 12px; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; border-bottom: 1px solid var(--border-subtle); }
  .tp-ext-meta { min-width: 0; }
  .tp-ext-name { margin: 0; font-family: 'Outfit', sans-serif; font-size: 15px; font-weight: 800; letter-spacing: -0.01em; color: var(--text-primary); }
  .tp-ext-sub { margin: 3px 0 0; font-size: 11.5px; color: var(--text-muted); line-height: 1.4; }
  .tp-ext-size { flex-shrink: 0; font-size: 10px; font-weight: 800; color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent); padding: 3px 8px; border-radius: 999px; white-space: nowrap; }
  .tp-ext-body { padding: 10px 12px; flex: 1; }
  .tp-ext-foot { padding: 10px 14px; border-top: 1px solid var(--border-subtle); background: var(--bg-elevated); display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .tp-attr { font-size: 10.5px; color: var(--text-muted); }
  .tp-ext-link { font-size: 11px; font-weight: 700; color: var(--c); text-decoration: none; }
  .tp-ext-link:hover { text-decoration: underline; }

  /* Source cards (compact, secondary) */
  .tp-srcgrp { margin-top: 6px; }
  .tp-srcgrp + .tp-srcgrp { margin-top: 18px; }
  .tp-srcgrp-title { margin: 0 0 9px; font-size: 12px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); }
  .tp-src-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
  .tp-src {
    --c: #6366f1; display: flex; flex-direction: column; justify-content: space-between; gap: 14px; min-height: 78px;
    padding: 13px 14px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 12px;
    text-decoration: none; color: inherit; transition: transform .15s, box-shadow .15s, border-color .15s;
  }
  .tp-src:hover { transform: translateY(-2px); box-shadow: 0 12px 26px rgba(0,0,0,0.07); border-color: var(--c); }
  .tp-src-top { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .tp-src-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--c); flex-shrink: 0; }
  .tp-src-name { font-size: 13.5px; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tp-src-foot { display: flex; align-items: center; justify-content: space-between; }
  .tp-src-size { font-size: 9.5px; font-weight: 800; color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent); padding: 2px 7px; border-radius: 999px; }
  .tp-src-go { font-size: 11px; font-weight: 700; color: var(--text-muted); }

  /* Tiles */
  .tp-tile-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 13px; }
  .tp-tile { --c: #6366f1; position: relative; display: flex; flex-direction: column; gap: 9px; min-height: 124px; padding: 17px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 13px; text-decoration: none; color: inherit; transition: transform .18s, box-shadow .18s, border-color .18s; }
  .tp-tile:not(.soon):hover { transform: translateY(-2px); box-shadow: 0 14px 30px rgba(0,0,0,0.07); border-color: var(--c); }
  .tp-tile.soon { opacity: 0.82; }
  .tp-tile-icon { width: 34px; height: 34px; border-radius: 9px; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--c) 12%, transparent); color: var(--c); }
  .tp-tile-name { margin: 0; font-family: 'Outfit', sans-serif; font-size: 15px; font-weight: 800; letter-spacing: -0.01em; color: var(--text-primary); }
  .tp-tile-desc { margin: 0; font-size: 12px; color: var(--text-muted); line-height: 1.45; flex: 1; }
  .tp-tile-soon { position: absolute; top: 13px; right: 13px; font-size: 8.5px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; padding: 3px 7px; border-radius: 999px; background: var(--bg-elevated); color: var(--text-muted); border: 1px solid var(--border-subtle); }
`
