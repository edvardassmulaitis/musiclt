'use client'
// app/news/[slug]/news-article-client.tsx

import { useState } from 'react'
import Link from 'next/link'
import { HeaderAuth } from '@/components/HeaderAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

type ArtistRef = {
  id: number
  name: string
  cover_image_url?: string
  photos?: { url: string; caption?: string }[]
}

type Photo = { url: string; caption?: string; source?: string; source_url?: string }

type NewsItem = {
  id: number
  title: string
  slug: string
  body: string
  type: string
  source_url?: string
  source_name?: string
  published_at: string
  image_small_url?: string
  gallery?: Photo[]
  youtube_url?: string
  artist?: ArtistRef
  artist2?: ArtistRef
}

type RelatedNews = {
  id: number
  title: string
  slug: string
  image_small_url?: string
  published_at: string
  type: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getYouTubeId(url?: string): string | null {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  return m ? m[1] : null
}

function getLede(body: string): string {
  const m = body.match(/<p[^>]*>(.*?)<\/p>/i)
  if (!m) return ''
  return m[1].replace(/<[^>]+>/g, '')
}

// ─── Chip ─────────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  news:       'bg-red-500/20 text-red-300 border-red-500/30',
  reportazas: 'bg-red-500/20 text-red-300 border-red-500/30',
  interviu:   'bg-violet-500/20 text-violet-300 border-violet-500/30',
  recenzija:  'bg-blue-500/20 text-blue-300 border-blue-500/30',
  default:    'bg-orange-500/20 text-orange-300 border-orange-500/30',
}
const TYPE_LABELS: Record<string, string> = {
  news: 'Naujiena', reportazas: 'Reportažas', interviu: 'Interviu', recenzija: 'Recenzija',
}
function Chip({ type }: { type: string }) {
  const cls = TYPE_COLORS[type] || TYPE_COLORS.default
  return (
    <span className={`inline-flex items-center text-[10px] font-black tracking-widest uppercase px-2.5 py-1 rounded-full border ${cls}`}>
      {TYPE_LABELS[type] || type}
    </span>
  )
}

// ─── YouTube Widget ───────────────────────────────────────────────────────────

function YouTubeWidget({ url }: { url: string }) {
  const [playing, setPlaying] = useState(false)
  const id = getYouTubeId(url)
  if (!id) return null
  return (
    <div className="yt-widget">
      <div className="yt-widget-label">🎬 Vaizdo klipas</div>
      {playing ? (
        <div className="yt-embed-wrap">
          <iframe src={`https://www.youtube.com/embed/${id}?autoplay=1`} allow="autoplay; encrypted-media" allowFullScreen className="yt-iframe" />
        </div>
      ) : (
        <div className="yt-thumb-wrap" onClick={() => setPlaying(true)}>
          <img src={`https://img.youtube.com/vi/${id}/maxresdefault.jpg`} alt="Video" />
          <div className="yt-play-btn">
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
              <circle cx="28" cy="28" r="28" fill="rgba(0,0,0,0.6)"/>
              <polygon points="23,18 41,28 23,38" fill="white"/>
            </svg>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Vertical Gallery Sidebar ─────────────────────────────────────────────────

function VerticalGallery({ photos }: { photos: Photo[] }) {
  const [lightbox, setLightbox] = useState<number | null>(null)
  if (!photos.length) return null

  return (
    <>
      <div className="vgallery">
        <div className="vgallery-label">📸 {photos.length} nuotr.</div>
        <div className="vgallery-list">
          {photos.map((p, i) => (
            <div key={i} className="vgallery-item" onClick={() => setLightbox(i)}>
              <img src={p.url} alt={p.caption || ''} />
              {p.caption && <div className="vgallery-cap">{p.caption}</div>}
              {p.source && <div className="vgallery-src">© {p.source}</div>}
              <div className="vgallery-overlay">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox !== null && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <button className="lb-close" onClick={() => setLightbox(null)}>✕</button>
          <button className="lb-prev" onClick={e => { e.stopPropagation(); setLightbox(i => Math.max(0, i! - 1)) }}>‹</button>
          <div className="lb-img-wrap" onClick={e => e.stopPropagation()}>
            <img src={photos[lightbox].url} alt={photos[lightbox].caption || ''} />
            {photos[lightbox].caption && <div className="lb-cap">{photos[lightbox].caption}</div>}
          </div>
          <button className="lb-next" onClick={e => { e.stopPropagation(); setLightbox(i => Math.min(photos.length - 1, i! + 1)) }}>›</button>
          <div className="lb-counter">{lightbox + 1} / {photos.length}</div>
        </div>
      )}
    </>
  )
}

// ─── Reactions ────────────────────────────────────────────────────────────────

const REACTIONS = [
  { emoji: '🏆', label: 'Laimės!', count: 214 },
  { emoji: '🔥', label: 'Puiki daina', count: 389 },
  { emoji: '🇱🇹', label: 'Palaikau', count: 512 },
  { emoji: '😬', label: 'Abejoju', count: 67 },
]
function Reactions() {
  const [picked, setPicked] = useState<number | null>(null)
  const [counts, setCounts] = useState(REACTIONS.map(r => r.count))
  const total = counts.reduce((a, b) => a + b, 0)
  const pick = (i: number) => {
    if (picked === i) return
    setCounts(c => c.map((v, j) => j === i ? v + 1 : v))
    setPicked(i)
  }
  return (
    <div className="reactions-block">
      <p className="reactions-q">Kaip vertini šios naujienos atlikėją?</p>
      <div className="reactions-btns">
        {REACTIONS.map((r, i) => (
          <button key={i} onClick={() => pick(i)} className={`reaction-btn ${picked === i ? 'reaction-btn-on' : ''}`}>
            <span className="reaction-emoji">{r.emoji}</span>
            <span className="reaction-label">{r.label}</span>
            <span className="reaction-count">{counts[i]}</span>
          </button>
        ))}
      </div>
      {picked !== null && (
        <div className="reactions-bars">
          {REACTIONS.map((r, i) => (
            <div key={i} className="rx-bar-row">
              <span className="rx-bar-e">{r.emoji}</span>
              <div className="rx-bar-bg"><div className="rx-bar-fg" style={{ width: `${Math.round(counts[i] / total * 100)}%` }} /></div>
              <span className="rx-bar-n">{counts[i]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Comments ─────────────────────────────────────────────────────────────────

const MOCK_COMMENTS = [
  { id: 1, user: 'muzikoslt', badge: 'Fanas', color: 'bg-violet-500/20 text-violet-300', text: 'Labai džiaugiuosi! Puiki daina, tikiuosi gerai pasirodys Vienoje.', time: '2 val.', likes: 24 },
  { id: 2, user: 'eurovizijos_fanas', badge: 'Ekspertas', color: 'bg-orange-500/20 text-orange-300', text: 'Pagal bukmeikerių prognozes esame tarp TOP 15 – labai geras rezultatas Lietuvai.', time: '8 val.', likes: 41 },
]
function Comments() {
  const [liked, setLiked] = useState<number[]>([])
  const [likes, setLikes] = useState(MOCK_COMMENTS.map(c => c.likes))
  const toggleLike = (i: number) => {
    setLiked(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])
    setLikes(prev => prev.map((v, j) => j === i ? (liked.includes(i) ? v - 1 : v + 1) : v))
  }
  return (
    <div className="comments-block">
      <div className="comments-header">
        <span className="comments-title">💬 Komentarai ({MOCK_COMMENTS.length + 45})</span>
        <button className="comments-sort">Naujausi ↓</button>
      </div>
      <div className="comment-input-row">
        <div className="comment-av" style={{ background: 'rgba(29,78,216,.25)', color: '#93b4e0' }}>J</div>
        <textarea className="comment-input" placeholder="Parašyk komentarą…" rows={1}
          onFocus={e => { e.target.rows = 3 }} onBlur={e => { if (!e.target.value) e.target.rows = 1 }} />
        <button className="comment-send">Siųsti</button>
      </div>
      {MOCK_COMMENTS.map((c, i) => (
        <div key={c.id} className="comment-item">
          <div className={`comment-av ${c.color}`}>{c.user[0].toUpperCase()}</div>
          <div className="comment-body">
            <div className="comment-top">
              <span className="comment-user">{c.user}</span>
              <span className={`comment-badge ${c.color}`}>{c.badge}</span>
              <span className="comment-time">{c.time}</span>
            </div>
            <p className="comment-text">{c.text}</p>
            <div className="comment-acts">
              <button className={`comment-act ${liked.includes(i) ? 'comment-act-liked' : ''}`} onClick={() => toggleLike(i)}>
                👍 <span>{likes[i]}</span>
              </button>
              <button className="comment-act">↩ Atsakyti</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const NAV = ['Topai', 'Muzika', 'Renginiai', 'Atlikėjai', 'Bendruomenė']

export default function NewsArticleClient({ news, related }: { news: NewsItem; related: RelatedNews[] }) {
  const [heroLoaded, setHeroLoaded] = useState(false)
  const heroImg = news.image_small_url || news.artist?.cover_image_url
  const gallery = news.gallery || []
  const lede = getLede(news.body)

  const formattedDate = new Date(news.published_at).toLocaleDateString('lt-LT', {
    year: 'numeric', month: 'long', day: 'numeric'
  })

  return (
    <>
      <style>{`
        :root {
          --bg: #0d1117; --text: #f2f4f8; --text2: #c8d8f0; --text3: #7a90b0;
          --text4: #3d5878; --border: rgba(255,255,255,0.07); --border2: rgba(255,255,255,0.04);
          --orange: #f97316; --blue: #1d4ed8; --card: rgba(255,255,255,0.03);
        }
        .news-page { background: var(--bg); color: var(--text); font-family: 'Inter', system-ui, sans-serif; -webkit-font-smoothing: antialiased; min-height: 100vh; }

        /* ── Site Header ── */
        .site-header { position: sticky; top: 0; z-index: 50; background: rgba(13,17,23,0.97); backdrop-filter: blur(24px); }
        .site-header-row1 { max-width: 1360px; margin: 0 auto; padding: 0 20px; height: 56px; display: flex; align-items: center; gap: 24px; }
        .site-logo { font-size: 22px; font-weight: 900; letter-spacing: -0.03em; text-decoration: none; flex-shrink: 0; }
        .site-logo-main { color: #f2f4f8; }
        .site-logo-dot { color: #fb923c; }
        .site-search { flex: 1; display: flex; align-items: center; border-radius: 100px; overflow: hidden; background: rgba(255,255,255,0.055); border: 1px solid rgba(255,255,255,0.09); }
        .site-search input { flex: 1; height: 36px; padding: 0 16px; font-size: 13px; background: transparent; border: none; outline: none; color: #c8d8f0; }
        .site-search input::placeholder { color: #3d5878; }
        .site-search-btn { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; color: #6a88b0; }
        .site-lens { display: flex; align-items: center; border-radius: 100px; padding: 2px; background: rgba(255,255,255,0.055); border: 1px solid rgba(255,255,255,0.08); flex-shrink: 0; }
        .site-lens-btn { padding: 6px 14px; border-radius: 100px; font-size: 12px; font-weight: 700; letter-spacing: 0.02em; background: none; border: none; cursor: pointer; color: #8aa8cc; transition: all .15s; font-family: 'Inter', sans-serif; }
        .site-lens-btn.active { background: #1d4ed8; color: white; }
        .site-header-row2 { border-top: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.02); }
        .site-nav { max-width: 1360px; margin: 0 auto; padding: 0 20px; height: 36px; display: flex; align-items: center; gap: 2px; }
        .site-nav a { padding: 4px 14px; font-size: 12px; font-weight: 600; color: #8aa8cc; border-radius: 6px; text-decoration: none; transition: all .15s; }
        .site-nav a:hover { color: #e2eaf8; background: rgba(255,255,255,0.06); }
        .site-nav a.active { color: #f2f4f8; background: rgba(255,255,255,0.08); }

        /* ── Hero ── */
        .news-hero { position: relative; height: 100svh; min-height: 560px; max-height: 860px; overflow: hidden; }
        .news-hero-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 60% 15%; transform: scale(1.06); animation: slow-zoom 18s ease-out forwards; }
        @keyframes slow-zoom { to { transform: scale(1); } }
        .news-hero-grad { position: absolute; inset: 0; background: linear-gradient(to right, rgba(8,11,17,0.92) 0%, rgba(8,11,17,0.5) 55%, rgba(8,11,17,0.1) 100%), linear-gradient(to top, rgba(8,11,17,0.8) 0%, transparent 45%); }
        .news-hero-content { position: absolute; inset: 0; display: flex; align-items: center; padding: 80px 48px 80px; max-width: 740px; }
        .news-hero-inner { animation: hero-fadein 0.9s 0.15s both; }
        @keyframes hero-fadein { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: none; } }
        .news-hero-chips { display: flex; gap: 6px; margin-bottom: 20px; }
        .news-hero-h1 { font-size: clamp(2rem, 4.5vw, 3.8rem); font-weight: 900; line-height: 1.05; letter-spacing: -0.035em; color: #fff; margin-bottom: 18px; }
        .news-hero-lede { font-size: clamp(0.95rem, 1.6vw, 1.1rem); color: rgba(200,218,245,0.78); line-height: 1.7; margin-bottom: 32px; max-width: 540px; }
        .news-hero-cta { display: flex; gap: 10px; flex-wrap: wrap; }
        .news-btn-primary { display: inline-flex; align-items: center; gap: 8px; background: var(--orange); color: #fff; border: none; font-size: 13px; font-weight: 800; padding: 12px 24px; border-radius: 100px; cursor: pointer; font-family: 'Inter', sans-serif; box-shadow: 0 4px 20px rgba(249,115,22,.35); transition: all .2s; text-decoration: none; }
        .news-btn-primary:hover { background: #ea6b0a; transform: translateY(-1px); }
        .news-scroll-hint { position: absolute; bottom: 32px; left: 48px; display: flex; align-items: center; gap: 10px; opacity: 0.4; animation: bob 2.4s ease-in-out infinite; }
        @keyframes bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(6px); } }
        .news-scroll-hint span { font-size: 9px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; color: rgba(255,255,255,.7); }
        .news-scroll-line { width: 28px; height: 1px; background: rgba(255,255,255,.3); }

        /* ── Layout ── */
        .news-layout { max-width: 1360px; margin: 0 auto; padding: 52px 24px 80px; display: grid; grid-template-columns: 1fr 300px; gap: 0; align-items: start; }
        .news-main { padding-right: 48px; border-right: 1px solid var(--border2); }
        .news-sidebar { padding-left: 32px; position: sticky; top: 80px; display: flex; flex-direction: column; gap: 10px; }

        /* ── Prose ── */
        .news-divider { height: 1px; background: var(--border2); margin-bottom: 32px; }
        .news-prose { color: var(--text3); font-size: 1rem; line-height: 1.9; }
        .news-prose p { margin-bottom: 24px; }
        .news-prose a { color: #93b4e0; text-decoration: underline; }
        .news-prose h2 { font-size: 1.45rem; font-weight: 800; color: var(--text2); margin: 36px 0 16px; letter-spacing: -.02em; }
        .news-prose h3 { font-size: 1.18rem; font-weight: 700; color: var(--text2); margin: 28px 0 12px; }
        .news-prose blockquote { border-left: 3px solid var(--orange); padding: 14px 20px; margin: 32px 0; background: rgba(249,115,22,.05); border-radius: 0 10px 10px 0; }
        .news-prose blockquote p { font-size: 1.08rem; font-weight: 700; font-style: italic; color: var(--text2); line-height: 1.5; margin: 0; }
        .news-prose ul { margin: 16px 0 24px 20px; list-style: disc; }
        .news-prose ol { margin: 16px 0 24px 20px; list-style: decimal; }
        .news-prose li { color: var(--text3); line-height: 1.78; margin-bottom: 6px; }
        .news-prose hr { border: none; border-top: 1px solid var(--border); margin: 36px 0; }
        .news-prose strong { color: var(--text2); font-weight: 700; }
        .news-prose em { font-style: italic; }
        .news-prose u { text-decoration: underline; }

        /* ── YouTube ── */
        .yt-widget { margin-bottom: 32px; border-radius: 14px; overflow: hidden; border: 1px solid var(--border); background: #000; }
        .yt-widget-label { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .12em; color: var(--text4); padding: 10px 14px; background: rgba(255,255,255,.025); }
        .yt-thumb-wrap { position: relative; aspect-ratio: 16/9; cursor: pointer; overflow: hidden; }
        .yt-thumb-wrap img { width: 100%; height: 100%; object-fit: cover; opacity: .7; display: block; transition: opacity .2s; }
        .yt-thumb-wrap:hover img { opacity: .85; }
        .yt-play-btn { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: none; }
        .yt-embed-wrap { position: relative; aspect-ratio: 16/9; }
        .yt-iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: none; }

        /* ── Vertical Gallery ── */
        .vgallery { }
        .vgallery-label { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .12em; color: var(--text4); margin-bottom: 8px; padding: 0 4px; }
        .vgallery-list { display: flex; flex-direction: column; gap: 5px; }
        .vgallery-item { position: relative; border-radius: 10px; overflow: hidden; border: 1px solid var(--border); cursor: pointer; aspect-ratio: 3/2; }
        .vgallery-item img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .35s; }
        .vgallery-item:hover img { transform: scale(1.04); }
        .vgallery-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0); display: flex; align-items: center; justify-content: center; opacity: 0; transition: all .2s; }
        .vgallery-item:hover .vgallery-overlay { background: rgba(0,0,0,.35); opacity: 1; }
        .vgallery-cap { position: absolute; bottom: 0; left: 0; right: 0; font-size: 10px; color: #fff; padding: 20px 8px 6px; background: linear-gradient(to top, rgba(0,0,0,.75), transparent); line-height: 1.3; }
        .vgallery-src { position: absolute; top: 5px; right: 7px; font-size: 9px; color: rgba(255,255,255,.35); }

        /* ── Lightbox ── */
        .lightbox { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,.93); display: flex; align-items: center; justify-content: center; }
        .lb-img-wrap { max-width: 88vw; max-height: 85vh; }
        .lb-img-wrap img { max-width: 100%; max-height: 80vh; object-fit: contain; border-radius: 8px; display: block; }
        .lb-cap { font-size: 12px; color: rgba(255,255,255,.45); text-align: center; margin-top: 10px; }
        .lb-close { position: absolute; top: 20px; right: 24px; background: rgba(255,255,255,.1); border: none; color: rgba(255,255,255,.7); font-size: 18px; cursor: pointer; width: 36px; height: 36px; border-radius: 50%; }
        .lb-prev, .lb-next { position: absolute; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,.08); border: none; color: rgba(255,255,255,.7); font-size: 36px; cursor: pointer; width: 52px; height: 52px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
        .lb-prev { left: 16px; }
        .lb-next { right: 16px; }
        .lb-counter { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); font-size: 12px; color: rgba(255,255,255,.35); }

        /* ── Sidebar cards ── */
        .sb-card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; }
        .sb-inner { padding: 14px; }
        .sb-label { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .12em; color: var(--text4); margin-bottom: 10px; }
        .share-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
        .share-btn { background: rgba(255,255,255,.04); border: 1px solid var(--border); border-radius: 8px; padding: 7px; font-size: 11px; font-weight: 700; color: var(--text3); cursor: pointer; font-family: 'Inter', sans-serif; transition: all .2s; }
        .share-btn:hover { color: var(--text); border-color: rgba(255,255,255,.15); }
        .share-btn-full { grid-column: 1 / -1; background: rgba(249,115,22,.1); border-color: rgba(249,115,22,.25); color: var(--orange); }
        .share-btn-full:hover { background: rgba(249,115,22,.18); }
        .related-item { display: flex; gap: 9px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--border2); text-decoration: none; transition: opacity .2s; }
        .related-item:last-child { border-bottom: none; }
        .related-item:hover { opacity: .8; }
        .related-thumb { width: 42px; height: 42px; border-radius: 6px; object-fit: cover; flex-shrink: 0; background: rgba(255,255,255,.06); }
        .related-title { font-size: 12px; font-weight: 700; color: var(--text2); line-height: 1.35; }
        .artist-card { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 18px 14px; }
        .artist-card-img { width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid var(--border); margin-bottom: 8px; background: rgba(255,255,255,.06); }
        .artist-card-name { font-size: 14px; font-weight: 800; color: var(--text); margin-bottom: 2px; }
        .artist-card-sub { font-size: 11px; color: var(--text4); margin-bottom: 10px; }
        .artist-card-btn { width: 100%; background: rgba(29,78,216,.1); border: 1px solid rgba(29,78,216,.2); color: #93b4e0; font-size: 11px; font-weight: 700; padding: 7px; border-radius: 8px; cursor: pointer; font-family: 'Inter', sans-serif; transition: all .2s; text-decoration: none; display: block; text-align: center; }
        .artist-card-btn:hover { background: rgba(29,78,216,.2); }
        .source-link { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--text3); text-decoration: none; padding: 7px 0; border-top: 1px solid var(--border2); margin-top: 7px; }
        .source-link:hover { color: var(--text2); }

        /* ── Reactions ── */
        .reactions-block { margin: 32px 0; padding: 16px; border-radius: 14px; background: var(--card); border: 1px solid var(--border); }
        .reactions-q { font-size: 13px; font-weight: 700; color: var(--text2); margin-bottom: 12px; }
        .reactions-btns { display: grid; grid-template-columns: repeat(2, 1fr); gap: 5px; margin-bottom: 12px; }
        .reaction-btn { background: rgba(255,255,255,.04); border: 1px solid var(--border); border-radius: 10px; padding: 9px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--text2); transition: all .2s; font-family: 'Inter', sans-serif; }
        .reaction-btn-on { border-color: rgba(249,115,22,.4); background: rgba(249,115,22,.1); color: var(--orange); }
        .reaction-emoji { font-size: 15px; }
        .reaction-label { font-size: 11px; }
        .reaction-count { font-size: 11px; color: var(--text4); font-weight: 500; margin-left: auto; }
        .reactions-bars { display: flex; flex-direction: column; gap: 6px; }
        .rx-bar-row { display: flex; align-items: center; gap: 8px; }
        .rx-bar-e { font-size: 13px; width: 18px; text-align: center; }
        .rx-bar-bg { flex: 1; height: 4px; background: rgba(255,255,255,.06); border-radius: 100px; overflow: hidden; }
        .rx-bar-fg { height: 100%; border-radius: 100px; background: var(--orange); transition: width .5s; }
        .rx-bar-n { font-size: 11px; color: var(--text4); width: 26px; text-align: right; font-weight: 600; }

        /* ── Comments ── */
        .comments-block { margin: 32px 0 0; }
        .comments-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .comments-title { font-size: 14px; font-weight: 800; color: var(--text2); }
        .comments-sort { font-size: 11px; color: var(--text4); background: var(--card); border: 1px solid var(--border); padding: 3px 10px; border-radius: 100px; cursor: pointer; font-family: 'Inter', sans-serif; }
        .comment-input-row { display: flex; gap: 9px; margin-bottom: 18px; align-items: flex-start; }
        .comment-av { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 900; flex-shrink: 0; }
        .comment-input { flex: 1; background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px; font-size: 13px; color: var(--text2); font-family: 'Inter', sans-serif; resize: none; outline: none; }
        .comment-input:focus { border-color: rgba(29,78,216,.4); }
        .comment-input::placeholder { color: var(--text4); }
        .comment-send { background: var(--blue); color: #fff; border: none; border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 700; cursor: pointer; flex-shrink: 0; font-family: 'Inter', sans-serif; }
        .comment-item { display: flex; gap: 9px; padding: 12px 0; border-bottom: 1px solid var(--border2); }
        .comment-body { flex: 1; min-width: 0; }
        .comment-top { display: flex; align-items: center; gap: 7px; margin-bottom: 4px; flex-wrap: wrap; }
        .comment-user { font-size: 12px; font-weight: 700; color: var(--text); }
        .comment-badge { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .07em; padding: 2px 6px; border-radius: 100px; }
        .comment-time { font-size: 10px; color: var(--text4); margin-left: auto; }
        .comment-text { font-size: 13px; color: var(--text3); line-height: 1.6; margin-bottom: 7px; }
        .comment-acts { display: flex; gap: 9px; }
        .comment-act { background: none; border: none; font-size: 11px; font-weight: 600; color: var(--text4); cursor: pointer; display: flex; align-items: center; gap: 3px; font-family: 'Inter', sans-serif; }
        .comment-act-liked { color: var(--orange); }

        /* ── Responsive ── */
        @media (max-width: 900px) {
          .news-layout { grid-template-columns: 1fr; padding: 32px 16px 60px; }
          .news-main { padding-right: 0; border-right: none; border-bottom: 1px solid var(--border2); padding-bottom: 40px; margin-bottom: 32px; }
          .news-sidebar { padding-left: 0; position: static; }
          .site-search { display: none; }
          .site-lens { display: none; }
        }
        @media (max-width: 600px) {
          .news-hero-content { padding: 80px 20px 60px; }
        }
      `}</style>

      <div className="news-page">

        {/* ── SITE HEADER ── */}
        <header className="site-header">
          <div className="site-header-row1">
            <Link href="/" className="site-logo">
              <span className="site-logo-main">music</span>
              <span className="site-logo-dot">.lt</span>
            </Link>
            <div className="site-search">
              <input type="text" placeholder="Ieškok atlikėjų, albumų, dainų…" />
              <div className="site-search-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
              </div>
            </div>
            <div className="site-lens">
              {(['🇱🇹 LT', 'Pasaulis', 'Visi'] as const).map((l, i) => (
                <button key={i} className={`site-lens-btn ${i === 0 ? 'active' : ''}`}>{l}</button>
              ))}
            </div>
            <HeaderAuth />
          </div>
          <div className="site-header-row2">
            <nav className="site-nav">
              {NAV.map(n => (
                <a key={n} href="/" className={n === 'Topai' ? '' : ''}>{n}</a>
              ))}
            </nav>
          </div>
        </header>

        {/* ── HERO ── */}
        <div className="news-hero">
          {heroImg && <img src={heroImg} alt={news.title} className="news-hero-img" onLoad={() => setHeroLoaded(true)} />}
          <div className="news-hero-grad" />
          <div className="news-hero-content">
            <div className="news-hero-inner">
              <div className="news-hero-chips"><Chip type={news.type} /></div>
              <h1 className="news-hero-h1">{news.title}</h1>
              {lede && <p className="news-hero-lede">{lede}</p>}
              <div className="news-hero-cta">
                {news.source_url && (
                  <a href={news.source_url} target="_blank" rel="noopener" className="news-btn-primary">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    Skaityti šaltinį
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="news-scroll-hint">
            <div className="news-scroll-line" />
            <span>Skaityti</span>
          </div>
        </div>

        {/* ── BODY ── */}
        <div className="news-layout">
          <main className="news-main">
            <div className="news-divider" />

            {news.youtube_url && <YouTubeWidget url={news.youtube_url} />}

            <div className="news-prose" dangerouslySetInnerHTML={{ __html: news.body }} />

            <Reactions />
            <Comments />
          </main>

          {/* ── SIDEBAR ── */}
          <aside className="news-sidebar">

            {/* Share */}
            <div className="sb-card sb-inner">
              <div className="sb-label">Dalintis</div>
              <div className="share-grid">
                <button className="share-btn share-btn-full" onClick={() => navigator.share?.({ title: news.title, url: window.location.href })}>📤 Dalintis</button>
                <button className="share-btn" onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`)}>Facebook</button>
                <button className="share-btn" onClick={() => window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(news.title)}`)}>Twitter / X</button>
              </div>
            </div>

            {/* Vertical photo gallery */}
            {gallery.length > 0 && <VerticalGallery photos={gallery} />}

            {/* Related */}
            {related.length > 0 && (
              <div className="sb-card sb-inner">
                <div className="sb-label">Taip pat skaitykite</div>
                {related.map(r => (
                  <Link key={r.id} href={`/news/${r.slug}`} className="related-item">
                    {r.image_small_url ? <img src={r.image_small_url} alt="" className="related-thumb" /> : <div className="related-thumb" />}
                    <span className="related-title">{r.title}</span>
                  </Link>
                ))}
              </div>
            )}

            {/* Artist – žemiau */}
            {news.artist && (
              <div className="sb-card artist-card">
                {news.artist.cover_image_url
                  ? <img src={news.artist.cover_image_url} alt={news.artist.name} className="artist-card-img" />
                  : <div className="artist-card-img" style={{ display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,fontWeight:900,color:'rgba(255,255,255,.15)' }}>{news.artist.name[0]}</div>
                }
                <div className="artist-card-name">{news.artist.name}</div>
                <div className="artist-card-sub">music.lt atlikėjas</div>
                <Link href={`/artists/${news.artist.id}`} className="artist-card-btn">Atlikėjo profilis →</Link>
                {news.source_url && news.source_name && (
                  <a href={news.source_url} target="_blank" rel="noopener" className="source-link">↗ {news.source_name}</a>
                )}
              </div>
            )}

          </aside>
        </div>
      </div>
    </>
  )
}
