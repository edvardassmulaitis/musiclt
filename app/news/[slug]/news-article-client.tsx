'use client'
// app/news/[slug]/news-article-client.tsx

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'

// ─── Types ───────────────────────────────────────────────────────────────────

type ArtistRef = {
  id: number
  name: string
  cover_image_url?: string
  photos?: { url: string; caption?: string }[]
}

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

// ─── Body Renderer ────────────────────────────────────────────────────────────

function renderBody(body: string): React.ReactNode[] {
  if (!body) return []

  let blocks: any[] = []
  try {
    const parsed = JSON.parse(body)
    blocks = parsed.blocks || []
  } catch {
    return [<p key="0" className="news-p">{body.replace(/<[^>]+>/g, '')}</p>]
  }

  const nodes: React.ReactNode[] = []
  let imageQueue: any[] = []

  const flushImages = (key: string) => {
    if (imageQueue.length === 0) return
    const imgs = [...imageQueue]
    imageQueue = []

    if (imgs.length === 1) {
      const img = imgs[0]
      const isLeft = img.data?.alignment === 'left'
      nodes.push(
        <figure key={key} className={`news-img-float ${isLeft ? 'news-img-left' : 'news-img-right'}`}>
          <img src={img.data.file?.url} alt={img.data.caption || ''} />
          {img.data.caption && <figcaption>{img.data.caption}</figcaption>}
        </figure>
      )
    } else {
      nodes.push(
        <div key={key} className="news-img-row">
          {imgs.map((img, i) => (
            <figure key={i} className="news-img-row-item">
              <img src={img.data.file?.url} alt={img.data.caption || ''} />
              {img.data.caption && <figcaption>{img.data.caption}</figcaption>}
            </figure>
          ))}
        </div>
      )
    }
  }

  blocks.forEach((block, i) => {
    if (block.type === 'image') {
      imageQueue.push(block)
      return
    }

    // Flush queued images before non-image block
    flushImages(`imgs-${i}`)

    switch (block.type) {
      case 'paragraph':
        nodes.push(
          <p key={i} className="news-p"
            dangerouslySetInnerHTML={{ __html: block.data.text }} />
        )
        break
      case 'header':
        const Tag = `h${block.data.level}` as keyof JSX.IntrinsicElements
        nodes.push(
          <Tag key={i} className={`news-h${block.data.level}`}
            dangerouslySetInnerHTML={{ __html: block.data.text }} />
        )
        break
      case 'quote':
        nodes.push(
          <blockquote key={i} className="news-quote">
            <p dangerouslySetInnerHTML={{ __html: block.data.text }} />
            {block.data.caption && <cite>{block.data.caption}</cite>}
          </blockquote>
        )
        break
      case 'list':
        const ListTag = block.data.style === 'ordered' ? 'ol' : 'ul'
        nodes.push(
          <ListTag key={i} className="news-list">
            {block.data.items?.map((item: string, j: number) => (
              <li key={j} dangerouslySetInnerHTML={{ __html: item }} />
            ))}
          </ListTag>
        )
        break
      case 'delimiter':
        nodes.push(<hr key={i} className="news-hr" />)
        break
    }
  })

  flushImages('imgs-final')
  return nodes
}

// ─── Chip ─────────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  news:      'bg-red-500/20 text-red-300 border-red-500/30',
  reportazas:'bg-red-500/20 text-red-300 border-red-500/30',
  interviu:  'bg-violet-500/20 text-violet-300 border-violet-500/30',
  recenzija: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  default:   'bg-orange-500/20 text-orange-300 border-orange-500/30',
}

function Chip({ type }: { type: string }) {
  const label: Record<string, string> = {
    news: 'Naujiena', reportazas: 'Reportažas', interviu: 'Interviu',
    recenzija: 'Recenzija',
  }
  const cls = TYPE_COLORS[type] || TYPE_COLORS.default
  return (
    <span className={`inline-flex items-center text-[10px] font-black tracking-widest uppercase px-2.5 py-1 rounded-full border ${cls}`}>
      {label[type] || type}
    </span>
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
          <button key={i} onClick={() => pick(i)}
            className={`reaction-btn ${picked === i ? 'reaction-btn-on' : ''}`}>
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

// ─── Comments ─────────────────────────────────────────────────────────────────

const MOCK_COMMENTS = [
  { id: 1, user: 'muzikoslt', badge: 'Fanas', color: 'bg-violet-500/20 text-violet-300', text: 'Labai džiaugiuosi! Puiki daina, tikiuosi gerai pasirodys Vienoje.', time: '2 val.', likes: 24 },
  { id: 2, user: 'eurovizijos_fanas', badge: 'Ekspertas', color: 'bg-orange-500/20 text-orange-300', text: 'Pagal bukmeikerių prognozes esame tarp TOP 15 – labai geras rezultatas Lietuvai. Daina turi aiškų identitetą.', time: '8 val.', likes: 41 },
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
        <textarea className="comment-input" placeholder="Parašyk komentarą…"
          rows={1} onFocus={e => { e.target.rows = 3 }} onBlur={e => { if (!e.target.value) e.target.rows = 1 }} />
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

// ─── Filmstrip Gallery ────────────────────────────────────────────────────────

function Gallery({ photos }: { photos: { url: string; caption?: string }[] }) {
  if (!photos.length) return null
  return (
    <div className="gallery-block">
      <div className="gallery-label">📸 Fotogalerija</div>
      <div className="filmstrip">
        {photos.map((p, i) => (
          <div key={i} className="filmstrip-item">
            <img src={p.url} alt={p.caption || `Foto ${i + 1}`} />
            {p.caption && <div className="filmstrip-cap">{p.caption}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function NewsArticleClient({ news, related }: { news: NewsItem; related: RelatedNews[] }) {
  const [heroLoaded, setHeroLoaded] = useState(false)
  const heroImg = news.image_small_url || news.artist?.cover_image_url || news.artist?.photos?.[0]?.url
  const allPhotos = news.artist?.photos || []
  const lede = (() => {
    try {
      const p = JSON.parse(news.body)
      return p.blocks?.find((b: any) => b.type === 'paragraph')?.data?.text?.replace(/<[^>]+>/g, '') || ''
    } catch { return '' }
  })()

  const formattedDate = new Date(news.published_at).toLocaleDateString('lt-LT', {
    year: 'numeric', month: 'long', day: 'numeric'
  })

  return (
    <>
      <style>{`
        /* ── CSS variables ─────────────────────────────────── */
        .news-page {
          --bg: #0d1117;
          --text: #f2f4f8;
          --text2: #c8d8f0;
          --text3: #7a90b0;
          --text4: #3d5878;
          --border: rgba(255,255,255,0.07);
          --border2: rgba(255,255,255,0.04);
          --orange: #f97316;
          --blue: #1d4ed8;
          --card: rgba(255,255,255,0.03);
          background: var(--bg);
          color: var(--text);
          font-family: 'Inter', system-ui, sans-serif;
          -webkit-font-smoothing: antialiased;
          min-height: 100vh;
        }

        /* ── Hero ──────────────────────────────────────────── */
        .news-hero {
          position: relative;
          height: 100svh;
          min-height: 560px;
          max-height: 860px;
          overflow: hidden;
        }
        .news-hero-img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: 60% 15%;
          transform: scale(1.06);
          animation: slow-zoom 18s ease-out forwards;
        }
        @keyframes slow-zoom { to { transform: scale(1); } }
        .news-hero-grad {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(to right, rgba(8,11,17,0.9) 0%, rgba(8,11,17,0.45) 55%, rgba(8,11,17,0.05) 100%),
            linear-gradient(to top, rgba(8,11,17,0.65) 0%, transparent 50%);
        }
        .news-hero-content {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          padding: 80px 48px 48px;
          max-width: 720px;
        }
        .news-hero-inner {
          animation: hero-fadein 0.9s 0.15s both;
        }
        @keyframes hero-fadein {
          from { opacity: 0; transform: translateY(22px); }
          to   { opacity: 1; transform: none; }
        }
        .news-hero-chips { display: flex; gap: 6px; margin-bottom: 18px; flex-wrap: wrap; }
        .news-hero-h1 {
          font-size: clamp(1.8rem, 4vw, 3.5rem);
          font-weight: 900;
          line-height: 1.07;
          letter-spacing: -0.035em;
          color: #fff;
          margin-bottom: 16px;
        }
        .news-hero-lede {
          font-size: clamp(0.9rem, 1.5vw, 1.05rem);
          color: rgba(200,218,245,0.72);
          line-height: 1.65;
          margin-bottom: 24px;
          max-width: 500px;
        }
        .news-hero-meta {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 28px;
        }
        .news-hero-mt { font-size: 12px; color: rgba(200,218,245,0.4); font-weight: 500; }
        .news-hero-sep { color: rgba(255,255,255,0.1); }
        .news-hero-cta { display: flex; gap: 10px; flex-wrap: wrap; }
        .news-btn-primary {
          display: inline-flex; align-items: center; gap: 8px;
          background: var(--orange); color: #fff; border: none;
          font-size: 13px; font-weight: 800; padding: 11px 22px;
          border-radius: 100px; cursor: pointer;
          font-family: 'Inter', sans-serif;
          box-shadow: 0 4px 20px rgba(249,115,22,.35);
          transition: all .2s; text-decoration: none;
        }
        .news-btn-primary:hover { background: #ea6b0a; transform: translateY(-1px); }
        .news-btn-ghost {
          display: inline-flex; align-items: center; gap: 8px;
          background: rgba(255,255,255,.08); color: rgba(200,218,245,.75);
          border: 1px solid rgba(255,255,255,.14);
          font-size: 13px; font-weight: 700; padding: 11px 20px;
          border-radius: 100px; cursor: pointer;
          font-family: 'Inter', sans-serif; transition: all .2s;
          text-decoration: none;
        }
        .news-btn-ghost:hover { background: rgba(255,255,255,.14); color: #fff; }
        .news-scroll-hint {
          position: absolute; bottom: 24px; left: 50%;
          transform: translateX(-50%);
          display: flex; flex-direction: column; align-items: center; gap: 6px;
          opacity: 0.35; animation: bob 2.4s ease-in-out infinite;
        }
        @keyframes bob {
          0%,100% { transform: translateX(-50%) translateY(0); }
          50%      { transform: translateX(-50%) translateY(7px); }
        }
        .news-scroll-hint span { font-size: 9px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: rgba(255,255,255,.6); }
        .news-scroll-line { width: 1px; height: 32px; background: linear-gradient(to bottom, rgba(255,255,255,.4), transparent); }

        /* ── Layout ────────────────────────────────────────── */
        .news-body-wrap {
          max-width: 1100px;
          margin: 0 auto;
          padding: 52px 24px 80px;
          display: grid;
          grid-template-columns: 1fr 288px;
          gap: 48px;
          align-items: start;
        }
        .news-divider { height: 1px; background: var(--border2); margin-bottom: 28px; }

        /* ── Article body ──────────────────────────────────── */
        .news-p {
          font-size: 0.985rem;
          line-height: 1.88;
          color: var(--text3);
          margin-bottom: 22px;
        }
        .news-p a { color: #93b4e0; text-decoration: underline; }
        .news-h2 { font-size: 1.4rem; font-weight: 800; color: var(--text2); margin: 32px 0 14px; letter-spacing: -.02em; }
        .news-h3 { font-size: 1.15rem; font-weight: 700; color: var(--text2); margin: 24px 0 10px; }
        .news-h4 { font-size: 1rem; font-weight: 700; color: var(--text3); margin: 20px 0 8px; }
        .news-quote {
          border-left: 3px solid var(--orange);
          padding: 12px 20px; margin: 28px 0;
          background: rgba(249,115,22,.05);
          border-radius: 0 10px 10px 0;
        }
        .news-quote p { font-size: 1.05rem; font-weight: 700; font-style: italic; color: var(--text2); line-height: 1.5; margin: 0; }
        .news-quote cite { display: block; font-size: 11px; color: var(--text4); margin-top: 6px; font-style: normal; }
        .news-list { margin: 16px 0 22px 20px; }
        .news-list li { color: var(--text3); font-size: .975rem; line-height: 1.75; margin-bottom: 6px; }
        .news-hr { border: none; border-top: 1px solid var(--border); margin: 32px 0; }

        /* ── Float images ──────────────────────────────────── */
        .news-img-float { border-radius: 10px; overflow: hidden; border: 1px solid var(--border); margin-bottom: 4px; }
        .news-img-right { float: right; width: 43%; margin-left: 22px; }
        .news-img-left  { float: left;  width: 43%; margin-right: 22px; }
        .news-img-float img { width: 100%; display: block; object-fit: cover; max-height: 260px; }
        .news-img-float figcaption { font-size: 10px; color: var(--text4); padding: 6px 10px; background: rgba(255,255,255,.025); }
        .news-img-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 20px 0; clear: both; }
        .news-img-row-item { border-radius: 10px; overflow: hidden; border: 1px solid var(--border); }
        .news-img-row-item img { width: 100%; display: block; object-fit: cover; aspect-ratio: 4/3; }
        .news-img-row-item figcaption { font-size: 10px; color: var(--text4); padding: 6px 10px; background: rgba(255,255,255,.025); }
        .cf::after { content: ''; display: table; clear: both; }

        /* ── Gallery filmstrip ─────────────────────────────── */
        .gallery-block { margin: 28px 0; }
        .gallery-label { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .12em; color: var(--text4); margin-bottom: 10px; }
        .filmstrip { display: flex; gap: 6px; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; -webkit-overflow-scrolling: touch; padding-bottom: 2px; }
        .filmstrip::-webkit-scrollbar { display: none; }
        .filmstrip-item { flex-shrink: 0; width: 155px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border); scroll-snap-align: start; cursor: pointer; transition: opacity .2s; }
        .filmstrip-item:hover { opacity: .8; }
        .filmstrip-item img { width: 100%; height: 105px; object-fit: cover; display: block; }
        .filmstrip-cap { font-size: 10px; color: var(--text4); padding: 5px 8px; background: rgba(255,255,255,.02); }

        /* ── YouTube embed ─────────────────────────────────── */
        .yt-block { margin: 28px 0; border-radius: 12px; overflow: hidden; border: 1px solid var(--border); background: #000; }
        .yt-thumb-wrap { position: relative; aspect-ratio: 16/9; cursor: pointer; overflow: hidden; }
        .yt-thumb-wrap img { width: 100%; height: 100%; object-fit: cover; opacity: .6; display: block; transition: opacity .2s; }
        .yt-thumb-wrap:hover img { opacity: .78; }
        .yt-play-btn { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: none; }
        .yt-bar { padding: 10px 14px; background: rgba(255,255,255,.025); }
        .yt-bar-title { font-size: 13px; font-weight: 700; color: var(--text2); }
        .yt-bar-sub { font-size: 11px; color: var(--text4); margin-top: 2px; }

        /* ── Reactions ─────────────────────────────────────── */
        .reactions-block { margin: 32px 0; padding: 18px; border-radius: 14px; background: var(--card); border: 1px solid var(--border); }
        .reactions-q { font-size: 13px; font-weight: 700; color: var(--text2); margin-bottom: 14px; }
        .reactions-btns { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin-bottom: 14px; }
        .reaction-btn {
          background: rgba(255,255,255,.04); border: 1px solid var(--border);
          border-radius: 10px; padding: 10px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 7px;
          font-size: 13px; font-weight: 700; color: var(--text2);
          transition: all .2s; font-family: 'Inter', sans-serif;
        }
        .reaction-btn:hover { transform: translateY(-1px); border-color: rgba(255,255,255,.15); }
        .reaction-btn-on { border-color: rgba(249,115,22,.4); background: rgba(249,115,22,.1); color: var(--orange); }
        .reaction-emoji { font-size: 16px; }
        .reaction-label { font-size: 12px; }
        .reaction-count { font-size: 11px; color: var(--text4); font-weight: 500; margin-left: auto; }
        .reactions-bars { display: flex; flex-direction: column; gap: 7px; margin-top: 4px; }
        .rx-bar-row { display: flex; align-items: center; gap: 8px; }
        .rx-bar-e { font-size: 14px; width: 20px; text-align: center; }
        .rx-bar-bg { flex: 1; height: 4px; background: rgba(255,255,255,.06); border-radius: 100px; overflow: hidden; }
        .rx-bar-fg { height: 100%; border-radius: 100px; background: var(--orange); transition: width .5s; }
        .rx-bar-n { font-size: 11px; color: var(--text4); width: 28px; text-align: right; font-weight: 600; }

        /* ── Comments ──────────────────────────────────────── */
        .comments-block { margin: 36px 0 0; }
        .comments-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .comments-title { font-size: 14px; font-weight: 800; color: var(--text2); }
        .comments-sort { font-size: 11px; color: var(--text4); background: var(--card); border: 1px solid var(--border); padding: 4px 12px; border-radius: 100px; cursor: pointer; font-family: 'Inter', sans-serif; }
        .comment-input-row { display: flex; gap: 10px; margin-bottom: 20px; align-items: flex-start; }
        .comment-av { width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 900; flex-shrink: 0; }
        .comment-input { flex: 1; background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 9px 13px; font-size: 13px; color: var(--text2); font-family: 'Inter', sans-serif; resize: none; outline: none; transition: border-color .2s; min-height: 40px; }
        .comment-input:focus { border-color: rgba(29,78,216,.4); }
        .comment-input::placeholder { color: var(--text4); }
        .comment-send { background: var(--blue); color: #fff; border: none; border-radius: 8px; padding: 7px 14px; font-size: 12px; font-weight: 700; cursor: pointer; flex-shrink: 0; font-family: 'Inter', sans-serif; }
        .comment-item { display: flex; gap: 10px; padding: 14px 0; border-bottom: 1px solid var(--border2); }
        .comment-body { flex: 1; min-width: 0; }
        .comment-top { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; flex-wrap: wrap; }
        .comment-user { font-size: 13px; font-weight: 700; color: var(--text); }
        .comment-badge { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .07em; padding: 2px 7px; border-radius: 100px; }
        .comment-time { font-size: 11px; color: var(--text4); margin-left: auto; }
        .comment-text { font-size: 13px; color: var(--text3); line-height: 1.6; margin-bottom: 8px; }
        .comment-acts { display: flex; gap: 10px; }
        .comment-act { background: none; border: none; font-size: 11px; font-weight: 600; color: var(--text4); cursor: pointer; display: flex; align-items: center; gap: 3px; transition: color .2s; font-family: 'Inter', sans-serif; }
        .comment-act:hover { color: var(--text2); }
        .comment-act-liked { color: var(--orange); }

        /* ── Sidebar ───────────────────────────────────────── */
        .news-sidebar { position: sticky; top: 80px; display: flex; flex-direction: column; gap: 12px; }
        .sb-card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; }
        .sb-inner { padding: 16px; }
        .sb-label { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .12em; color: var(--text4); margin-bottom: 12px; }

        /* Artist card */
        .artist-card { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 20px 16px; }
        .artist-card-img { width: 70px; height: 70px; border-radius: 50%; object-fit: cover; border: 2px solid var(--border); margin-bottom: 10px; background: rgba(255,255,255,.06); }
        .artist-card-name { font-size: 15px; font-weight: 800; color: var(--text); margin-bottom: 3px; }
        .artist-card-sub { font-size: 12px; color: var(--text4); margin-bottom: 14px; }
        .artist-card-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; width: 100%; }
        .artist-stat { background: rgba(255,255,255,.03); border: 1px solid var(--border2); border-radius: 8px; padding: 8px; text-align: center; }
        .artist-stat-n { font-size: 13px; font-weight: 800; color: var(--text); }
        .artist-stat-l { font-size: 10px; color: var(--text4); margin-top: 2px; }
        .artist-card-btn { width: 100%; margin-top: 10px; background: rgba(29,78,216,.1); border: 1px solid rgba(29,78,216,.2); color: #93b4e0; font-size: 12px; font-weight: 700; padding: 8px; border-radius: 8px; cursor: pointer; font-family: 'Inter', sans-serif; transition: all .2s; text-decoration: none; display: block; text-align: center; }
        .artist-card-btn:hover { background: rgba(29,78,216,.2); }

        /* Source */
        .source-link { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text3); text-decoration: none; padding: 8px 0; border-top: 1px solid var(--border2); margin-top: 8px; }
        .source-link:hover { color: var(--text2); }

        /* Tags */
        .tags-row { display: flex; gap: 5px; flex-wrap: wrap; }
        .tag { display: inline-flex; align-items: center; font-size: 10px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; padding: 3px 9px; border-radius: 100px; }

        /* Share */
        .share-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
        .share-btn { background: rgba(255,255,255,.04); border: 1px solid var(--border); border-radius: 8px; padding: 8px; font-size: 11px; font-weight: 700; color: var(--text3); cursor: pointer; font-family: 'Inter', sans-serif; transition: all .2s; }
        .share-btn:hover { color: var(--text); border-color: rgba(255,255,255,.15); }
        .share-btn-full { grid-column: 1 / -1; background: rgba(249,115,22,.1); border-color: rgba(249,115,22,.25); color: var(--orange); }
        .share-btn-full:hover { background: rgba(249,115,22,.18); }

        /* Related */
        .related-item { display: flex; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border2); text-decoration: none; transition: opacity .2s; }
        .related-item:last-child { border-bottom: none; }
        .related-item:hover { opacity: .8; }
        .related-thumb { width: 44px; height: 44px; border-radius: 6px; object-fit: cover; flex-shrink: 0; background: rgba(255,255,255,.06); }
        .related-title { font-size: 12px; font-weight: 700; color: var(--text2); line-height: 1.4; }

        /* ── Responsive ────────────────────────────────────── */
        @media (max-width: 860px) {
          .news-body-wrap { grid-template-columns: 1fr; padding: 36px 16px 60px; gap: 0; }
          .news-sidebar { position: static; margin-top: 40px; }
        }
        @media (max-width: 600px) {
          .news-hero-content { padding: 80px 20px 36px; }
          .news-img-right, .news-img-left { float: none; width: 100%; margin: 0 0 16px; }
          .reactions-btns { grid-template-columns: 1fr 1fr; }
          .news-img-row { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="news-page">

        {/* ── HERO ── */}
        <div className="news-hero">
          {heroImg && (
            <img
              src={heroImg}
              alt={news.title}
              className="news-hero-img"
              onLoad={() => setHeroLoaded(true)}
            />
          )}
          <div className="news-hero-grad" />
          <div className="news-hero-content">
            <div className="news-hero-inner">
              <div className="news-hero-chips">
                <Chip type={news.type} />
              </div>
              <h1 className="news-hero-h1">{news.title}</h1>
              {lede && <p className="news-hero-lede">{lede}</p>}
              <div className="news-hero-meta">
                <span className="news-hero-mt">{formattedDate}</span>
                <span className="news-hero-sep">·</span>
                <span className="news-hero-mt">music.lt</span>
                {news.artist && <>
                  <span className="news-hero-sep">·</span>
                  <span className="news-hero-mt">{news.artist.name}</span>
                </>}
              </div>
              <div className="news-hero-cta">
                {news.source_url && (
                  <a href={news.source_url} target="_blank" rel="noopener" className="news-btn-primary">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    Skaityti šaltinį
                  </a>
                )}
                {news.artist && (
                  <Link href={`/artists/${news.artist.id}`} className="news-btn-ghost">
                    {news.artist.name} →
                  </Link>
                )}
              </div>
            </div>
          </div>
          <div className="news-scroll-hint">
            <span>Skaityti</span>
            <div className="news-scroll-line" />
          </div>
        </div>

        {/* ── BODY ── */}
        <div className="news-body-wrap">
          <main>
            <div className="news-divider" />

            {/* Article body from Editor.js blocks */}
            {renderBody(news.body)}

            <div style={{ clear: 'both' }} />

            {/* Gallery if artist has photos */}
            {allPhotos.length > 1 && <Gallery photos={allPhotos} />}

            {/* Reactions */}
            <Reactions />

            {/* Comments */}
            <Comments />
          </main>

          {/* ── SIDEBAR ── */}
          <aside className="news-sidebar">

            {/* Artist card */}
            {news.artist && (
              <div className="sb-card artist-card">
                {news.artist.cover_image_url
                  ? <img src={news.artist.cover_image_url} alt={news.artist.name} className="artist-card-img" />
                  : <div className="artist-card-img" style={{ display:'flex',alignItems:'center',justifyContent:'center',fontSize:28,fontWeight:900,color:'rgba(255,255,255,.15)' }}>
                      {news.artist.name[0]}
                    </div>
                }
                <div className="artist-card-name">{news.artist.name}</div>
                <div className="artist-card-sub">music.lt atlikėjas</div>
                <div className="artist-card-stats">
                  <div className="artist-stat"><div className="artist-stat-n">{allPhotos.length || '–'}</div><div className="artist-stat-l">Nuotraukos</div></div>
                  <div className="artist-stat"><div className="artist-stat-n">–</div><div className="artist-stat-l">Albumai</div></div>
                </div>
                <Link href={`/artists/${news.artist.id}`} className="artist-card-btn">
                  Atlikėjo profilis →
                </Link>
                {news.source_url && news.source_name && (
                  <a href={news.source_url} target="_blank" rel="noopener" className="source-link">
                    ↗ {news.source_name}
                  </a>
                )}
              </div>
            )}

            {/* Tags */}
            <div className="sb-card sb-inner">
              <div className="sb-label">Žymos</div>
              <div className="tags-row">
                <span className="tag" style={{ background:'rgba(29,78,216,.15)', color:'#93b4e0', border:'1px solid rgba(29,78,216,.22)' }}>
                  {news.type}
                </span>
                {news.artist && (
                  <span className="tag" style={{ background:'rgba(124,58,237,.15)', color:'#c4b5fd', border:'1px solid rgba(124,58,237,.22)' }}>
                    {news.artist.name}
                  </span>
                )}
                {news.artist2 && (
                  <span className="tag" style={{ background:'rgba(5,150,105,.15)', color:'#6ee7b7', border:'1px solid rgba(5,150,105,.22)' }}>
                    {news.artist2.name}
                  </span>
                )}
              </div>
            </div>

            {/* Share */}
            <div className="sb-card sb-inner">
              <div className="sb-label">Dalintis</div>
              <div className="share-grid">
                <button className="share-btn share-btn-full"
                  onClick={() => navigator.share?.({ title: news.title, url: window.location.href })}>
                  📤 Dalintis
                </button>
                <button className="share-btn"
                  onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`)}>
                  Facebook
                </button>
                <button className="share-btn"
                  onClick={() => window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(news.title)}`)}>
                  Twitter / X
                </button>
              </div>
            </div>

            {/* Related */}
            {related.length > 0 && (
              <div className="sb-card sb-inner">
                <div className="sb-label">Taip pat skaitykite</div>
                {related.map(r => (
                  <Link key={r.id} href={`/news/${r.slug}`} className="related-item">
                    {r.image_small_url
                      ? <img src={r.image_small_url} alt="" className="related-thumb" />
                      : <div className="related-thumb" />
                    }
                    <span className="related-title">{r.title}</span>
                  </Link>
                ))}
              </div>
            )}

          </aside>
        </div>

      </div>
    </>
  )
}
