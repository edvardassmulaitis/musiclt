// components/radaras-ui.tsx
//
// SERVER-rendered prezentaciniai komponentai „Naujos muzikos radarui"
// (/nauji-atlikejai). Jokio 'use client' — viskas statiška, kad Google matytų
// pilną turinį ir tikrus <a> link'us (vidinio tinklo SEO).
//
// Vizualinis tonas: svetainės tokenai (oranžinis akcentas), bet radaras turi
// SAVO parašą — oranžinis→žalias „pulse" градиentas + animuotas radaro skenavimas
// herojuje + žali „Naujas" ženkliukai (žalia = šviežumas). Nuosekli su /muzika
// kortelių sistema (kvadratas + meta po juo), bet su emerging signalų sluoksniu.

import Link from 'next/link'
import { flagFor } from '@/lib/artist-browse'
import {
  type RadarArtist, type RadarTrack,
  radarArtistHref, radarTrackHref, styleHref,
} from '@/lib/radaras-shared'

/* ─────────────── helpers ─────────────── */
function parseCoverPos(pos: string | null): { x: number; y: number; zoom: number } {
  if (!pos) return { x: 50, y: 20, zoom: 1 }
  const parts = pos.trim().split(/\s+/)
  const pcts = pos.match(/(\d+)%/g) || []
  const isCenter = parts[0] === 'center'
  const x = isCenter ? 50 : pcts[0] ? parseInt(pcts[0]) : 50
  const yPct = pcts[isCenter ? 0 : 1]
  const y = yPct ? parseInt(yPct) : 20
  const lastStr = parts[parts.length - 1] ?? ''
  const last = parseFloat(lastStr)
  const zoom = !isNaN(last) && last >= 1 && !lastStr.includes('%') ? last : 1
  return { x, y, zoom }
}
function styleLabel(name: string): string {
  return name.replace(/\s*muzika\s*$/i, '').trim() || name
}
function fmtAgo(iso: string | null): string {
  if (!iso) return ''
  const d = Date.parse(iso)
  if (!d) return ''
  const days = Math.floor((Date.now() - d) / 86_400_000)
  if (days <= 0) return 'šiandien'
  if (days === 1) return 'vakar'
  if (days < 7) return `prieš ${days} d.`
  if (days < 31) { const w = Math.floor(days / 7); return `prieš ${w} sav.` }
  if (days < 365) { const m = Math.floor(days / 30); return `prieš ${m} mėn.` }
  const y = Math.floor(days / 365); return `prieš ${y} m.`
}
function fmtViews(n: number | null): string {
  if (!n || n <= 0) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

/* ─────────────── radar sweep (hero dekoras) ─────────────── */
export function RadarSweep() {
  return (
    <svg className="rd-sweep" viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <radialGradient id="rdg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(34,197,94,0.0)" />
          <stop offset="78%" stopColor="rgba(34,197,94,0.0)" />
          <stop offset="100%" stopColor="rgba(34,197,94,0.55)" />
        </radialGradient>
        <linearGradient id="rdsweep" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(249,115,22,0)" />
          <stop offset="100%" stopColor="rgba(249,115,22,0.45)" />
        </linearGradient>
      </defs>
      {[40, 64, 88].map((r) => (
        <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="url(#rdg)" strokeWidth="1" opacity="0.7" />
      ))}
      <g className="rd-sweep-rot" style={{ transformOrigin: '100px 100px' }}>
        <path d="M100 100 L100 12 A88 88 0 0 1 168 56 Z" fill="url(#rdsweep)" />
      </g>
      <circle cx="100" cy="100" r="2.5" fill="var(--accent-green)" />
    </svg>
  )
}

/* ─────────────── section head ─────────────── */
export function RadarSection({
  kicker, title, sub, href, hrefLabel, children,
}: {
  kicker?: string; title: string; sub?: string; href?: string; hrefLabel?: string
  children: React.ReactNode
}) {
  return (
    <section className="rd-sec">
      <div className="rd-shead">
        <div>
          {kicker && <span className="rd-kicker">{kicker}</span>}
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {href && (
          <Link href={href} className="rd-shead-all" prefetch={false}>
            {hrefLabel || 'Visi'} <span aria-hidden>→</span>
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

/* ─────────────── featured spotlight card (landscape) ─────────────── */
export function FeaturedCard({ a }: { a: RadarArtist }) {
  const pos = parseCoverPos(a.cover_image_position)
  const flag = flagFor(a.country)
  const blurb = a.radar_blurb
    || (a.latest_title ? `Naujausia: „${a.latest_title}"` : 'Kylantis kūrėjas, kurį verta sekti.')
  return (
    <Link href={radarArtistHref(a)} className="rd-feat" prefetch={false}>
      <div className="rd-feat-img">
        {a.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.cover_image_url} alt={a.name} loading="lazy"
            style={{ objectPosition: `${pos.x}% ${pos.y}%`, transform: `scale(${pos.zoom})`, transformOrigin: `${pos.x}% ${pos.y}%` }} />
        ) : <div className="rd-feat-noimg"><span>{a.name?.[0] || '?'}</span></div>}
        <span className="rd-feat-badge">Spotlight</span>
      </div>
      <div className="rd-feat-body">
        <div className="rd-feat-name">{a.name} {flag && <span className="rd-flag">{flag}</span>}</div>
        {a.genres.length > 0 && <div className="rd-feat-genre">{a.genres.map(styleLabel).join(' · ')}</div>}
        <p className="rd-feat-blurb">{blurb}</p>
        {a.latest_at && <span className="rd-feat-meta">Atnaujinta {fmtAgo(a.latest_at)}</span>}
      </div>
    </Link>
  )
}

/* ─────────────── emerging tile (kvadratas) ─────────────── */
export function EmergingTile({ a }: { a: RadarArtist }) {
  const pos = parseCoverPos(a.cover_image_position)
  const flag = flagFor(a.country)
  const genre = a.genres[0] ? styleLabel(a.genres[0]) : ''
  return (
    <Link href={radarArtistHref(a)} className="rd-tile" prefetch={false}>
      <div className="rd-tile-img">
        {a.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.cover_image_url} alt={a.name} loading="lazy"
            style={{ objectPosition: `${pos.x}% ${pos.y}%`, transform: `scale(${pos.zoom})`, transformOrigin: `${pos.x}% ${pos.y}%` }} />
        ) : <div className="rd-tile-noimg"><span>{a.name?.[0] || '?'}</span></div>}
        {a.is_fresh && <span className="rd-tile-new" title="Neseniai išleido">Šviežia</span>}
        {a.is_verified && (
          <span className="rd-tile-verified" title="Patvirtintas">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
          </span>
        )}
        {genre && <span className="rd-tile-genre">{genre}</span>}
      </div>
      <div className="rd-tile-cap">
        <span className="rd-tile-name">{a.name}</span>
        {flag && <span className="rd-flag">{flag}</span>}
      </div>
      {a.latest_title && (
        <div className="rd-tile-latest">
          <span className="rd-dot" aria-hidden /> {fmtAgo(a.latest_at)}
        </div>
      )}
    </Link>
  )
}

export function EmergingGrid({ artists }: { artists: RadarArtist[] }) {
  return <div className="rd-grid">{artists.map((a) => <EmergingTile key={a.id} a={a} />)}</div>
}

export function FeaturedRow({ artists }: { artists: RadarArtist[] }) {
  return <div className="rd-feat-row">{artists.map((a) => <FeaturedCard key={a.id} a={a} />)}</div>
}

/* ─────────────── fresh track row ─────────────── */
export function FreshTrackRow({ t, rank }: { t: RadarTrack; rank: number }) {
  const views = fmtViews(t.video_views)
  return (
    <Link href={radarTrackHref(t)} className="rd-trow" prefetch={false}>
      <span className="rd-trow-rank">{rank}</span>
      <span className="rd-trow-cover">
        {t.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.cover_url} alt="" loading="lazy" />
        ) : <span className="rd-trow-noimg">♪</span>}
      </span>
      <span className="rd-trow-txt">
        <span className="rd-trow-title">{t.title}</span>
        <span className="rd-trow-artist">{t.artist_name}</span>
      </span>
      <span className="rd-trow-meta">
        {fmtAgo(t.uploaded_at)}{views ? ` · ${views}` : ''}
      </span>
    </Link>
  )
}

export function FreshTrackList({ tracks }: { tracks: RadarTrack[] }) {
  return <div className="rd-tlist">{tracks.map((t, i) => <FreshTrackRow key={t.id} t={t} rank={i + 1} />)}</div>
}

/* ─────────────── style chips ─────────────── */
export function StyleChips({ styles }: { styles: { name: string; n: number }[] }) {
  return (
    <div className="rd-chips">
      {styles.map((s) => (
        <Link key={s.name} href={styleHref(s.name)} className="rd-chip" prefetch={false}>
          {styleLabel(s.name)}
        </Link>
      ))}
    </div>
  )
}

/* ─────────────── styles ─────────────── */
export const radarStyles = `
.rd { background:var(--bg-body); color:var(--text-primary); min-height:100vh; font-family:'DM Sans',system-ui,sans-serif; }
.rd a { text-decoration:none; color:inherit; }
.rd-wrap { max-width:var(--page-max); margin:0 auto; padding:0 var(--page-pad-x) var(--page-pad-bottom); }

/* ── Hero ── */
.rd-hero { position:relative; overflow:hidden; }
.rd-hero::before { content:''; position:absolute; inset:0;
  background:radial-gradient(ellipse at 18% -10%, rgba(249,115,22,0.16), transparent 55%),
             radial-gradient(ellipse at 92% 8%, rgba(34,197,94,0.13), transparent 52%);
  pointer-events:none; }
.rd-hero-inner { position:relative; max-width:var(--page-max); margin:0 auto;
  padding:46px var(--page-pad-x) 30px; display:flex; align-items:center; gap:30px; }
.rd-hero-txt { position:relative; z-index:2; flex:1; min-width:0; }
.rd-hero-tag { display:inline-flex; align-items:center; gap:7px; font-family:'Outfit',sans-serif;
  font-weight:700; font-size:11.5px; text-transform:uppercase; letter-spacing:.09em;
  color:var(--accent-green); background:rgba(34,197,94,0.10); border:1px solid rgba(34,197,94,0.30);
  padding:5px 11px; border-radius:100px; margin-bottom:14px; }
.rd-pulse { width:7px; height:7px; border-radius:50%; background:var(--accent-green);
  box-shadow:0 0 0 0 rgba(34,197,94,0.6); animation:rdpulse 2s infinite; }
@keyframes rdpulse { 0%{box-shadow:0 0 0 0 rgba(34,197,94,0.5);} 70%{box-shadow:0 0 0 8px rgba(34,197,94,0);} 100%{box-shadow:0 0 0 0 rgba(34,197,94,0);} }
.rd-hero h1 { font-family:'Outfit',sans-serif; font-weight:var(--page-h1-weight);
  letter-spacing:var(--page-h1-tracking); font-size:var(--page-h1-size); line-height:1.04;
  background:linear-gradient(92deg, var(--text-primary) 30%, var(--accent-orange) 70%, var(--accent-green));
  -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
.rd-hero-lead { color:var(--page-sub-color); font-size:15px; max-width:560px; margin-top:12px; line-height:1.55; }
.rd-stats { display:flex; flex-wrap:wrap; gap:9px; margin-top:18px; }
.rd-stat { display:inline-flex; align-items:baseline; gap:6px; background:var(--bg-hover);
  border:1px solid var(--border-default); border-radius:100px; padding:7px 14px; }
.rd-stat b { font-family:'Outfit',sans-serif; font-weight:800; font-size:15px; color:var(--text-primary); }
.rd-stat span { font-size:12px; color:var(--text-muted); }

/* radar sweep svg */
.rd-sweep { width:178px; height:178px; flex-shrink:0; position:relative; z-index:1; opacity:.9; }
.rd-sweep-rot { animation:rdrot 6s linear infinite; }
@keyframes rdrot { to { transform:rotate(360deg); } }
@media(max-width:760px){ .rd-sweep { display:none; } }

/* ── Section ── */
.rd-sec { margin-top:46px; }
.rd-shead { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:18px; }
.rd-kicker { display:block; font-family:'Outfit',sans-serif; font-weight:700; font-size:11px;
  text-transform:uppercase; letter-spacing:.08em; color:var(--accent-green); margin-bottom:5px; }
.rd-shead h2 { font-family:'Outfit',sans-serif; font-weight:800; letter-spacing:-.02em;
  font-size:var(--section-title-size); line-height:1.1; }
.rd-shead p { color:var(--text-muted); font-size:13px; margin-top:4px; max-width:560px; }
.rd-shead-all { flex-shrink:0; font-family:'Outfit',sans-serif; font-weight:700; font-size:13px;
  color:var(--accent-link); white-space:nowrap; padding-bottom:3px; }
.rd-shead-all:hover { color:var(--accent-orange); }

/* ── Featured spotlight ── */
.rd-feat-row { display:grid; grid-template-columns:repeat(auto-fill, minmax(320px,1fr)); gap:14px; }
.rd-feat { display:flex; gap:14px; padding:12px; border-radius:16px; background:var(--bg-surface);
  border:1px solid var(--border-default); transition:border-color .18s, transform .18s; }
.rd-feat:hover { border-color:rgba(34,197,94,0.4); transform:translateY(-2px); }
.rd-feat-img { position:relative; width:108px; height:108px; flex-shrink:0; border-radius:12px;
  overflow:hidden; background:var(--bg-elevated); }
.rd-feat-img img { width:100%; height:100%; object-fit:cover; display:block; }
.rd-feat-noimg { width:100%; height:100%; display:flex; align-items:center; justify-content:center;
  background:linear-gradient(135deg, var(--bg-elevated), rgba(249,115,22,0.10)); }
.rd-feat-noimg span { font-family:'Outfit',sans-serif; font-weight:900; font-size:38px; color:rgba(255,255,255,0.10); }
.rd-feat-badge { position:absolute; top:7px; left:7px; font-family:'Outfit',sans-serif; font-weight:800;
  font-size:9.5px; text-transform:uppercase; letter-spacing:.06em; color:#fff;
  background:linear-gradient(92deg,var(--accent-orange),var(--accent-green)); padding:2px 7px; border-radius:100px; }
.rd-feat-body { flex:1; min-width:0; display:flex; flex-direction:column; }
.rd-feat-name { font-family:'Outfit',sans-serif; font-weight:800; font-size:16px; line-height:1.15;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.rd-feat:hover .rd-feat-name { color:var(--accent-orange); }
.rd-feat-genre { font-size:11.5px; color:var(--accent-green); font-weight:600; margin-top:2px; }
.rd-feat-blurb { font-size:12.5px; color:var(--text-secondary); line-height:1.45; margin-top:7px;
  overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.rd-feat-meta { font-size:11px; color:var(--text-faint); margin-top:auto; padding-top:7px; }

/* ── Emerging grid ── */
.rd-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(158px,1fr)); gap:16px 14px; }
.rd-tile { position:relative; display:block; }
.rd-tile-img { position:relative; aspect-ratio:1/1; border-radius:14px; background:var(--bg-elevated); overflow:hidden; }
.rd-tile-img img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .4s ease; }
.rd-tile:hover .rd-tile-img img { transform:scale(1.06); }
.rd-tile-noimg { width:100%; height:100%; display:flex; align-items:center; justify-content:center;
  background:linear-gradient(135deg, var(--bg-elevated), rgba(34,197,94,0.08)); }
.rd-tile-noimg span { font-family:'Outfit',sans-serif; font-weight:900; font-size:42px; color:rgba(255,255,255,0.08); }
.rd-tile-new { position:absolute; top:8px; left:8px; font-family:'Outfit',sans-serif; font-weight:800;
  font-size:10px; text-transform:uppercase; letter-spacing:.05em; color:#04130a;
  background:var(--accent-green); padding:2px 8px; border-radius:100px; box-shadow:0 2px 8px rgba(0,0,0,.3); }
.rd-tile-verified { position:absolute; top:8px; right:8px; width:20px; height:20px; border-radius:50%;
  background:#3b82f6; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,.3); }
.rd-tile-genre { position:absolute; bottom:8px; left:8px; right:8px; font-size:10.5px; font-weight:600;
  color:#fff; text-shadow:0 1px 4px rgba(0,0,0,.8); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  opacity:0; transform:translateY(4px); transition:opacity .2s, transform .2s; }
.rd-tile:hover .rd-tile-genre { opacity:1; transform:translateY(0); }
.rd-tile-cap { display:flex; align-items:center; justify-content:space-between; gap:6px; margin-top:9px; padding:0 1px; }
.rd-tile-name { font-family:'Outfit',sans-serif; font-weight:700; color:var(--text-primary);
  font-size:var(--card-title-size); line-height:1.2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
.rd-tile:hover .rd-tile-name { color:var(--accent-orange); }
.rd-flag { font-size:13px; line-height:1; flex-shrink:0; }
.rd-tile-latest { display:flex; align-items:center; gap:6px; margin-top:3px; padding:0 1px;
  font-size:11px; color:var(--text-faint); }
.rd-dot { width:5px; height:5px; border-radius:50%; background:var(--accent-green); flex-shrink:0; }

/* ── Fresh tracks ── */
.rd-tlist { display:grid; grid-template-columns:repeat(2, 1fr); gap:6px 28px; }
@media(max-width:760px){ .rd-tlist { grid-template-columns:1fr; } }
.rd-trow { display:flex; align-items:center; gap:12px; padding:7px 10px; border-radius:10px; transition:background .15s; }
.rd-trow:hover { background:var(--bg-hover); }
.rd-trow-rank { width:20px; text-align:center; font-family:'Outfit',sans-serif; font-weight:800;
  font-size:13px; color:var(--text-faint); flex-shrink:0; }
.rd-trow-cover { width:42px; height:42px; border-radius:8px; overflow:hidden; background:var(--bg-elevated);
  flex-shrink:0; display:flex; align-items:center; justify-content:center; }
.rd-trow-cover img { width:100%; height:100%; object-fit:cover; }
.rd-trow-noimg { font-size:16px; color:rgba(255,255,255,0.15); }
.rd-trow-txt { flex:1; min-width:0; display:flex; flex-direction:column; }
.rd-trow-title { font-family:'Outfit',sans-serif; font-weight:600; font-size:13.5px;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.rd-trow:hover .rd-trow-title { color:var(--accent-orange); }
.rd-trow-artist { font-size:12px; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.rd-trow-meta { font-size:11px; color:var(--text-faint); font-weight:600; flex-shrink:0; text-align:right; }

/* ── Style chips ── */
.rd-chips { display:flex; flex-wrap:wrap; gap:8px; }
.rd-chip { display:inline-flex; align-items:center; padding:8px 15px; border-radius:100px;
  background:var(--bg-hover); border:1px solid var(--border-default); transition:all .15s;
  font-family:'Outfit',sans-serif; font-weight:600; font-size:13px; color:var(--text-secondary); }
.rd-chip:hover { border-color:rgba(249,115,22,0.45); color:var(--text-primary); }

/* ── CTA ── */
.rd-cta { margin-top:50px; position:relative; overflow:hidden; border-radius:18px;
  border:1px solid var(--border-default); background:var(--bg-surface);
  padding:30px 28px; display:flex; align-items:center; justify-content:space-between; gap:22px; flex-wrap:wrap; }
.rd-cta::before { content:''; position:absolute; inset:0; pointer-events:none;
  background:radial-gradient(ellipse at 100% 0%, rgba(34,197,94,0.12), transparent 55%),
             radial-gradient(ellipse at 0% 100%, rgba(249,115,22,0.10), transparent 55%); }
.rd-cta-txt { position:relative; z-index:1; max-width:560px; }
.rd-cta-txt h3 { font-family:'Outfit',sans-serif; font-weight:800; font-size:20px; letter-spacing:-.01em; }
.rd-cta-txt p { color:var(--text-secondary); font-size:13.5px; line-height:1.55; margin-top:7px; }
.rd-cta-actions { position:relative; z-index:1; display:flex; gap:10px; flex-wrap:wrap; }
.rd-btn { display:inline-flex; align-items:center; gap:8px; font-family:'Outfit',sans-serif;
  font-weight:700; font-size:14px; padding:11px 20px; border-radius:11px; transition:all .15s; white-space:nowrap; }
.rd-btn-primary { color:#fff; background:linear-gradient(92deg,var(--accent-orange),#fb923c); border:1px solid transparent; }
.rd-btn-primary:hover { filter:brightness(1.06); transform:translateY(-1px); }
.rd-btn-ghost { color:var(--text-secondary); background:var(--bg-hover); border:1px solid var(--border-default); }
.rd-btn-ghost:hover { color:var(--text-primary); border-color:var(--border-strong); }

/* ── empty ── */
.rd-empty { margin:30px 0; padding:26px; border-radius:14px; border:1px dashed var(--border-strong);
  text-align:center; color:var(--text-muted); font-size:13.5px; }

/* ── SEO prose ── */
.rd-prose { max-width:780px; margin:40px 0 0; color:var(--text-muted); font-size:13.5px; line-height:1.7; }
.rd-prose a { color:var(--accent-link); }
.rd-prose a:hover { color:var(--accent-orange); }

/* ── Filter bar (top style filter) ── */
.rd-filterbar { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:18px; }
.rd-chip.on { background:var(--accent-orange); border-color:var(--accent-orange); color:#fff; }
.rd-chip em { font-style:normal; font-size:11px; opacity:.7; margin-left:6px; font-weight:700; }
.rd-chip.on em { opacity:.85; }

/* ── Fresh: list + player (topų layout) ── */
.rd-fresh { display:grid; grid-template-columns:1fr 384px; gap:26px; align-items:start; }
@media(max-width:920px){ .rd-fresh { grid-template-columns:1fr; } }
.rd-fresh-list { display:flex; flex-direction:column; gap:2px; }
.rd-frow { display:flex; align-items:center; gap:12px; padding:8px 10px; border-radius:11px;
  cursor:pointer; transition:background .15s; border:1px solid transparent; text-align:left; background:none; width:100%; }
.rd-frow:hover { background:var(--bg-hover); }
.rd-frow.on { background:var(--bg-hover); border-color:rgba(249,115,22,0.35); }
.rd-frow-rank { width:22px; text-align:center; font-family:'Outfit',sans-serif; font-weight:800; font-size:13px; color:var(--text-faint); flex-shrink:0; }
.rd-frow.on .rd-frow-rank { color:var(--accent-orange); }
.rd-frow-cover { position:relative; width:46px; height:46px; border-radius:8px; overflow:hidden; background:var(--bg-elevated); flex-shrink:0; display:flex; align-items:center; justify-content:center; }
.rd-frow-cover img { width:100%; height:100%; object-fit:cover; }
.rd-frow-noimg { font-size:18px; color:rgba(255,255,255,0.15); }
.rd-frow-play { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.32); opacity:0; transition:opacity .15s; }
.rd-frow:hover .rd-frow-play, .rd-frow.on .rd-frow-play { opacity:1; }
.rd-frow-play svg { width:18px; height:18px; fill:#fff; filter:drop-shadow(0 1px 2px rgba(0,0,0,.5)); }
.rd-frow-txt { flex:1; min-width:0; display:flex; flex-direction:column; }
.rd-frow-title { font-family:'Outfit',sans-serif; font-weight:600; font-size:13.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text-primary); }
.rd-frow.on .rd-frow-title, .rd-frow:hover .rd-frow-title { color:var(--accent-orange); }
.rd-frow-artist { font-size:12px; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.rd-frow-meta { font-size:11px; color:var(--text-faint); font-weight:600; flex-shrink:0; text-align:right; }

.rd-player { position:sticky; top:78px; }
.rd-player-frame { position:relative; aspect-ratio:16/9; border-radius:14px; overflow:hidden; background:#000; border:1px solid var(--border-default); }
.rd-player-frame iframe { width:100%; height:100%; border:0; display:block; }
.rd-player-empty { width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:var(--text-faint); font-size:13px; text-align:center; padding:20px; }
.rd-player-meta { margin-top:11px; padding:0 2px; }
.rd-player-title { font-family:'Outfit',sans-serif; font-weight:800; font-size:16px; line-height:1.2; }
.rd-player-artist { font-size:13px; color:var(--text-muted); margin-top:3px; }
.rd-player-artist a:hover { color:var(--accent-orange); }
.rd-player-hint { font-size:11.5px; color:var(--text-faint); margin-top:10px; }

@media(max-width:768px){
  .rd-grid { grid-template-columns:repeat(auto-fill,minmax(116px,1fr)); gap:13px 10px; }
  .rd-feat-row { grid-template-columns:1fr; }
  .rd-hero-inner { padding:34px var(--page-pad-x-sm) 24px; }
  .rd-wrap { padding-left:var(--page-pad-x-sm); padding-right:var(--page-pad-x-sm); }
  .rd-hero-lead { font-size:14px; }
}
`
