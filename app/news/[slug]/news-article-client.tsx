'use client'
// app/news/[slug]/news-article-client.tsx
//
// 2026-06-18 redesign: pilnas vizualinis suvienodinimas su likusiu site'u
// (homepage / artist page). Buvęs puslapis naudojo niekur neapibrėžtus
// --na-* CSS tokens (→ render'inosi su default/inherited spalvom, „išsimušė
// iš konteksto"). Dabar viskas naudoja realius globalius temos token'us
// (--bg-*, --text-*, --accent-*) ir veikia light+dark temose.
//
// Layout:
//   HERO  — artist-page logika, bet foto DEŠINĖJE (artist'e kairėje):
//           sluoksniuotas blur backdrop + ryški foto + gradient'as kuris
//           foto blend'ina į tamsų foną, kad pavadinimas kairėje būtų
//           skaitomas net su tamsiom koncertų nuotraukom. Po pavadinimu —
//           data, susijusių atlikėjų juosta, Patinka + Kopijuoti mygtukai.
//   BODY  — straipsnis + dešinė kolona kurioje TIK player'is (artist-style).
//           Susiję straipsniai rodomi tik jei yra švieži (≤12 mėn.).

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import EntityCommentsBlock from '@/components/EntityCommentsBlock'
import LikesModal, { type LikeUser } from '@/components/LikesModal'

/* ─── Types ──────────────────────────────────────────────────────────────── */
type Photo     = { url: string; caption?: string; source?: string }
type SongEntry = { id?: number; song_id?: number | null; title: string; artist_name: string; youtube_url: string; cover_url?: string }
type ArtistRef = { id: number; name: string; cover_image_url?: string }
type NewsItem  = {
  id: number; title: string; slug: string; body: string; type: string
  source_url?: string; source_name?: string; published_at: string
  image_small_url?: string; gallery?: Photo[]
  artist?:  { id: number; name: string; cover_image_url?: string; photos?: any[] }
  artist2?: { id: number; name: string; cover_image_url?: string } | null
  artists?: ArtistRef[]  // VISI susiję atlikėjai (primary + Susijusi info section)
}
type RelatedNews = { id: number; title: string; slug: string; image_small_url?: string; published_at: string; type: string }

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

/* ─── News article like button ───────────────────────────────────────────── */
/* entity_type='news', entity_id=news.id. `variant='hero'` — ryškus pill ant
   tamsaus hero fono; default — neutralus pill straipsnio kontekste. */
function NewsLikeButton({ newsId, variant = 'hero' }: { newsId: number; variant?: 'hero' }) {
  const { data: session } = useSession()
  const [count, setCount] = useState(0)
  const [liked, setLiked] = useState(false)
  const [likers, setLikers] = useState<LikeUser[]>([])
  const [modalOpen, setModalOpen] = useState(false)

  const refreshLikers = () => {
    fetch(`/api/likes/news/${newsId}`)
      .then(r => r.json())
      .then(d => {
        const users: LikeUser[] = d.users || []
        setCount(d.count || 0)
        setLikers(users)
        const myUsername = (session?.user as any)?.name || (session?.user as any)?.email
        if (myUsername) {
          setLiked(users.some(u => (u.user_username || '').toLowerCase() === myUsername.toLowerCase()))
        } else setLiked(false)
      })
      .catch(() => {})
  }

  useEffect(() => {
    refreshLikers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsId, session?.user])

  async function toggleLike() {
    if (!session?.user) return
    const next = !liked
    setLiked(next)
    setCount(c => next ? c + 1 : Math.max(0, c - 1))
    try { await fetch(`/api/news/${newsId}/like`, { method: 'POST' }); refreshLikers() } catch {}
  }

  return (
    <>
      <button
        type="button"
        onClick={session?.user ? toggleLike : undefined}
        className={`na-act ${liked ? 'na-act-liked' : ''}`}
        style={{ cursor: session?.user ? 'pointer' : 'not-allowed' }}
        title={session?.user ? (liked ? 'Nebepatinka' : 'Patinka') : 'Prisijunk, kad pamėgtum'}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
        Patinka
        {count > 0 && (
          <span
            onClick={e => { e.stopPropagation(); setModalOpen(true) }}
            className="na-act-count"
            title="Pamatyti kas paspaudė"
          >
            {count}
          </span>
        )}
      </button>
      <LikesModal open={modalOpen} onClose={() => setModalOpen(false)} title="Patinka" count={count} users={likers} />
    </>
  )
}

/* ─── Copy-link button ───────────────────────────────────────────────────── */
function CopyLinkButton() {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="na-act"
      onClick={() => navigator.clipboard.writeText(location.href).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) })}
      title="Kopijuoti nuorodą"
    >
      {copied
        ? <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M20 6 9 17l-5-5"/></svg>Nukopijuota</>
        : <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>Kopijuoti</>
      }
    </button>
  )
}

/* ─── Music Player — artist-page vizualas ────────────────────────────────── */
/* Cinematic hqdefault thumbnail backdrop, ryškus oranžinis play btn,
   embeddable preflight (Klaida 153 / VEVO label block) → „Žiūrėti YouTube'e".
   nocookie embed, švarus track sąrašas. */
function MusicPlayer({ songs }: { songs: SongEntry[] }) {
  const [active, setActive]   = useState(0)
  const [playing, setPlaying] = useState(false)
  const [thumbAlive, setThumbAlive] = useState<boolean | null>(null)
  const [embedDisabled, setEmbedDisabled] = useState<Set<string>>(new Set())

  const cur   = songs[active]
  const vid   = ytId(cur?.youtube_url)
  const hqThumb = vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : null
  const thumb = (thumbAlive === true && hqThumb) ? hqThumb : (cur?.cover_url || null)
  const isBlocked = !!vid && embedDisabled.has(vid)

  // hqdefault liveness probe — gyvas video grąžina ≥200px, dead → 120x90.
  useEffect(() => {
    if (!vid) { setThumbAlive(null); return }
    setThumbAlive(null)
    const img = new window.Image()
    img.onload  = () => setThumbAlive(img.naturalWidth >= 200)
    img.onerror = () => setThumbAlive(false)
    img.src = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`
  }, [vid])

  // Embeddable preflight — label/VEVO turinys dažnai išjungia įterpimą.
  useEffect(() => {
    if (!vid || embedDisabled.has(vid)) return
    let cancelled = false
    fetch(`/api/yt/embeddable?videoId=${encodeURIComponent(vid)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d) return
        if (d.embeddable === false) setEmbedDisabled(s => { const n = new Set(s); n.add(vid); return n })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [vid]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!songs.length) return null

  return (
    <div className="mu">
      {/* Header — EQ animacija */}
      <div className="mu-hdr">
        <div className="mu-hdr-icon">
          <div className="mu-hdr-eq">
            {[6,10,4,8].map((h,i) => <span key={i} style={{ height: h, animationDelay: `${i*0.13}s` }} />)}
          </div>
        </div>
        <span className="mu-hdr-label">Susijusi muzika</span>
      </div>

      {/* Player area */}
      <div className="mu-video">
        {playing && vid && !isBlocked ? (
          <>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&rel=0`}
              allow="autoplay; encrypted-media" allowFullScreen className="mu-iframe"
            />
            <a href={`https://youtube.com/watch?v=${vid}`} target="_blank" rel="noopener" className="mu-ytfloat"
              title="Jei video čia neveikia — atidaryti YouTube">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="#FF0000"><path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.55A3.02 3.02 0 0 0 .5 6.19 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14c1.88.55 9.38.55 9.38.55s7.5 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.81zM9.54 15.57V8.43L15.82 12l-6.28 3.57z"/></svg>
              <span>YouTube ↗</span>
            </a>
          </>
        ) : isBlocked && vid ? (
          /* Embed išjungtas — thumbnail + „Žiūrėti YouTube'e" CTA */
          <a href={`https://www.youtube.com/watch?v=${vid}`} target="_blank" rel="noopener noreferrer" className="mu-blocked">
            {thumb && <img src={thumb} alt="" className="mu-blocked-img" />}
            <div className="mu-blocked-veil" />
            <div className="mu-blocked-inner">
              <span className="mu-blocked-btn">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="#fff"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg>
              </span>
              <span className="mu-blocked-label">Žiūrėti YouTube'e</span>
            </div>
          </a>
        ) : (
          <div className={`mu-thumb ${!vid ? 'mu-thumb-noplay' : ''}`} onClick={() => vid && setPlaying(true)}>
            {thumb ? <img src={thumb} alt={cur.title} /> : <div className="mu-no-thumb">♪</div>}
            <div className="mu-thumb-veil" />
            {vid && (
              <div className="mu-play-overlay">
                <div className="mu-play-btn">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Now playing */}
      <div className="mu-now">
        <div className="mu-now-info">
          <p className="mu-now-title">{cur.title}</p>
          <p className="mu-now-artist">{cur.artist_name}</p>
        </div>
        {vid && (
          <a href={`https://youtube.com/watch?v=${vid}`} target="_blank" rel="noopener" className="mu-yt-btn" title="Atidaryti YouTube">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.55A3.02 3.02 0 0 0 .5 6.19 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14c1.88.55 9.38.55 9.38.55s7.5 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.81zM9.54 15.57V8.43L15.82 12l-6.28 3.57z"/></svg>
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
                {t ? <img src={t} alt="" className="mu-track-img" /> : <div className="mu-track-img mu-track-img-empty">♪</div>}
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

/* ─── Recent related news (≤12 mėn.) — kompaktiška ────────────────────────── */
function RelatedRecent({ related }: { related: RelatedNews[] }) {
  if (!related.length) return null
  return (
    <div className="sb-card">
      <p className="sb-card-label">Taip pat skaitykite</p>
      {related.map((r, i) => (
        <Link key={r.id} href={`/news/${r.slug}`} className="rel-item"
          style={{ borderBottom: i < related.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
          <div className="rel-thumb">
            {r.image_small_url && <img src={r.image_small_url} alt="" />}
          </div>
          <div className="rel-body">
            <span className="rel-type" style={{ color: TYPE_COLOR[r.type] || 'var(--accent-orange)' }}>
              {TYPE_LABEL[r.type] || r.type}
            </span>
            <p className="rel-title">{r.title}</p>
          </div>
        </Link>
      ))}
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

  // Susiję atlikėjai → hero juosta (anksčiau sidebar kortelės).
  const artists = (news.artists && news.artists.length > 0
    ? news.artists
    : news.artist ? [news.artist] : []) as ArtistRef[]

  // Susiję straipsniai — TIK švieži (≤12 mėn.). Senesni klaidina.
  const YEAR_MS = 365 * 24 * 60 * 60 * 1000
  const recentRelated = related.filter(r => {
    const t = r.published_at ? new Date(r.published_at).getTime() : 0
    return t > 0 && (Date.now() - t) <= YEAR_MS
  }).slice(0, 4)

  const hasSidebar = songs.length > 0 || recentRelated.length > 0

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');

        @keyframes na-in     { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:none } }
        @keyframes na-zoom   { 0%{transform:scale(1.04)} 100%{transform:scale(1.12)} }
        @keyframes eq-bounce { from { transform:scaleY(0.25) } to { transform:scaleY(1) } }

        .na-root { background:var(--bg-body); color:var(--text-primary); font-family:'DM Sans',sans-serif; -webkit-font-smoothing:antialiased; min-height:100vh; }

        /* ══ HERO — artist-page logika, foto DEŠINĖJE ══ */
        .na-hero {
          position:relative; width:100%;
          min-height:380px; max-height:560px; height:54vh;
          overflow:hidden; background:var(--bg-body);
          display:flex; align-items:flex-end;
        }
        /* Foto kontaineris — dešinė pusė, ~58% */
        .na-hero-photo {
          position:absolute; inset-block:0; right:0; left:auto;
          width:62%; overflow:hidden;
        }
        /* Sluoksnis 1 — blur backdrop (maskuoja low-res upscale) */
        .na-hero-blur {
          position:absolute; inset:0;
          background-size:cover; background-position:center 30%;
          filter:blur(60px) saturate(1.25) brightness(0.9); transform:scale(1.3);
        }
        /* Sluoksnis 2 — ryški foto */
        .na-hero-img {
          position:absolute; inset:0; width:100%; height:100%;
          object-fit:cover; object-position:center 25%;
          animation:na-zoom 30s ease-in-out infinite alternate;
          filter:saturate(1.08) contrast(1.04);
        }
        /* Gradient'ai — foto blend'as į tamsų foną (kairė) + apačia */
        .na-hero-fade-l { position:absolute; inset:0; background:linear-gradient(to right, var(--bg-body) 4%, rgba(8,13,20,0.55) 38%, transparent 78%); pointer-events:none; }
        .na-hero-fade-b { position:absolute; inset:0; background:linear-gradient(to top, var(--bg-body) 2%, rgba(8,13,20,0.35) 30%, transparent 62%); pointer-events:none; }
        .na-hero-noimg { position:absolute; inset:0; background:linear-gradient(135deg,#0d1420 0%,#111826 100%); }
        .na-hero-noimg::after { content:''; position:absolute; inset:0; background:radial-gradient(ellipse at 75% 40%, rgba(249,115,22,0.12) 0%, transparent 55%); }

        .na-hero-wrap { position:relative; z-index:2; width:100%; max-width:1240px; margin:0 auto; padding:0 28px 38px; }
        .na-hero-inner { max-width:640px; animation:na-in .7s .05s both; }
        .na-breadcrumb { display:flex; align-items:center; gap:8px; margin-bottom:14px; }
        .na-breadcrumb a { font-size:12px; font-weight:600; color:rgba(255,255,255,0.42); text-decoration:none; }
        .na-breadcrumb a:hover { color:rgba(255,255,255,0.7); }
        .na-breadcrumb span { font-size:12px; color:rgba(255,255,255,0.22); }
        .na-chip { display:inline-block; font-family:'Outfit',sans-serif; font-size:10px; font-weight:900; letter-spacing:.08em; text-transform:uppercase; color:#fff; padding:4px 12px; border-radius:20px; }
        .na-h1 { font-family:'Outfit',sans-serif; font-size:clamp(1.6rem,3vw,2.7rem); font-weight:900; line-height:1.07; letter-spacing:-.03em; color:#fff; margin:14px 0 14px; text-shadow:0 2px 24px rgba(0,0,0,0.4); }
        .na-date { font-size:12.5px; color:rgba(255,255,255,0.5); font-weight:600; font-family:'Outfit',sans-serif; }

        /* Susijusių atlikėjų juosta */
        .na-artbar { display:flex; flex-wrap:wrap; gap:8px; margin-top:16px; }
        .na-artpill { display:inline-flex; align-items:center; gap:7px; background:rgba(255,255,255,0.09); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,0.14); border-radius:100px; padding:4px 13px 4px 4px; text-decoration:none; transition:background .2s,border-color .2s; }
        .na-artpill:hover { background:rgba(255,255,255,0.16); border-color:rgba(255,255,255,0.28); }
        .na-artpill img { width:24px; height:24px; border-radius:50%; object-fit:cover; }
        .na-artpill-av { width:24px; height:24px; border-radius:50%; background:rgba(249,115,22,0.85); display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:900; color:#fff; }
        .na-artpill span { font-size:12.5px; font-weight:700; color:#fff; }

        /* Veiksmų mygtukai (Patinka + Kopijuoti) */
        .na-actbar { display:flex; flex-wrap:wrap; gap:9px; margin-top:18px; }
        .na-act { display:inline-flex; align-items:center; gap:7px; padding:8px 16px; border-radius:100px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.16); color:rgba(255,255,255,0.92); font-size:12.5px; font-weight:800; font-family:'Outfit',sans-serif; cursor:pointer; transition:all .18s; backdrop-filter:blur(8px); }
        .na-act:hover { background:rgba(255,255,255,0.15); border-color:rgba(255,255,255,0.3); }
        .na-act-liked { color:#f97316; background:rgba(249,115,22,0.14); border-color:rgba(249,115,22,0.4); }
        .na-act-count { margin-left:3px; padding-left:8px; border-left:1px solid rgba(255,255,255,0.22); font-weight:800; cursor:pointer; }

        /* ── Page layout ── */
        .na-page { max-width:1240px; margin:0 auto; padding:0 28px; }
        .na-grid { display:grid; gap:48px; align-items:start; padding:40px 0 90px; }
        .na-grid.has-sb { grid-template-columns:minmax(0,1fr) 340px; }
        .na-grid.no-sb  { grid-template-columns:minmax(0,1fr); max-width:780px; margin:0 auto; }

        /* ── Prose ── */
        .na-prose { color:var(--text-secondary); font-size:1.08rem; line-height:1.85; }
        .na-prose p  { margin-bottom:22px; }
        .na-prose a  { color:var(--accent-link); text-decoration:underline; }
        .na-prose h2 { font-family:'Outfit',sans-serif; font-size:1.5rem; font-weight:900; color:var(--text-primary); margin:40px 0 16px; letter-spacing:-.025em; }
        .na-prose h3 { font-family:'Outfit',sans-serif; font-size:1.18rem; font-weight:800; color:var(--text-primary); margin:32px 0 12px; }
        .na-prose blockquote { border-left:3px solid var(--accent-orange); padding:14px 22px; margin:32px 0; background:rgba(249,115,22,.06); border-radius:0 12px 12px 0; }
        .na-prose blockquote p { font-size:1.08rem; font-weight:700; font-style:italic; color:var(--text-primary); line-height:1.55; margin:0; }
        .na-prose ul,.na-prose ol { margin:16px 0 24px 22px; }
        .na-prose li { margin-bottom:6px; line-height:1.78; color:var(--text-secondary); }
        .na-prose strong { color:var(--text-primary); font-weight:700; }
        .na-prose img { max-width:100%; border-radius:10px; }

        /* ── Sidebar ── */
        .na-sidebar { position:sticky; top:80px; display:flex; flex-direction:column; gap:12px; }
        .sb-card { border-radius:16px; background:var(--card-bg); border:1px solid var(--border-default); padding:14px; }
        .sb-card-label { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.1em; color:var(--text-muted); margin:0 0 10px; font-family:'Outfit',sans-serif; }

        /* Related */
        .rel-item { display:flex; gap:10px; padding:9px 0; text-decoration:none; }
        .rel-item:hover { opacity:.75; }
        .rel-thumb { width:54px; height:54px; border-radius:8px; overflow:hidden; flex-shrink:0; background:var(--bg-elevated); }
        .rel-thumb img { width:100%; height:100%; object-fit:cover; display:block; }
        .rel-body { flex:1; min-width:0; }
        .rel-type { font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:.07em; display:block; margin-bottom:3px; font-family:'Outfit',sans-serif; }
        .rel-title { font-size:12.5px; font-weight:700; color:var(--text-secondary); margin:0; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }

        /* ── Music player (artist-style) ── */
        .mu { border-radius:18px; overflow:hidden; background:var(--bg-elevated); border:1px solid var(--border-default); box-shadow:0 20px 60px -24px rgba(0,0,0,0.45); }
        .mu-hdr { display:flex; align-items:center; gap:9px; padding:11px 14px; border-bottom:1px solid var(--border-subtle); }
        .mu-hdr-icon { width:28px; height:28px; border-radius:8px; background:linear-gradient(135deg,#f97316,#e05500); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .mu-hdr-eq { display:flex; align-items:flex-end; gap:2px; height:14px; }
        .mu-hdr-eq span { width:3px; border-radius:2px; background:#fff; transform-origin:bottom; animation:eq-bounce .7s ease-in-out infinite alternate; }
        .mu-hdr-label { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.1em; color:var(--text-muted); font-family:'Outfit',sans-serif; flex:1; }

        .mu-video { position:relative; background:#000; aspect-ratio:16/9; }
        .mu-iframe { position:absolute; inset:0; width:100%; height:100%; border:none; display:block; }
        .mu-ytfloat { position:absolute; bottom:8px; right:8px; z-index:5; background:rgba(0,0,0,0.7); color:#fff; padding:4px 10px; border-radius:6px; font-size:11px; font-weight:600; text-decoration:none; display:flex; align-items:center; gap:4px; backdrop-filter:blur(4px); }
        .mu-thumb { position:relative; width:100%; height:100%; overflow:hidden; cursor:pointer; }
        .mu-thumb-noplay { cursor:default; }
        .mu-thumb img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .5s; }
        .mu-thumb:not(.mu-thumb-noplay):hover img { transform:scale(1.05); }
        .mu-thumb-veil { position:absolute; inset:0; background:linear-gradient(to top, rgba(0,0,0,0.45), rgba(0,0,0,0.05) 55%, rgba(0,0,0,0.15)); pointer-events:none; }
        .mu-no-thumb { width:100%; height:100%; background:var(--player-placeholder-bg); display:flex; align-items:center; justify-content:center; font-size:34px; color:rgba(255,255,255,0.4); }
        .mu-play-overlay { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; }
        .mu-play-btn { width:58px; height:58px; border-radius:50%; background:rgba(249,115,22,.95); display:flex; align-items:center; justify-content:center; box-shadow:0 8px 30px rgba(249,115,22,.5); transition:transform .15s; }
        .mu-thumb:hover .mu-play-btn { transform:scale(1.08); }
        .mu-blocked { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; text-decoration:none; overflow:hidden; }
        .mu-blocked-img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; opacity:.55; }
        .mu-blocked-veil { position:absolute; inset:0; background:linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.5)); }
        .mu-blocked-inner { position:relative; z-index:2; display:flex; flex-direction:column; align-items:center; gap:10px; }
        .mu-blocked-btn { width:62px; height:62px; border-radius:50%; background:#FF0000; display:flex; align-items:center; justify-content:center; box-shadow:0 10px 36px rgba(0,0,0,.5); }
        .mu-blocked-label { font-size:13px; font-weight:700; color:#fff; font-family:'Outfit',sans-serif; }

        .mu-now { display:flex; align-items:center; gap:10px; padding:11px 14px; background:rgba(249,115,22,.07); border-top:1px solid rgba(249,115,22,.12); }
        .mu-now-info { flex:1; min-width:0; }
        .mu-now-title { font-size:12.5px; font-weight:800; color:var(--text-primary); margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-family:'Outfit',sans-serif; }
        .mu-now-artist { font-size:10.5px; color:var(--text-muted); margin:2px 0 0; }
        .mu-yt-btn { width:28px; height:28px; border-radius:50%; background:var(--bg-elevated); border:1px solid var(--border-default); display:flex; align-items:center; justify-content:center; color:var(--text-muted); text-decoration:none; flex-shrink:0; transition:all .2s; }
        .mu-yt-btn:hover { color:#ff0000; border-color:rgba(255,0,0,.3); }
        .mu-list { border-top:1px solid var(--border-subtle); max-height:280px; overflow-y:auto; }
        .mu-track { width:100%; display:flex; align-items:center; gap:9px; padding:8px 14px; background:transparent; border:none; border-bottom:1px solid var(--border-subtle); cursor:pointer; text-align:left; transition:background .15s; font-family:'DM Sans',sans-serif; }
        .mu-track:last-child { border-bottom:none; }
        .mu-track:hover { background:var(--bg-hover); }
        .mu-track-on { background:rgba(249,115,22,.07); }
        .mu-track-num { width:18px; font-size:10px; font-weight:700; color:var(--text-muted); text-align:center; flex-shrink:0; }
        .mu-track-on .mu-track-num { color:#f97316; }
        .mu-track-img { width:36px; height:36px; border-radius:6px; object-fit:cover; flex-shrink:0; }
        .mu-track-img-empty { background:var(--bg-elevated); display:flex; align-items:center; justify-content:center; font-size:13px; color:var(--text-muted); }
        .mu-track-info { flex:1; min-width:0; }
        .mu-track-title  { font-size:12px; font-weight:700; color:var(--text-secondary); margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .mu-track-artist { font-size:10px; color:var(--text-muted); margin:1px 0 0; }

        /* ── Gallery ── */
        .pg-wrap { margin-top:48px; }
        .pg-divider { display:flex; align-items:center; gap:12px; margin-bottom:14px; }
        .pg-divider-line { flex:1; height:1px; background:var(--border-default); }
        .pg-divider-label { font-size:10px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; color:var(--text-muted); white-space:nowrap; font-family:'Outfit',sans-serif; }
        .pg-grid { display:grid; gap:3px; border-radius:12px; overflow:hidden; }
        .pg-grid-1 { grid-template-columns:1fr; }
        .pg-grid-2 { grid-template-columns:1fr 1fr; }
        .pg-grid-3 { grid-template-columns:2fr 1fr; grid-template-rows:220px 170px; }
        .pg-grid-4,.pg-grid-5 { grid-template-columns:2fr 1fr 1fr; grid-template-rows:220px 170px; }
        .pg-grid-3 .pg-cell-0,.pg-grid-4 .pg-cell-0,.pg-grid-5 .pg-cell-0 { grid-row:1/3; }
        .pg-cell { position:relative; overflow:hidden; cursor:zoom-in; background:var(--bg-elevated); }
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

        /* ── Comments wrapper spacing ── */
        .na-comments { margin-top:52px; padding-top:38px; border-top:1px solid var(--border-default); }
        .na-backrow { margin-top:40px; }
        .na-back { display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:700; color:var(--text-muted); text-decoration:none; font-family:'Outfit',sans-serif; transition:color .15s; }
        .na-back:hover { color:var(--text-primary); }

        /* ── Responsive ── */
        @media(max-width:1024px){
          .na-grid.has-sb { grid-template-columns:1fr; }
          .na-sidebar { position:static; }
        }
        @media(max-width:860px){
          .na-hero { height:auto; min-height:auto; max-height:none; flex-direction:column; align-items:stretch; }
          .na-hero-photo { position:relative; width:100%; height:210px; }
          .na-hero-fade-l { background:linear-gradient(to top, var(--bg-body) 4%, transparent 70%); }
          .na-hero-fade-b { display:none; }
          .na-hero-wrap { background:var(--bg-body); padding:18px 20px 26px; max-width:100%; }
          .na-hero-inner { max-width:100%; }
          .na-h1 { text-shadow:none; }
        }
        @media(max-width:640px){
          .na-hero-photo { height:170px; }
          .na-page { padding:0 16px; }
          .na-grid { padding:24px 0 60px; gap:30px; }
        }
      `}</style>

      <div className="na-root">

        {/* ══════════ HERO ══════════ */}
        <div className="na-hero">
          {heroImg ? (
            <div className="na-hero-photo">
              <div className="na-hero-blur" style={{ backgroundImage: `url(${heroImg})` }} />
              <img src={heroImg} alt="" className="na-hero-img" referrerPolicy="no-referrer" />
              <div className="na-hero-fade-l" />
              <div className="na-hero-fade-b" />
            </div>
          ) : (
            <div className="na-hero-noimg" />
          )}

          <div className="na-hero-wrap">
            <div className="na-hero-inner">
              <div className="na-breadcrumb">
                <Link href="/">Pradžia</Link>
                <span>›</span>
                <Link href="/naujienos">Naujienos</Link>
              </div>
              <div className="na-chip" style={{ background: chipColor }}>{chipLabel}</div>
              <h1 className="na-h1">{news.title}</h1>
              <span className="na-date">{formatDate(news.published_at)}</span>

              {/* Susijusių atlikėjų juosta */}
              {artists.length > 0 && (
                <div className="na-artbar">
                  {artists.map((a, i) => (
                    <Link key={`${a.id}-${i}`} href={`/atlikejai/${a.id}`} className="na-artpill">
                      {a.cover_image_url
                        ? <img src={a.cover_image_url} alt={a.name} referrerPolicy="no-referrer" />
                        : <span className="na-artpill-av">{(a.name || '?')[0]}</span>}
                      <span>{a.name}</span>
                    </Link>
                  ))}
                </div>
              )}

              {/* Veiksmai — Patinka + Kopijuoti */}
              <div className="na-actbar">
                <NewsLikeButton newsId={news.id} />
                <CopyLinkButton />
              </div>
            </div>
          </div>
        </div>

        {/* ══════════ ARTICLE + SIDEBAR ══════════ */}
        <div className="na-page" id="na-article">
          <div className={`na-grid ${hasSidebar ? 'has-sb' : 'no-sb'}`}>

            <main>
              <div className="na-prose" dangerouslySetInnerHTML={{ __html: news.body }} />
              {gallery.length > 0 && <PhotoGallery photos={gallery} />}

              <div className="na-backrow">
                <Link href="/naujienos" className="na-back">← Visos naujienos</Link>
              </div>

              {/* EntityCommentsBlock — tas pats UI kaip diskusijoms */}
              <div className="na-comments">
                <EntityCommentsBlock entityType="news" entityId={news.id} title="Komentarai" skipLegacy />
              </div>
            </main>

            {hasSidebar && (
              <aside className="na-sidebar">
                {songs.length > 0 && <MusicPlayer songs={songs} />}
                {recentRelated.length > 0 && <RelatedRecent related={recentRelated} />}
              </aside>
            )}
          </div>
        </div>

      </div>
    </>
  )
}
