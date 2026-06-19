// components/muzika-ui.tsx
//
// Bendri SERVER-rendered presentation komponentai /muzika hub'ui ir
// /zanrai/[slug] stilių landing'ams. Visi render'ina tikrus <a> link'us
// (per next/link) — kritiška SEO: crawler'is pereina visą vidinį tinklą.
// Jokio 'use client' — viskas statiška, kad Google matytų pilną turinį.

import Link from 'next/link'
import type { ReactNode } from 'react'
import { flagFor } from '@/lib/artist-browse'
import {
  type HubArtist, type HubAlbum, type HubTrack,
  artistHref, albumHref, trackHref,
} from '@/lib/muzika-hub'

/* ───────────────────────── Cover position parser ───────────────────────── */
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

function fmtViews(n: number | null): string {
  if (!n || n <= 0) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

/* ───────────────────────── Section header ───────────────────────── */
export function SectionHead({
  title, sub, href, hrefLabel,
}: { title: string; sub?: string; href?: string; hrefLabel?: string }) {
  return (
    <div className="mz-shead">
      <div>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {href && (
        <Link href={href} className="mz-shead-all" prefetch={false}>
          {hrefLabel || 'Visi'} <span aria-hidden>→</span>
        </Link>
      )}
    </div>
  )
}

/* ───────────────────────── Artist tile ───────────────────────── */
export function ArtistTile({ a, rank }: { a: HubArtist; rank?: number }) {
  const pos = parseCoverPos(a.cover_image_position)
  const flag = flagFor(a.country)
  return (
    <Link href={artistHref(a)} className="mz-tile" prefetch={false}>
      <div className="mz-tile-img">
        {a.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={a.cover_image_url}
            alt={a.name}
            loading="lazy"
            style={{ objectPosition: `${pos.x}% ${pos.y}%`, transform: `scale(${pos.zoom})`, transformOrigin: `${pos.x}% ${pos.y}%` }}
          />
        ) : (
          <div className="mz-tile-noimg"><span>{a.name?.[0] || '?'}</span></div>
        )}
        {typeof rank === 'number' && rank <= 3 && <span className="mz-tile-rank">#{rank}</span>}
        {a.is_verified && (
          <span className="mz-tile-verified" title="Patvirtintas">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
          </span>
        )}
      </div>
      <div className="mz-tile-cap">
        <span className="mz-tile-name">{a.name}</span>
        {flag && <span className="mz-tile-flag">{flag}</span>}
      </div>
    </Link>
  )
}

/* ───────────────────────── Album card ───────────────────────── */
export function AlbumCard({ al }: { al: HubAlbum }) {
  return (
    <Link href={albumHref(al)} className="mz-acard" prefetch={false}>
      <div className="mz-acard-img">
        {al.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={al.cover_image_url} alt={al.title} loading="lazy" />
        ) : (
          <div className="mz-acard-noimg"><span>♪</span></div>
        )}
      </div>
      <div className="mz-acard-title">{al.title}</div>
      <div className="mz-acard-sub">
        {al.artist_name}{al.year ? ` · ${al.year}` : ''}
      </div>
    </Link>
  )
}

/* ───────────────────────── Track row ───────────────────────── */
export function TrackRow({ t, rank }: { t: HubTrack; rank: number }) {
  const views = fmtViews(t.video_views)
  return (
    <Link href={trackHref(t)} className="mz-trow" prefetch={false}>
      <span className="mz-trow-rank">{rank}</span>
      <span className="mz-trow-cover">
        {t.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.cover_url} alt="" loading="lazy" />
        ) : (
          <span className="mz-trow-noimg">♪</span>
        )}
      </span>
      <span className="mz-trow-txt">
        <span className="mz-trow-title">{t.title}</span>
        <span className="mz-trow-artist">{t.artist_name}</span>
      </span>
      {views && <span className="mz-trow-views">{views}</span>}
    </Link>
  )
}

/* ───────────────────────── Pill / chip link ───────────────────────── */
export function PillLink({ href, label, count }: { href: string; label: ReactNode; count?: number }) {
  return (
    <Link href={href} className="mz-pill" prefetch={false}>
      <span>{label}</span>
      {typeof count === 'number' && count > 0 && <em>{count.toLocaleString('lt-LT')}</em>}
    </Link>
  )
}

/* ───────────────────────── Grid wrappers ───────────────────────── */
export function ArtistRow({ artists, ranked }: { artists: HubArtist[]; ranked?: boolean }) {
  return (
    <div className="mz-tile-grid">
      {artists.map((a, i) => <ArtistTile key={a.id} a={a} rank={ranked ? i + 1 : undefined} />)}
    </div>
  )
}

export function AlbumRow({ albums }: { albums: HubAlbum[] }) {
  return (
    <div className="mz-acard-grid">
      {albums.map((al) => <AlbumCard key={al.id} al={al} />)}
    </div>
  )
}

export function TrackList({ tracks }: { tracks: HubTrack[] }) {
  return (
    <div className="mz-tlist">
      {tracks.map((t, i) => <TrackRow key={t.id} t={t} rank={i + 1} />)}
    </div>
  )
}

/* ───────────────────────── Styles ───────────────────────── */
export const muzikaStyles = `
.mz { background:var(--bg-body); color:var(--text-primary); min-height:100vh; font-family:'DM Sans',system-ui,sans-serif; }
.mz a { text-decoration:none; color:inherit; }
.mz-wrap { max-width:var(--page-max); margin:0 auto; padding:0 var(--page-pad-x); }

/* Hero */
.mz-hero { position:relative; overflow:hidden; padding:40px var(--page-pad-x) 26px; }
.mz-hero::before { content:''; position:absolute; inset:0; background:radial-gradient(ellipse at 50% -20%, rgba(249,115,22,0.13), transparent 62%); pointer-events:none; }
.mz-hero-inner { max-width:var(--page-max); margin:0 auto; position:relative; }
.mz-crumbs { display:flex; gap:8px; align-items:center; font-size:12px; color:var(--text-muted); margin-bottom:12px; }
.mz-crumbs a:hover { color:var(--accent-orange); }
.mz-hero h1 { font-family:'Outfit',sans-serif; font-weight:var(--page-h1-weight); letter-spacing:var(--page-h1-tracking); font-size:var(--page-h1-size); line-height:var(--page-h1-line); }
.mz-hero-lead { color:var(--page-sub-color); font-size:var(--page-sub-size); max-width:var(--page-sub-max); margin-top:10px; line-height:var(--page-sub-line); }

/* Section block */
.mz-sec { margin-top:44px; }
.mz-sec:first-of-type { margin-top:30px; }
.mz-shead { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:16px; }
.mz-shead h2 { font-family:'Outfit',sans-serif; font-weight:800; letter-spacing:-.02em; font-size:var(--section-title-size); line-height:1.1; }
.mz-shead p { color:var(--text-muted); font-size:13px; margin-top:4px; }
.mz-shead-all { flex-shrink:0; font-family:'Outfit',sans-serif; font-weight:700; font-size:13px; color:var(--accent-link); white-space:nowrap; padding-bottom:3px; }
.mz-shead-all:hover { color:var(--accent-orange); }

.mz-subhead { font-family:'Outfit',sans-serif; font-weight:700; font-size:12px; text-transform:uppercase; letter-spacing:.07em; color:var(--text-faint); margin:18px 0 12px; display:flex; align-items:center; gap:8px; }

/* Artist tiles */
.mz-tile-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(158px,1fr)); gap:14px; }
.mz-tile { position:relative; display:block; }
.mz-tile-img { position:relative; aspect-ratio:1/1; border-radius:14px; background:var(--bg-elevated); overflow:hidden; }
.mz-tile-img img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .4s ease; }
.mz-tile:hover .mz-tile-img img { transform:scale(1.06); }
.mz-tile-noimg { width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg, var(--bg-elevated), rgba(249,115,22,0.08)); }
.mz-tile-noimg span { font-family:'Outfit',sans-serif; font-weight:900; font-size:42px; color:rgba(255,255,255,0.08); }
.mz-tile-cap { display:flex; align-items:center; justify-content:space-between; gap:6px; margin-top:9px; padding:0 1px; }
.mz-tile-name { font-family:'Outfit',sans-serif; font-weight:700; color:var(--text-primary); font-size:var(--card-title-size); line-height:1.2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
.mz-tile:hover .mz-tile-name { color:var(--accent-orange); }
.mz-tile-flag { font-size:13px; line-height:1; flex-shrink:0; }
.mz-tile-rank { position:absolute; top:8px; left:8px; font-family:'Outfit',sans-serif; font-weight:900; font-size:13px; color:#fff; background:var(--accent-orange); padding:2px 8px; border-radius:100px; box-shadow:0 2px 8px rgba(0,0,0,.3); }
.mz-tile-verified { position:absolute; top:8px; right:8px; width:20px; height:20px; border-radius:50%; background:#3b82f6; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,.3); }

/* Album cards — tas pats šablonas kaip atlikėjų (kvadratas + meta po juo) */
.mz-acard-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(158px,1fr)); gap:14px; }
.mz-acard { display:block; }
.mz-acard-img { position:relative; aspect-ratio:1/1; border-radius:14px; overflow:hidden; background:var(--bg-elevated); }
.mz-acard-img img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .4s ease; }
.mz-acard:hover .mz-acard-img img { transform:scale(1.05); }
.mz-acard-noimg { width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:34px; color:rgba(255,255,255,0.12); }
.mz-acard-title { font-family:'Outfit',sans-serif; font-weight:700; font-size:var(--card-title-size); margin-top:9px; line-height:1.2; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.mz-acard:hover .mz-acard-title { color:var(--accent-orange); }
.mz-acard-sub { font-size:var(--card-sub-size); color:var(--text-muted); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* Track list */
.mz-tlist { display:grid; grid-template-columns:repeat(2, 1fr); gap:6px 28px; }
@media(max-width:760px){ .mz-tlist { grid-template-columns:1fr; } }
.mz-trow { display:flex; align-items:center; gap:12px; padding:7px 10px; border-radius:10px; transition:background .15s; }
.mz-trow:hover { background:var(--bg-hover); }
.mz-trow-rank { width:20px; text-align:center; font-family:'Outfit',sans-serif; font-weight:800; font-size:13px; color:var(--text-faint); flex-shrink:0; }
.mz-trow-cover { width:40px; height:40px; border-radius:7px; overflow:hidden; background:var(--bg-elevated); flex-shrink:0; display:flex; align-items:center; justify-content:center; }
.mz-trow-cover img { width:100%; height:100%; object-fit:cover; }
.mz-trow-noimg { font-size:16px; color:rgba(255,255,255,0.15); }
.mz-trow-txt { flex:1; min-width:0; display:flex; flex-direction:column; }
.mz-trow-title { font-family:'Outfit',sans-serif; font-weight:600; font-size:13.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.mz-trow:hover .mz-trow-title { color:var(--accent-orange); }
.mz-trow-artist { font-size:12px; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.mz-trow-views { font-size:11.5px; color:var(--text-faint); font-weight:600; flex-shrink:0; }

/* Pills (genres / countries) */
.mz-pills { display:flex; flex-wrap:wrap; gap:8px; }
.mz-pill { display:inline-flex; align-items:center; gap:8px; padding:8px 15px; border-radius:100px; background:var(--bg-hover); border:1px solid var(--border-default,rgba(255,255,255,0.08)); transition:all .15s; }
.mz-pill span { font-family:'Outfit',sans-serif; font-weight:600; font-size:13.5px; color:var(--text-secondary); }
.mz-pill em { font-style:normal; font-size:11.5px; color:var(--text-faint); font-weight:600; }
.mz-pill:hover { border-color:rgba(249,115,22,0.45); }
.mz-pill:hover span { color:var(--text-primary); }

/* Collection cards (themed) */
.mz-coll-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(220px,1fr)); gap:14px; }
.mz-coll { display:block; padding:18px 18px 16px; border-radius:14px; background:linear-gradient(135deg, rgba(249,115,22,0.10), rgba(249,115,22,0.02)); border:1px solid var(--border-default,rgba(255,255,255,0.08)); transition:all .18s; }
.mz-coll:hover { border-color:rgba(249,115,22,0.4); transform:translateY(-2px); }
.mz-coll-name { font-family:'Outfit',sans-serif; font-weight:800; font-size:16px; }
.mz-coll-desc { font-size:12.5px; color:var(--text-muted); margin-top:5px; line-height:1.4; }

/* SEO footer link cloud */
.mz-seo { margin:54px auto 90px; padding:28px 24px 0; border-top:1px solid var(--border-default,rgba(255,255,255,0.07)); }
.mz-seo-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:28px; }
.mz-seo h3 { font-family:'Outfit',sans-serif; font-size:12px; text-transform:uppercase; letter-spacing:.07em; color:var(--text-faint); margin-bottom:12px; }
.mz-seo ul { list-style:none; display:flex; flex-direction:column; gap:8px; padding:0; margin:0; }
.mz-seo li a { font-size:13.5px; color:var(--text-secondary); display:flex; justify-content:space-between; gap:12px; }
.mz-seo li a:hover { color:var(--accent-orange); }
.mz-seo li em { font-style:normal; color:var(--text-faint); font-size:12px; }
.mz-prose { max-width:780px; margin-top:24px; color:var(--text-muted); font-size:13.5px; line-height:1.65; }
.mz-prose a { color:var(--accent-link); }
.mz-prose a:hover { color:var(--accent-orange); }

/* Filter bar (browse puslapiams: /albumai, /dainos) — server-rendered <a> chips */
.mz-fbar { display:flex; flex-direction:column; gap:9px; margin-bottom:18px; }
.mz-frow { display:flex; flex-wrap:wrap; gap:7px; align-items:center; }
@media(max-width:680px){ .mz-frow { flex-wrap:nowrap; overflow-x:auto; scrollbar-width:none; } .mz-frow::-webkit-scrollbar{ display:none; } .mz-flbl { position:sticky; left:0; } }
.mz-flbl { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--text-faint); min-width:58px; font-family:'Outfit',sans-serif; }
.mz-count { font-size:13px; color:var(--text-muted); margin:2px 0 16px; }

/* Pagination */
.mz-pager { display:flex; flex-wrap:wrap; gap:6px; justify-content:center; align-items:center; margin:32px 0; }
.mz-pg { min-width:38px; height:38px; padding:0 12px; display:inline-flex; align-items:center; justify-content:center; border-radius:9px; font-size:13px; font-weight:700; font-family:'Outfit',sans-serif; background:var(--bg-hover); border:1px solid var(--border-default,rgba(255,255,255,0.08)); color:var(--text-secondary); transition:all .15s; }
.mz-pg:hover { color:var(--text-primary); border-color:rgba(249,115,22,0.4); }
.mz-pg-cur { background:var(--accent-orange); border-color:var(--accent-orange); color:#fff; }
.mz-pg-dots { color:var(--text-faint); padding:0 2px; }

.mz-empty { max-width:560px; margin:50px auto; text-align:center; }
.mz-empty-ic { font-size:42px; opacity:.4; }
.mz-empty h3 { font-family:'Outfit',sans-serif; font-weight:800; font-size:19px; margin:10px 0 4px; }
.mz-empty p { color:var(--text-muted); font-size:13px; }

@media(max-width:768px){
  .mz-tile-grid { grid-template-columns:repeat(auto-fill,minmax(112px,1fr)); gap:9px; }
  .mz-acard-grid { grid-template-columns:repeat(auto-fill,minmax(108px,1fr)); gap:12px; }
  .mz-tile-name { font-size:13px; }
}
/* Hub filtrų juosta — viena kompaktiška eilutė (/koncertai stilius) */
.mz-hubfbar-spacer { margin-left:auto; }
.mz-pop { position:absolute; top:calc(100% + 8px); left:0; z-index:50; padding:11px; background:var(--bg-surface,var(--bg-elevated)); border:1px solid var(--border-default,rgba(255,255,255,0.1)); border-radius:14px; box-shadow:0 14px 40px rgba(0,0,0,0.32); }
.mz-pop-list { display:flex; flex-direction:column; gap:2px; max-height:320px; overflow-y:auto; }
.mz-opt { display:flex; align-items:center; gap:8px; text-align:left; width:100%; padding:8px 10px; border-radius:9px; font-size:13px; font-weight:600; font-family:'Outfit',sans-serif; cursor:pointer; background:transparent; border:none; color:var(--text-secondary); transition:all .12s; white-space:nowrap; }
.mz-opt:hover { background:var(--bg-hover); color:var(--text-primary); }

/* Žanrų kortelės (brand spalvos per --gc / --gcr) */
.mz-gcards { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:10px; }
.mz-gcard { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:16px 16px; border-radius:13px; background:linear-gradient(135deg, rgba(var(--gcr),0.20), rgba(var(--gcr),0.05)); border:1px solid rgba(var(--gcr),0.30); transition:all .18s; }
.mz-gcard:hover { border-color:var(--gc); transform:translateY(-2px); }
.mz-gcard-name { font-family:'Outfit',sans-serif; font-weight:800; font-size:14.5px; color:var(--text-primary); }
.mz-gcard-n { font-size:11.5px; font-weight:700; color:var(--text-faint); }

/* Kolekcijų nuorodos (2 stulpeliai) */
.mz-coll-cols { display:grid; grid-template-columns:1fr 1fr; gap:30px; }
@media(max-width:760px){ .mz-coll-cols { grid-template-columns:1fr; gap:22px; } }
.mz-coll-list { display:flex; flex-direction:column; gap:6px; }
.mz-coll-list-row { flex-direction:row; flex-wrap:wrap; }
.mz-collrow { display:inline-flex; align-items:center; gap:10px; padding:10px 14px; border-radius:11px; background:var(--bg-hover); border:1px solid var(--border-default,rgba(255,255,255,0.07)); transition:all .15s; }
.mz-collrow:hover { border-color:rgba(249,115,22,0.4); transform:translateX(2px); }
.mz-collrow-emoji { font-size:17px; line-height:1; }
.mz-collrow-name { font-family:'Outfit',sans-serif; font-weight:700; font-size:13.5px; color:var(--text-secondary); }
.mz-collrow:hover .mz-collrow-name { color:var(--text-primary); }

@media(max-width:640px){
  .mz-wrap { padding-left:var(--page-pad-x-sm); padding-right:var(--page-pad-x-sm); }
  .mz-hero { padding-left:var(--page-pad-x-sm); padding-right:var(--page-pad-x-sm); }
  .mz-hubfbar-spacer { display:none; }
}
`
