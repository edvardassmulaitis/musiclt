'use client'

// app/muzikos-atradimai/discoveries-client.tsx
//
// Klientinis sluoksnis „Muzikos atradimams". Atradimas = forumo komentaras:
// rodom autorių (avatar+username), komentaro santrauką, VEIKIANTĮ embed'ą
// (click-to-play), like'ą (per /api/comments/likes), relatyvią datą. Paspaudus
// kortelę — detalės puslapis. Filtrai pill stiliumi (kaip Renginiuose): paieška
// + narys. Stiliaus chip'ai rodomi tik kai yra priskirtų tagų.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import { relativeLt, type Discovery, type DiscoveryFacets } from '@/lib/discoveries'

function hue(s: string) { let h = 0; for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h }

function Avatar({ src, name, size = 30 }: { src?: string | null; name?: string | null; size?: number }) {
  const nm = name || 'Narys'
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={proxyImg(src)} alt="" width={size} height={size} loading="lazy" className="ma-av" style={{ width: size, height: size }} />
  }
  return <div className="ma-av ma-av-ph" style={{ width: size, height: size, fontSize: size * 0.42, background: `hsl(${hue(nm)},32%,20%)`, color: `hsl(${hue(nm)},52%,64%)` }}>{nm.charAt(0).toUpperCase()}</div>
}

const PLAY_SVG = (
  <svg viewBox="0 0 68 48" width="46" height="33" aria-hidden><path fill="#f00" d="M66.5 7.7a8.6 8.6 0 0 0-6-6C55.2 0 34 0 34 0S12.8 0 7.5 1.7a8.6 8.6 0 0 0-6 6A90 90 0 0 0 0 24a90 90 0 0 0 1.5 16.3 8.6 8.6 0 0 0 6 6C12.8 48 34 48 34 48s21.2 0 26.5-1.7a8.6 8.6 0 0 0 6-6A90 90 0 0 0 68 24a90 90 0 0 0-1.5-16.3z"/><path fill="#fff" d="M27 34l18-10-18-10z"/></svg>
)

function Embed({ d }: { d: Discovery }) {
  const [play, setPlay] = useState(false)
  if (!d.embed_id) return null

  if (d.embed_type === 'youtube') {
    if (play) {
      return <iframe className="ma-frame ma-frame-yt" src={`https://www.youtube.com/embed/${d.embed_id}?autoplay=1`} allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
    }
    return (
      <button className="ma-yt" onClick={e => { e.preventDefault(); setPlay(true) }} aria-label="Paleisti">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`https://i.ytimg.com/vi/${d.embed_id}/hqdefault.jpg`} loading="lazy" alt="" />
        <span className="ma-play">{PLAY_SVG}</span>
      </button>
    )
  }

  // spotify_track | spotify_album | spotify_artist | spotify_playlist
  const kind = d.embed_type?.replace('spotify_', '') || 'track'
  const h = kind === 'track' ? 152 : 152
  if (play) {
    return <iframe className="ma-frame" style={{ height: h }} src={`https://open.spotify.com/embed/${kind}/${d.embed_id}`} loading="lazy" allow="autoplay; encrypted-media" />
  }
  return (
    <button className="ma-sp" onClick={e => { e.preventDefault(); setPlay(true) }} aria-label="Paleisti Spotify">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="#1DB954" aria-hidden><path d="M12 0a12 12 0 100 24 12 12 0 000-24zm5.5 17.3a.75.75 0 01-1 .25c-2.8-1.7-6.3-2.1-10.4-1.1a.75.75 0 11-.34-1.46c4.5-1 8.4-.6 11.5 1.3.36.22.47.69.24 1.02zm1.47-3.3a.94.94 0 01-1.29.31c-3.2-2-8.1-2.5-11.9-1.36a.94.94 0 11-.54-1.8c4.3-1.3 9.7-.7 13.4 1.56.44.27.58.85.33 1.29zm.13-3.4C15.36 8.3 8.9 8.06 5.2 9.2a1.12 1.12 0 11-.65-2.15c4.2-1.28 11.4-1.03 15.9 1.6a1.12 1.12 0 01-1.14 1.93z"/></svg>
      <span>Paleisti Spotify</span>
    </button>
  )
}

function LikeBtn({ commentId, count }: { commentId: number | null; count: number | null }) {
  const [n, setN] = useState(count || 0)
  const [liked, setLiked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState(false)
  async function toggle(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
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
    <button className={`ma-like${liked ? ' on' : ''}`} onClick={toggle} title={hint ? 'Reikia prisijungti' : 'Patinka'}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
      {n > 0 && <span>{n}</span>}
    </button>
  )
}

export default function DiscoveriesClient({ items, facets }: { items: Discovery[]; facets: DiscoveryFacets }) {
  const [q, setQ] = useState('')
  const [member, setMember] = useState('')
  const [genres, setGenres] = useState<Set<string>>(new Set())
  const [limit, setLimit] = useState(24)

  function toggleGenre(g: string) { setGenres(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n }) }

  const list = useMemo(() => items.filter(d => {
    if (member && d.author?.username !== member) return false
    if (genres.size && !d.tags.some(t => genres.has(t))) return false
    if (q) {
      const hay = `${d.artist_name || ''} ${d.track_name || ''} ${d.album_name || ''} ${d.body || ''} ${d.author?.username || ''} ${d.tags.join(' ')}`.toLowerCase()
      if (!hay.includes(q.toLowerCase())) return false
    }
    return true
  }), [items, q, member, genres])

  const shown = list.slice(0, limit)
  const hasFilters = q || member || genres.size > 0

  return (
    <div className="ma">
      <div className="ma-bar">
        <div className="ma-search-wrap">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input value={q} onChange={e => { setQ(e.target.value); setLimit(24) }} placeholder="Ieškoti atlikėjo, dainos, teksto…" />
        </div>
        <div className="ma-chiprow">
          <button className={`ma-fchip${member === '' ? ' on' : ''}`} onClick={() => setMember('')}>Visi nariai</button>
          {facets.members.map(m => (
            <button key={m} className={`ma-fchip${member === m ? ' on' : ''}`} onClick={() => { setMember(member === m ? '' : m); setLimit(24) }}>{m}</button>
          ))}
        </div>
        {facets.genres.length > 0 && (
          <div className="ma-chiprow">
            {facets.genres.map(g => (
              <button key={g} className={`ma-fchip${genres.has(g) ? ' on' : ''}`} onClick={() => { toggleGenre(g); setLimit(24) }}>{g}</button>
            ))}
          </div>
        )}
        <div className="ma-meta">
          <span className="ma-count">{list.length} atradim{list.length === 1 ? 'as' : (list.length % 10 === 0 || list.length >= 11 ? 'ų' : 'ai')}</span>
          {hasFilters && <button className="ma-reset" onClick={() => { setQ(''); setMember(''); setGenres(new Set()); setLimit(24) }}>Išvalyti</button>}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="ma-empty">Nieko nerasta su šiais filtrais.</div>
      ) : (
        <div className="ma-grid">
          {shown.map(d => {
            const uname = d.author?.username
            const when = relativeLt(d.created_at)
            return (
              <article key={d.id} className="ma-card">
                <div className="ma-head">
                  <Avatar src={d.author?.avatar_url} name={uname} />
                  <div className="ma-who">
                    {uname ? <Link href={`/@${uname}`} className="ma-nm">{uname}</Link> : <span className="ma-nm">Narys</span>}
                    {when && <span className="ma-dt">{when}</span>}
                  </div>
                  <LikeBtn commentId={d.comment_id} count={d.like_count} />
                </div>
                <div className="ma-embed"><Embed d={d} /></div>
                <Link href={`/muzikos-atradimai/${d.id}`} className="ma-body">
                  {(d.artist_name || d.track_name) && (
                    <div className="ma-title">
                      {d.artist_slug && d.artist_name ? <span className="ma-art">{d.artist_name}</span> : (d.artist_name && <span className="ma-art">{d.artist_name}</span>)}
                      {d.track_name && <span className="ma-tk"> — {d.track_name}</span>}
                    </div>
                  )}
                  {d.body && <p className="ma-narr">{d.body}</p>}
                  {d.tags.length > 0 && <div className="ma-tags">{d.tags.slice(0, 4).map(t => <span key={t} className="ma-tag">{t}</span>)}</div>}
                </Link>
              </article>
            )
          })}
        </div>
      )}

      {shown.length < list.length && (
        <div className="ma-more"><button onClick={() => setLimit(l => l + 24)}>Rodyti daugiau ({list.length - shown.length})</button></div>
      )}

      <style jsx>{`
        .ma-bar{display:flex;flex-direction:column;gap:11px;margin-bottom:18px}
        .ma-search-wrap{display:flex;align-items:center;gap:8px;background:var(--bg-hover);border:1px solid var(--border-default);border-radius:10px;padding:9px 12px;color:var(--text-muted);max-width:420px}
        .ma-search-wrap input{background:none;border:none;color:var(--text-primary);outline:none;width:100%;font-size:13.5px}
        .ma-chiprow{display:flex;gap:7px;flex-wrap:wrap}
        .ma-fchip{display:inline-flex;align-items:center;padding:6px 13px;border-radius:100px;font-size:12.5px;font-weight:600;font-family:'Outfit',sans-serif;background:var(--bg-hover);border:1px solid var(--border-default);color:var(--text-secondary);transition:all .15s;white-space:nowrap;cursor:pointer}
        .ma-fchip:hover{color:var(--text-primary);border-color:rgba(249,115,22,0.4)}
        .ma-fchip.on{background:var(--accent-orange);border-color:var(--accent-orange);color:#fff}
        .ma-meta{display:flex;align-items:center;gap:10px}
        .ma-count{font-size:12px;font-weight:700;color:var(--text-faint);font-family:'Outfit',sans-serif;background:var(--bg-hover);border-radius:100px;padding:4px 11px}
        .ma-reset{padding:5px 11px;border-radius:100px;font-size:12px;font-weight:700;font-family:'Outfit',sans-serif;color:var(--accent-orange);background:transparent;border:none;cursor:pointer}
        .ma-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}
        .ma-card{background:var(--card-surface);border:1px solid var(--card-border-default);border-radius:14px;overflow:hidden;display:flex;flex-direction:column}
        .ma-card:hover{border-color:var(--border-strong)}
        .ma-head{display:flex;align-items:center;gap:9px;padding:12px 14px 10px}
        :global(.ma-av){border-radius:50%;object-fit:cover;flex-shrink:0}
        .ma-av-ph{display:flex;align-items:center;justify-content:center;font-weight:800;border-radius:50%;flex-shrink:0}
        .ma-who{display:flex;flex-direction:column;line-height:1.25;min-width:0;flex:1}
        :global(.ma-nm){font-size:13px;font-weight:600;color:var(--text-primary);text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        :global(.ma-nm:hover){color:var(--accent-orange)}
        .ma-dt{color:var(--text-muted);font-size:11.5px}
        .ma-embed{padding:0 14px}
        .ma-embed :global(.ma-yt){position:relative;display:block;width:100%;border:none;padding:0;border-radius:10px;overflow:hidden;aspect-ratio:16/9;background:#000;cursor:pointer}
        .ma-embed :global(.ma-yt img){width:100%;height:100%;object-fit:cover;display:block;opacity:.9;transition:.15s}
        .ma-embed :global(.ma-yt:hover img){opacity:1}
        .ma-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 2px 8px rgba(0,0,0,.6))}
        .ma-embed :global(.ma-sp){display:flex;align-items:center;justify-content:center;gap:9px;width:100%;height:64px;border-radius:10px;border:1px solid var(--border-default);background:var(--bg-hover);color:var(--text-primary);font-weight:700;font-size:13px;font-family:'Outfit',sans-serif;cursor:pointer}
        .ma-embed :global(.ma-sp:hover){border-color:#1DB954}
        .ma-embed :global(.ma-frame){width:100%;border:none;border-radius:10px;aspect-ratio:16/9}
        .ma-embed :global(.ma-frame[style]){aspect-ratio:auto}
        .ma-body{display:block;padding:11px 14px 14px;text-decoration:none}
        .ma-title{font-family:'Outfit',sans-serif;font-size:15px;font-weight:800;letter-spacing:-.01em;color:var(--text-primary);margin-bottom:5px;line-height:1.25}
        .ma-body:hover .ma-art{color:var(--accent-orange)}
        .ma-tk{color:var(--text-secondary);font-weight:600}
        .ma-narr{font-size:13px;line-height:1.5;color:var(--text-secondary);margin:0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
        .ma-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}
        .ma-tag{background:var(--bg-hover);color:var(--text-muted);font-size:11px;padding:2px 8px;border-radius:12px}
        .ma-like{display:inline-flex;align-items:center;gap:4px;background:transparent;border:none;cursor:pointer;color:var(--text-muted);font-size:12px;font-weight:700;font-family:'Outfit',sans-serif;padding:4px 6px;border-radius:8px;flex-shrink:0}
        .ma-like:hover{color:var(--accent-orange);background:var(--bg-hover)}
        .ma-like.on{color:var(--accent-orange)}
        .ma-more{display:flex;justify-content:center;margin-top:24px}
        .ma-more button{padding:10px 22px;border-radius:100px;font-size:13px;font-weight:700;font-family:'Outfit',sans-serif;background:var(--bg-hover);border:1px solid var(--border-default);color:var(--text-primary);cursor:pointer}
        .ma-more button:hover{border-color:var(--accent-orange)}
        .ma-empty{text-align:center;color:var(--text-muted);padding:54px 0;font-size:15px}
      `}</style>
    </div>
  )
}
