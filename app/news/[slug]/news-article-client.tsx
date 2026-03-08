'use client'
// app/news/[slug]/news-article-client.tsx

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

/* ─── Types ──────────────────────────────────────────────────────────────── */
type Photo     = { url: string; caption?: string; source?: string }
type SongEntry = { id?: number; song_id?: number | null; title: string; artist_name: string; youtube_url: string; cover_url?: string }
type NewsItem  = {
  id: number; title: string; slug: string; body: string; type: string
  source_url?: string; source_name?: string; published_at: string
  image_small_url?: string; gallery?: Photo[]
  artist?:  { id: number; name: string; cover_image_url?: string; photos?: any[] }
  artist2?: { id: number; name: string; cover_image_url?: string } | null
}
type RelatedNews = { id: number; title: string; slug: string; image_small_url?: string; published_at: string; type: string }
type Comment   = { id: number; content: string; created_at: string; user_name: string; user_image?: string | null }

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function ytId(url?: string | null) {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  return m ? m[1] : null
}
function formatDate(d: string) {
  try { return new Date(d).toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' }) }
  catch { return d }
}
function getLede(html: string) {
  const m = html.match(/<p[^>]*>(.*?)<\/p>/i)
  return m ? m[1].replace(/<[^>]+>/g, '').slice(0, 200) : ''
}

const TYPE_LABEL: Record<string, string> = {
  news: 'Naujiena', reportazas: 'Reportažas', interviu: 'Interviu',
  recenzija: 'Recenzija', eurovizija: 'Eurovizija',
  report: 'Reportažas', interview: 'Interviu', review: 'Recenzija',
}
const TYPE_COLOR: Record<string, string> = {
  news: '#1d4ed8', reportazas: '#dc2626', interviu: '#7c3aed',
  recenzija: '#0891b2', eurovizija: '#db2777',
  report: '#dc2626', interview: '#7c3aed', review: '#0891b2',
}

/* ─── Music Player ───────────────────────────────────────────────────────── */
function MusicPlayer({ songs }: { songs: SongEntry[] }) {
  const [active, setActive]   = useState(0)
  const [playing, setPlaying] = useState(false)
  if (!songs.length) return null
  const cur   = songs[active]
  const vid   = ytId(cur.youtube_url)
  const thumb = cur.cover_url || (vid ? `https://img.youtube.com/vi/${vid}/mqdefault.jpg` : null)

  return (
    <div className="mu">
      {/* Header — EQ animation here, no duplicate play btn */}
      <div className="mu-hdr">
        <div className="mu-hdr-icon">
          {/* Animated EQ bars inside icon */}
          <div className="mu-hdr-eq">
            {[6,10,4,8].map((h,i) => (
              <span key={i} style={{ height: h, animationDelay: `${i*0.13}s` }} />
            ))}
          </div>
        </div>
        <span className="mu-hdr-label">Susijusi muzika</span>
      </div>

      {/* Video / thumbnail — play btn only here */}
      <div className="mu-video">
        {playing && vid
          ? <iframe src={`https://www.youtube.com/embed/${vid}?autoplay=1&rel=0`}
              allow="autoplay; encrypted-media" allowFullScreen className="mu-iframe" />
          : <div className={`mu-thumb ${!vid ? 'mu-thumb-noplay' : ''}`} onClick={() => vid && setPlaying(true)}>
              {thumb ? <img src={thumb} alt={cur.title} /> : <div className="mu-no-thumb">♪</div>}
              {vid && (
                <div className="mu-play-overlay">
                  <div className="mu-play-btn">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                  </div>
                </div>
              )}
            </div>
        }
      </div>

      {/* Now playing — track info + YT link, NO second play btn */}
      <div className="mu-now">
        <div className="mu-now-info">
          <p className="mu-now-title">{cur.title}</p>
          <p className="mu-now-artist">{cur.artist_name}</p>
        </div>
        {vid && (
          <a href={`https://youtube.com/watch?v=${vid}`} target="_blank" rel="noopener" className="mu-yt-btn" title="Atidaryti YouTube">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.55A3.02 3.02 0 0 0 .5 6.19 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14c1.88.55 9.38.55 9.38.55s7.5 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.81zM9.54 15.57V8.43L15.82 12l-6.28 3.57z"/>
            </svg>
          </a>
        )}
      </div>

      {/* Track list */}
      {songs.length > 1 && (
        <div className="mu-list">
          {songs.map((s, i) => {
            const v = ytId(s.youtube_url)
            const t = s.cover_url || (v ? `https://img.youtube.com/vi/${v}/default.jpg` : null)
            return (
              <button key={i} onClick={() => { setActive(i); setPlaying(false) }}
                className={`mu-track ${active === i ? 'mu-track-on' : ''}`}>
                <span className="mu-track-num">{active === i ? '▶' : i + 1}</span>
                {t ? <img src={t} alt="" className="mu-track-img" />
                   : <div className="mu-track-img mu-track-img-empty">♪</div>}
                <div className="mu-track-info">
                  <p className="mu-track-title">{s.title}</p>
                  <p className="mu-track-artist">{s.artist_name}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ─── Photo Gallery ──────────────────────────────────────────────────────── */
function PhotoGallery({ photos }: { photos: Photo[] }) {
  const [lb, setLb]           = useState<number | null>(null)
  const [showAll, setShowAll] = useState(false)
  if (!photos.length) return null
  const PREVIEW = 5
  const shown   = showAll ? photos : photos.slice(0, PREVIEW)
  const hidden  = photos.length - PREVIEW

  return (
    <>
      <div className="pg-wrap">
        <div className="pg-divider">
          <div className="pg-divider-line" />
          <span className="pg-divider-label">Galerija · {photos.length} nuotr.</span>
          <div className="pg-divider-line" />
        </div>
        <div className={`pg-grid pg-grid-${Math.min(shown.length, 5)}`}>
          {shown.map((p, i) => (
            <div key={i} className={`pg-cell pg-cell-${i}`} onClick={() => setLb(i)}>
              <img src={p.url} alt={p.caption || ''} />
              {!showAll && i === PREVIEW - 1 && hidden > 0 && (
                <div className="pg-more" onClick={e => { e.stopPropagation(); setShowAll(true) }}>
                  <span>+{hidden}</span>
                  <small>nuotraukos</small>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {lb !== null && (
        <div className="lb" onClick={() => setLb(null)}>
          <button className="lb-close" onClick={e => { e.stopPropagation(); setLb(null) }}>✕</button>
          <button className="lb-prev"  onClick={e => { e.stopPropagation(); setLb(i => Math.max(0, i! - 1)) }}>‹</button>
          <div className="lb-inner" onClick={e => e.stopPropagation()}>
            <img src={photos[lb].url} alt="" />
            {photos[lb].caption && <p className="lb-cap">{photos[lb].caption}</p>}
          </div>
          <button className="lb-next" onClick={e => { e.stopPropagation(); setLb(i => Math.min(photos.length - 1, i! + 1)) }}>›</button>
          <div className="lb-counter">{lb + 1} / {photos.length}</div>
        </div>
      )}
    </>
  )
}

/* ─── Sidebar helpers ────────────────────────────────────────────────────── */
function RelatedCard({ related }: { related: RelatedNews[] }) {
  if (!related.length) return null
  return (
    <div className="sb-card">
      <p className="sb-card-label">Taip pat skaitykite</p>
      {related.map((r, i) => (
        <Link key={r.id} href={`/news/${r.slug}`} className="rel-item"
          style={{ borderBottom: i < related.length - 1 ? '1px solid var(--na-border)' : 'none' }}>
          <div className="rel-thumb">
            {r.image_small_url && <img src={r.image_small_url} alt="" />}
          </div>
          <div className="rel-body">
            <span className="rel-type" style={{ color: TYPE_COLOR[r.type] || '#f97316' }}>
              {TYPE_LABEL[r.type] || r.type}
            </span>
            <p className="rel-title">{r.title}</p>
          </div>
        </Link>
      ))}
    </div>
  )
}

function ShareCard({ title }: { title: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="sb-card">
      <p className="sb-card-label">Dalintis</p>
      <div className="share-grid">
        <button className="share-btn share-btn-main"
          onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(location.href)}`)}>
          📤 Dalintis
        </button>
        <button className="share-btn"
          onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(location.href)}`)}>
          Facebook
        </button>
        <button className="share-btn" style={{ color: copied ? '#34d399' : undefined }}
          onClick={() => navigator.clipboard.writeText(location.href).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })}>
          {copied ? '✓ Nukopijuota' : 'Kopijuoti'}
        </button>
      </div>
    </div>
  )
}

/* ─── Comments ───────────────────────────────────────────────────────────── */
function Comments({ newsId }: { newsId: number }) {
  const { data: session } = useSession()
  const [comments, setComments]   = useState<Comment[]>([])
  const [loading, setLoading]     = useState(true)
  const [text, setText]           = useState('')
  const [sending, setSending]     = useState(false)
  const [error, setError]         = useState('')
  const textareaRef               = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetch(`/api/news/${newsId}/comments`)
      .then(r => r.json())
      .then(d => setComments(d.comments || []))
      .finally(() => setLoading(false))
  }, [newsId])

  async function submit() {
    if (!text.trim() || sending) return
    setSending(true); setError('')
    const res = await fetch(`/api/news/${newsId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text.trim() }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Klaida'); setSending(false); return }
    setComments(prev => [...prev, data.comment])
    setText('')
    setSending(false)
  }

  async function del(id: number) {
    await fetch(`/api/news/${newsId}/comments`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commentId: id }),
    })
    setComments(prev => prev.filter(c => c.id !== id))
  }

  const isAdmin = ['admin', 'super_admin'].includes((session?.user as any)?.role)

  return (
    <div className="cm-wrap">
      <div className="cm-hdr">
        <span className="cm-hdr-title">Komentarai</span>
        {!loading && <span className="cm-count">{comments.length}</span>}
      </div>

      {/* Comment list */}
      {loading
        ? <div className="cm-loading"><span /><span /><span /></div>
        : comments.length === 0
          ? <p className="cm-empty">Būk pirmas — parašyk komentarą!</p>
          : <div className="cm-list">
              {comments.map(c => (
                <div key={c.id} className="cm-item">
                  <div className="cm-avatar">
                    {c.user_image
                      ? <img src={c.user_image} alt={c.user_name} />
                      : <span>{(c.user_name || 'V')[0].toUpperCase()}</span>}
                  </div>
                  <div className="cm-body">
                    <div className="cm-meta">
                      <strong>{c.user_name}</strong>
                      <time>{new Date(c.created_at).toLocaleDateString('lt-LT', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}</time>
                      {(isAdmin || session?.user?.name === c.user_name) && (
                        <button className="cm-del" onClick={() => del(c.id)} title="Ištrinti">✕</button>
                      )}
                    </div>
                    <p className="cm-text">{c.content}</p>
                  </div>
                </div>
              ))}
            </div>
      }

      {/* Input */}
      {session
        ? <div className="cm-form">
            <div className="cm-form-avatar">
              {session.user?.image
                ? <img src={session.user.image} alt="" />
                : <span>{(session.user?.name || 'V')[0].toUpperCase()}</span>}
            </div>
            <div className="cm-form-right">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit() }}
                placeholder="Rašyk komentarą..."
                className="cm-textarea"
                rows={3}
                maxLength={2000}
              />
              {error && <p className="cm-error">{error}</p>}
              <div className="cm-form-foot">
                <span className="cm-chars">{text.length}/2000</span>
                <button
                  className="cm-submit"
                  onClick={submit}
                  disabled={!text.trim() || sending}
                >
                  {sending ? 'Siunčiama...' : 'Skelbti'}
                </button>
              </div>
            </div>
          </div>
        : <div className="cm-login">
            <p>Norėdamas komentuoti, <Link href="/api/auth/signin" className="cm-login-link">prisijunk</Link></p>
          </div>
      }
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN EXPORT
   ══════════════════════════════════════════════════════════════════════════ */
export default function NewsArticleClient({
  news, related, songs = [],
}: {
  news: NewsItem
  related: RelatedNews[]
  songs?: SongEntry[]
}) {
  const heroImg    = news.image_small_url || news.artist?.cover_image_url
  const gallery    = news.gallery || []
  const chipColor  = TYPE_COLOR[news.type] || '#1d4ed8'
  const chipLabel  = TYPE_LABEL[news.type] || news.type
  const hasSidebar = songs.length > 0 || related.length > 0
  const lede       = getLede(news.body)

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');

        @keyframes na-in     { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:none } }
        @keyframes na-zoom   { from { transform:scale(1.04) }                 to { transform:scale(1) } }
        @keyframes eq-bounce { from { transform:scaleY(0.25) }                to { transform:scaleY(1) } }
        @keyframes bob       { 0%,100%{transform:translateY(0)} 50%{transform:translateY(4px)} }

        /* ── Color tokens ── */
        :root {
          --na-bg:      #ffffff;
          --na-bg2:     #f4f6f9;
          --na-bg3:     #eef1f5;
          --na-card:    rgba(0,0,0,0.04);
          --na-border:  rgba(0,0,0,0.09);
          --na-border2: rgba(0,0,0,0.05);
          --na-text:    #0f1623;
          --na-text2:   #2a3750;
          --na-text3:   #4a5e78;
          --na-text4:   #8a9ab8;
          --na-prose:   #2d3c50;
        }
        html.dark {
          --na-bg:      #080d14;
          --na-bg2:     #0d1420;
          --na-bg3:     #111826;
          --na-card:    rgba(255,255,255,0.03);
          --na-border:  rgba(255,255,255,0.07);
          --na-border2: rgba(255,255,255,0.04);
          --na-text:    #e0eaf8;
          --na-text2:   #c8d8f0;
          --na-text3:   #7a90b0;
          --na-text4:   #3d5878;
          --na-prose:   rgba(195,215,242,0.72);
        }

        .na-root { background:var(--na-bg); color:var(--na-text); font-family:'DM Sans',sans-serif; -webkit-font-smoothing:antialiased; min-height:100vh; }

        /* ══ HERO — kaip homepage: tamsi kairė, nuotrauka dešinė ══ */
        .na-hero {
          position:relative;
          height:52vh; min-height:340px; max-height:480px;
          overflow:hidden;
          background:#080d14;
          display:flex;
          flex-direction:column;
          justify-content:flex-end;
        }
        /* Nuotrauka — tik dešinė pusė */
        .na-hero-img {
          position:absolute;
          top:0; right:0; bottom:0;
          width:60%;
          object-fit:cover; object-position:center 20%;
          animation:na-zoom 16s ease-out forwards;
          -webkit-mask-image:linear-gradient(to left, black 40%, transparent 100%);
          mask-image:linear-gradient(to left, black 40%, transparent 100%);
        }
        /* Tamsinimas apačioje */
        .na-hero-overlay {
          position:absolute; inset:0;
          background:linear-gradient(to top, rgba(8,13,20,0.6) 0%, transparent 60%);
          pointer-events:none;
        }
        /* No photo fallback */
        .na-hero-noimg {
          position:absolute; inset:0;
          background:linear-gradient(135deg, #0d1420 0%, #111826 100%);
        }
        .na-hero-noimg::after {
          content:''; position:absolute; inset:0;
          background:radial-gradient(ellipse at 75% 40%, rgba(249,115,22,0.1) 0%, transparent 55%);
        }
        .na-hero-content {
          position:relative; z-index:2;
          display:flex; flex-direction:column; justify-content:flex-end;
          width:100%;
          max-width:1300px;
          margin:0 auto;
          padding:0 28px 40px;
          align-self:flex-end;
        }
        /* Inner text capped at article column width (matches prose below) */
        .na-hero-inner {
          max-width:680px;
          animation:na-in .7s .05s both;
        }
        .na-breadcrumb { display:flex; align-items:center; gap:8px; margin-bottom:12px; }
        .na-breadcrumb-home { font-size:12px; font-weight:600; color:rgba(255,255,255,0.38); text-decoration:none; }
        .na-breadcrumb-home:hover { color:rgba(255,255,255,0.6); }
        .na-breadcrumb-sep { font-size:12px; color:rgba(255,255,255,0.2); }
        .na-chip { display:inline-block; font-family:'Outfit',sans-serif; font-size:10px; font-weight:900; letter-spacing:.08em; text-transform:uppercase; color:#fff; padding:4px 12px; border-radius:20px; }
        .na-h1 {
          font-family:'Outfit',sans-serif;
          font-size:clamp(1.5rem,2.8vw,2.6rem);
          font-weight:900; line-height:1.08; letter-spacing:-.03em;
          color:#fff; margin:0 0 14px;
        }
        .na-meta { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        .na-date { font-size:12px; color:rgba(255,255,255,0.4); font-weight:600; font-family:'Outfit',sans-serif; }
        .na-artist-pill { display:inline-flex; align-items:center; gap:6px; background:rgba(255,255,255,0.1); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,0.15); border-radius:100px; padding:4px 12px 4px 4px; text-decoration:none; transition:background .2s; }
        .na-artist-pill:hover { background:rgba(255,255,255,0.18); }
        .na-artist-pill img { width:20px; height:20px; border-radius:50%; object-fit:cover; }
        .na-artist-pill-av { width:20px; height:20px; border-radius:50%; background:rgba(255,255,255,0.2); display:flex; align-items:center; justify-content:center; font-size:8px; font-weight:900; color:#fff; }
        .na-artist-pill span { font-size:11px; font-weight:700; color:rgba(255,255,255,0.85); }
        .na-source-btn { display:inline-flex; align-items:center; gap:7px; margin-top:14px; padding:8px 16px; border-radius:100px; background:rgba(249,115,22,.12); border:1px solid rgba(249,115,22,.28); color:#f97316; font-size:12px; font-weight:800; text-decoration:none; font-family:'Outfit',sans-serif; transition:all .2s; }
        .na-source-btn:hover { background:rgba(249,115,22,.22); }

        /* ── Page layout ── */
        .na-page { max-width:1300px; margin:0 auto; padding:0 28px; }
        .na-grid { display:grid; gap:44px; align-items:start; padding:36px 0 90px; }
        .na-grid.has-sb { grid-template-columns:1fr 340px; }
        .na-grid.no-sb  { grid-template-columns:1fr; max-width:820px; margin:0 auto; }

        /* ── Prose ── */
        .na-prose { color:var(--na-prose); font-size:1.06rem; line-height:1.9; }
        .na-prose p  { margin-bottom:22px; }
        .na-prose a  { color:#3b82f6; text-decoration:underline; }
        .na-prose h2 { font-family:'Outfit',sans-serif; font-size:1.5rem; font-weight:900; color:var(--na-text); margin:40px 0 16px; letter-spacing:-.025em; }
        .na-prose h3 { font-family:'Outfit',sans-serif; font-size:1.18rem; font-weight:800; color:var(--na-text); margin:32px 0 12px; }
        .na-prose blockquote { border-left:3px solid #f97316; padding:14px 22px; margin:32px 0; background:rgba(249,115,22,.05); border-radius:0 12px 12px 0; }
        .na-prose blockquote p { font-size:1.08rem; font-weight:700; font-style:italic; color:var(--na-text2); line-height:1.55; margin:0; }
        .na-prose ul,.na-prose ol { margin:16px 0 24px 22px; }
        .na-prose li { margin-bottom:6px; line-height:1.78; color:var(--na-prose); }
        .na-prose strong { color:var(--na-text2); font-weight:700; }
        .na-prose img { max-width:100%; border-radius:10px; }
        .na-footer { margin-top:48px; padding-top:28px; border-top:1px solid var(--na-border); display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
        .na-back { display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:700; color:var(--na-text4); text-decoration:none; font-family:'Outfit',sans-serif; transition:color .15s; }
        .na-back:hover { color:var(--na-text2); }
        .na-share-btn { padding:7px 16px; border-radius:100px; background:var(--na-card); border:1px solid var(--na-border); color:var(--na-text3); font-size:12px; font-weight:700; cursor:pointer; font-family:'Outfit',sans-serif; }

        /* ── Sidebar ── */
        .na-sidebar { position:sticky; top:80px; display:flex; flex-direction:column; gap:10px; }
        .sb-card { border-radius:16px; background:var(--na-card); border:1px solid var(--na-border); padding:14px; }
        .sb-card-label { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.1em; color:var(--na-text4); margin:0 0 10px; font-family:'Outfit',sans-serif; }

        /* Artist card */
        .na-artist-card { border-radius:16px; background:var(--na-card); border:1px solid var(--na-border); padding:14px; display:flex; align-items:center; gap:12px; }
        .na-artist-card img,.na-artist-av { width:48px; height:48px; border-radius:50%; object-fit:cover; border:2px solid var(--na-border); flex-shrink:0; }
        .na-artist-av { background:var(--na-bg3); display:flex; align-items:center; justify-content:center; font-size:18px; color:var(--na-text4); }
        .na-artist-name { font-family:'Outfit',sans-serif; font-size:14px; font-weight:800; color:var(--na-text); margin:0 0 2px; }
        .na-artist-sub  { font-size:11px; color:var(--na-text4); margin:0; }
        .na-artist-link { background:rgba(29,78,216,.1); border:1px solid rgba(29,78,216,.22); color:#3b82f6; font-size:11px; font-weight:700; padding:7px 14px; border-radius:8px; text-decoration:none; white-space:nowrap; flex-shrink:0; font-family:'Outfit',sans-serif; transition:background .2s; }
        .na-artist-link:hover { background:rgba(29,78,216,.18); }

        /* Related */
        .rel-item { display:flex; gap:10px; padding:8px 0; text-decoration:none; }
        .rel-item:hover { opacity:.75; }
        .rel-thumb { width:52px; height:52px; border-radius:8px; overflow:hidden; flex-shrink:0; background:var(--na-bg3); }
        .rel-thumb img { width:100%; height:100%; object-fit:cover; display:block; }
        .rel-body { flex:1; min-width:0; }
        .rel-type { font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:.07em; display:block; margin-bottom:3px; font-family:'Outfit',sans-serif; }
        .rel-title { font-size:12px; font-weight:700; color:var(--na-text2); margin:0; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }

        /* Share */
        .share-grid { display:grid; grid-template-columns:1fr 1fr; gap:5px; }
        .share-btn { padding:8px; border-radius:9px; background:var(--na-card); border:1px solid var(--na-border); color:var(--na-text3); font-size:11px; font-weight:700; cursor:pointer; font-family:'Outfit',sans-serif; transition:all .2s; }
        .share-btn:hover { border-color:rgba(249,115,22,.3); color:#f97316; }
        .share-btn-main { grid-column:1/-1; background:rgba(249,115,22,.1); border-color:rgba(249,115,22,.22); color:#f97316; }

        /* ── Music player ── */
        .mu { border-radius:16px; overflow:hidden; background:var(--na-card); border:1px solid var(--na-border); }
        .mu-hdr { display:flex; align-items:center; gap:9px; padding:10px 14px; border-bottom:1px solid var(--na-border2); }
        /* EQ icon box */
        .mu-hdr-icon { width:28px; height:28px; border-radius:7px; background:linear-gradient(135deg,#f97316,#e05500); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .mu-hdr-eq { display:flex; align-items:flex-end; gap:2px; height:14px; }
        .mu-hdr-eq span { width:3px; border-radius:2px; background:#fff; transform-origin:bottom; animation:eq-bounce .7s ease-in-out infinite alternate; }
        .mu-hdr-label { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.1em; color:var(--na-text4); font-family:'Outfit',sans-serif; flex:1; }

        .mu-video { background:#000; }
        .mu-iframe { width:100%; aspect-ratio:16/9; border:none; display:block; }
        .mu-thumb { position:relative; aspect-ratio:16/9; overflow:hidden; cursor:pointer; }
        .mu-thumb-noplay { cursor:default; }
        .mu-thumb img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .4s; }
        .mu-thumb:not(.mu-thumb-noplay):hover img { transform:scale(1.04); }
        .mu-no-thumb { width:100%; aspect-ratio:16/9; background:var(--na-bg3); display:flex; align-items:center; justify-content:center; font-size:32px; color:var(--na-text4); }
        .mu-play-overlay { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.2); }
        .mu-play-btn { width:52px; height:52px; border-radius:50%; background:rgba(249,115,22,.92); display:flex; align-items:center; justify-content:center; box-shadow:0 4px 24px rgba(249,115,22,.5); transition:transform .15s; }
        .mu-thumb:hover .mu-play-btn { transform:scale(1.07); }
        /* Now playing row — simpler, no EQ here */
        .mu-now { display:flex; align-items:center; gap:10px; padding:10px 14px; background:rgba(249,115,22,.06); border-top:1px solid rgba(249,115,22,.1); }
        .mu-now-info { flex:1; min-width:0; }
        .mu-now-title { font-size:12px; font-weight:800; color:var(--na-text); margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-family:'Outfit',sans-serif; }
        .mu-now-artist { font-size:10px; color:var(--na-text4); margin:2px 0 0; }
        .mu-yt-btn { width:28px; height:28px; border-radius:50%; background:var(--na-bg3); border:1px solid var(--na-border); display:flex; align-items:center; justify-content:center; color:var(--na-text4); text-decoration:none; flex-shrink:0; transition:all .2s; }
        .mu-yt-btn:hover { color:#ff0000; border-color:rgba(255,0,0,.3); }
        .mu-list { border-top:1px solid var(--na-border2); }
        .mu-track { width:100%; display:flex; align-items:center; gap:9px; padding:8px 14px; background:transparent; border:none; border-bottom:1px solid var(--na-border2); cursor:pointer; text-align:left; transition:background .15s; font-family:'DM Sans',sans-serif; }
        .mu-track:last-child { border-bottom:none; }
        .mu-track:hover { background:var(--na-bg3); }
        .mu-track-on { background:rgba(249,115,22,.06); }
        .mu-track-num { width:18px; font-size:10px; font-weight:700; color:var(--na-text4); text-align:center; flex-shrink:0; }
        .mu-track-on .mu-track-num { color:#f97316; }
        .mu-track-img { width:36px; height:36px; border-radius:6px; object-fit:cover; flex-shrink:0; }
        .mu-track-img-empty { background:var(--na-bg3); display:flex; align-items:center; justify-content:center; font-size:13px; color:var(--na-text4); }
        .mu-track-info { flex:1; min-width:0; }
        .mu-track-title  { font-size:12px; font-weight:700; color:var(--na-text2); margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .mu-track-artist { font-size:10px; color:var(--na-text4); margin:1px 0 0; }

        /* ── Gallery ── */
        .pg-wrap { margin-top:48px; }
        .pg-divider { display:flex; align-items:center; gap:12px; margin-bottom:14px; }
        .pg-divider-line { flex:1; height:1px; background:var(--na-border); }
        .pg-divider-label { font-size:10px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; color:var(--na-text4); white-space:nowrap; font-family:'Outfit',sans-serif; }
        .pg-grid { display:grid; gap:3px; border-radius:12px; overflow:hidden; }
        .pg-grid-1 { grid-template-columns:1fr; }
        .pg-grid-2 { grid-template-columns:1fr 1fr; }
        .pg-grid-3 { grid-template-columns:2fr 1fr; grid-template-rows:220px 170px; }
        .pg-grid-4,.pg-grid-5 { grid-template-columns:2fr 1fr 1fr; grid-template-rows:220px 170px; }
        .pg-grid-3 .pg-cell-0,.pg-grid-4 .pg-cell-0,.pg-grid-5 .pg-cell-0 { grid-row:1/3; }
        .pg-cell { position:relative; overflow:hidden; cursor:zoom-in; background:var(--na-bg3); }
        .pg-grid-1 .pg-cell,.pg-grid-2 .pg-cell { aspect-ratio:16/9; }
        .pg-cell img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .4s; }
        .pg-cell:hover img { transform:scale(1.05); }
        .pg-more { position:absolute; inset:0; background:rgba(8,13,20,.75); backdrop-filter:blur(4px); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; cursor:pointer; }
        .pg-more span { font-size:26px; font-weight:900; color:#fff; }
        .pg-more small { font-size:10px; font-weight:600; color:rgba(255,255,255,.5); letter-spacing:.08em; text-transform:uppercase; }

        /* ── Lightbox ── */
        .lb { position:fixed; inset:0; z-index:1000; background:rgba(0,0,0,.96); backdrop-filter:blur(12px); display:flex; align-items:center; justify-content:center; }
        .lb-inner { max-width:88vw; max-height:88vh; display:flex; flex-direction:column; align-items:center; }
        .lb-inner img { max-width:100%; max-height:80vh; object-fit:contain; border-radius:8px; }
        .lb-cap { font-size:12px; color:rgba(255,255,255,.4); margin-top:10px; text-align:center; }
        .lb-close { position:absolute; top:18px; right:22px; width:40px; height:40px; border-radius:50%; background:rgba(255,255,255,.1); border:none; color:rgba(255,255,255,.7); font-size:17px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
        .lb-prev,.lb-next { position:absolute; top:50%; transform:translateY(-50%); width:52px; height:52px; border-radius:50%; background:rgba(255,255,255,.08); border:none; color:rgba(255,255,255,.7); font-size:34px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
        .lb-prev { left:14px; } .lb-next { right:14px; }
        .lb-counter { position:absolute; bottom:18px; left:50%; transform:translateX(-50%); font-size:11px; font-weight:600; color:rgba(255,255,255,.28); }

        /* ── Comments ── */
        .cm-wrap { margin-top:56px; padding-top:40px; border-top:2px solid var(--na-border); }
        .cm-hdr { display:flex; align-items:center; gap:10px; margin-bottom:24px; }
        .cm-hdr-title { font-family:'Outfit',sans-serif; font-size:1.1rem; font-weight:900; color:var(--na-text); letter-spacing:-.02em; }
        .cm-count { background:var(--na-bg3); border:1px solid var(--na-border); color:var(--na-text3); font-size:11px; font-weight:700; padding:2px 9px; border-radius:100px; font-family:'Outfit',sans-serif; }
        .cm-loading { display:flex; gap:8px; margin:24px 0; }
        .cm-loading span { height:64px; border-radius:12px; background:var(--na-bg3); flex:1; animation:cm-pulse 1.4s ease-in-out infinite; }
        .cm-loading span:nth-child(2) { animation-delay:.2s; }
        .cm-loading span:nth-child(3) { animation-delay:.4s; }
        @keyframes cm-pulse { 0%,100%{opacity:.5} 50%{opacity:1} }
        .cm-empty { color:var(--na-text4); font-size:.95rem; padding:20px 0; }
        .cm-list { display:flex; flex-direction:column; gap:4px; margin-bottom:28px; }
        .cm-item { display:flex; gap:12px; padding:14px 0; border-bottom:1px solid var(--na-border2); }
        .cm-item:last-child { border-bottom:none; }
        .cm-avatar { width:38px; height:38px; border-radius:50%; overflow:hidden; flex-shrink:0; background:var(--na-bg3); border:1px solid var(--na-border); display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:800; color:var(--na-text3); }
        .cm-avatar img { width:100%; height:100%; object-fit:cover; }
        .cm-body { flex:1; min-width:0; }
        .cm-meta { display:flex; align-items:center; gap:8px; margin-bottom:6px; flex-wrap:wrap; }
        .cm-meta strong { font-size:13px; font-weight:700; color:var(--na-text); font-family:'Outfit',sans-serif; }
        .cm-meta time { font-size:11px; color:var(--na-text4); }
        .cm-del { margin-left:auto; background:none; border:none; color:var(--na-text4); cursor:pointer; font-size:11px; padding:2px 6px; border-radius:4px; transition:all .15s; }
        .cm-del:hover { color:#ef4444; background:rgba(239,68,68,.08); }
        .cm-text { font-size:.95rem; color:var(--na-prose); line-height:1.65; white-space:pre-wrap; word-break:break-word; margin:0; }
        .cm-form { display:flex; gap:10px; margin-top:4px; }
        .cm-form-avatar { width:38px; height:38px; border-radius:50%; overflow:hidden; flex-shrink:0; background:var(--na-bg3); border:1px solid var(--na-border); display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:800; color:var(--na-text3); margin-top:2px; }
        .cm-form-avatar img { width:100%; height:100%; object-fit:cover; }
        .cm-form-right { flex:1; min-width:0; }
        .cm-textarea { width:100%; background:var(--na-bg2); border:1px solid var(--na-border); border-radius:12px; color:var(--na-text); font-family:'DM Sans',sans-serif; font-size:.95rem; line-height:1.6; padding:12px 14px; resize:vertical; min-height:90px; transition:border .2s; outline:none; box-sizing:border-box; }
        .cm-textarea:focus { border-color:rgba(249,115,22,.4); box-shadow:0 0 0 3px rgba(249,115,22,.08); }
        .cm-textarea::placeholder { color:var(--na-text4); }
        .cm-error { font-size:12px; color:#ef4444; margin:6px 0 0; }
        .cm-form-foot { display:flex; align-items:center; justify-content:space-between; margin-top:8px; }
        .cm-chars { font-size:11px; color:var(--na-text4); }
        .cm-submit { padding:8px 20px; border-radius:100px; background:#f97316; border:none; color:#fff; font-size:13px; font-weight:800; font-family:'Outfit',sans-serif; cursor:pointer; transition:all .2s; }
        .cm-submit:hover:not(:disabled) { background:#e05500; }
        .cm-submit:disabled { opacity:.45; cursor:default; }
        .cm-login { background:var(--na-bg2); border:1px solid var(--na-border); border-radius:12px; padding:18px 20px; text-align:center; margin-top:8px; }
        .cm-login p { font-size:.95rem; color:var(--na-text3); margin:0; }
        .cm-login-link { color:#f97316; font-weight:700; text-decoration:none; }
        .cm-login-link:hover { text-decoration:underline; }

        /* ── Responsive ── */
        @media(max-width:1024px){
          .na-grid.has-sb { grid-template-columns:1fr; }
          .na-sidebar { position:static; margin-top:0; }
          .na-hero-content { padding:0 24px 32px; }
          .na-hero-inner { max-width:100%; }
          /* Mobile: nuotrauka visas plotis, stipriai blur + tamsinta */
          .na-hero-img {
            display:block !important;
            width:100% !important; right:auto !important;
            filter:blur(18px) brightness(0.45) saturate(1.4);
            transform:scale(1.08);
            -webkit-mask-image:none !important;
            mask-image:none !important;
          }
          .na-hero-overlay {
            background:linear-gradient(to top, rgba(8,13,20,0.85) 0%, rgba(8,13,20,0.4) 60%, rgba(8,13,20,0.55) 100%);
          }
        }
        @media(max-width:640px){
          .na-hero { height:auto; min-height:260px; max-height:none; padding-top:60px; }
          .na-h1 { font-size:1.55rem; }
          .na-page { padding:0 16px; }
          .na-grid { padding:24px 0 60px; gap:28px; }
        }
      `}</style>

      <div className="na-root">

        {/* ══════════ HERO ══════════ */}
        <div className="na-hero">
          {heroImg
            ? <><img src={heroImg} alt="" className="na-hero-img" /><div className="na-hero-overlay" /></>
            : <div className="na-hero-noimg" />
          }
          {/* Hero content plotis = straipsnio plotis (max 1300px, padding 28px) */}
          <div className="na-hero-content">
            <div style={{ maxWidth: 'calc(100% - 340px - 44px)' }} className="na-hero-inner">
              <div className="na-breadcrumb">
                <div className="na-chip" style={{ background: chipColor }}>{chipLabel}</div>
              </div>
              <h1 className="na-h1">{news.title}</h1>
              <div className="na-meta">
                <span className="na-date">{formatDate(news.published_at)}</span>
              </div>
              {news.source_url && (
                <a href={news.source_url} target="_blank" rel="noopener" className="na-source-btn">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  Skaityti šaltinį
                </a>
              )}
            </div>
          </div>
        </div>

        {/* ══════════ ARTICLE + SIDEBAR ══════════ */}
        <div className="na-page" id="na-article">
          <div className={`na-grid ${hasSidebar ? 'has-sb' : 'no-sb'}`}>

            <main>
              <div className="na-prose" dangerouslySetInnerHTML={{ __html: news.body }} />
              {gallery.length > 0 && <PhotoGallery photos={gallery} />}
              <div className="na-footer">
                <Link href="/naujienos" className="na-back">← Visos naujienos</Link>
                <button className="na-share-btn"
                  onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(location.href)}`)}>
                  Dalintis
                </button>
              </div>

              <Comments newsId={news.id} />
            </main>

            {hasSidebar && (
              <aside className="na-sidebar">
                {/* Muzika pirmiau, atlikėjas po jos */}
                {songs.length > 0 && <MusicPlayer songs={songs} />}
                {news.artist && (
                  <div className="na-artist-card">
                    {news.artist.cover_image_url
                      ? <img src={news.artist.cover_image_url} alt={news.artist.name} />
                      : <div className="na-artist-av">{news.artist.name[0]}</div>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="na-artist-name">{news.artist.name}</p>
                      <p className="na-artist-sub">music.lt atlikėjas</p>
                    </div>
                    <Link href={`/atlikejai/${news.artist.id}`} className="na-artist-link">Profilis →</Link>
                  </div>
                )}
                <RelatedCard related={related} />
                <ShareCard title={news.title} />
              </aside>
            )}
          </div>
        </div>

      </div>
    </>
  )
}
