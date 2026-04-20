'use client'
// app/atlikejai/artists-list-client.tsx

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { HeaderAuth } from '@/components/HeaderAuth'

type Artist = {
  id: number; slug: string; name: string; country?: string; type: string
  active_from?: number; active_until?: number; cover_image_url?: string
  cover_image_position?: string; is_verified?: boolean; genres: string[]
}

function parseCoverPos(pos: string): { x: number; y: number; zoom: number } {
  const parts = pos.trim().split(/\s+/)
  if (parts[0] === 'center') {
    const yMatch = pos.match(/(\d+)%/)
    const y = yMatch ? parseInt(yMatch[1]) : 20
    const last = parseFloat(parts[parts.length - 1])
    const zoom = (!isNaN(last) && last >= 1 && !parts[parts.length - 1].includes('%')) ? last : 1
    return { x: 50, y, zoom }
  }
  const pcts = pos.match(/(\d+)%/g) || []
  const x = pcts[0] ? parseInt(pcts[0]) : 50
  const y = pcts[1] ? parseInt(pcts[1]) : 20
  const last = parseFloat(parts[parts.length - 1])
  const zoom = (!isNaN(last) && last >= 1 && !parts[parts.length - 1].includes('%')) ? last : 1
  return { x, y, zoom }
}
type Genre = { id: number; name: string }

const NAV = ['Topai', 'Muzika', 'Renginiai', 'Atlikėjai', 'Bendruomenė']

export default function ArtistsListClient({ artists, genres }: { artists: Artist[]; genres: Genre[] }) {
  const [search, setSearch] = useState('')
  const [country, setCountry] = useState('all')
  const [genre, setGenre] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')

  const countries = useMemo(() => {
    const set = new Set(artists.map(a => a.country).filter(Boolean) as string[])
    return [...set].sort()
  }, [artists])

  // Only show genres that are actually used
  const usedGenres = useMemo(() => {
    const set = new Set(artists.flatMap(a => a.genres))
    return genres.filter(g => set.has(g.name))
  }, [artists, genres])

  const filtered = useMemo(() => {
    return artists.filter(a => {
      if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false
      if (country !== 'all' && a.country !== country) return false
      if (genre !== 'all' && !a.genres.includes(genre)) return false
      if (typeFilter !== 'all' && a.type !== typeFilter) return false
      return true
    })
  }, [artists, search, country, genre, typeFilter])

  const hasFilters = search || country !== 'all' || genre !== 'all' || typeFilter !== 'all'

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=DM+Sans:wght@400;500;700&display=swap');
        :root {
          --bg:#0a0e14; --bg2:#111720; --text:#f0f2f5; --text2:#b8c4d8; --text3:#6a7a94; --text4:#3a4a60;
          --border:rgba(255,255,255,0.07); --border2:rgba(255,255,255,0.04);
          --orange:#f97316; --blue:#3b82f6; --card:rgba(255,255,255,0.03);
          --font-display:'Outfit',system-ui,sans-serif; --font-body:'DM Sans',system-ui,sans-serif;
        }
        .al { background:var(--bg); color:var(--text); font-family:var(--font-body); -webkit-font-smoothing:antialiased; min-height:100vh; }

        .al-header { position:sticky; top:0; z-index:50; background:rgba(10,14,20,0.95); backdrop-filter:blur(24px); border-bottom:1px solid var(--border2); }
        .al-header-inner { max-width:1400px; margin:0 auto; padding:0 24px; height:56px; display:flex; align-items:center; gap:24px; }
        .al-logo { font-family:var(--font-display); font-size:22px; font-weight:900; letter-spacing:-.03em; text-decoration:none; flex-shrink:0; }
        .al-logo-m { color:#f2f4f8; } .al-logo-d { color:#fb923c; }
        .al-search-h { flex:1; display:flex; align-items:center; border-radius:100px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08); max-width:480px; }
        .al-search-h input { flex:1; height:36px; padding:0 16px; font-size:13px; background:transparent; border:none; outline:none; color:var(--text2); font-family:var(--font-body); }
        .al-search-h input::placeholder { color:var(--text4); }
        .al-nav { display:flex; gap:2px; margin-left:auto; }
        .al-nav a { padding:6px 14px; font-size:12px; font-weight:600; color:var(--text3); border-radius:6px; text-decoration:none; transition:all .15s; font-family:var(--font-display); }
        .al-nav a:hover { color:var(--text); background:rgba(255,255,255,0.06); }
        .al-nav a.active { color:var(--orange); }

        /* Hero banner */
        .al-hero { padding:48px 24px 32px; text-align:center; position:relative; overflow:hidden; }
        .al-hero::before { content:''; position:absolute; inset:0; background:radial-gradient(ellipse at 50% 0%, rgba(249,115,22,0.08) 0%, transparent 60%); }
        .al-hero h1 { font-family:var(--font-display); font-size:clamp(2rem,4vw,3rem); font-weight:900; letter-spacing:-.04em; position:relative; }
        .al-hero p { font-size:14px; color:var(--text3); margin-top:8px; position:relative; }

        /* Filters */
        .al-filters { max-width:1400px; margin:0 auto; padding:0 24px 24px; display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
        .al-filter-input { height:38px; padding:0 16px; border-radius:10px; font-size:13px; background:rgba(255,255,255,0.05); border:1px solid var(--border); color:var(--text2); font-family:var(--font-body); outline:none; min-width:200px; flex:1; max-width:320px; }
        .al-filter-input:focus { border-color:rgba(59,130,246,0.5); }
        .al-filter-input::placeholder { color:var(--text4); }
        .al-filter-select { height:38px; padding:0 12px; border-radius:10px; font-size:12px; font-weight:600; background:rgba(255,255,255,0.05); border:1px solid var(--border); color:var(--text2); font-family:var(--font-display); outline:none; cursor:pointer; appearance:none; padding-right:28px; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%236a7a94' stroke-width='1.5'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 10px center; }
        .al-filter-select:focus { border-color:rgba(59,130,246,0.5); }
        .al-clear { padding:6px 14px; border-radius:8px; font-size:11px; font-weight:700; background:rgba(249,115,22,0.1); border:1px solid rgba(249,115,22,0.2); color:var(--orange); cursor:pointer; font-family:var(--font-display); transition:all .2s; }
        .al-clear:hover { background:rgba(249,115,22,0.2); }
        .al-count { font-size:12px; color:var(--text4); font-weight:600; margin-left:auto; }

        /* Grid */
        .al-grid { max-width:1400px; margin:0 auto; padding:0 24px 80px; display:grid; grid-template-columns:repeat(auto-fill, minmax(180px, 1fr)); gap:16px; }
        .al-card { border-radius:14px; overflow:hidden; border:1px solid var(--border); background:var(--card); transition:all .25s; cursor:pointer; text-decoration:none; display:block; }
        .al-card:hover { transform:translateY(-4px); border-color:rgba(255,255,255,0.12); box-shadow:0 16px 40px rgba(0,0,0,.4); }
        .al-card-img { aspect-ratio:1; background:var(--bg2); position:relative; overflow:hidden; }
        .al-card-img img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .35s; }
        .al-card:hover .al-card-img img { transform:scale(1.06); }
        .al-card-noimg { width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg, var(--bg2), rgba(249,115,22,0.06)); }
        .al-card-noimg span { font-size:36px; font-weight:900; color:rgba(255,255,255,0.07); font-family:var(--font-display); }
        .al-card-verified { position:absolute; top:8px; right:8px; width:20px; height:20px; border-radius:50%; background:var(--blue); display:flex; align-items:center; justify-content:center; }
        .al-card-info { padding:12px 14px; }
        .al-card-name { font-family:var(--font-display); font-size:14px; font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .al-card-sub { font-size:11px; color:var(--text4); margin-top:3px; display:flex; align-items:center; gap:6px; }
        .al-card-genre { font-size:10px; color:var(--text3); margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

        /* Empty state */
        .al-empty { max-width:1400px; margin:0 auto; padding:80px 24px; text-align:center; }
        .al-empty-icon { font-size:48px; margin-bottom:16px; opacity:.3; }
        .al-empty h3 { font-family:var(--font-display); font-size:20px; font-weight:800; color:var(--text2); margin-bottom:6px; }
        .al-empty p { font-size:13px; color:var(--text4); }

        @media(max-width:768px) {
          .al-search-h, .al-nav { display:none; }
          .al-grid { grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); gap:10px; }
          .al-filters { flex-direction:column; }
          .al-filter-input { max-width:100%; min-width:0; }
        }
      `}</style>

      <div className="al">
        <header className="al-header">
          <div className="al-header-inner">
            <Link href="/" className="al-logo"><span className="al-logo-m">music</span><span className="al-logo-d">.lt</span></Link>
            <div className="al-search-h"><input type="text" placeholder="Ieškok atlikėjų, albumų, dainų…" /></div>
            <nav className="al-nav">
              {NAV.map(n => <a key={n} href="/" className={n === 'Atlikėjai' ? 'active' : ''}>{n}</a>)}
            </nav>
            <HeaderAuth />
          </div>
        </header>

        <div className="al-hero">
          <h1>Atlikėjai</h1>
          <p>{artists.length} atlikėjų music.lt platformoje</p>
        </div>

        <div className="al-filters">
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Ieškoti atlikėjo…" className="al-filter-input"
          />
          <select value={country} onChange={e => setCountry(e.target.value)} className="al-filter-select">
            <option value="all">🌍 Visos šalys</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={genre} onChange={e => setGenre(e.target.value)} className="al-filter-select">
            <option value="all">🎵 Visi žanrai</option>
            {usedGenres.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="al-filter-select">
            <option value="all">Visi tipai</option>
            <option value="group">🎸 Grupės</option>
            <option value="solo">🎤 Solo</option>
          </select>
          {hasFilters && (
            <button className="al-clear" onClick={() => { setSearch(''); setCountry('all'); setGenre('all'); setTypeFilter('all') }}>
              ✕ Išvalyti
            </button>
          )}
          <span className="al-count">{filtered.length} rezultatų</span>
        </div>

        {filtered.length === 0 ? (
          <div className="al-empty">
            <div className="al-empty-icon">🎤</div>
            <h3>{hasFilters ? 'Nieko nerasta' : 'Nėra atlikėjų'}</h3>
            <p>{hasFilters ? 'Pabandyk pakeisti paieškos kriterijus' : 'Pridėk pirmus atlikėjus admin panelėje'}</p>
          </div>
        ) : (
          <div className="al-grid">
            {filtered.map(a => (
              <Link key={a.id} href={`/atlikejai/${a.slug}`} className="al-card">
                <div className="al-card-img">
                  {a.cover_image_url
                    ? (() => { const p = parseCoverPos(a.cover_image_position || 'center 20%'); return <img src={a.cover_image_url} alt={a.name} style={{ objectPosition: `${p.x}% ${p.y}%`, transform: `scale(${p.zoom})`, transformOrigin: `${p.x}% ${p.y}%` }} /> })()
                    : <div className="al-card-noimg"><span>{a.name[0]}</span></div>}
                  {a.is_verified && (
                    <div className="al-card-verified">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                    </div>
                  )}
                </div>
                <div className="al-card-info">
                  <div className="al-card-name">{a.name}</div>
                  <div className="al-card-sub">
                    <span>{a.type === 'solo' ? '🎤' : '🎸'} {a.country || ''}</span>
                    {a.active_from && <span>· nuo {a.active_from}</span>}
                  </div>
                  {a.genres.length > 0 && <div className="al-card-genre">{a.genres.join(', ')}</div>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
