'use client'

// app/muzikos-atradimai/[id]/detail-client.tsx
// Interaktyvi detalės dalis: VEIKIANTIS embed (click-to-play) + like.

import { useState } from 'react'
import type { Discovery } from '@/lib/discoveries'

export function DetailMedia({ d }: { d: Discovery }) {
  const [play, setPlay] = useState(false)
  if (!d.embed_id) return null

  let inner: React.ReactNode = null
  if (d.embed_type === 'youtube') {
    inner = play
      ? <iframe className="md-frame md-yt" src={`https://www.youtube.com/embed/${d.embed_id}?autoplay=1`} allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
      : (
        <button className="md-ytbtn" onClick={() => setPlay(true)} aria-label="Paleisti">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://i.ytimg.com/vi/${d.embed_id}/hqdefault.jpg`} alt="" />
          <span className="md-play"><svg viewBox="0 0 68 48" width="58" height="42" aria-hidden><path fill="#f00" d="M66.5 7.7a8.6 8.6 0 0 0-6-6C55.2 0 34 0 34 0S12.8 0 7.5 1.7a8.6 8.6 0 0 0-6 6A90 90 0 0 0 0 24a90 90 0 0 0 1.5 16.3 8.6 8.6 0 0 0 6 6C12.8 48 34 48 34 48s21.2 0 26.5-1.7a8.6 8.6 0 0 0 6-6A90 90 0 0 0 68 24a90 90 0 0 0-1.5-16.3z"/><path fill="#fff" d="M27 34l18-10-18-10z"/></svg></span>
        </button>
      )
  } else {
    const kind = d.embed_type?.replace('spotify_', '') || 'track'
    inner = <iframe className="md-frame md-sp" style={{ height: kind === 'track' ? 152 : 352 }} src={`https://open.spotify.com/embed/${kind}/${d.embed_id}`} allow="autoplay; encrypted-media" />
  }

  return (
    <div className="md-media">
      {inner}
      <style jsx>{`
        .md-media{margin:14px 0}
        .md-ytbtn{position:relative;display:block;width:100%;max-width:560px;border:none;padding:0;border-radius:12px;overflow:hidden;aspect-ratio:16/9;background:#000;cursor:pointer}
        .md-ytbtn img{width:100%;height:100%;object-fit:cover;display:block;opacity:.92}
        .md-ytbtn:hover img{opacity:1}
        .md-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 2px 10px rgba(0,0,0,.6))}
        .md-frame{border:none;border-radius:12px}
        .md-yt{width:100%;max-width:560px;aspect-ratio:16/9}
        .md-sp{width:100%;max-width:560px}
      `}</style>
    </div>
  )
}

export function DetailLike({ commentId, count }: { commentId: number | null; count: number | null }) {
  const [n, setN] = useState(count || 0)
  const [liked, setLiked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState(false)
  async function toggle() {
    if (busy || !commentId) return
    setBusy(true)
    try {
      const res = await fetch('/api/comments/likes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment_id: commentId }) })
      if (res.status === 401) { setHint(true); setTimeout(() => setHint(false), 2200); return }
      const d = await res.json()
      if (res.ok) { setLiked(!!d.liked); setN(x => x + (d.liked ? 1 : -1)) }
    } catch {} finally { setBusy(false) }
  }
  return (
    <button onClick={toggle} title={hint ? 'Reikia prisijungti' : 'Patinka'}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 100, cursor: 'pointer',
        fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 13, background: liked ? 'rgba(249,115,22,0.14)' : 'var(--bg-hover)',
        border: '1px solid ' + (liked ? 'rgba(249,115,22,0.4)' : 'var(--border-default)'), color: liked ? 'var(--accent-orange)' : 'var(--text-secondary)' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
      Patinka{n > 0 ? ` · ${n}` : ''}
    </button>
  )
}
