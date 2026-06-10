'use client'

// app/muzikos-atradimai/discoveries-client.tsx
//
// Atradimas = forumo komentaras. LAYOUT — forumo stiliaus EILUTĖS (rows):
// kairėje embed (YT click-to-play / Spotify), viduryje autorius + pilnas
// komentaras (clamp + „Skaityti daugiau"), dešinėje susietas atlikėjas
// (foto + vardas + oficialūs stiliai + ryšys „dar N atradimų"). Filtrų
// juosta — Renginių (ev-fbar) stilius + rūšiavimas Naujausi/Populiariausi.
// Naujas atradimas po formos submit'o iškart prepend'inamas viršuje.

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { useSession } from 'next-auth/react'
import { proxyImg } from '@/lib/img-proxy'
import { LikePill } from '@/components/LikePill'
import LikesModal, { type LikeUser } from '@/components/LikesModal'
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
  const [modal, setModal] = useState(false)
  const [users, setUsers] = useState<LikeUser[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => { setSelf(liked) }, [liked])
  useEffect(() => { setN(count || 0) }, [count])
  async function toggle() {
    if (pending || !commentId) return
    setPending(true)
    try {
      const res = await fetch('/api/comments/likes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment_id: commentId }) })
      if (res.status === 401) return
      const d = await res.json()
      if (res.ok) { setSelf(!!d.liked); setN(x => Math.max(0, x + (d.liked ? 1 : -1))) }
    } catch {} finally { setPending(false) }
  }
  // Count zona — atidaro „kas pamėgo" modalą
  async function openLikers() {
    if (!commentId) return
    setModal(true); setLoading(true)
    try {
      const d = await fetch(`/api/comments/likes?likers=${commentId}`).then(r => r.json())
      setUsers(d.users || [])
      if (typeof d.count === 'number') setN(c => Math.max(c, d.count))
    } catch {} finally { setLoading(false) }
  }
  return (
    <>
      <LikePill likes={n} selfLiked={self} onToggle={toggle} pending={pending} variant="surface" onOpenModal={commentId ? openLikers : undefined} />
      <LikesModal open={modal} onClose={() => setModal(false)} title="Patinka" count={n} users={users} loading={loading} selfLiked={self} authed onToggleSelfLike={toggle} selfLikePending={pending} />
    </>
  )
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

// Ilgas komentaras — clamp'inam iki 8 eilučių. Ar tekstas TIKRAI netelpa,
// matuojam per DOM (scrollHeight > clientHeight), ne per simbolių skaičių —
// kitaip mygtukas rodydavosi tekstams, kurie ir taip telpa.
function ClampText({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const ref = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => { if (!open) setOverflows(el.scrollHeight > el.clientHeight + 2) }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text, open])
  return (
    <>
      <p ref={ref} className={`ma-narr${!open ? ' ma-clamp' : ''}`}>{text}</p>
      {(overflows || open) && (
        <button className="ma-readmore" onClick={() => setOpen(o => !o)}>
          {open ? 'Suskleisti ↑' : 'Skaityti daugiau ↓'}
        </button>
      )}
    </>
  )
}

// Atlikėjo panelė eilutės dešinėje: foto + vardas + oficialūs stiliai +
// ryšys su kitais to paties atlikėjo atradimais.
function ArtistAside({ d, moreCount, onMore }: { d: Discovery; moreCount: number; onMore: () => void }) {
  const nm = d.artist_name || '?'
  return (
    <aside className="ma-aside">
      <Link href={`/atlikejai/${d.artist_slug}`} className="ma-aside-link">
        {d.artist_cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyImg(d.artist_cover)} alt="" width={56} height={56} loading="lazy" className="ma-aside-img" />
        ) : (
          <span className="ma-aside-img ma-aside-ph" style={{ background: `hsl(${hue(nm)},32%,20%)`, color: `hsl(${hue(nm)},52%,64%)` }}>{nm.charAt(0).toUpperCase()}</span>
        )}
        <span className="ma-aside-nm">{nm}</span>
      </Link>
      {d.artist_styles.length > 0 && (
        <div className="ma-aside-styles">
          {d.artist_styles.slice(0, 3).map(s => <span key={s} className="ma-style">{s}</span>)}
        </div>
      )}
      {moreCount > 0 && (
        <button className="ma-aside-more" onClick={onMore}>
          + dar {moreCount} atradim{moreCount === 1 ? 'as' : (moreCount % 10 === 0 || moreCount >= 11 ? 'ų' : 'ai')}
        </button>
      )}
    </aside>
  )
}

// Modalas su visais to paties atlikėjo atradimais — atsidaro paspaudus
// „+ dar N atradimai" (sąrašo turinys nesikeičia, layout'as nesigriauna).
function ArtistDiscoveriesModal({ src, items, likedSet, onClose }: {
  src: Discovery; items: Discovery[]; likedSet: Set<number>; onClose: () => void
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [onClose])
  if (typeof document === 'undefined') return null
  const nm = src.artist_name || '?'
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8"
      style={{ background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex max-h-[90vh] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.6)]">
        <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
          {src.artist_cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proxyImg(src.artist_cover)} alt="" width={44} height={44} className="h-11 w-11 flex-shrink-0 rounded-xl object-cover" />
          ) : (
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl font-extrabold" style={{ background: `hsl(${hue(nm)},32%,20%)`, color: `hsl(${hue(nm)},52%,64%)` }}>{nm.charAt(0).toUpperCase()}</span>
          )}
          <div className="min-w-0 flex-1">
            <div className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.15em] text-[var(--text-muted)]">Muzikos atradimai · {items.length}</div>
            {src.artist_slug
              ? <Link href={`/atlikejai/${src.artist_slug}`} className="block truncate font-['Outfit',sans-serif] text-[17px] font-extrabold text-[var(--text-primary)] no-underline hover:text-[var(--accent-orange)]">{nm}</Link>
              : <div className="truncate font-['Outfit',sans-serif] text-[17px] font-extrabold text-[var(--text-primary)]">{nm}</div>}
          </div>
          {src.artist_styles.length > 0 && (
            <div className="hidden flex-wrap justify-end gap-1.5 sm:flex">
              {src.artist_styles.slice(0, 3).map(s => <span key={s} className="ma-style">{s}</span>)}
            </div>
          )}
          <button
            onClick={onClose}
            aria-label="Uždaryti"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] border border-[var(--border-subtle)] bg-transparent text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5">
          <div className="flex flex-col gap-4">
            {items.map(d => {
              const uname = d.author?.username
              const when = relativeLt(d.created_at)
              return (
                <article key={d.id} className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-hover)] p-3.5">
                  <div className="mb-2.5 flex items-center gap-2.5">
                    <Avatar src={d.author?.avatar_url} name={uname} size={28} />
                    <div className="flex min-w-0 flex-1 items-baseline gap-2">
                      {uname ? <Link href={`/@${uname}`} className="ma-nm">{uname}</Link> : <span className="ma-nm">Narys</span>}
                      {when && <span className="text-[11px] text-[var(--text-muted)]">{when}</span>}
                    </div>
                    <CardLike commentId={d.comment_id} count={d.like_count} liked={d.comment_id ? likedSet.has(d.comment_id) : false} />
                  </div>
                  {d.embed_id && <div className="mb-2.5"><Embed d={d} /></div>}
                  {d.track_name && (
                    <div className="mb-1 font-['Outfit',sans-serif] text-[14px] font-extrabold text-[var(--text-primary)]">
                      {d.track_slug
                        ? <Link href={`/dainos/${d.track_slug}`} className="no-underline hover:text-[var(--accent-orange)]" style={{ color: 'inherit' }}>{d.track_name} ♪</Link>
                        : <>{d.track_name}</>}
                    </div>
                  )}
                  {d.body && <ClampText text={d.body} />}
                </article>
              )
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

type Sort = 'new' | 'top'

export default function DiscoveriesClient({ items, facets }: { items: Discovery[]; facets: DiscoveryFacets }) {
  const { data: session } = useSession()
  const isAdmin = ['admin', 'super_admin'].includes(((session?.user as any)?.role) || '')
  const [q, setQ] = useState('')
  const [member, setMember] = useState('')
  const [style, setStyle] = useState('')
  const [sort, setSort] = useState<Sort>('new')
  const [limit, setLimit] = useState(20)
  const [openId, setOpenId] = useState<string | null>(null)
  const [likedSet, setLikedSet] = useState<Set<number>>(new Set())
  // „+ dar N atradimai" modalas — src discovery, iš kurio paimam atlikėją
  const [artistModal, setArtistModal] = useState<Discovery | null>(null)
  // Admin paslėpti atradimai (optimistinis pašalinimas iš sąrašo)
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set())
  // Ką tik per formą pridėti atradimai — prepend'inami viršuje iškart,
  // kol ISR revalidate atneš juos su server data.
  const [added, setAdded] = useState<Discovery[]>([])

  const allItems = useMemo(() => {
    let base = items
    if (added.length > 0) {
      const ids = new Set(added.map(a => a.id))
      base = [...added, ...items.filter(i => !ids.has(i.id))]
    }
    return hiddenIds.size ? base.filter(i => !hiddenIds.has(i.id)) : base
  }, [items, added, hiddenIds])

  // Kiek atradimų turi kiekvienas susietas atlikėjas (ryšiui „dar N").
  const byArtist = useMemo(() => {
    const m = new Map<number, number>()
    for (const d of allItems) if (d.artist_id) m.set(d.artist_id, (m.get(d.artist_id) || 0) + 1)
    return m
  }, [allItems])

  // Batch: kuriuos komentarus žiūrintysis jau pamėgo
  useEffect(() => {
    const ids = allItems.map(i => i.comment_id).filter(Boolean) as number[]
    if (!ids.length) return
    fetch(`/api/comments/likes?ids=${ids.join(',')}`).then(r => r.json())
      .then(d => setLikedSet(new Set<number>(d.liked_ids || []))).catch(() => {})
  }, [allItems])

  const list = useMemo(() => {
    const filtered = allItems.filter(d => {
      if (member && d.author?.username !== member) return false
      if (style && !d.tags.includes(style)) return false
      if (q) {
        const hay = `${d.artist_name || ''} ${d.track_name || ''} ${d.album_name || ''} ${d.body || ''} ${d.author?.username || ''} ${d.tags.join(' ')}`.toLowerCase()
        if (!hay.includes(q.toLowerCase())) return false
      }
      return true
    })
    if (sort === 'top') {
      filtered.sort((a, b) =>
        (b.like_count || 0) - (a.like_count || 0) ||
        +new Date(b.created_at || 0) - +new Date(a.created_at || 0))
    }
    return filtered
  }, [allItems, q, member, style, sort])

  const shown = list.slice(0, limit)
  const hasFilters = q || member || style

  function resetAll() { setQ(''); setMember(''); setStyle(''); setLimit(20) }

  function handleAdded(d: Discovery) {
    setAdded(prev => [d, ...prev])
    // Išvalom filtrus + grįžtam į „Naujausi", kad naujas atradimas matytųsi viršuje
    resetAll(); setSort('new')
  }

  // Admin: paslėpti atradimą iš viešo srauto
  async function hideDiscovery(d: Discovery) {
    if (!window.confirm(`Paslėpti šį atradimą iš viešo srauto?`)) return
    setHiddenIds(prev => new Set(prev).add(d.id))
    try {
      await fetch('/api/admin/atradimai', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'hide', id: d.id }) })
    } catch {}
  }

  return (
    <div className="ma">
      {/* ── Kompaktiška filtrų juosta (Renginių stilius) ── */}
      <div className="ma-fbar">
        <div className="ma-search-wrap">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input value={q} onChange={e => { setQ(e.target.value); setLimit(20) }} placeholder="Ieškoti atlikėjo, dainos, teksto…" />
        </div>

        <span className="ma-divider" />

        {/* Rūšiavimas */}
        <button className={`ma-chip${sort === 'new' ? ' on' : ''}`} onClick={() => { setSort('new'); setLimit(20) }}>Naujausi</button>
        <button className={`ma-chip${sort === 'top' ? ' on' : ''}`} onClick={() => { setSort('top'); setLimit(20) }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
          Populiariausi
        </button>

        <span className="ma-divider" />

        <FilterPopover id="member" openId={openId} setOpenId={setOpenId} label="Narys" icon={IconUser} value={member} options={facets.members} onPick={v => { setMember(v); setLimit(20) }} />
        {facets.genres.length > 0 && (
          <FilterPopover id="style" openId={openId} setOpenId={setOpenId} label="Stilius" icon={IconNote} value={style} options={facets.genres} onPick={v => { setStyle(v); setLimit(20) }} />
        )}
        {hasFilters && <button className="ma-reset" onClick={resetAll}>Išvalyti ✕</button>}

        <span className="ma-count">{list.length}</span>
        <AddDiscovery onAdded={handleAdded} />
      </div>

      {shown.length === 0 ? (
        <div className="ma-empty">Nieko nerasta su šiais filtrais.</div>
      ) : (
        <div className="ma-list">
          {shown.map(d => {
            const uname = d.author?.username
            const when = relativeLt(d.created_at)
            const fresh = added.some(a => a.id === d.id)
            const moreCount = d.artist_id ? Math.max(0, (byArtist.get(d.artist_id) || 1) - 1) : 0
            return (
              <article key={d.id} className={`ma-row${fresh ? ' ma-fresh' : ''}`}>
                {d.embed_id && <div className="ma-media"><Embed d={d} /></div>}

                <div className="ma-main">
                  <div className="ma-head">
                    <Avatar src={d.author?.avatar_url} name={uname} size={30} />
                    <div className="ma-who">
                      {uname ? <Link href={`/@${uname}`} className="ma-nm">{uname}</Link> : <span className="ma-nm">Narys</span>}
                      {when && <span className="ma-dt">{when}</span>}
                    </div>
                    <CardLike commentId={d.comment_id} count={d.like_count} liked={d.comment_id ? likedSet.has(d.comment_id) : false} />
                    {isAdmin && (
                      <button className="ma-hide" title="Paslėpti iš viešo srauto (admin)" onClick={() => hideDiscovery(d)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.526 13.526 0 0 0 2 12s3 8 10 8a9.74 9.74 0 0 0 5.39-1.61M2 2l20 20"/></svg>
                      </button>
                    )}
                  </div>

                  {((d.artist_name && !d.artist_slug) || d.track_name) && (
                    <div className="ma-title">
                      {/* Kai atlikėjas susietas — jis rodomas dešinėje panelėje,
                          title lieka tik dainai. Nesusietam — kaip anksčiau. */}
                      {d.artist_name && !d.artist_slug && <span className="ma-art">{d.artist_name}</span>}
                      {d.artist_name && !d.artist_slug && d.track_name && <span className="ma-sep"> — </span>}
                      {d.track_name && (d.track_slug
                        ? <Link href={`/dainos/${d.track_slug}`} className="ma-tk ma-tk-link">{d.track_name} ♪</Link>
                        : <span className="ma-tk">{d.track_name}</span>)}
                    </div>
                  )}
                  {d.body && <ClampText text={d.body} />}
                  {/* Forumo tag'ai rodomi TIK kai nėra susieto atlikėjo —
                      kitaip dubliuotųsi su oficialiais stiliais panelėje. */}
                  {!d.artist_slug && d.tags.length > 0 && <div className="ma-tags">{d.tags.slice(0, 4).map(t => <button key={t} className="ma-tag" onClick={() => { setStyle(t); setLimit(20); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>{t}</button>)}</div>}
                </div>

                {d.artist_slug && <ArtistAside d={d} moreCount={moreCount} onMore={() => setArtistModal(d)} />}
              </article>
            )
          })}
        </div>
      )}

      {shown.length < list.length && (
        <div className="ma-more"><button onClick={() => setLimit(l => l + 20)}>Rodyti daugiau ({list.length - shown.length})</button></div>
      )}

      <div className="ma-foot">
        <span>Matai, kad kažko trūksta duombazėje?</span>
        <MissingForm />
      </div>

      {artistModal && (
        <ArtistDiscoveriesModal
          src={artistModal}
          items={allItems.filter(x => x.artist_id === artistModal.artist_id)}
          likedSet={likedSet}
          onClose={() => setArtistModal(null)}
        />
      )}

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

        /* ── Eilutės (forumo stilius) ── */
        .ma-list{display:flex;flex-direction:column;gap:14px}
        .ma-row{display:flex;gap:18px;align-items:flex-start;background:var(--card-surface);border:1px solid var(--card-border-default);border-radius:14px;padding:16px}
        .ma-row:hover{border-color:var(--border-strong)}
        .ma-fresh{border-color:rgba(249,115,22,0.55);box-shadow:0 0 0 1px rgba(249,115,22,0.35)}
        .ma-media{width:300px;flex-shrink:0}
        .ma-main{flex:1;min-width:0}
        .ma-head{display:flex;align-items:center;gap:9px;margin-bottom:9px}
        :global(.ma-av){border-radius:50%;object-fit:cover;flex-shrink:0}
        :global(.ma-av-ph){display:flex;align-items:center;justify-content:center;font-weight:800;border-radius:50%;flex-shrink:0}
        .ma-who{display:flex;align-items:baseline;gap:8px;line-height:1.25;min-width:0;flex:1}
        :global(.ma-nm){font-size:13.5px;font-weight:700;color:var(--text-primary);text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        :global(.ma-nm:hover){color:var(--accent-orange)}
        .ma-dt{color:var(--text-muted);font-size:11.5px;flex-shrink:0}
        .ma-hide{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:transparent;border:1px solid var(--border-subtle);color:var(--text-faint);cursor:pointer;flex-shrink:0}
        .ma-hide:hover{color:var(--accent-red,#ef4444);border-color:var(--accent-red,#ef4444)}
        :global(.ma-yt){position:relative;display:block;width:100%;border:none;padding:0;border-radius:10px;overflow:hidden;aspect-ratio:16/9;background:#000;cursor:pointer}
        :global(.ma-yt img){width:100%;height:100%;object-fit:cover;display:block;opacity:.92;transition:.15s}
        :global(.ma-yt:hover img){opacity:1}
        :global(.ma-play){position:absolute;inset:0;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 2px 8px rgba(0,0,0,.6))}
        :global(.ma-frame){width:100%;border:none;border-radius:10px;aspect-ratio:16/9}
        :global(.ma-sp){width:100%;border:none;border-radius:12px}
        .ma-title{font-family:'Outfit',sans-serif;font-size:15px;font-weight:800;letter-spacing:-.01em;margin-bottom:6px;line-height:1.3}
        :global(.ma-art){color:var(--text-primary);text-decoration:none}
        .ma-sep{color:var(--text-faint)}
        .ma-tk{color:var(--text-secondary);font-weight:700}
        :global(a.ma-tk-link){color:var(--text-secondary);text-decoration:none}
        :global(a.ma-tk-link:hover){color:var(--accent-orange)}
        :global(.ma-narr){font-size:13.5px;line-height:1.65;color:var(--text-secondary);margin:0;white-space:pre-wrap;word-break:break-word}
        :global(.ma-narr.ma-clamp){display:-webkit-box;-webkit-line-clamp:8;-webkit-box-orient:vertical;overflow:hidden}
        :global(.ma-readmore){margin-top:7px;padding:0;background:none;border:none;color:var(--accent-orange);font-size:12px;font-weight:700;font-family:'Outfit',sans-serif;cursor:pointer;display:block}
        .ma-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
        .ma-tag{background:var(--bg-hover);color:var(--text-muted);font-size:11px;padding:3px 9px;border-radius:12px;border:none;cursor:pointer;font-family:'Outfit',sans-serif}
        .ma-tag:hover{color:var(--accent-orange)}

        /* ── Atlikėjo panelė dešinėje ── */
        :global(.ma-aside){width:172px;flex-shrink:0;display:flex;flex-direction:column;align-items:flex-start;gap:9px;border-left:1px solid var(--border-subtle);padding-left:16px;align-self:stretch}
        :global(.ma-aside-link){display:flex;flex-direction:column;gap:8px;text-decoration:none;min-width:0}
        :global(.ma-aside-img){width:56px;height:56px;border-radius:12px;object-fit:cover}
        :global(.ma-aside-ph){display:flex;align-items:center;justify-content:center;font-weight:800;font-size:22px}
        :global(.ma-aside-nm){font-family:'Outfit',sans-serif;font-size:14px;font-weight:800;color:var(--text-primary);line-height:1.25;word-break:break-word}
        :global(.ma-aside-link:hover .ma-aside-nm){color:var(--accent-orange)}
        :global(.ma-aside-styles){display:flex;gap:5px;flex-wrap:wrap}
        :global(.ma-style){background:var(--bg-hover);border:1px solid var(--border-subtle);color:var(--text-muted);font-size:10.5px;font-weight:700;font-family:'Outfit',sans-serif;padding:3px 8px;border-radius:100px;white-space:nowrap}
        :global(.ma-aside-more){margin-top:auto;padding:5px 10px;border-radius:100px;background:rgba(249,115,22,0.1);border:1px solid rgba(249,115,22,0.3);color:var(--accent-orange);font-size:11px;font-weight:700;font-family:'Outfit',sans-serif;cursor:pointer;white-space:nowrap}
        :global(.ma-aside-more:hover){background:rgba(249,115,22,0.18)}

        /* Mobile: media per visą plotį, atlikėjas — horizontali juosta apačioje */
        @media(max-width:860px){
          .ma-row{flex-direction:column;gap:12px}
          .ma-media{width:100%}
          :global(.ma-aside){width:100%;flex-direction:row;align-items:center;border-left:none;border-top:1px solid var(--border-subtle);padding-left:0;padding-top:12px;gap:10px}
          :global(.ma-aside-link){flex-direction:row;align-items:center;gap:10px;flex:1}
          :global(.ma-aside-img){width:38px;height:38px;border-radius:10px}
          :global(.ma-aside-ph){font-size:15px}
          :global(.ma-aside-more){margin-top:0;margin-left:auto}
        }

        .ma-more{display:flex;justify-content:center;margin-top:24px}
        .ma-more button{padding:10px 22px;border-radius:100px;font-size:13px;font-weight:700;font-family:'Outfit',sans-serif;background:var(--bg-hover);border:1px solid var(--border-default);color:var(--text-primary);cursor:pointer}
        .ma-more button:hover{border-color:var(--accent-orange)}
        .ma-empty{text-align:center;color:var(--text-muted);padding:54px 0;font-size:15px}
      `}</style>
    </div>
  )
}
