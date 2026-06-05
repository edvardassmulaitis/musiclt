'use client'

// app/muzikos-atradimai/discoveries-client.tsx
//
// Klientinis filtravimo sluoksnis „Muzikos atradimams". Gauna pilną sąrašą iš
// serverio (viena gija ~14 įrašų) ir filtruoja vietoje: paieška / narys / metai /
// stilius / DB būsena. Stiliaus tokenai iš globals.css (veikia abiejuose temose).

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import type { Discovery, DiscoveryFacets } from '@/lib/discoveries'

function hue(s: string) { let h = 0; for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h }

function Avatar({ src, name }: { src?: string | null; name?: string | null }) {
  const nm = name || 'Narys'
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={proxyImg(src)} alt="" width={30} height={30} loading="lazy" className="ma-av" />
  }
  return <div className="ma-av ma-av-ph" style={{ background: `hsl(${hue(nm)},32%,20%)`, color: `hsl(${hue(nm)},52%,64%)` }}>{nm.charAt(0).toUpperCase()}</div>
}

function Embed({ d }: { d: Discovery }) {
  if (!d.embed_id) return null
  if (d.embed_type === 'youtube') {
    return (
      <a className="ma-yt" href={`https://youtu.be/${d.embed_id}`} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`https://i.ytimg.com/vi/${d.embed_id}/hqdefault.jpg`} loading="lazy" alt="" />
        <span className="ma-play" aria-hidden>
          <svg viewBox="0 0 68 48" width="48" height="34"><path fill="#f00" d="M66.5 7.7a8.6 8.6 0 0 0-6-6C55.2 0 34 0 34 0S12.8 0 7.5 1.7a8.6 8.6 0 0 0-6 6A90 90 0 0 0 0 24a90 90 0 0 0 1.5 16.3 8.6 8.6 0 0 0 6 6C12.8 48 34 48 34 48s21.2 0 26.5-1.7a8.6 8.6 0 0 0 6-6A90 90 0 0 0 68 24a90 90 0 0 0-1.5-16.3z"/><path fill="#fff" d="M27 34l18-10-18-10z"/></svg>
        </span>
      </a>
    )
  }
  const kind = d.embed_type === 'spotify_album' ? 'album' : d.embed_type === 'spotify_artist' ? 'artist' : 'track'
  const h = kind === 'track' ? 80 : 152
  return <iframe className="ma-sp" src={`https://open.spotify.com/embed/${kind}/${d.embed_id}`} height={h} loading="lazy" allow="encrypted-media" />
}

function Badge({ d }: { d: Discovery }) {
  if (d.resolve_state === 'unresolved') return <span className="ma-badge ma-unres">neatpažintas</span>
  if (d.is_lt) return <span className="ma-badge ma-lt">LT</span>
  if (d.resolve_state === 'needs_import') return <span className="ma-badge ma-miss">nėra DB</span>
  return null
}

export default function DiscoveriesClient({ items, facets }: { items: Discovery[]; facets: DiscoveryFacets }) {
  const [q, setQ] = useState('')
  const [member, setMember] = useState('')
  const [year, setYear] = useState('')
  const [dbState, setDbState] = useState('')
  const [genres, setGenres] = useState<Set<string>>(new Set())

  function toggleGenre(g: string) {
    setGenres(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n })
  }

  const list = useMemo(() => items.filter(d => {
    const m = d.author?.username || d.author_username
    if (member && m !== member) return false
    if (year && (d.created_at || '').slice(0, 4) !== year) return false
    const miss = d.resolve_state === 'needs_import' || d.is_lt
    if (dbState === 'miss' && !miss) return false
    if (dbState === 'indb' && (miss || d.resolve_state === 'unresolved')) return false
    if (genres.size && !d.tags.some(t => genres.has(t))) return false
    if (q) {
      const hay = `${d.artist_name || ''} ${d.track_name || ''} ${d.album_name || ''} ${d.narrative || ''} ${m || ''} ${d.tags.join(' ')}`.toLowerCase()
      if (!hay.includes(q.toLowerCase())) return false
    }
    return true
  }), [items, q, member, year, dbState, genres])

  const missCount = list.filter(d => d.resolve_state === 'needs_import' || d.is_lt).length
  const spotCount = list.filter(d => d.spotify_id).length

  return (
    <div className="ma">
      <div className="ma-controls">
        <div className="ma-row">
          <div className="ma-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Ieškoti atlikėjo, dainos, teksto…" />
          </div>
          <select value={member} onChange={e => setMember(e.target.value)} aria-label="Narys">
            <option value="">Visi nariai</option>
            {facets.members.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(e.target.value)} aria-label="Metai">
            <option value="">Visi metai</option>
            {facets.years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={dbState} onChange={e => setDbState(e.target.value)} aria-label="Būsena">
            <option value="">Visi įrašai</option>
            <option value="miss">Tik „nėra DB"</option>
            <option value="indb">Tik esantys DB</option>
          </select>
        </div>
        {facets.genres.length > 0 && (
          <div className="ma-row ma-chips">
            {facets.genres.map(g => (
              <button key={g} className={`ma-chip${genres.has(g) ? ' on' : ''}`} onClick={() => toggleGenre(g)}>{g}</button>
            ))}
          </div>
        )}
        <div className="ma-meta">
          <span>{list.length} {list.length === 1 ? 'atradimas' : (list.length >= 11 || list.length === 0 ? 'atradimų' : 'atradimai')}</span>
          <span className="ma-dot">·</span>
          <span><b>{missCount}</b> atlikėjų reikia importuoti</span>
          <span className="ma-dot">·</span>
          <span><b>{spotCount}</b> su Spotify ID</span>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="ma-empty">Nieko nerasta su šiais filtrais.</div>
      ) : (
        <div className="ma-grid">
          {list.map(d => {
            const uname = d.author?.username || d.author_username
            return (
              <article key={d.id} className="ma-card">
                <div className="ma-head">
                  <Avatar src={d.author?.avatar_url} name={uname} />
                  <div className="ma-who">
                    {uname ? <Link href={`/@${uname}`} className="ma-nm">{uname}</Link> : <span className="ma-nm">Narys</span>}
                    <span className="ma-dt">{d.created_at?.slice(0, 10)}</span>
                  </div>
                </div>
                <div className="ma-body">
                  <h3 className="ma-artist">
                    {d.artist_name
                      ? (d.artist_slug
                        ? <Link href={`/atlikejai/${d.artist_slug}`}>{d.artist_name}</Link>
                        : <span>{d.artist_name}</span>)
                      : <span className="ma-noartist">Atlikėjas neatpažintas</span>}
                    <Badge d={d} />
                  </h3>
                  {(d.track_name || d.album_name) && (
                    <div className="ma-tk">{d.track_name}{d.track_name && d.album_name ? ' · ' : ''}{d.album_name && <span className="ma-alb">{d.album_name}</span>}</div>
                  )}
                  {d.tags.length > 0 && (
                    <div className="ma-tags">
                      {d.tags.map(t => <button key={t} className="ma-tag" onClick={() => toggleGenre(t)}>{t}</button>)}
                    </div>
                  )}
                  {d.narrative && <p className="ma-narr">{d.narrative}</p>}
                  <div className="ma-embed"><Embed d={d} /></div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <style jsx>{`
        .ma-controls{background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:14px;padding:16px;margin-bottom:18px;display:flex;flex-direction:column;gap:13px}
        .ma-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
        .ma-search{flex:1;min-width:210px;display:flex;align-items:center;gap:8px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:10px;padding:9px 12px;color:var(--text-muted)}
        .ma-search input{background:none;border:none;color:var(--text-primary);outline:none;width:100%;font-size:14px}
        select{background:var(--bg-elevated);color:var(--text-primary);border:1px solid var(--border-subtle);border-radius:10px;padding:9px 12px;font-size:14px;outline:none;cursor:pointer}
        .ma-chips{gap:7px}
        .ma-chip{background:var(--bg-elevated);border:1px solid var(--border-subtle);color:var(--text-secondary);font-size:12.5px;padding:6px 11px;border-radius:20px;cursor:pointer;transition:.12s}
        .ma-chip:hover{border-color:var(--accent-orange);color:var(--text-primary)}
        .ma-chip.on{background:var(--accent-orange);border-color:var(--accent-orange);color:#1a0d04;font-weight:600}
        .ma-meta{color:var(--text-muted);font-size:13px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
        .ma-meta b{color:var(--text-primary)}
        .ma-dot{opacity:.5}
        .ma-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}
        .ma-card{background:var(--card-surface);border:1px solid var(--card-border-default);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;transition:.15s}
        .ma-card:hover{border-color:var(--border-strong)}
        .ma-head{padding:13px 15px 9px;display:flex;align-items:center;gap:10px}
        :global(.ma-av){width:30px;height:30px;border-radius:50%;object-fit:cover;flex-shrink:0}
        .ma-av-ph{display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px}
        .ma-who{display:flex;flex-direction:column;line-height:1.25}
        :global(.ma-nm){font-size:13px;font-weight:600;color:var(--text-primary);text-decoration:none}
        :global(.ma-nm:hover){color:var(--accent-orange)}
        .ma-dt{color:var(--text-muted);font-size:12px}
        .ma-body{padding:0 15px 14px;flex:1}
        .ma-artist{font-size:18px;font-weight:800;letter-spacing:-.01em;margin:2px 0 3px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;line-height:1.2}
        .ma-artist :global(a){color:var(--text-primary);text-decoration:none}
        .ma-artist :global(a:hover){color:var(--accent-orange)}
        .ma-noartist{color:var(--text-muted);font-weight:600;font-size:15px}
        .ma-tk{color:var(--accent-link);font-size:13.5px;margin-bottom:8px}
        .ma-alb{color:var(--text-muted)}
        .ma-tags{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:9px}
        .ma-tag{background:var(--bg-elevated);color:var(--text-muted);font-size:11.5px;padding:3px 9px;border-radius:14px;cursor:pointer;border:none}
        .ma-tag:hover{color:var(--accent-link)}
        .ma-badge{font-size:10px;font-weight:700;padding:3px 7px;border-radius:6px;text-transform:uppercase;letter-spacing:.03em}
        .ma-miss{background:rgba(249,115,22,.16);color:var(--accent-orange);border:1px solid rgba(249,115,22,.35)}
        .ma-lt{background:rgba(29,78,216,.18);color:var(--accent-link);border:1px solid rgba(90,142,200,.4)}
        .ma-unres{background:rgba(255,255,255,.06);color:var(--text-muted);border:1px solid var(--border-subtle)}
        .ma-narr{font-size:13.5px;line-height:1.5;color:var(--text-secondary);margin:8px 0 12px}
        .ma-embed :global(.ma-yt){position:relative;display:block;border-radius:10px;overflow:hidden;aspect-ratio:16/9;background:#000}
        .ma-embed :global(.ma-yt img){width:100%;height:100%;object-fit:cover;display:block;opacity:.86;transition:.15s}
        .ma-embed :global(.ma-yt:hover img){opacity:1}
        .ma-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 2px 8px rgba(0,0,0,.6))}
        .ma-embed :global(.ma-sp){border:none;border-radius:10px;width:100%}
        .ma-empty{text-align:center;color:var(--text-muted);padding:54px 0;font-size:15px}
      `}</style>
    </div>
  )
}
