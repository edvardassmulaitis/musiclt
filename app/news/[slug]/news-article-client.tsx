'use client'
// app/news/[slug]/news-article-client.tsx

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { HeaderAuth } from '@/components/HeaderAuth'

type Photo = { url: string; caption?: string; source?: string }
type SongEntry = { id?: number; song_id?: number | null; title: string; artist_name: string; youtube_url: string }

type NewsItem = {
  id: number; title: string; slug: string; body: string; type: string
  source_url?: string; source_name?: string; published_at: string
  image_small_url?: string; gallery?: Photo[]; youtube_url?: string
  artist?: { id: number; name: string; cover_image_url?: string }
}

type RelatedNews = { id: number; title: string; slug: string; image_small_url?: string; published_at: string; type: string }

function ytId(url?: string | null) {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  return m ? m[1] : null
}

function getLede(body: string) {
  const m = body.match(/<p[^>]*>(.*?)<\/p>/i)
  return m ? m[1].replace(/<[^>]+>/g, '') : ''
}

const T_COLOR: Record<string, string> = {
  news: 'bg-red-500/20 text-red-300 border-red-500/30',
  reportazas: 'bg-red-500/20 text-red-300 border-red-500/30',
  interviu: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  recenzija: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
}
const T_LABEL: Record<string, string> = { news: 'Naujiena', reportazas: 'Reportažas', interviu: 'Interviu', recenzija: 'Recenzija' }

function Chip({ type }: { type: string }) {
  return (
    <span className={`inline-flex items-center text-[10px] font-black tracking-widest uppercase px-2.5 py-1 rounded-full border ${T_COLOR[type] || 'bg-orange-500/20 text-orange-300 border-orange-500/30'}`}>
      {T_LABEL[type] || type}
    </span>
  )
}

// ── Songs Player ──────────────────────────────────────────────────────────

function SongsPlayer({ songs }: { songs: SongEntry[] }) {
  const [active, setActive] = useState(0)
  const [playing, setPlaying] = useState(false)

  if (!songs.length) return null

  const cur = songs[active]
  const vid = ytId(cur.youtube_url)

  return (
    <div className="songs-player">
      <div className="sp-video">
        {playing && vid ? (
          <iframe
            src={`https://www.youtube.com/embed/${vid}?autoplay=1`}
            allow="autoplay; encrypted-media" allowFullScreen
            className="sp-iframe"
          />
        ) : (
          <div className="sp-thumb" onClick={() => { if (vid) setPlaying(true) }}>
            {vid
              ? <img src={`https://img.youtube.com/vi/${vid}/mqdefault.jpg`} alt={cur.title} />
              : <div className="sp-no-thumb">♪</div>
            }
            {vid && (
              <div className="sp-play-overlay">
                <div className="sp-play-btn">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                </div>
              </div>
            )}
            <div className="sp-thumb-meta">
              <div className="sp-thumb-title">{cur.title}</div>
              {cur.artist_name && <div className="sp-thumb-artist">{cur.artist_name}</div>}
            </div>
          </div>
        )}
      </div>

      {songs.length > 1 && (
        <div className="sp-list">
          {songs.map((s, i) => {
            const v = ytId(s.youtube_url)
            return (
              <button key={i} onClick={() => { setActive(i); setPlaying(false) }}
                className={`sp-item ${active === i ? 'sp-item-active' : ''}`}>
                {v
                  ? <img src={`https://img.youtube.com/vi/${v}/default.jpg`} alt="" className="sp-item-thumb" />
                  : <div className="sp-item-thumb sp-item-no-thumb">♪</div>
                }
                <div className="sp-item-text">
                  <div className="sp-item-title">{s.title}</div>
                  {s.artist_name && <div className="sp-item-artist">{s.artist_name}</div>}
                </div>
                {active === i && <div className="sp-item-dot" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Reactions ─────────────────────────────────────────────────────────────

const RX = [
  { e: '🏆', l: 'Laimės!', c: 214 },
  { e: '🔥', l: 'Puiki daina', c: 389 },
  { e: '🇱🇹', l: 'Palaikau', c: 512 },
  { e: '😬', l: 'Abejoju', c: 67 },
]

function Reactions() {
  const [picked, setPicked] = useState<number | null>(null)
  const [counts, setCounts] = useState(RX.map(r => r.c))
  const total = counts.reduce((a, b) => a + b, 0)

  const pick = (i: number) => {
    if (picked === i) return
    if (picked !== null) setCounts(c => c.map((v, j) => j === picked ? v - 1 : v))
    setCounts(c => c.map((v, j) => j === i ? v + 1 : v))
    setPicked(i)
  }

  return (
    <div className="rx-block">
      <div className="rx-label">Kaip vertini?</div>
      <div className="rx-grid">
        {RX.map((r, i) => (
          <button key={i} onClick={() => pick(i)} className={`rx-btn ${picked === i ? 'rx-btn-on' : ''}`}>
            <span className="rx-e">{r.e}</span>
            <span className="rx-l">{r.l}</span>
            <span className="rx-c">{counts[i]}</span>
          </button>
        ))}
      </div>
      {picked !== null && (
        <div className="rx-bars">
          {RX.map((r, i) => (
            <div key={i} className="rx-bar-row">
              <span className="rx-bar-e">{r.e}</span>
              <div className="rx-bar-bg">
                <div className="rx-bar-fg" style={{ width: `${Math.round(counts[i] / total * 100)}%` }} />
              </div>
              <span className="rx-bar-n">{counts[i]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Photo Gallery (modern collage) ────────────────────────────────────────

function PhotoGallery({ photos }: { photos: Photo[] }) {
  const [lb, setLb] = useState<number | null>(null)
  const [showAll, setShowAll] = useState(false)
  if (!photos.length) return null

  const PREVIEW = 5
  const shown = showAll ? photos : photos.slice(0, PREVIEW)
  const hidden = photos.length - PREVIEW

  return (
    <>
      <div className="pg-wrap">
        <div className="pg-label">
          <span className="pg-label-line" />
          <span className="pg-label-txt">Galerija · {photos.length} nuotr.</span>
          <span className="pg-label-line" />
        </div>

        {/* Masonry-style collage grid */}
        <div className={`pg-grid pg-grid-${Math.min(shown.length, 5)}`}>
          {shown.map((p, i) => (
            <div key={i} className={`pg-cell pg-cell-${i}`} onClick={() => setLb(i)}>
              <img src={p.url} alt={p.caption || ''} />
              <div className="pg-cell-overlay">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
              </div>
              {/* Show +N on last visible if hidden */}
              {!showAll && i === PREVIEW - 1 && hidden > 0 && (
                <div className="pg-more-overlay" onClick={e => { e.stopPropagation(); setShowAll(true) }}>
                  <span>+{hidden}</span>
                  <small>nuotraukos</small>
                </div>
              )}
              {p.caption && <div className="pg-caption">{p.caption}</div>}
            </div>
          ))}
        </div>

        {showAll && photos.length > PREVIEW && (
          <button className="pg-less" onClick={() => setShowAll(false)}>↑ Rodyti mažiau</button>
        )}
      </div>

      {lb !== null && (
        <div className="lb" onClick={() => setLb(null)}>
          <button className="lb-x" onClick={e => { e.stopPropagation(); setLb(null) }}>✕</button>
          <button className="lb-prev" onClick={e => { e.stopPropagation(); setLb(i => Math.max(0, i! - 1)) }}>‹</button>
          <div className="lb-wrap" onClick={e => e.stopPropagation()}>
            <img src={photos[lb].url} alt="" />
            {photos[lb].caption && <p className="lb-cap">{photos[lb].caption}</p>}
            {photos[lb].source && <p className="lb-src">© {photos[lb].source}</p>}
          </div>
          <button className="lb-next" onClick={e => { e.stopPropagation(); setLb(i => Math.min(photos.length - 1, i! + 1)) }}>›</button>
          <div className="lb-counter">{lb + 1} / {photos.length}</div>
        </div>
      )}
    </>
  )
}

// ── Comments ──────────────────────────────────────────────────────────────

const MOCK_CMT = [
  { id: 1, user: 'muzikoslt', badge: 'Fanas', bCls: 'bg-violet-500/20 text-violet-300', text: 'Labai džiaugiuosi! Puiki daina, tikiuosi gerai pasirodys Vienoje.', time: '2 val.', likes: 24 },
  { id: 2, user: 'eurovizijos_fanas', badge: 'Ekspertas', bCls: 'bg-orange-500/20 text-orange-300', text: 'Pagal bukmeikerių prognozes esame tarp TOP 15 – labai geras rezultatas Lietuvai.', time: '8 val.', likes: 41 },
]

function Comments() {
  const [liked, setLiked] = useState<number[]>([])
  const [counts, setCounts] = useState(MOCK_CMT.map(c => c.likes))
  const toggle = (i: number) => {
    setLiked(p => p.includes(i) ? p.filter(x => x !== i) : [...p, i])
    setCounts(p => p.map((v, j) => j === i ? (liked.includes(i) ? v - 1 : v + 1) : v))
  }
  return (
    <div className="cmt-block">
      <div className="cmt-hdr">
        <span className="cmt-title">💬 Komentarai ({MOCK_CMT.length + 45})</span>
        <button className="cmt-sort">Naujausi ↓</button>
      </div>
      <div className="cmt-input-row">
        <div className="cmt-av" style={{ background: 'rgba(29,78,216,.25)', color: '#93b4e0' }}>J</div>
        <textarea className="cmt-input" placeholder="Parašyk komentarą…" rows={1}
          onFocus={e => { e.target.rows = 3 }} onBlur={e => { if (!e.target.value) e.target.rows = 1 }} />
        <button className="cmt-send">Siųsti</button>
      </div>
      {MOCK_CMT.map((c, i) => (
        <div key={c.id} className="cmt-item">
          <div className={`cmt-av ${c.bCls}`}>{c.user[0].toUpperCase()}</div>
          <div className="cmt-body">
            <div className="cmt-top">
              <span className="cmt-user">{c.user}</span>
              <span className={`cmt-badge ${c.bCls}`}>{c.badge}</span>
              <span className="cmt-time">{c.time}</span>
            </div>
            <p className="cmt-text">{c.text}</p>
            <div className="cmt-acts">
              <button className={`cmt-act ${liked.includes(i) ? 'cmt-liked' : ''}`} onClick={() => toggle(i)}>
                👍 <span>{counts[i]}</span>
              </button>
              <button className="cmt-act">↩ Atsakyti</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

const NAV = ['Topai', 'Muzika', 'Renginiai', 'Atlikėjai', 'Bendruomenė']

export default function NewsArticleClient({
  news, related, songs = [],
}: {
  news: NewsItem
  related: RelatedNews[]
  songs?: SongEntry[]
}) {
  const heroImg = news.image_small_url || news.artist?.cover_image_url
  const gallery = news.gallery || []
  const lede = getLede(news.body)
  const hasSidebar = songs.length > 0

  return (
    <>
      <style>{`
        :root {
          --bg:#0d1117; --text:#f2f4f8; --text2:#c8d8f0; --text3:#7a90b0;
          --text4:#3d5878; --border:rgba(255,255,255,0.07); --border2:rgba(255,255,255,0.04);
          --orange:#f97316; --blue:#1d4ed8; --card:rgba(255,255,255,0.03);
        }
        .np { background:var(--bg); color:var(--text); font-family:'Inter',system-ui,sans-serif; -webkit-font-smoothing:antialiased; min-height:100vh; }

        /* Header */
        .sh { position:sticky; top:0; z-index:50; background:rgba(13,17,23,0.97); backdrop-filter:blur(24px); }
        .sh-r1 { max-width:1360px; margin:0 auto; padding:0 20px; height:56px; display:flex; align-items:center; gap:24px; }
        .sh-logo { font-size:22px; font-weight:900; letter-spacing:-.03em; text-decoration:none; flex-shrink:0; }
        .sh-logo-m { color:#f2f4f8; } .sh-logo-d { color:#fb923c; }
        .sh-search { flex:1; display:flex; align-items:center; border-radius:100px; overflow:hidden; background:rgba(255,255,255,0.055); border:1px solid rgba(255,255,255,0.09); }
        .sh-search input { flex:1; height:36px; padding:0 16px; font-size:13px; background:transparent; border:none; outline:none; color:#c8d8f0; }
        .sh-search input::placeholder { color:#3d5878; }
        .sh-search-icon { width:36px; height:36px; display:flex; align-items:center; justify-content:center; color:#6a88b0; }
        .sh-lens { display:flex; align-items:center; border-radius:100px; padding:2px; background:rgba(255,255,255,0.055); border:1px solid rgba(255,255,255,0.08); flex-shrink:0; }
        .sh-lbtn { padding:6px 14px; border-radius:100px; font-size:12px; font-weight:700; background:none; border:none; cursor:pointer; color:#8aa8cc; font-family:'Inter',sans-serif; }
        .sh-lbtn.on { background:#1d4ed8; color:white; }
        .sh-r2 { border-top:1px solid rgba(255,255,255,0.06); background:rgba(255,255,255,0.02); }
        .sh-nav { max-width:1360px; margin:0 auto; padding:0 20px; height:36px; display:flex; align-items:center; gap:2px; }
        .sh-nav a { padding:4px 14px; font-size:12px; font-weight:600; color:#8aa8cc; border-radius:6px; text-decoration:none; transition:all .15s; }
        .sh-nav a:hover { color:#e2eaf8; background:rgba(255,255,255,0.06); }

        /* Hero */
        .hero { position:relative; height:100svh; min-height:560px; max-height:820px; overflow:hidden; }
        .hero-img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:60% 15%; transform:scale(1.06); animation:zoom 18s ease-out forwards; }
        @keyframes zoom { to { transform:scale(1); } }
        .hero-grad { position:absolute; inset:0; background:linear-gradient(to right, rgba(8,11,17,0.92) 0%, rgba(8,11,17,0.5) 55%, rgba(8,11,17,0.1) 100%), linear-gradient(to top, rgba(8,11,17,0.8) 0%, transparent 45%); }
        .hero-content { position:absolute; inset:0; display:flex; align-items:center; padding:80px 48px; max-width:760px; }
        .hero-inner { animation:fadein .9s .15s both; }
        @keyframes fadein { from { opacity:0; transform:translateY(22px); } to { opacity:1; transform:none; } }
        .hero-chips { display:flex; gap:6px; margin-bottom:20px; }
        .hero-h1 { font-size:clamp(2rem,4.5vw,3.8rem); font-weight:900; line-height:1.05; letter-spacing:-.035em; color:#fff; margin-bottom:18px; }
        .hero-lede { font-size:clamp(.95rem,1.6vw,1.1rem); color:rgba(200,218,245,0.78); line-height:1.7; margin-bottom:32px; max-width:560px; }
        .hero-btn { display:inline-flex; align-items:center; gap:8px; background:var(--orange); color:#fff; border:none; font-size:13px; font-weight:800; padding:12px 24px; border-radius:100px; cursor:pointer; font-family:'Inter',sans-serif; box-shadow:0 4px 20px rgba(249,115,22,.35); transition:all .2s; text-decoration:none; }
        .hero-btn:hover { background:#ea6b0a; transform:translateY(-1px); }
        .hero-scroll { position:absolute; bottom:32px; left:48px; display:flex; align-items:center; gap:10px; opacity:.4; animation:bob 2.4s ease-in-out infinite; }
        @keyframes bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(6px)} }
        .hero-scroll span { font-size:9px; font-weight:800; letter-spacing:.16em; text-transform:uppercase; color:rgba(255,255,255,.7); }
        .hero-scroll-line { width:28px; height:1px; background:rgba(255,255,255,.3); }

        /* Layout */
        .layout { max-width:1360px; margin:0 auto; padding:52px 24px 80px; display:grid; gap:0; align-items:start; }
        .layout.with-sidebar { grid-template-columns:1fr 320px; }
        .layout.no-sidebar { grid-template-columns:1fr; }
        .main { padding-right:0; }
        .layout.with-sidebar .main { padding-right:40px; border-right:1px solid var(--border2); }
        .sidebar { padding-left:28px; position:sticky; top:80px; display:flex; flex-direction:column; gap:10px; }

        /* Prose */
        .divider { height:1px; background:var(--border2); margin-bottom:32px; }
        .prose { color:var(--text3); font-size:1rem; line-height:1.9; }
        .prose p { margin-bottom:24px; }
        .prose a { color:#93b4e0; text-decoration:underline; }
        .prose h2 { font-size:1.45rem; font-weight:800; color:var(--text2); margin:36px 0 16px; letter-spacing:-.02em; }
        .prose h3 { font-size:1.18rem; font-weight:700; color:var(--text2); margin:28px 0 12px; }
        .prose blockquote { border-left:3px solid var(--orange); padding:14px 20px; margin:32px 0; background:rgba(249,115,22,.05); border-radius:0 10px 10px 0; }
        .prose blockquote p { font-size:1.08rem; font-weight:700; font-style:italic; color:var(--text2); line-height:1.5; margin:0; }
        .prose ul { margin:16px 0 24px 20px; list-style:disc; }
        .prose ol { margin:16px 0 24px 20px; list-style:decimal; }
        .prose li { color:var(--text3); line-height:1.78; margin-bottom:6px; }
        .prose strong { color:var(--text2); font-weight:700; }
        .prose em { font-style:italic; }

        /* Songs Player */
        .songs-player { border-radius:14px; overflow:hidden; border:1px solid var(--border); background:rgba(0,0,0,.5); margin-bottom:8px; }
        .sp-video { position:relative; }
        .sp-iframe { width:100%; aspect-ratio:16/9; border:none; display:block; }
        .sp-thumb { position:relative; aspect-ratio:16/9; overflow:hidden; cursor:pointer; }
        .sp-thumb img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .3s; }
        .sp-thumb:hover img { transform:scale(1.03); }
        .sp-no-thumb { width:100%; aspect-ratio:16/9; background:#111; display:flex; align-items:center; justify-content:center; font-size:32px; color:rgba(255,255,255,.1); }
        .sp-play-overlay { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.3); transition:background .2s; }
        .sp-thumb:hover .sp-play-overlay { background:rgba(0,0,0,.45); }
        .sp-play-btn { width:52px; height:52px; border-radius:50%; background:rgba(249,115,22,.9); display:flex; align-items:center; justify-content:center; box-shadow:0 4px 20px rgba(249,115,22,.5); transition:transform .15s; }
        .sp-thumb:hover .sp-play-btn { transform:scale(1.08); }
        .sp-thumb-meta { position:absolute; bottom:0; left:0; right:0; padding:24px 12px 10px; background:linear-gradient(transparent, rgba(0,0,0,.8)); }
        .sp-thumb-title { font-size:13px; font-weight:800; color:#fff; line-height:1.3; }
        .sp-thumb-artist { font-size:11px; color:rgba(255,255,255,.5); margin-top:2px; }
        .sp-list { border-top:1px solid var(--border2); }
        .sp-item { width:100%; display:flex; align-items:center; gap:9px; padding:8px 10px; text-align:left; background:none; border:none; cursor:pointer; border-bottom:1px solid var(--border2); transition:background .15s; font-family:'Inter',sans-serif; }
        .sp-item:last-child { border-bottom:none; }
        .sp-item:hover { background:rgba(255,255,255,.04); }
        .sp-item-active { background:rgba(249,115,22,.07); }
        .sp-item-thumb { width:38px; height:38px; border-radius:6px; object-fit:cover; flex-shrink:0; }
        .sp-item-no-thumb { background:rgba(255,255,255,.06); display:flex; align-items:center; justify-content:center; font-size:14px; color:rgba(255,255,255,.2); }
        .sp-item-text { flex:1; min-width:0; }
        .sp-item-title { font-size:12px; font-weight:700; color:var(--text2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .sp-item-artist { font-size:10px; color:var(--text4); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .sp-item-dot { width:6px; height:6px; border-radius:50%; background:var(--orange); flex-shrink:0; }

        /* Reactions */
        .rx-block { border-radius:14px; border:1px solid var(--border); background:var(--card); padding:14px; }
        .rx-label { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.12em; color:var(--text4); margin-bottom:10px; }
        .rx-grid { display:grid; grid-template-columns:1fr 1fr; gap:5px; margin-bottom:10px; }
        .rx-btn { background:rgba(255,255,255,.04); border:1px solid var(--border); border-radius:10px; padding:9px 8px; cursor:pointer; display:flex; align-items:center; gap:5px; font-size:11px; font-weight:700; color:var(--text2); transition:all .2s; font-family:'Inter',sans-serif; }
        .rx-btn.rx-btn-on { border-color:rgba(249,115,22,.4); background:rgba(249,115,22,.1); color:var(--orange); }
        .rx-e { font-size:15px; } .rx-l { font-size:10px; flex:1; text-align:left; } .rx-c { font-size:10px; color:var(--text4); font-weight:500; }
        .rx-bars { display:flex; flex-direction:column; gap:6px; margin-top:8px; padding-top:8px; border-top:1px solid var(--border2); }
        .rx-bar-row { display:flex; align-items:center; gap:8px; }
        .rx-bar-e { font-size:12px; width:18px; text-align:center; }
        .rx-bar-bg { flex:1; height:4px; background:rgba(255,255,255,.06); border-radius:100px; overflow:hidden; }
        .rx-bar-fg { height:100%; border-radius:100px; background:var(--orange); transition:width .5s; }
        .rx-bar-n { font-size:10px; color:var(--text4); width:24px; text-align:right; font-weight:600; }

        /* Share */
        .share-card { border-radius:14px; border:1px solid var(--border); background:var(--card); padding:14px; }
        .share-label { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.12em; color:var(--text4); margin-bottom:10px; }
        .share-grid { display:grid; grid-template-columns:1fr 1fr; gap:5px; }
        .sh-btn { background:rgba(255,255,255,.04); border:1px solid var(--border); border-radius:8px; padding:7px; font-size:11px; font-weight:700; color:var(--text3); cursor:pointer; font-family:'Inter',sans-serif; transition:all .2s; }
        .sh-btn:hover { color:var(--text); border-color:rgba(255,255,255,.15); }
        .sh-btn-full { grid-column:1/-1; background:rgba(249,115,22,.1); border-color:rgba(249,115,22,.25); color:var(--orange); }

        /* Related */
        .rel-card { border-radius:14px; border:1px solid var(--border); background:var(--card); padding:14px; }
        .rel-label { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.12em; color:var(--text4); margin-bottom:10px; }
        .rel-item { display:flex; gap:9px; align-items:center; padding:6px 0; border-bottom:1px solid var(--border2); text-decoration:none; transition:opacity .2s; }
        .rel-item:last-child { border-bottom:none; }
        .rel-item:hover { opacity:.8; }
        .rel-thumb { width:40px; height:40px; border-radius:6px; object-fit:cover; flex-shrink:0; background:rgba(255,255,255,.06); }
        .rel-title { font-size:12px; font-weight:700; color:var(--text2); line-height:1.35; }

        /* Artist card */
        .artist-card { border-radius:14px; border:1px solid var(--border); background:var(--card); display:flex; flex-direction:column; align-items:center; text-align:center; padding:18px 14px; }
        .ac-img { width:56px; height:56px; border-radius:50%; object-fit:cover; border:2px solid var(--border); margin-bottom:8px; background:rgba(255,255,255,.06); }
        .ac-name { font-size:14px; font-weight:800; color:var(--text); margin-bottom:2px; }
        .ac-sub { font-size:11px; color:var(--text4); margin-bottom:10px; }
        .ac-btn { width:100%; background:rgba(29,78,216,.1); border:1px solid rgba(29,78,216,.2); color:#93b4e0; font-size:11px; font-weight:700; padding:7px; border-radius:8px; cursor:pointer; font-family:'Inter',sans-serif; transition:all .2s; text-decoration:none; display:block; text-align:center; }
        .ac-btn:hover { background:rgba(29,78,216,.2); }

        /* ── PHOTO GALLERY ── */
        .pg-wrap { margin:40px 0 32px; }
        .pg-label { display:flex; align-items:center; gap:12px; margin-bottom:16px; }
        .pg-label-line { flex:1; height:1px; background:var(--border); }
        .pg-label-txt { font-size:10px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; color:var(--text4); white-space:nowrap; }

        /* Dynamic grid by photo count */
        .pg-grid { display:grid; gap:3px; border-radius:12px; overflow:hidden; }

        /* 1 photo: full width 16:9 */
        .pg-grid-1 { grid-template-columns:1fr; }
        .pg-grid-1 .pg-cell { aspect-ratio:16/9; }

        /* 2 photos: equal halves */
        .pg-grid-2 { grid-template-columns:1fr 1fr; }
        .pg-grid-2 .pg-cell { aspect-ratio:4/3; }

        /* 3 photos: big left + 2 right stacked */
        .pg-grid-3 { grid-template-columns:2fr 1fr; grid-template-rows:1fr 1fr; height:360px; }
        .pg-grid-3 .pg-cell-0 { grid-row:1/3; }
        .pg-grid-3 .pg-cell { height:100%; }

        /* 4 photos: 1 wide top + 3 bottom */
        .pg-grid-4 { grid-template-columns:1fr 1fr 1fr; grid-template-rows:240px 180px; }
        .pg-grid-4 .pg-cell-0 { grid-column:1/4; }

        /* 5+ photos: asymmetric editorial grid */
        .pg-grid-5 { grid-template-columns:2fr 1fr 1fr; grid-template-rows:220px 160px; }
        .pg-grid-5 .pg-cell-0 { grid-row:1/3; }
        .pg-grid-5 .pg-cell { height:100%; }

        .pg-cell { position:relative; overflow:hidden; cursor:zoom-in; background:rgba(255,255,255,.03); }
        .pg-cell img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .4s cubic-bezier(.25,.46,.45,.94); }
        .pg-cell:hover img { transform:scale(1.05); }
        .pg-cell-overlay { position:absolute; inset:0; background:rgba(0,0,0,0); display:flex; align-items:center; justify-content:center; transition:background .2s; opacity:0; }
        .pg-cell:hover .pg-cell-overlay { background:rgba(0,0,0,.3); opacity:1; }
        .pg-caption { position:absolute; bottom:0; left:0; right:0; font-size:10px; color:rgba(255,255,255,.7); padding:20px 10px 7px; background:linear-gradient(transparent,rgba(0,0,0,.65)); pointer-events:none; }

        /* +N overlay on last cell */
        .pg-more-overlay { position:absolute; inset:0; background:rgba(10,14,20,.75); backdrop-filter:blur(4px); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; cursor:pointer; transition:background .2s; }
        .pg-more-overlay:hover { background:rgba(10,14,20,.6); }
        .pg-more-overlay span { font-size:28px; font-weight:900; color:#fff; line-height:1; }
        .pg-more-overlay small { font-size:10px; font-weight:600; color:rgba(255,255,255,.5); letter-spacing:.08em; text-transform:uppercase; }

        .pg-less { display:block; margin:10px auto 0; font-size:11px; font-weight:700; color:var(--text4); background:none; border:1px solid var(--border); padding:6px 16px; border-radius:100px; cursor:pointer; font-family:'Inter',sans-serif; transition:all .2s; }
        .pg-less:hover { color:var(--text2); border-color:rgba(255,255,255,.15); }

        /* Lightbox */
        .lb { position:fixed; inset:0; z-index:1000; background:rgba(0,0,0,.95); backdrop-filter:blur(12px); display:flex; align-items:center; justify-content:center; animation:fadein .15s; }
        .lb-wrap { max-width:88vw; max-height:88vh; display:flex; flex-direction:column; align-items:center; }
        .lb-wrap img { max-width:100%; max-height:80vh; object-fit:contain; border-radius:8px; display:block; box-shadow:0 24px 80px rgba(0,0,0,.8); }
        .lb-cap { font-size:12px; color:rgba(255,255,255,.45); text-align:center; margin-top:10px; }
        .lb-src { font-size:10px; color:rgba(255,255,255,.25); text-align:center; margin-top:4px; }
        .lb-x { position:absolute; top:20px; right:24px; background:rgba(255,255,255,.1); border:none; color:rgba(255,255,255,.7); font-size:18px; cursor:pointer; width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; transition:background .2s; }
        .lb-x:hover { background:rgba(255,255,255,.2); }
        .lb-prev,.lb-next { position:absolute; top:50%; transform:translateY(-50%); background:rgba(255,255,255,.08); border:none; color:rgba(255,255,255,.7); font-size:36px; cursor:pointer; width:52px; height:52px; border-radius:50%; display:flex; align-items:center; justify-content:center; transition:background .2s; }
        .lb-prev:hover,.lb-next:hover { background:rgba(255,255,255,.15); }
        .lb-prev { left:16px; } .lb-next { right:16px; }
        .lb-counter { position:absolute; bottom:20px; left:50%; transform:translateX(-50%); font-size:11px; font-weight:600; color:rgba(255,255,255,.3); letter-spacing:.08em; }

        /* Comments */
        .cmt-block { margin-top:40px; }
        .cmt-hdr { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
        .cmt-title { font-size:14px; font-weight:800; color:var(--text2); }
        .cmt-sort { font-size:11px; color:var(--text4); background:var(--card); border:1px solid var(--border); padding:3px 10px; border-radius:100px; cursor:pointer; font-family:'Inter',sans-serif; }
        .cmt-input-row { display:flex; gap:9px; margin-bottom:18px; align-items:flex-start; }
        .cmt-av { width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:900; flex-shrink:0; }
        .cmt-input { flex:1; background:var(--card); border:1px solid var(--border); border-radius:10px; padding:8px 12px; font-size:13px; color:var(--text2); font-family:'Inter',sans-serif; resize:none; outline:none; }
        .cmt-input:focus { border-color:rgba(29,78,216,.4); }
        .cmt-input::placeholder { color:var(--text4); }
        .cmt-send { background:var(--blue); color:#fff; border:none; border-radius:8px; padding:6px 12px; font-size:12px; font-weight:700; cursor:pointer; flex-shrink:0; font-family:'Inter',sans-serif; }
        .cmt-item { display:flex; gap:9px; padding:12px 0; border-bottom:1px solid var(--border2); }
        .cmt-body { flex:1; min-width:0; }
        .cmt-top { display:flex; align-items:center; gap:7px; margin-bottom:4px; flex-wrap:wrap; }
        .cmt-user { font-size:12px; font-weight:700; color:var(--text); }
        .cmt-badge { font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:.07em; padding:2px 6px; border-radius:100px; }
        .cmt-time { font-size:10px; color:var(--text4); margin-left:auto; }
        .cmt-text { font-size:13px; color:var(--text3); line-height:1.6; margin-bottom:7px; }
        .cmt-acts { display:flex; gap:9px; }
        .cmt-act { background:none; border:none; font-size:11px; font-weight:600; color:var(--text4); cursor:pointer; display:flex; align-items:center; gap:3px; font-family:'Inter',sans-serif; }
        .cmt-liked { color:var(--orange); }

        @media(max-width:900px){
          .layout.with-sidebar,.layout.no-sidebar { grid-template-columns:1fr; padding:32px 16px 60px; }
          .layout.with-sidebar .main { padding-right:0; border-right:none; border-bottom:1px solid var(--border2); padding-bottom:40px; margin-bottom:32px; }
          .sidebar { padding-left:0; position:static; }
          .sh-search,.sh-lens { display:none; }
          .hero-content { padding:80px 20px 60px; }
          .pg-grid-3 { height:260px; }
          .pg-grid-4 { grid-template-rows:180px 140px; }
          .pg-grid-5 { grid-template-rows:180px 130px; }
        }
      `}</style>

      <div className="np">

        {/* Header */}
        <header className="sh">
          <div className="sh-r1">
            <Link href="/" className="sh-logo">
              <span className="sh-logo-m">music</span><span className="sh-logo-d">.lt</span>
            </Link>
            <div className="sh-search">
              <input type="text" placeholder="Ieškok atlikėjų, albumų, dainų…" />
              <div className="sh-search-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
              </div>
            </div>
            <div className="sh-lens">
              {['🇱🇹 LT', 'Pasaulis', 'Visi'].map((l, i) => (
                <button key={i} className={`sh-lbtn ${i === 0 ? 'on' : ''}`}>{l}</button>
              ))}
            </div>
            <HeaderAuth />
          </div>
          <div className="sh-r2">
            <nav className="sh-nav">
              {NAV.map(n => <a key={n} href="/">{n}</a>)}
            </nav>
          </div>
        </header>

        {/* Hero */}
        <div className="hero">
          {heroImg && <img src={heroImg} alt={news.title} className="hero-img" />}
          <div className="hero-grad" />
          <div className="hero-content">
            <div className="hero-inner">
              <div className="hero-chips"><Chip type={news.type} /></div>
              <h1 className="hero-h1">{news.title}</h1>
              {lede && <p className="hero-lede">{lede}</p>}
              {news.source_url && (
                <a href={news.source_url} target="_blank" rel="noopener" className="hero-btn">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  Skaityti šaltinį
                </a>
              )}
            </div>
          </div>
          <div className="hero-scroll">
            <div className="hero-scroll-line" />
            <span>Skaityti</span>
          </div>
        </div>

        {/* Body */}
        <div className={`layout ${hasSidebar ? 'with-sidebar' : 'no-sidebar'}`}>
          <main className="main">
            <div className="divider" />
            <div className="prose" dangerouslySetInnerHTML={{ __html: news.body }} />
            {gallery.length > 0 && <PhotoGallery photos={gallery} />}
            <Comments />
          </main>

          {hasSidebar && (
            <aside className="sidebar">
              <SongsPlayer songs={songs} />
              <Reactions />
              <div className="share-card">
                <div className="share-label">Dalintis</div>
                <div className="share-grid">
                  <button className="sh-btn sh-btn-full" onClick={() => navigator.share?.({ title: news.title, url: location.href })}>📤 Dalintis</button>
                  <button className="sh-btn" onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(location.href)}`)}>Facebook</button>
                  <button className="sh-btn" onClick={() => window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(location.href)}&text=${encodeURIComponent(news.title)}`)}>Twitter / X</button>
                </div>
              </div>
              {related.length > 0 && (
                <div className="rel-card">
                  <div className="rel-label">Taip pat skaitykite</div>
                  {related.map(r => (
                    <Link key={r.id} href={`/news/${r.slug}`} className="rel-item">
                      {r.image_small_url ? <img src={r.image_small_url} alt="" className="rel-thumb" /> : <div className="rel-thumb" />}
                      <span className="rel-title">{r.title}</span>
                    </Link>
                  ))}
                </div>
              )}
              {news.artist && (
                <div className="artist-card">
                  {news.artist.cover_image_url
                    ? <img src={news.artist.cover_image_url} alt={news.artist.name} className="ac-img" />
                    : <div className="ac-img" style={{ display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,fontWeight:900,color:'rgba(255,255,255,.15)' }}>{news.artist.name[0]}</div>
                  }
                  <div className="ac-name">{news.artist.name}</div>
                  <div className="ac-sub">music.lt atlikėjas</div>
                  <Link href={`/artists/${news.artist.id}`} className="ac-btn">Atlikėjo profilis →</Link>
                </div>
              )}
            </aside>
          )}
        </div>
      </div>
    </>
  )
}
