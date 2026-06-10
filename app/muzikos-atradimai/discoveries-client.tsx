'use client'

// app/muzikos-atradimai/discoveries-client.tsx
//
// Atradimas = forumo komentaras. Kortelė: autorius (avatar+username) + relatyvi
// data + LikePill (forumo like+skaičius); VEIKIANTIS embed (YT click-to-play,
// Spotify tiesioginis); pilnas komentaras (nenukirptas); atlikėjas—daina.
// Filtrų juosta — Renginių (ev-fbar) stiliaus: viena kompaktiška dėžutė su
// paieška + Narys/Stilius popover chip'ais + count + „Pridėti atradimą" CTA.
// Naujas atradimas po formos submit'o iškart prepend'inamas sąrašo viršuje.

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import { LikePill } from '@/components/LikePill'
import { relativeLt, type Discovery, type DiscoveryFacets } from '@/lib/discoveries'
import MissingForm from './missing-form'
import AddDiscovery from './add-discovery'

function hue(s: string) { let h = 0; for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h }

function Avatar({ src, name, size = 32 }: { src?: string | null; name?: string | null; size?: number }) {
  const nm = name || 'Narys'
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={proxyImg(src)} alt="" width={size} height={size} loading="lazy" className="ma-av" style={{ width: size, height: size }} />
  }
  return <div className="ma-av ma-av-ph" style={{ width: size, height: size, fontSize: size * 0.42, background: `hsl(${hue(nm)},32%,20%)`, color: `hsl(${hue(nm)},52%,64%)` }}>{nm.charAt(0).toUpperCase()}</div>
}

function Embed({ d }: { d: Discovery }) {
  const [play, setPlay] = useState(false)
  if (!d.embed_id) return null

  if (d.embed_type === 'youtube') {
    if (play) {
      return <iframe className="ma-frame" src={`https://www.youtube.com/embed/${d.embed_id}?autoplay=1`} allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
    }
    return (
      <button className="ma-yt" onClick={() => setPlay(true)} aria-label="Paleisti">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`https://i.ytimg.com/vi/${d.embed_id}/hqdefault.jpg`} loading="lazy" alt="" />
        <span className="ma-play"><svg viewBox="0 0 68 48" width="46" height="33" aria-hidden><path fill="#f00" d="M66.5 7.7a8.6 8.6 0 0 0-6-6C55.2 0 34 0 34 0S12.8 0 7.5 1.7a8.6 8.6 0 0 0-6 6A90 90 0 0 0 0 24a90 90 0 0 0 1.5 16.3 8.6 8.6 0 0 0 6 6C12.8 48 34 48 34 48s21.2 0 26.5-1.7a8.6 8.6 0 0 0 6-6A90 90 0 0 0 68 24a90 90 0 0 0-1.5-16.3z"/><path fill="#fff" d="M27 34l18-10-18-10z"/></svg></span>
      </button>
    )
  }

  // Spotify — tiesioginis iframe (kompaktiškas)
  const kind = d.embed_type?.replace('spotify_', '') || 'track'
  return <iframe className="ma-sp" style={{ height: kind === 'track' ? 152 : 232 }} src={`https://open.spotify.com/embed/${kind}/${d.embed_id}`} loading="lazy" allow="autoplay; encrypted-media" />
}

function CardLike({ commentId, count, liked }: { commentId: number | null; count: number | null; liked: boolean }) {
  const [n, setN] = useState(count || 0)
  const [self, setSelf] = useState(liked)
  const [pending, setPending] = useState(false)
  useEffect(() => { setSelf(liked) }, [liked])
  async function toggle() {
    if (pending || !commentId) return
    setPending(true)
    try {
      const res = await fetch('/api/comments/likes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment_id: commentId }) })
      if (res.status === 401) return
      const d = await res.json()
      if (res.ok) { setSelf(!!d.liked); setN(x => x + (d.liked ? 1 : -1)) }
    } catch {} finally { setPending(false) }
  }
  return <LikePill likes={n} selfLiked={self} onToggle={toggle} pending={pending} variant="surface" />
}

// Renginių stiliaus popover chip'as su paieška (Narys / Stilius).
function FilterPopover({ id, openId, setOpenId, label, icon, value, options, onPick }: {
  id: string; openId: string | null; setOpenId: (v: string | null) => void
  label: string; icon?: React.ReactNode; value: string; options: string[]; onPick: (v: string) => void
}) {
  const [s, setS] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const open = openId === id
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpenId(null) }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpenId(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onEsc) }
  }, [open, setOpenId])
  const filtered = options.filter(o => o.toLowerCase().includes(s.toLowerCase()))
  return (
    <div className="ma-popwrap" ref={ref}>
      <button type="button" className={`ma-chip${value ? ' on' : ''}`} onClick={() => setOpenId(open ? null : id)}>
        {icon}<span className="ma-chip-lbl">{value ? `${label}: ${value}` : label}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ opacity: .7 }}><path d="m6 9 6 6 6-6"/></svg>
      </button>
      {open && (
        <div className="ma-pop">
          <input className="ma-pop-search" value={s} onChange={e => setS(e.target.value)} placeholder="Ieškoti…" autoFocus />
          <div className="ma-pop-list">
            <button className={`ma-opt${value === '' ? ' on' : ''}`} onClick={() => { onPick(''); setOpenId(null); setS('') }}>Visi</button>
            {filtered.map(o => (
              <button key={o} className={`ma-opt${value === o ? ' on' : ''}`} onClick={() => { onPick(o); setOpenId(null); setS('') }}>{o}</button>
            ))}
            {filtered.length === 0 && <span className="ma-pop-empty">Nerasta</span>}
          </div>
        </div>
      )}
    </div>
  )
}

const IconUser = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>
const IconNote = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>

export default function DiscoveriesClient({ items, facets }: { items: Discovery[]; facets: DiscoveryFacets }) {
  const [q, setQ] = useState('')
  const [member, setMember] = useState('')
  const [style, setStyle] = useState('')
  const [limit, setLimit] = useState(24)
  const [openId, setOpenId] = useState<string | null>(null)
  const [likedSet, setLikedSet] = useState<Set<number>>(new Set())
  // Ką tik per formą pridėti atradimai — prepend'inami viršuje iškart,
  // kol ISR revalidate atneš juos su server data.
  const [added, setAdded] = useState<Discovery[]>([])

  const allItems = useMemo(() => {
    if (added.length === 0) return items
    const ids = new Set(added.map(a => a.id))
    return [...added, ...items.filter(i => !ids.has(i.id))]
  }, [items, added])

  // Batch: kuriuos komentarus žiūrintysis jau pamėgo
  useEffect(() => {
    const ids = allItems.map(i => i.comment_id).filter(Boolean) as number[]
    if (!ids.length) return
    fetch(`/api/comments/likes?ids=${ids.join(',')}`).then(r => r.json())
      .then(d => setLikedSet(new Set<number>(d.liked_ids || []))).catch(() => {})
  }, [allItems])

  const list = useMemo(() => allItems.filter(d => {
    if (member && d.author?.username !== member) return false
    if (style && !d.tags.includes(style)) return false
    if (q) {
      const hay = `${d.artist_name || ''} ${d.track_name || ''} ${d.album_name || ''} ${d.body || ''} ${d.author?.username || ''} ${d.tags.join(' ')}`.toLowerCase()
      if (!hay.includes(q.toLowerCase())) return false
    }
    return true
  }), [allItems, q, member, style])

  const shown = list.slice(0, limit)
  const hasFilters = q || member || style

  function handleAdded(d: Discovery) {
    setAdded(prev => [d, ...prev])
    // Išvalom filtrus, kad naujas atradimas garantuotai matytųsi viršuje
    setQ(''); setMember(''); setStyle(''); setLimit(24)
  }

  return (
    <div className="ma">
      {/* ── Kompaktiška filtrų juosta (Renginių stilius) ── */}
      <div className="ma-fbar">
        <div className="ma-search-wrap">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input value={q} onChange={e => { setQ(e.target.value); setLimit(24) }} placeholder="Ieškoti atlikėjo, dainos, teksto…" />
        </div>

        <span className="ma-divider" />

        <FilterPopover id="member" openId={openId} setOpenId={setOpenId} label="Narys" icon={IconUser} value={member} options={facets.members} onPick={v => { setMember(v); setLimit(24) }} />
        {facets.genres.length > 0 && (
          <FilterPopover id="style" openId={openId} setOpenId={setOpenId} label="Stilius" icon={IconNote} value={style} options={facets.genres} onPick={v => { setStyle(v); setLimit(24) }} />
        )}

        {hasFilters && <button className="ma-reset" onClick={() => { setQ(''); setMember(''); setStyle(''); setLimit(24) }}>Išvalyti ✕</button>}

        <span className="ma-count">{list.length}</span>
        <AddDiscovery onAdded={handleAdded} />
      </div>

      {shown.length === 0 ? (
        <div className="ma-empty">Nieko nerasta su šiais filtrais.</div>
      ) : (
        <div className="ma-grid">
          {shown.map(d => {
            const uname = d.author?.username
            const when = relativeLt(d.created_at)
            const fresh = added.some(a => a.id === d.id)
            return (
              <article key={d.id} className={`ma-card${fresh ? ' ma-fresh' : ''}`}>
                <div className="ma-head">
                  <Avatar src={d.author?.avatar_url} name={uname} />
                  <div className="ma-who">
                    {uname ? <Link href={`/@${uname}`} className="ma-nm">{uname}</Link> : <span className="ma-nm">Narys</span>}
                    {when && <span className="ma-dt">{when}</span>}
                  </div>
                  <CardLike commentId={d.comment_id} count={d.like_count} liked={d.comment_id ? likedSet.has(d.comment_id) : false} />
                </div>

                <div className="ma-embed"><Embed d={d} /></div>

                <div className="ma-body">
                  {(d.artist_name || d.track_name) && (
                    <div className="ma-title">
                      {d.artist_name && (d.artist_slug
                        ? <Link href={`/atlikejai/${d.artist_slug}`} className="ma-art">{d.artist_name}</Link>
                        : <span className="ma-art">{d.artist_name}</span>)}
                      {d.artist_name && d.track_name && <span className="ma-sep"> — </span>}
                      {d.track_name && (d.track_slug
                        ? <Link href={`/dainos/${d.track_slug}`} className="ma-tk ma-tk-link">{d.track_name} ♪</Link>
                        : <span className="ma-tk">{d.track_name}</span>)}
                    </div>
                  )}
                  {d.body && <p className="ma-narr">{d.body}</p>}
                  {d.tags.length > 0 && <div className="ma-tags">{d.tags.slice(0, 4).map(t => <button key={t} className="ma-tag" onClick={() => { setStyle(t); setLimit(24); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>{t}</button>)}</div>}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {shown.length < list.length && (
        <div className="ma-more"><button onClick={() => setLimit(l => l + 24)}>Rodyti daugiau ({list.length - shown.length})</button></div>
      )}

      <div className="ma-foot">
        <span>Matai, kad kažko trūksta duombazėje?</span>
        <MissingForm />
      </div>

      <style jsx>{`
        /* Filtrų juosta — Renginių (ev-fbar) stilius */
        .ma-fbar{display:flex;flex-wrap:wrap;gap:7px;align-items:center;padding:11px 12px;border-radius:14px;background:var(--bg-surface);border:1px solid var(--border-default,rgba(255,255,255,0.08));margin-bottom:22px}
        .ma-divider{width:1px;height:22px;background:var(--border-default,rgba(255,255,255,0.1));margin:0 2px}
        .ma-search-wrap{display:flex;align-items:center;gap:8px;background:var(--bg-hover);border:1px solid var(--border-default);border-radius:100px;padding:6px 13px;color:var(--text-muted);flex:1;min-width:180px;max-width:320px}
        .ma-search-wrap input{background:none;border:none;color:var(--text-primary);outline:none;width:100%;font-size:13px}
        :global(.ma-popwrap){position:relative;display:inline-flex}
        :global(.ma-chip){display:inline-flex;align-items:center;gap:6px;padding:6px 13px;border-radius:100px;font-size:12.5px;font-weight:600;font-family:'Outfit',sans-serif;background:var(--bg-hover);border:1px solid var(--border-default,rgba(255,255,255,0.08));color:var(--text-secondary);transition:all .15s;white-space:nowrap;cursor:pointer;line-height:1.3;max-width:240px}
        :global(.ma-chip svg){display:block;flex-shrink:0}
        :global(.ma-chip-lbl){overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        :global(.ma-chip:hover){color:var(--text-primary);border-color:rgba(249,115,22,0.4)}
        :global(.ma-chip.on){background:var(--accent-orange);border-color:var(--accent-orange);color:#fff}
        .ma-reset{padding:6px 11px;border-radius:100px;font-size:12px;font-weight:700;font-family:'Outfit',sans-serif;color:var(--accent-orange);background:transparent;border:none;cursor:pointer;white-space:nowrap}
        .ma-count{margin-left:auto;font-size:12px;font-weight:700;color:var(--text-faint);font-family:'Outfit',sans-serif;background:var(--bg-hover);border-radius:100px;padding:4px 11px}
        :global(.ma-pop){position:absolute;top:calc(100% + 8px);left:0;z-index:60;width:240px;padding:12px;background:var(--bg-surface);border:1px solid var(--border-default,rgba(255,255,255,0.1));border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.32)}
        :global(.ma-pop-search){width:100%;height:34px;border-radius:9px;padding:0 11px;font-size:13px;margin-bottom:8px;background:var(--bg-hover);border:1px solid var(--border-default);color:var(--text-primary);outline:none}
        :global(.ma-pop-list){display:flex;flex-direction:column;gap:2px;max-height:260px;overflow-y:auto}
        :global(.ma-opt){text-align:left;padding:8px 10px;border-radius:9px;font-size:13px;font-weight:600;font-family:'Outfit',sans-serif;cursor:pointer;background:transparent;border:none;color:var(--text-secondary);transition:all .12s}
        :global(.ma-opt:hover){background:var(--bg-hover);color:var(--text-primary)}
        :global(.ma-opt.on){color:var(--accent-orange)}
        :global(.ma-pop-empty){color:var(--text-muted);font-size:12.5px;padding:8px 10px}
        .ma-foot{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;margin-top:40px;padding-top:24px;border-top:1px solid var(--border-subtle);color:var(--text-muted);font-size:13px}
        .ma-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px;align-items:start}
        .ma-card{background:var(--card-surface);border:1px solid var(--card-border-default);border-radius:14px;overflow:hidden;display:flex;flex-direction:column}
        .ma-card:hover{border-color:var(--border-strong)}
        .ma-fresh{border-color:rgba(249,115,22,0.55);box-shadow:0 0 0 1px rgba(249,115,22,0.35)}
        .ma-head{display:flex;align-items:center;gap:9px;padding:13px 14px 11px}
        :global(.ma-av){border-radius:50%;object-fit:cover;flex-shrink:0}
        :global(.ma-av-ph){display:flex;align-items:center;justify-content:center;font-weight:800;border-radius:50%;flex-shrink:0}
        .ma-who{display:flex;flex-direction:column;line-height:1.25;min-width:0;flex:1}
        :global(.ma-nm){font-size:13.5px;font-weight:700;color:var(--text-primary);text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        :global(.ma-nm:hover){color:var(--accent-orange)}
        .ma-dt{color:var(--text-muted);font-size:11.5px}
        .ma-embed{padding:0 14px;min-height:8px}
        .ma-embed :global(.ma-yt){position:relative;display:block;width:100%;border:none;padding:0;border-radius:10px;overflow:hidden;aspect-ratio:16/9;background:#000;cursor:pointer}
        .ma-embed :global(.ma-yt img){width:100%;height:100%;object-fit:cover;display:block;opacity:.92;transition:.15s}
        .ma-embed :global(.ma-yt:hover img){opacity:1}
        .ma-embed :global(.ma-play){position:absolute;inset:0;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 2px 8px rgba(0,0,0,.6))}
        .ma-embed :global(.ma-frame){width:100%;border:none;border-radius:10px;aspect-ratio:16/9}
        .ma-embed :global(.ma-sp){width:100%;border:none;border-radius:12px}
        .ma-body{padding:12px 15px 15px}
        .ma-title{font-family:'Outfit',sans-serif;font-size:15.5px;font-weight:800;letter-spacing:-.01em;margin-bottom:7px;line-height:1.3}
        :global(.ma-art){color:var(--text-primary);text-decoration:none}
        :global(a.ma-art:hover){color:var(--accent-orange)}
        .ma-sep{color:var(--text-faint)}
        .ma-tk{color:var(--text-secondary);font-weight:700}
        :global(a.ma-tk-link){color:var(--text-secondary);text-decoration:none}
        :global(a.ma-tk-link:hover){color:var(--accent-orange)}
        .ma-narr{font-size:13.5px;line-height:1.6;color:var(--text-secondary);margin:0;white-space:pre-wrap;word-break:break-word}
        .ma-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:11px}
        .ma-tag{background:var(--bg-hover);color:var(--text-muted);font-size:11px;padding:3px 9px;border-radius:12px;border:none;cursor:pointer;font-family:'Outfit',sans-serif}
        .ma-tag:hover{color:var(--accent-orange)}
        .ma-more{display:flex;justify-content:center;margin-top:24px}
        .ma-more button{padding:10px 22px;border-radius:100px;font-size:13px;font-weight:700;font-family:'Outfit',sans-serif;background:var(--bg-hover);border:1px solid var(--border-default);color:var(--text-primary);cursor:pointer}
        .ma-more button:hover{border-color:var(--accent-orange)}
        .ma-empty{text-align:center;color:var(--text-muted);padding:54px 0;font-size:15px}
      `}</style>
    </div>
  )
}
