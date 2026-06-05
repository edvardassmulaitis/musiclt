'use client'

// app/feed/page.tsx
//
// „Atradimai" (bendruomenės srautas) — vientisas horizontalių row'ų hub'as.
// URL /feed (anksčiau /atradimai; pervadinta 2026-06-05, /atradimai → 308 /feed).
//
// Tvarka:
//   1. Plona antraštė
//   2. Dienos daina — homepage stiliaus juosta (winner + siūlomos)
//   3. Muzikos atradimai — narių atrastos grupės/dainos (→ /muzikos-atradimai)
//   4. Naujausi įrašai (visi tipai)
//   5. Diskusijos (su atlikėjo vizualu + paskutinio komentatoriaus avataru)
//   6. Pagal kategorijas: Narių topai · Recenzijos · Kūryba · Vertimai · Straipsniai
//   7. Apačioje: Bendruomenė gyvai · Nauji nariai
//
// Duomenys: /api/atradimai/feed · /api/muzikos-atradimai · /api/diskusijos/recent ·
//   /api/dienos-daina/* · /api/atradimai/active-members · <ActivityWidget/> <ShoutboxWidget/>

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import { ShoutboxWidget } from '@/components/ShoutboxWidget'
import { ActivityWidget } from '@/components/ActivityWidget'

// ───────────────────────── helpers ─────────────────────────
function timeAgo(d?: string | null) {
  if (!d) return ''
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'ką tik'
  if (m < 60) return `${m} min.`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} val.`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days} d.`
  return `${Math.floor(days / 7)} sav.`
}
function sani(s?: string | null) {
  return (s || '').replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim()
}
function hue(s: string) { let h = 0; for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h }
function ytId(url?: string | null) {
  return url?.match?.(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/)?.[1] || null
}

function Avatar({ src, name, size = 32 }: { src?: string | null; name?: string | null; size?: number }) {
  const nm = name || 'Narys'
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={proxyImg(src)} alt="" width={size} height={size} loading="lazy" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  }
  return (
    <div className="flex shrink-0 items-center justify-center rounded-full font-extrabold"
      style={{ width: size, height: size, fontSize: size * 0.42, background: `hsl(${hue(nm)},32%,20%)`, color: `hsl(${hue(nm)},52%,62%)` }}>
      {nm.charAt(0).toUpperCase()}
    </div>
  )
}

// ───────────────────────── types ─────────────────────────
type FeedPost = {
  id: number; slug: string; title: string; post_type: string; rating: number | null
  like_count: number | null; comment_count: number | null; published_at: string | null
  cover: string | null; blog_slug: string | null
  author: { id: string | null; full_name: string | null; username: string | null; avatar_url: string | null } | null
}
type Member = { user_id: string; username: string | null; name: string | null; avatar: string | null; total: number; last_active: string; headline: string }
type NewMember = { username: string; name: string | null; avatar: string | null; created_at: string }
type Diskusija = {
  id: number; slug: string; title: string; author_name: string | null; author_avatar: string | null
  comment_count: number; created_at: string; artist_name?: string | null; artist_image?: string | null
  latest_comment?: { author: string; excerpt: string; avatar?: string | null } | null
}
type Nom = { id: number; votes?: number; weighted_votes?: number; comment?: string | null; own?: boolean; proposer?: { username: string | null; full_name: string | null; avatar_url: string | null } | null; tracks?: { id: number; slug?: string | null; title: string; cover_url?: string | null; video_url?: string | null; artists?: { name?: string | null; cover_image_url?: string | null } | null } | null }
type Winner = { id: number; date: string; total_votes?: number; weighted_votes?: number; winning_comment?: string | null; proposer?: Nom['proposer']; tracks?: Nom['tracks'] }
type DiscoveryLite = {
  id: number; artist_name: string | null; artist_slug: string | null; track_name: string | null
  embed_type: string | null; embed_id: string | null; artist_cover: string | null
  resolve_state: string; is_lt: boolean; created_at: string | null
  author: { username: string | null; full_name: string | null; avatar_url: string | null } | null
  author_username: string | null
}

function feedHref(p: FeedPost) {
  return p.blog_slug ? `/blogas/${p.blog_slug}/${p.slug}` : '/blogas'
}

const TYPE_META: Record<string, { label: string; rgb: string }> = {
  topas: { label: 'Topas', rgb: '245,158,11' },
  review: { label: 'Recenzija', rgb: '239,68,68' },
  creation: { label: 'Kūryba', rgb: '236,72,153' },
  translation: { label: 'Vertimas', rgb: '16,185,129' },
  article: { label: 'Straipsnis', rgb: '168,85,247' },
  event: { label: 'Renginys', rgb: '59,130,246' },
  quick: { label: 'Įrašas', rgb: '148,163,184' },
}

// ───────────────────────── Slim header ─────────────────────────
function SlimHeader() {
  return (
    <div className="page-head">
      <h1>Atradimai</h1>
      <p>Kas naujo pas kitus narius — gyvai, įrašai, topai, recenzijos, kūryba</p>
    </div>
  )
}

// ───────── Kompaktiška „gyvai" juosta (žemiau, mažiau prominentų) ─────────
function CompactBand() {
  const H = 240
  return (
    <section className="mb-8">
      <h3 className="m-0 mb-3 font-['Outfit',sans-serif] text-[13px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">Bendruomenė gyvai</h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div style={{ height: H }}><ActivityWidget /></div>
        <div style={{ height: H }}><ShoutboxWidget /></div>
        <Link href="/boombox" className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-[var(--border-default)] p-4 no-underline transition-all hover:-translate-y-0.5"
          style={{ height: H, background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(168,85,247,0.10))' }}>
          <div>
            <span className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--accent-orange)]">Boombox · žaidimas</span>
            <p className="m-0 mt-1 font-['Outfit',sans-serif] text-[19px] font-black leading-tight text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">Atspėk atlikėją iš nuotraukos</p>
            <p className="m-0 mt-1.5 text-[12px] leading-snug text-[var(--text-muted)]">Pamatai nuotrauką — atspėji, kieno daina. Greita ir įtraukia.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[var(--accent-orange)] px-4 py-2 text-[12.5px] font-extrabold text-white transition-transform group-hover:translate-x-0.5">
            <span className="text-[14px]">🎧</span> Žaisk dabar →
          </span>
        </Link>
      </div>
    </section>
  )
}

// ───────────────────────── Row primitives ─────────────────────────
function RowHead({ title, accent, allHref, addType }: { title: string; accent: string; allHref: string; addType?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span style={{ width: 4, height: 18, borderRadius: 3, background: accent }} />
        <h2 className="m-0 font-['Outfit',sans-serif] font-extrabold text-[var(--text-primary)]" style={{ fontSize: 'var(--section-title-size)', letterSpacing: 'var(--section-title-tracking)' }}>{title}</h2>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {addType && <Link href={`/blogas/rasyti?type=${addType}`} className="font-['Outfit',sans-serif] text-[12px] font-bold text-[var(--text-muted)] no-underline transition-colors hover:text-[var(--accent-orange)]">+ Rašyti</Link>}
        <Link href={allHref} className="font-['Outfit',sans-serif] text-[12px] font-bold text-[var(--accent-orange)] no-underline transition-opacity hover:opacity-70">Visi →</Link>
      </div>
    </div>
  )
}

const SCROLL = 'hp-scroll flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x'

// ───────────────────────── Muzikos atradimai (narių atrastos grupės/dainos) ─────────────────────────
function MuzikosAtradimaiRow() {
  const [items, setItems] = useState<DiscoveryLite[] | null>(null)
  useEffect(() => {
    let a = true
    fetch('/api/muzikos-atradimai?limit=12').then(r => r.json()).then(d => { if (a) setItems(d.items || []) }).catch(() => { if (a) setItems([]) })
    return () => { a = false }
  }, [])
  if (items !== null && items.length === 0) return null
  return (
    <section className="mb-8">
      <RowHead title="Muzikos atradimai" accent="#f97316" allHref="/muzikos-atradimai" />
      {items === null ? (
        <div className={SCROLL}>{Array(6).fill(null).map((_, i) => (
          <div key={i} className="w-[200px] shrink-0"><div className="hp-skel aspect-video rounded-xl" /><div className="hp-skel mt-2 h-3 w-4/5 rounded" /></div>
        ))}</div>
      ) : (
        <div className={SCROLL}>
          {items.map(d => {
            const thumb = d.embed_type === 'youtube' && d.embed_id ? `https://i.ytimg.com/vi/${d.embed_id}/mqdefault.jpg` : (d.artist_cover ? proxyImg(d.artist_cover) : null)
            const uname = d.author?.username || d.author_username
            return (
              <Link key={d.id} href="/muzikos-atradimai" className="group block w-[200px] shrink-0 snap-start no-underline">
                <div className="relative aspect-video overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--cover-placeholder)]">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center" style={{ background: `linear-gradient(135deg, hsl(${hue(d.artist_name || 'x')},34%,22%), hsl(${(hue(d.artist_name || 'x') + 40) % 360},30%,12%))` }}>
                      <span className="font-['Outfit',sans-serif] text-3xl font-black text-white/85">{(d.artist_name || '?').charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  {d.embed_type && <span className="absolute right-1.5 top-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-white/90">{d.embed_type === 'youtube' ? '▶ YouTube' : 'Spotify'}</span>}
                </div>
                <p className="m-0 mt-2 line-clamp-1 font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{d.artist_name || 'Atradimas'}</p>
                <p className="m-0 mt-0.5 line-clamp-1 text-[11.5px] text-[var(--text-muted)]">{d.track_name || (uname ? `atrado ${uname}` : '')}</p>
              </Link>
            )
          })}
          <Link href="/muzikos-atradimai" className="group flex w-[200px] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] text-center no-underline transition-all hover:-translate-y-0.5 hover:border-[rgba(249,115,22,0.5)]" style={{ minHeight: 112 }}>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(249,115,22,0.12)] text-[20px] font-bold text-[var(--accent-orange)] transition-colors group-hover:bg-[var(--accent-orange)] group-hover:text-white">→</span>
            <span className="px-3 font-['Outfit',sans-serif] text-[12px] font-extrabold text-[var(--text-primary)]">Visi atradimai</span>
          </Link>
        </div>
      )}
    </section>
  )
}

// ───────────────────────── Dienos daina (homepage stilius) ─────────────────────────
function DainaPopBar({ level }: { level: number }) {
  return (
    <span className="mt-2 flex items-center gap-[3px] px-0.5" aria-label={`Balsų lygis ${level}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={`h-[3px] w-[11px] rounded-[2px] ${i < level ? 'bg-[var(--accent-orange)]' : 'bg-[var(--border-default)]'}`} />
      ))}
    </span>
  )
}
function ProposerLine({ p }: { p?: Nom['proposer'] }) {
  const name = p?.full_name || p?.username
  if (!name) return null
  return (
    <span className="flex min-w-0 items-center gap-1">
      {p?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={proxyImg(p.avatar_url)} alt="" className="h-[14px] w-[14px] shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full text-[7px] font-extrabold" style={{ background: `hsl(${hue(name)},32%,20%)`, color: `hsl(${hue(name)},48%,58%)` }}>{name.charAt(0).toUpperCase()}</span>
      )}
      <span className="truncate text-[10.5px] font-semibold text-[var(--text-secondary)]">{name}</span>
    </span>
  )
}
function dainaImg(t?: Nom['tracks']) {
  if (!t) return null
  const v = ytId(t.video_url)
  return t.cover_url || (v ? `https://img.youtube.com/vi/${v}/mqdefault.jpg` : null) || t.artists?.cover_image_url || null
}
function trackHref(t?: Nom['tracks']) {
  if (!t) return '/dienos-daina'
  return `/dainos/${t.slug || t.id}`
}

function DainaCard({ n, winner, maxVotes, voted, voting, onVote }: { n: Nom; winner?: boolean; maxVotes: number; voted: boolean; voting: number | null; onVote: (id: number) => void }) {
  const t = n.tracks
  if (!t) return null
  const votes = n.weighted_votes || n.votes || 0
  const level = votes > 0 ? Math.max(1, Math.round((votes / Math.max(1, maxVotes)) * 5)) : 0
  const img = dainaImg(t)
  return (
    <div className="group flex shrink-0 snap-start flex-col" style={{ width: 302 }}>
      <Link href={trackHref(t)} className="block no-underline">
        <div className="relative aspect-video overflow-hidden rounded-xl border bg-[var(--cover-placeholder)] shadow-[0_4px_12px_rgba(0,0,0,0.25)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[0_14px_32px_rgba(249,115,22,0.18)]"
          style={{ borderColor: winner ? 'rgba(249,115,22,0.5)' : 'var(--border-default)' }}>
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proxyImg(img)} alt={sani(t.title)} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" style={{ filter: 'saturate(1.05) contrast(1.02)' }} />
          ) : <div className="flex h-full w-full items-center justify-center text-2xl text-[var(--text-faint)]">🎵</div>}
        </div>
        <DainaPopBar level={level} />
        <div className="mt-1 px-0.5">
          <p className="m-0 truncate font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">{sani(t.title)}</p>
          <p className="m-0 mt-0.5 truncate text-[11.5px] text-[var(--text-muted)]">{t.artists?.name}</p>
        </div>
      </Link>
      {n.proposer && <div className="mt-1.5 px-0.5"><ProposerLine p={n.proposer} /></div>}
      {!winner && !n.own && (
        <div className="mt-1.5 px-0.5">
          <button type="button" onClick={() => onVote(n.id)} disabled={voted || voting !== null}
            className={`block w-full rounded-full py-[3px] font-['Outfit',sans-serif] text-[10.5px] font-extrabold transition-all ${voted ? 'cursor-default' : voting !== null ? 'opacity-60' : 'hover:bg-[rgba(249,115,22,0.12)]'}`}
            style={{ background: voted ? 'rgba(249,115,22,0.14)' : 'transparent', color: 'var(--accent-orange)', border: '1px solid rgba(249,115,22,0.4)' }}>
            {voting === n.id ? '…' : voted ? '✓ Balsuota' : 'Balsuoti'}
          </button>
        </div>
      )}
      {(winner ? n.comment : n.comment) && <p className="m-0 mt-1 px-0.5 line-clamp-2 text-[10.5px] italic text-[var(--text-muted)]">„{n.comment}"</p>}
    </div>
  )
}

function DienosDainaStrip() {
  const [noms, setNoms] = useState<Nom[] | null>(null)
  const [winner, setWinner] = useState<Winner | null>(null)
  const [votedIds, setVotedIds] = useState<Set<number>>(new Set())
  const [voting, setVoting] = useState<number | null>(null)
  useEffect(() => {
    let a = true
    Promise.all([
      fetch('/api/dienos-daina/nominations').then(r => r.json()).catch(() => ({})),
      fetch('/api/dienos-daina/winners?limit=1').then(r => r.json()).catch(() => ({})),
    ]).then(([n, w]) => { if (!a) return; setNoms(n.nominations || []); setWinner((w.winners && w.winners[0]) || null) })
    fetch('/api/dienos-daina/votes').then(r => r.json()).then(d => { if (a) setVotedIds(new Set<number>(d.voted_nomination_ids || [])) }).catch(() => {})
    return () => { a = false }
  }, [])
  const handleVote = useCallback(async (id: number) => {
    if (votedIds.has(id) || voting !== null) return
    setVoting(id)
    try {
      const res = await fetch('/api/dienos-daina/votes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nomination_id: id }) })
      const d = await res.json()
      if (res.ok) {
        const wt = d.weight || 1
        setVotedIds(prev => new Set(prev).add(id))
        setNoms(prev => (prev || []).map(n => n.id === id ? { ...n, votes: (n.votes || 0) + 1, weighted_votes: (n.weighted_votes || 0) + wt } : n))
      }
    } catch {} finally { setVoting(null) }
  }, [votedIds, voting])

  const sorted = [...(noms || [])].filter(n => n.tracks).sort((a, b) => (b.weighted_votes || b.votes || 0) - (a.weighted_votes || a.votes || 0))
  const maxVotes = Math.max(1, ...sorted.map(n => n.weighted_votes || n.votes || 0))

  return (
    <section className="mb-8">
      <RowHead title="Dienos daina" accent="#f97316" allHref="/dienos-daina" />
      {noms === null ? (
        <div className={SCROLL}>{Array(6).fill(null).map((_, i) => (
          <div key={i} className="shrink-0" style={{ width: 302 }}><div className="hp-skel aspect-video rounded-xl" /><div className="hp-skel mt-2 h-3 w-4/5 rounded" /><div className="hp-skel mt-2 h-6 w-full rounded-full" /></div>
        ))}</div>
      ) : (
        <div className={SCROLL}>
          {winner?.tracks && (
            <>
              <div className="flex shrink-0 flex-col">
                <span className="mb-1 px-0.5 font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--accent-orange)]">Vakar laimėjo</span>
                <DainaCard n={{ id: winner.id, weighted_votes: winner.weighted_votes, votes: winner.total_votes, proposer: winner.proposer, tracks: winner.tracks, comment: winner.winning_comment }} winner maxVotes={maxVotes} voted voting={null} onVote={() => {}} />
              </div>
              <div className="flex shrink-0 items-stretch self-stretch px-1"><div className="w-px self-stretch bg-[var(--border-default)]" /></div>
            </>
          )}
          {sorted.slice(0, 14).map(n => <DainaCard key={n.id} n={n} maxVotes={maxVotes} voted={votedIds.has(n.id)} voting={voting} onVote={handleVote} />)}
          <Link href="/dienos-daina" className="group flex shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] text-center no-underline transition-all hover:-translate-y-0.5 hover:border-[rgba(249,115,22,0.5)]" style={{ width: 302, minHeight: 'var(--card-visual-h)' }}>
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[rgba(249,115,22,0.12)] text-[24px] font-bold leading-none text-[var(--accent-orange)] transition-colors group-hover:bg-[var(--accent-orange)] group-hover:text-white">+</span>
            <span className="px-3 font-['Outfit',sans-serif] text-[12.5px] font-extrabold text-[var(--text-primary)]">Pasiūlyti dainą</span>
            <span className="px-3 text-[10.5px] text-[var(--text-muted)]">Pridėk savo kandidatą</span>
          </Link>
        </div>
      )}
    </section>
  )
}

// ───────────────────────── Įrašų kortelė ─────────────────────────
function PostCard({ p, showType = false }: { p: FeedPost; showType?: boolean }) {
  const a = p.author
  const isReview = p.post_type === 'review'
  const tm = TYPE_META[p.post_type]
  return (
    <Link href={feedHref(p)} className="group block w-[170px] shrink-0 snap-start no-underline">
      <div className="relative aspect-square overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--cover-placeholder)]">
        {p.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyImg(p.cover)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center"
            style={{ background: `linear-gradient(135deg, hsl(${hue(a?.username || p.title)},34%,22%), hsl(${(hue(a?.username || p.title) + 40) % 360},30%,12%))` }}>
            <span className="font-['Outfit',sans-serif] text-3xl font-black text-white/85">{(a?.full_name || a?.username || p.title || '?').charAt(0).toUpperCase()}</span>
            {tm && <span className="font-['Outfit',sans-serif] text-[8.5px] font-extrabold uppercase tracking-[0.12em] text-white/55">{tm.label}</span>}
          </div>
        )}
        {isReview && p.rating != null && (
          <span className="absolute left-1.5 top-1.5 flex items-center gap-0.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-black text-amber-300">★ {p.rating}</span>
        )}
        {showType && tm && (
          <span className="absolute right-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-[9.5px] font-extrabold text-white" style={{ background: `rgba(${tm.rgb},0.92)` }}>{tm.label}</span>
        )}
      </div>
      <p className="m-0 mt-2 line-clamp-2 font-['Outfit',sans-serif] text-[13px] font-extrabold leading-snug text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{sani(p.title) || '(be pavadinimo)'}</p>
      <div className="mt-1.5 flex items-center gap-1.5">
        <Avatar src={a?.avatar_url} name={a?.full_name || a?.username} size={16} />
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--text-muted)]">{a?.full_name || a?.username || 'Narys'}</span>
        {(p.like_count ?? 0) > 0 && <span className="shrink-0 text-[11.5px] text-[var(--text-faint)]">♥ {p.like_count}</span>}
      </div>
    </Link>
  )
}

function InviteCard({ label, type }: { label: string; type: string }) {
  return (
    <Link href={`/blogas/rasyti?type=${type}`} className="group flex w-[170px] shrink-0 snap-start flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-default)] p-4 text-center no-underline transition-colors hover:border-[var(--accent-orange)]" style={{ aspectRatio: '1' }}>
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-active)] text-[18px] font-black text-[var(--accent-orange)] transition-transform group-hover:scale-110">+</span>
      <span className="mt-2 font-['Outfit',sans-serif] text-[12.5px] font-extrabold text-[var(--text-primary)]">Būk pirmas</span>
      <span className="mt-0.5 text-[11px] text-[var(--text-muted)]">{label}</span>
    </Link>
  )
}

function SkelRow() {
  return (
    <div className={SCROLL}>{Array(7).fill(null).map((_, i) => (
      <div key={i} className="w-[170px] shrink-0"><div className="hp-skel aspect-square rounded-xl" /><div className="hp-skel mt-2 h-3 w-4/5 rounded" /></div>
    ))}</div>
  )
}

function BlogRow({ title, query, accent, allHref, writeType, inviteLabel }: { title: string; query: string; accent: string; allHref: string; writeType: string; inviteLabel: string }) {
  const [posts, setPosts] = useState<FeedPost[] | null>(null)
  useEffect(() => {
    let a = true
    fetch(`/api/atradimai/feed?${query}&limit=16`).then(r => r.json()).then(d => { if (a) setPosts(d.posts || []) }).catch(() => { if (a) setPosts([]) })
    return () => { a = false }
  }, [query])
  return (
    <section className="mb-8">
      <RowHead title={title} accent={accent} allHref={allHref} addType={writeType} />
      {posts === null ? <SkelRow /> : posts.length === 0 ? (
        <div className={SCROLL}>
          <InviteCard label={inviteLabel} type={writeType} />
          <div className="flex max-w-[280px] items-center text-[12.5px] leading-snug text-[var(--text-muted)]">Šios skilties dar niekas neužpildė — tavo įrašas čia būtų pirmas.</div>
        </div>
      ) : (
        <div className={SCROLL}>{posts.map(p => <PostCard key={p.id} p={p} />)}<InviteCard label={inviteLabel} type={writeType} /></div>
      )}
    </section>
  )
}

function NaujausiRow() {
  const [posts, setPosts] = useState<FeedPost[] | null>(null)
  useEffect(() => {
    let a = true
    fetch('/api/atradimai/feed?limit=18').then(r => r.json()).then(d => { if (a) setPosts(d.posts || []) }).catch(() => { if (a) setPosts([]) })
    return () => { a = false }
  }, [])
  return (
    <section className="mb-8">
      <RowHead title="Naujausi įrašai" accent="#0ea5e9" allHref="/blogas" />
      {posts === null ? <SkelRow /> : posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-default)] p-5 text-center text-[12.5px] text-[var(--text-muted)]">Įrašų dar nėra. <Link href="/blogas/rasyti" className="font-bold text-[var(--accent-orange)] no-underline">Parašyk pirmas →</Link></div>
      ) : (
        <div className={SCROLL}>{posts.map(p => <PostCard key={p.id} p={p} showType />)}</div>
      )}
    </section>
  )
}

// ───────────────────────── Diskusijos (vizualios) ─────────────────────────
function DiskusijosRow() {
  const [items, setItems] = useState<Diskusija[] | null>(null)
  useEffect(() => {
    let a = true
    fetch('/api/diskusijos/recent?limit=14').then(r => r.json()).then(d => {
      if (!a) return
      const seen = new Set<string>(); const out: Diskusija[] = []
      for (const it of (d.items || []) as Diskusija[]) {
        const k = it.author_name || it.latest_comment?.author || `d-${it.id}`
        if (seen.has(k)) continue; seen.add(k); out.push(it)
      }
      setItems(out.slice(0, 10))
    }).catch(() => { if (a) setItems([]) })
    return () => { a = false }
  }, [])
  return (
    <section className="mb-8">
      <RowHead title="Diskusijos" accent="#8b5cf6" allHref="/diskusijos" />
      {items === null ? (
        <div className={SCROLL}>{Array(4).fill(null).map((_, i) => <div key={i} className="hp-skel h-[116px] w-[300px] shrink-0 rounded-2xl" />)}</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-default)] p-5 text-center text-[12.5px] text-[var(--text-muted)]">Diskusijų dar nėra. <Link href="/diskusijos" className="font-bold text-[var(--accent-orange)] no-underline">Pradėk pirmas →</Link></div>
      ) : (
        <div className={SCROLL}>
          {items.map(d => (
            <Link key={d.id} href={`/diskusijos/${d.slug}`} className="group flex w-[300px] shrink-0 snap-start gap-3 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 no-underline transition-all hover:-translate-y-0.5 hover:border-[rgba(139,92,246,0.5)]">
              <div className="relative h-[68px] w-[68px] shrink-0 overflow-hidden rounded-xl bg-[var(--cover-placeholder)]">
                {d.artist_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={proxyImg(d.artist_image)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center" style={{ background: `hsl(${hue(d.title)},30%,18%)`, color: `hsl(${hue(d.title)},45%,60%)` }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  </div>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                {d.artist_name && <span className="mb-0.5 truncate text-[10px] font-extrabold uppercase tracking-[0.06em]" style={{ color: '#8b5cf6' }}>{d.artist_name}</span>}
                <p className="m-0 line-clamp-1 font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{d.title}</p>
                {d.latest_comment ? (
                  <div className="mt-1 flex items-start gap-1.5">
                    <Avatar src={d.latest_comment.avatar} name={d.latest_comment.author} size={18} />
                    <p className="m-0 line-clamp-2 text-[11px] leading-snug text-[var(--text-muted)]"><span className="font-bold text-[var(--text-secondary)]">{d.latest_comment.author}:</span> {d.latest_comment.excerpt}</p>
                  </div>
                ) : <p className="m-0 mt-1 text-[11px] text-[var(--text-muted)]">{d.author_name || 'Anonimas'}</p>}
                <p className="m-0 mt-auto pt-1.5 text-[10px] text-[var(--text-faint)]">{d.comment_count} ats. · {timeAgo(d.created_at)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

// ───────────────────────── Nauji nariai ─────────────────────────
function NaujiNariaiRow({ list, loading }: { list: NewMember[]; loading: boolean }) {
  return (
    <section className="mb-8">
      <RowHead title="Nauji nariai" accent="#10b981" allHref="/vartotojai" />
      {loading ? (
        <div className={SCROLL}>{Array(7).fill(null).map((_, i) => <div key={i} className="hp-skel h-[128px] w-[120px] shrink-0 rounded-xl" />)}</div>
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-default)] p-5 text-center text-[12.5px] text-[var(--text-muted)]">Naujų narių dar nėra.</div>
      ) : (
        <div className={SCROLL}>
          {list.map(m => (
            <Link key={m.username} href={`/@${m.username}`} className="group flex w-[120px] shrink-0 snap-start flex-col items-center rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-center no-underline transition-all hover:-translate-y-0.5 hover:border-[rgba(16,185,129,0.5)]">
              <Avatar src={m.avatar} name={m.name} size={46} />
              <p className="m-0 mt-2 w-full truncate font-['Outfit',sans-serif] text-[12px] font-extrabold text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{m.name}</p>
              <p className="m-0 mt-0.5 text-[10px] text-[var(--text-faint)]">prisijungė {timeAgo(m.created_at)}</p>
              <span className="mt-1.5 rounded-full bg-[rgba(16,185,129,0.14)] px-2 py-0.5 text-[9.5px] font-extrabold text-[#10b981]">naujas</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

// ───────────────────────── Page ─────────────────────────
export default function FeedPage() {
  const [members, setMembers] = useState<Member[] | null>(null)
  const [newMembers, setNewMembers] = useState<NewMember[]>([])
  useEffect(() => {
    let a = true
    fetch('/api/atradimai/active-members?days=7&limit=12').then(r => r.json()).then(d => {
      if (!a) return
      setMembers(d.members || []); setNewMembers(d.new_members || [])
    }).catch(() => { if (a) setMembers([]) })
    return () => { a = false }
  }, [])

  return (
    <div className="page-shell">
      <SlimHeader />
      {/* Prominentų turinys viršuje */}
      <DienosDainaStrip />
      <MuzikosAtradimaiRow />
      <NaujausiRow />
      <DiskusijosRow />
      {/* Įrašai pagal kategorijas */}
      <BlogRow title="Narių topai" query="type=topas" allHref="/blogas?type=topas" writeType="topas" accent="#f59e0b" inviteLabel="Sudaryk topą" />
      <BlogRow title="Recenzijos" query="editorial=recenzija" allHref="/blogas" writeType="review" accent="#ef4444" inviteLabel="Parašyk recenziją" />
      <BlogRow title="Koncertų įspūdžiai" query="editorial=koncertai" allHref="/blogas" writeType="article" accent="#3b82f6" inviteLabel="Pasidalink koncerto įspūdžiu" />
      <BlogRow title="Kūryba" query="type=creation" allHref="/blogas?type=creation" writeType="creation" accent="#ec4899" inviteLabel="Įkelk kūrybą" />
      <BlogRow title="Vertimai" query="type=translation" allHref="/blogas?type=translation" writeType="translation" accent="#10b981" inviteLabel="Pridėk vertimą" />
      {/* Mažiau prominentų: gyvas chatas + aktyvumas + žaidimas */}
      <CompactBand />
      <NaujiNariaiRow list={newMembers} loading={members === null} />
    </div>
  )
}
