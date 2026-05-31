import { Metadata } from 'next'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase'
import { getCurrentWeekMonday } from '@/lib/top-week'
import { proxyImg } from '@/lib/img-proxy'

export const metadata: Metadata = {
  title: 'Muzikos topai — TOP 40, LT TOP 30, AGATA ir pasaulio reitingai | music.lt',
  description: 'Visi muzikos topai vienoje vietoje — music.lt TOP 40 ir LT TOP 30, oficialus AGATA topas, Apple Music, Billboard, Official UK bei socialinių tinklų trendai.',
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

/* ───────────────────── External charts (defensive) ─────────────────────
 * Skaito external_charts (migracija 20260531). Kol migracija neaplikuota
 * arba lentelė tuščia — grąžina [], o UI parodo „Netrukus" būsenas. Tokiu
 * būdu puslapis veikia ir DABAR, ir automatiškai „atgyja" po ingestion. */
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
      .select('chart_id, position, prev_position, artist_name, title, cover_url')
      .in('chart_id', ids)
      .lte('position', 3)
      .order('position', { ascending: true })

    const byChart = new Map<number, ExtEntry[]>()
    for (const e of (entries || []) as any[]) {
      const arr = byChart.get(e.chart_id) || []
      arr.push({
        position: e.position,
        prevPosition: e.prev_position ?? null,
        artistName: e.artist_name,
        title: e.title,
        coverUrl: e.cover_url ?? null,
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
    }))
  } catch {
    return []
  }
}

/* ───────────────── Planuojami šaltiniai (placeholder katalogas) ─────────────────
 * Naudojami kai live duomenų dar nėra — kad sekcijos atrodytų pilnos ir
 * komunikuotų roadmap'ą. Kai ingestion įrašo external_charts su tuo pačiu
 * source+chart_key, live versija perima vietą (žr. mergePlanned). */
type Planned = {
  source: string; chartKey: string; title: string; subtitle: string
  accent: string; scope: 'lt' | 'world' | 'social'; size: number
  sourceUrl?: string; attribution?: string
}
const PLANNED: Planned[] = [
  // ── Lietuva ──
  { source: 'agata', chartKey: 'singles', title: 'AGATA Singlų TOP 100', subtitle: 'Oficialus LT klausymo platformų topas', accent: '#16a34a', scope: 'lt', size: 100, sourceUrl: 'https://www.agata.lt/lt/naujienos/', attribution: 'Šaltinis: AGATA' },
  { source: 'agata', chartKey: 'albums', title: 'AGATA Albumų TOP 100', subtitle: 'Klausomiausi albumai Lietuvoje', accent: '#0ea5e9', scope: 'lt', size: 100, sourceUrl: 'https://www.agata.lt/lt/naujienos/', attribution: 'Šaltinis: AGATA' },
  { source: 'mama', chartKey: 'top40', title: 'M.A.M.A TOP 40', subtitle: 'Populiariausi LT kūriniai Spotify (atnauj. penktadieniais)', accent: '#f59e0b', scope: 'lt', size: 40, sourceUrl: 'https://muzikosapdovanojimai.lt/m-a-m-a-top-40/', attribution: 'Šaltinis: M.A.M.A / Spotify' },
  { source: 'spotify', chartKey: 'lt', title: 'Spotify Lietuva', subtitle: 'Klausomiausios dainos Spotify Lietuvoje', accent: '#22c55e', scope: 'lt', size: 100, sourceUrl: 'https://kworb.net/spotify/country/lt_weekly.html', attribution: 'Spotify / kworb.net' },
  { source: 'apple', chartKey: 'lt_songs', title: 'Apple Music — Lietuva', subtitle: 'Klausomiausios dainos Apple Music LT', accent: '#ec4899', scope: 'lt', size: 100, sourceUrl: 'https://music.apple.com/lt/', attribution: 'Apple Music charts' },
  { source: 'radio', chartKey: 'm1', title: 'Radijo topai', subtitle: 'M-1, ZIP FM, Lietus — dažniausiai eteryje', accent: '#06b6d4', scope: 'lt', size: 40, attribution: 'Radijo stočių eterio duomenys' },

  // ── Pasaulis ──
  { source: 'official_uk', chartKey: 'singles', title: 'Official UK Singles', subtitle: 'Britanijos oficialus singlų topas', accent: '#ef4444', scope: 'world', size: 40, sourceUrl: 'https://www.officialcharts.com/', attribution: 'Official Charts Company' },
  { source: 'billboard', chartKey: 'hot100', title: 'Billboard Hot 100', subtitle: 'JAV pagrindinis dainų topas', accent: '#f59e0b', scope: 'world', size: 100, sourceUrl: 'https://www.billboard.com/charts/hot-100/', attribution: 'Billboard' },
  { source: 'spotify', chartKey: 'global', title: 'Spotify Global', subtitle: 'Klausomiausios dainos pasaulyje', accent: '#8b5cf6', scope: 'world', size: 100, sourceUrl: 'https://kworb.net/spotify/country/global_weekly.html', attribution: 'Spotify / kworb.net' },
  { source: 'billboard', chartKey: 'global200', title: 'Billboard Global 200', subtitle: 'Pasaulinis dainų reitingas', accent: '#f59e0b', scope: 'world', size: 200, sourceUrl: 'https://www.billboard.com/charts/billboard-global-200/', attribution: 'Billboard' },

  // ── Trendai / social ──
  { source: 'youtube', chartKey: 'lt_music', title: 'YouTube Trending — Lietuva', subtitle: 'Populiariausi muzikos klipai YouTube LT', accent: '#ef4444', scope: 'social', size: 50, sourceUrl: 'https://www.youtube.com/feed/trending', attribution: 'YouTube Charts' },
  { source: 'youtube', chartKey: 'us_music', title: 'YouTube Trending — Pasaulis', subtitle: 'Populiariausi muzikos klipai YouTube', accent: '#f43f5e', scope: 'social', size: 50, sourceUrl: 'https://www.youtube.com/feed/trending', attribution: 'YouTube Charts' },
  { source: 'billboard', chartKey: 'tiktok50', title: 'TikTok Billboard Top 50', subtitle: 'Trendinančios dainos TikTok platformoje', accent: '#ec4899', scope: 'social', size: 50, sourceUrl: 'https://www.billboard.com/charts/tiktok-billboard-top-50/', attribution: 'Billboard × TikTok' },
  { source: 'spotify', chartKey: 'viral50_global', title: 'Spotify Viral 50', subtitle: 'Greičiausiai populiarėjantys kūriniai pasaulyje', accent: '#22c55e', scope: 'social', size: 50, sourceUrl: 'https://charts.spotify.com/', attribution: 'Spotify Charts' },
  { source: 'shazam', chartKey: 'world', title: 'Shazam Global Top 200', subtitle: 'Daugiausiai atpažįstamos / atrandamos dainos', accent: '#0ea5e9', scope: 'social', size: 200, sourceUrl: 'https://www.shazam.com/charts/top-200/world', attribution: 'Shazam' },
  { source: 'shazam', chartKey: 'lt', title: 'Shazam Lietuva', subtitle: 'Kas atrandama Lietuvoje šiandien', accent: '#a855f7', scope: 'social', size: 100, sourceUrl: 'https://www.shazam.com/charts/top-200/lithuania', attribution: 'Shazam' },
]

function mergePlanned(live: ExtChart[], scope: 'lt' | 'world' | 'social'): (ExtChart & { isLive: boolean })[] {
  const liveByKey = new Map(live.map(c => [`${c.source}:${c.chartKey}`, c]))
  return PLANNED.filter(p => p.scope === scope).map(p => {
    const l = liveByKey.get(`${p.source}:${p.chartKey}`)
    if (l && l.entries.length > 0) return { ...l, isLive: true }
    return {
      source: p.source, chartKey: p.chartKey, title: p.title, subtitle: p.subtitle,
      accent: p.accent, scope: p.scope, size: p.size, sourceUrl: p.sourceUrl ?? null,
      attribution: p.attribution ?? null, periodLabel: '', entries: [], isLive: false,
    }
  })
}

/* ───────────────────────────── Page ───────────────────────────── */
export default async function TopaiHubPage() {
  const [top40, top30, ext] = await Promise.all([
    getMiniChart('top40', 5),
    getMiniChart('lt_top30', 5),
    getExternalCharts(),
  ])

  const ltCharts = mergePlanned(ext, 'lt')
  const worldCharts = mergePlanned(ext, 'world')
  const socialCharts = mergePlanned(ext, 'social')

  return (
    <div className="tp">
      <style>{styles}</style>

      {/* ───────── Hero ───────── */}
      <header className="tp-hero">
        <div className="tp-hero-badge">
          <span className="tp-hero-dot" /> Reitingai atnaujinami kas savaitę
        </div>
        <h1 className="tp-hero-title">Muzikos topai</h1>
        <p className="tp-hero-sub">
          music.lt <strong>TOP 40</strong> ir <strong>LT TOP 30</strong> — klausytojų balsais formuojami
          pagrindiniai topai. Šalia jų: oficialus AGATA reitingas, Apple Music, Billboard, Official UK ir
          socialinių tinklų trendai vienoje vietoje.
        </p>
      </header>

      {/* ───────── PAGRINDINIAI (highlight) ───────── */}
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

      {/* ───────── LIETUVOS OFICIALŪS ───────── */}
      <section className="tp-section" id="lt-topai">
        <SectionHead label="Lietuvos oficialūs topai" sub="Tikslūs klausymo ir eterio duomenys iš LT šaltinių" />
        <div className="tp-chart-grid">
          {ltCharts.map(c => <ExtCard key={`${c.source}-${c.chartKey}`} chart={c} />)}
        </div>
      </section>

      {/* ───────── PASAULIO ───────── */}
      <section className="tp-section" id="pasaulio-topai">
        <SectionHead label="Pasaulio topai" sub="UK, JAV ir globalūs oficialūs reitingai" />
        <div className="tp-chart-grid">
          {worldCharts.map(c => <ExtCard key={`${c.source}-${c.chartKey}`} chart={c} />)}
        </div>
      </section>

      {/* ───────── SOCIAL / TRENDING ───────── */}
      <section className="tp-section" id="trendai">
        <SectionHead label="Trendai ir socialiniai tinklai" sub="Kas sprogsta TikTok ir Spotify šiandien" />
        <div className="tp-chart-grid">
          {socialCharts.map(c => <ExtCard key={`${c.source}-${c.chartKey}`} chart={c} />)}
        </div>
      </section>

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

function ExtCard({ chart }: { chart: ExtChart & { isLive: boolean } }) {
  const live = chart.isLive
  return (
    <div className={`tp-ext${live ? ' is-live' : ''}`} style={{ ['--c' as any]: chart.accent }}>
      <div className="tp-ext-head">
        <div className="tp-ext-meta">
          <h3 className="tp-ext-name">{chart.title}</h3>
          {chart.subtitle && <p className="tp-ext-sub">{chart.subtitle}</p>}
        </div>
        {live
          ? <span className="tp-ext-size">TOP {chart.size}</span>
          : <span className="tp-soon">Netrukus</span>}
      </div>

      <div className="tp-ext-body">
        {live ? chart.entries.map(e => {
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
        }) : (
          <div className="tp-ext-placeholder">
            {[1, 2, 3].map(n => (
              <div key={n} className="tp-row tp-row-ghost">
                <span className="tp-pos">{n}</span>
                <span className="tp-cover tp-cover-ghost" />
                <span className="tp-info">
                  <span className="tp-bar tp-bar-w1" />
                  <span className="tp-bar tp-bar-w2" />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="tp-ext-foot">
        <span className="tp-attr">
          {chart.attribution}{live && chart.periodLabel ? ` · ${chart.periodLabel}` : ''}
        </span>
        {chart.sourceUrl
          ? <a href={chart.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="tp-ext-link">Šaltinis →</a>
          : <span />}
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
  .tp-hero-sub { margin: 14px 0 0; max-width: 70ch; color: var(--text-muted); font-size: 14.5px; line-height: 1.6; }
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

  /* External chart cards */
  .tp-chart-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 14px; }
  .tp-ext {
    --c: #6366f1; display: flex; flex-direction: column; min-height: 230px;
    background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 14px; overflow: hidden;
    transition: border-color .18s, transform .18s, box-shadow .18s;
  }
  .tp-ext.is-live:hover { transform: translateY(-2px); box-shadow: 0 16px 34px rgba(0,0,0,0.08); border-color: var(--c); }
  .tp-ext-head { padding: 16px 16px 12px; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; border-bottom: 1px solid var(--border-subtle); }
  .tp-ext-meta { min-width: 0; }
  .tp-ext-name { margin: 0; font-family: 'Outfit', sans-serif; font-size: 15px; font-weight: 800; letter-spacing: -0.01em; color: var(--text-primary); }
  .tp-ext-sub { margin: 3px 0 0; font-size: 11.5px; color: var(--text-muted); line-height: 1.4; }
  .tp-ext-size { flex-shrink: 0; font-size: 10px; font-weight: 800; color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent); padding: 3px 8px; border-radius: 999px; white-space: nowrap; }
  .tp-soon { flex-shrink: 0; font-size: 9px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; padding: 3px 8px; border-radius: 999px; background: var(--bg-elevated); color: var(--text-muted); border: 1px solid var(--border-subtle); }
  .tp-ext-body { padding: 10px 12px; flex: 1; }
  .tp-ext-foot { padding: 10px 14px; border-top: 1px solid var(--border-subtle); background: var(--bg-elevated); display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .tp-attr { font-size: 10.5px; color: var(--text-muted); }
  .tp-ext-link { font-size: 11px; font-weight: 700; color: var(--c); text-decoration: none; }
  .tp-ext-link:hover { text-decoration: underline; }

  /* Placeholder ghosts */
  .tp-row-ghost { opacity: 0.55; }
  .tp-cover-ghost { background: var(--bg-elevated); }
  .tp-bar { height: 9px; border-radius: 4px; background: var(--bg-elevated); }
  .tp-bar-w1 { width: 70%; }
  .tp-bar-w2 { width: 45%; margin-top: 5px; }

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
