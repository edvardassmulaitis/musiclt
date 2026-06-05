'use client'

// app/atrasti/page.tsx
//
// „Kas naujo" — bendruomenės srautas (anksčiau /feed; pervadinta 2026-06-05,
// /feed + /atradimai → 308 /atrasti).
//
// Struktūra (2026-06-05 perdarymas):
//   1. Antraštė „Kas naujo"
//   2. Top band: Dienos daina (bendras komponentas su homepage) + „Kas vyksta" dešinėje
//   3. PROMINENTŪS muzikos įrašai: Muzikos apžvalgos · Koncertų įspūdžiai · Narių topai
//   4. Muzikos atradimai · Naujausi įrašai (su išspręstais vizualais)
//   5. Diskusijos (pilnas komentaras) · Nauji nariai (suimportuoti)
//   6. ATSKIRAI ŽEMIAU: Kūryba ir vertimai
//
// Vizualai: topas → mini-top + collage; vertimas/renginys → susietos muzikos
// thumbnail; kūryba → be vizualo (gradientas). Sprendžiama /api/atradimai/feed.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import { ActivityWidget } from '@/components/ActivityWidget'
import { DienosDainaSection } from '@/components/DienosDainaSection'

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
type ListEntry = { rank: number; title: string; artist: string | null; image: string | null; type: string; entity_id: number | null }
type FeedPost = {
  id: number; slug: string; title: string; post_type: string; rating: number | null
  like_count: number | null; comment_count: number | null; published_at: string | null
  cover: string | null; collage: string[] | null; entries: ListEntry[] | null; blog_slug: string | null
  author: { id: string | null; full_name: string | null; username: string | null; avatar_url: string | null } | null
}
type NewMember = { username: string; name: string | null; avatar: string | null; created_at: string; joined_legacy_at?: string | null }
type Diskusija = {
  id: number; slug: string; title: string; author_name: string | null; author_avatar: string | null
  comment_count: number; created_at: string; artist_name?: string | null; artist_image?: string | null
  latest_comment?: { author: string; excerpt: string; avatar?: string | null; created_at?: string | null } | null
}
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
  review: { label: 'Apžvalga', rgb: '239,68,68' },
  creation: { label: 'Kūryba', rgb: '236,72,153' },
  translation: { label: 'Vertimas', rgb: '16,185,129' },
  article: { label: 'Įrašas', rgb: '168,85,247' },
  event: { label: 'Renginys', rgb: '59,130,246' },
  quick: { label: 'Įrašas', rgb: '148,163,184' },
}

// ───────────────────────── header ─────────────────────────
function SlimHeader() {
  return (
    <div className="page-head">
      <h1>Kas naujo</h1>
      <p>Bendruomenės srautas — gyvai, įrašai, topai, apžvalgos, kūryba</p>
    </div>
  )
}

// ───────────────────────── row primitives ─────────────────────────
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

// ───────────────────────── PROMINENT music card (apžvalgos/koncertai) ─────────────────────────
function BigPostCard({ p }: { p: FeedPost }) {
  const a = p.author
  return (
    <Link href={feedHref(p)} className="group flex w-[260px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] no-underline transition-all hover:-translate-y-0.5 hover:border-[rgba(249,115,22,0.45)] hover:shadow-[0_14px_32px_rgba(0,0,0,0.22)]">
      <div className="relative aspect-[16/10] overflow-hidden bg-[var(--cover-placeholder)]">
        {p.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyImg(p.cover)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-3 text-center"
            style={{ background: `linear-gradient(135deg, hsl(${hue(a?.username || p.title)},34%,22%), hsl(${(hue(a?.username || p.title) + 40) % 360},30%,12%))` }}>
            <span className="font-['Outfit',sans-serif] text-4xl font-black text-white/85">{(a?.full_name || a?.username || p.title || '?').charAt(0).toUpperCase()}</span>
          </div>
        )}
        {p.rating != null && (
          <span className="absolute left-2 top-2 flex items-center gap-0.5 rounded-lg bg-black/75 px-2 py-1 text-[13px] font-black text-amber-300">★ {p.rating}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        <p className="m-0 line-clamp-2 font-['Outfit',sans-serif] text-[15px] font-extrabold leading-snug text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{sani(p.title) || '(be pavadinimo)'}</p>
        <div className="mt-auto flex items-center gap-2 pt-3">
          <Avatar src={a?.avatar_url} name={a?.full_name || a?.username} size={22} />
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--text-secondary)]">{a?.full_name || a?.username || 'Narys'}</span>
          {(p.like_count ?? 0) > 0 && <span className="shrink-0 text-[12px] text-[var(--text-faint)]">♥ {p.like_count}</span>}
        </div>
      </div>
    </Link>
  )
}

function BigInviteCard({ label, type }: { label: string; type: string }) {
  return (
    <Link href={`/blogas/rasyti?type=${type}`} className="group flex w-[260px] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--border-default)] p-6 text-center no-underline transition-all hover:-translate-y-0.5 hover:border-[var(--accent-orange)]">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(249,115,22,0.12)] text-[24px] font-black text-[var(--accent-orange)] transition-transform group-hover:scale-110">+</span>
      <span className="font-['Outfit',sans-serif] text-[13.5px] font-extrabold text-[var(--text-primary)]">Būk pirmas</span>
      <span className="text-[11.5px] text-[var(--text-muted)]">{label}</span>
    </Link>
  )
}

function BigBlogRow({ title, query, accent, allHref, writeType, inviteLabel }: { title: string; query: string; accent: string; allHref: string; writeType: string; inviteLabel: string }) {
  const [posts, setPosts] = useState<FeedPost[] | null>(null)
  useEffect(() => {
    let on = true
    fetch(`/api/atradimai/feed?${query}&limit=16`).then(r => r.json()).then(d => { if (on) setPosts(d.posts || []) }).catch(() => { if (on) setPosts([]) })
    return () => { on = false }
  }, [query])
  return (
    <section className="mb-9">
      <RowHead title={title} accent={accent} allHref={allHref} addType={writeType} />
      {posts === null ? (
        <div className={SCROLL}>{Array(4).fill(null).map((_, i) => (
          <div key={i} className="w-[260px] shrink-0"><div className="hp-skel aspect-[16/10] rounded-2xl" /><div className="hp-skel mt-2 h-4 w-4/5 rounded" /></div>
        ))}</div>
      ) : posts.length === 0 ? (
        <div className={SCROLL}><BigInviteCard label={inviteLabel} type={writeType} /></div>
      ) : (
        <div className={SCROLL}>{posts.map(p => <BigPostCard key={p.id} p={p} />)}<BigInviteCard label={inviteLabel} type={writeType} /></div>
      )}
    </section>
  )
}

// ───────────────────────── Narių topai (mini-top, kaip oficialūs) ─────────────────────────
function TopThumb({ src, alt, size = 34 }: { src?: string | null; alt: string; size?: number }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={proxyImg(src)} alt="" loading="lazy" className="shrink-0 rounded-md object-cover" style={{ width: size, height: size }} />
  }
  return (
    <div className="flex shrink-0 items-center justify-center rounded-md text-[12px] font-black text-white/80" style={{ width: size, height: size, background: `linear-gradient(135deg, hsl(${hue(alt)},34%,22%), hsl(${(hue(alt) + 40) % 360},30%,12%))` }}>
      {alt.charAt(0).toUpperCase()}
    </div>
  )
}

function TopasCard({ p }: { p: FeedPost }) {
  const a = p.author
  const entries = (p.entries || []).slice(0, 5)
  return (
    <Link href={feedHref(p)} className="group flex w-[300px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] no-underline transition-all hover:-translate-y-0.5 hover:border-[rgba(245,158,11,0.5)] hover:shadow-[0_14px_32px_rgba(0,0,0,0.22)]">
      <div className="border-b border-[var(--border-subtle)] p-3.5">
        <p className="m-0 line-clamp-1 font-['Outfit',sans-serif] text-[14px] font-extrabold text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{sani(p.title) || 'Topas'}</p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <Avatar src={a?.avatar_url} name={a?.full_name || a?.username} size={16} />
          <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--text-muted)]">{a?.full_name || a?.username || 'Narys'}</span>
        </div>
      </div>
      <div className="flex flex-col">
        {entries.length === 0 ? (
          <div className="px-3.5 py-4 text-center text-[12px] text-[var(--text-muted)]">Tuščias topas</div>
        ) : entries.map((e, i) => (
          <div key={i} className="flex items-center gap-2.5 px-3.5 py-2 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-[var(--border-subtle)]">
            <span className={`w-4 shrink-0 text-center font-['Outfit',sans-serif] text-[14px] font-black leading-none ${e.rank <= 3 ? 'text-[var(--accent-orange)]' : 'text-[var(--text-faint)]'}`}>{e.rank}</span>
            <TopThumb src={e.image} alt={e.title || e.artist || '?'} size={32} />
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-[12.5px] font-bold text-[var(--text-primary)]">{sani(e.title)}</p>
              {e.artist && <p className="m-0 mt-px truncate text-[10.5px] text-[var(--text-muted)]">{e.artist}</p>}
            </div>
          </div>
        ))}
      </div>
    </Link>
  )
}

function TopaiRow() {
  const [posts, setPosts] = useState<FeedPost[] | null>(null)
  useEffect(() => {
    let on = true
    fetch('/api/atradimai/feed?type=topas&limit=16').then(r => r.json()).then(d => { if (on) setPosts(d.posts || []) }).catch(() => { if (on) setPosts([]) })
    return () => { on = false }
  }, [])
  if (posts !== null && posts.length === 0) return null
  return (
    <section className="mb-9">
      <RowHead title="Narių topai" accent="#f59e0b" allHref="/blogas?type=topas" addType="topas" />
      {posts === null ? (
        <div className={SCROLL}>{Array(3).fill(null).map((_, i) => <div key={i} className="hp-skel h-[260px] w-[300px] shrink-0 rounded-2xl" />)}</div>
      ) : (
        <div className={SCROLL}>{posts.map(p => <TopasCard key={p.id} p={p} />)}</div>
      )}
    </section>
  )
}

// ───────────────────────── Muzikos atradimai ─────────────────────────
function MuzikosAtradimaiRow() {
  const [items, setItems] = useState<DiscoveryLite[] | null>(null)
  useEffect(() => {
    let on = true
    fetch('/api/muzikos-atradimai?limit=12').then(r => r.json()).then(d => { if (on) setItems(d.items || []) }).catch(() => { if (on) setItems([]) })
    return () => { on = false }
  }, [])
  if (items !== null && items.length === 0) return null
  return (
    <section className="mb-9">
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

// ───────────────────────── Naujausi įrašai (su vizualais) ─────────────────────────
function CollageCover({ imgs }: { imgs: string[] }) {
  const four = imgs.slice(0, 4)
  if (four.length >= 4) {
    return (
      <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-[2px]">
        {four.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={proxyImg(src)} alt="" loading="lazy" className="h-full w-full object-cover" />
        ))}
      </div>
    )
  }
  // 1–3 vizualai → vienas didelis
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={proxyImg(four[0])} alt="" loading="lazy" className="h-full w-full object-cover" />
}

function PostCard({ p, showType = false }: { p: FeedPost; showType?: boolean }) {
  const a = p.author
  const isReview = p.post_type === 'review'
  const isTopas = p.post_type === 'topas'
  const tm = TYPE_META[p.post_type]
  const collage = isTopas && p.collage && p.collage.length ? p.collage : null
  return (
    <Link href={feedHref(p)} className="group block w-[170px] shrink-0 snap-start no-underline">
      <div className="relative aspect-square overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--cover-placeholder)]">
        {collage ? (
          <CollageCover imgs={collage} />
        ) : p.cover ? (
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

function NaujausiRow() {
  const [posts, setPosts] = useState<FeedPost[] | null>(null)
  useEffect(() => {
    let on = true
    fetch('/api/atradimai/feed?limit=18').then(r => r.json()).then(d => { if (on) setPosts(d.posts || []) }).catch(() => { if (on) setPosts([]) })
    return () => { on = false }
  }, [])
  return (
    <section className="mb-9">
      <RowHead title="Naujausi įrašai" accent="#0ea5e9" allHref="/blogas" />
      {posts === null ? <SkelRow /> : posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-default)] p-5 text-center text-[12.5px] text-[var(--text-muted)]">Įrašų dar nėra. <Link href="/blogas/rasyti" className="font-bold text-[var(--accent-orange)] no-underline">Parašyk pirmas →</Link></div>
      ) : (
        <div className={SCROLL}>{posts.map(p => <PostCard key={p.id} p={p} showType />)}</div>
      )}
    </section>
  )
}

// ───────── Standartinė kategorijų eilė (Kūryba / Vertimai) ─────────
function BlogRow({ title, query, accent, allHref, writeType, inviteLabel }: { title: string; query: string; accent: string; allHref: string; writeType: string; inviteLabel: string }) {
  const [posts, setPosts] = useState<FeedPost[] | null>(null)
  useEffect(() => {
    let on = true
    fetch(`/api/atradimai/feed?${query}&limit=16`).then(r => r.json()).then(d => { if (on) setPosts(d.posts || []) }).catch(() => { if (on) setPosts([]) })
    return () => { on = false }
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

// ───────────────────────── Diskusijos (pilnas komentaras) ─────────────────────────
function DiskusijosRow() {
  const [items, setItems] = useState<Diskusija[] | null>(null)
  useEffect(() => {
    let on = true
    fetch('/api/diskusijos/recent?limit=14').then(r => r.json()).then(d => {
      if (!on) return
      const seen = new Set<string>(); const out: Diskusija[] = []
      for (const it of (d.items || []) as Diskusija[]) {
        const k = it.author_name || it.latest_comment?.author || `d-${it.id}`
        if (seen.has(k)) continue; seen.add(k); out.push(it)
      }
      setItems(out.slice(0, 10))
    }).catch(() => { if (on) setItems([]) })
    return () => { on = false }
  }, [])
  return (
    <section className="mb-9">
      <RowHead title="Diskusijos" accent="#8b5cf6" allHref="/diskusijos" />
      {items === null ? (
        <div className={SCROLL}>{Array(4).fill(null).map((_, i) => <div key={i} className="hp-skel h-[200px] w-[360px] shrink-0 rounded-2xl" />)}</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-default)] p-5 text-center text-[12.5px] text-[var(--text-muted)]">Diskusijų dar nėra. <Link href="/diskusijos" className="font-bold text-[var(--accent-orange)] no-underline">Pradėk pirmas →</Link></div>
      ) : (
        <div className="hp-scroll flex items-start gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x">
          {items.map(d => (
            <Link key={d.id} href={`/diskusijos/${d.slug}`} className="group flex w-[360px] shrink-0 snap-start flex-col rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 no-underline transition-all hover:-translate-y-0.5 hover:border-[rgba(139,92,246,0.5)]">
              <div className="flex items-center gap-2.5">
                <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-[var(--cover-placeholder)]">
                  {d.artist_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proxyImg(d.artist_image)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center" style={{ background: `hsl(${hue(d.title)},30%,18%)`, color: `hsl(${hue(d.title)},45%,60%)` }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {d.artist_name && <span className="block truncate text-[10px] font-extrabold uppercase tracking-[0.06em]" style={{ color: '#8b5cf6' }}>{d.artist_name}</span>}
                  <p className="m-0 line-clamp-2 font-['Outfit',sans-serif] text-[14px] font-extrabold leading-tight text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{d.title}</p>
                </div>
              </div>
              {d.latest_comment ? (
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-[var(--bg-hover)] p-3">
                  <Avatar src={d.latest_comment.avatar} name={d.latest_comment.author} size={26} />
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-[11.5px] font-bold text-[var(--text-secondary)]">{d.latest_comment.author}</p>
                    <p className="m-0 mt-1 line-clamp-[10] whitespace-pre-line text-[12.5px] leading-relaxed text-[var(--text-secondary)]">{d.latest_comment.excerpt}</p>
                  </div>
                </div>
              ) : (
                <p className="m-0 mt-3 text-[12px] text-[var(--text-muted)]">{d.author_name || 'Anonimas'} pradėjo temą</p>
              )}
              <p className="m-0 mt-2 text-[10.5px] text-[var(--text-faint)]">prieš {timeAgo(d.latest_comment?.created_at || d.created_at)}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

// ───────────────────────── Nauji nariai (suimportuoti) ─────────────────────────
function memberSince(m: NewMember): string {
  if (m.joined_legacy_at) {
    const y = new Date(m.joined_legacy_at).getFullYear()
    if (!isNaN(y)) return `narys nuo ${y}`
  }
  return `prisijungė ${timeAgo(m.created_at)}`
}

function NaujiNariaiRow({ list, loading }: { list: NewMember[]; loading: boolean }) {
  return (
    <section className="mb-9">
      <RowHead title="Nauji nariai" accent="#10b981" allHref="/vartotojai" />
      {loading ? (
        <div className={SCROLL}>{Array(8).fill(null).map((_, i) => <div key={i} className="hp-skel h-[128px] w-[120px] shrink-0 rounded-xl" />)}</div>
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-default)] p-5 text-center text-[12.5px] text-[var(--text-muted)]">Naujų narių dar nėra.</div>
      ) : (
        <div className={SCROLL}>
          {list.map(m => (
            <Link key={m.username} href={`/@${m.username}`} className="group flex w-[120px] shrink-0 snap-start flex-col items-center rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-center no-underline transition-all hover:-translate-y-0.5 hover:border-[rgba(16,185,129,0.5)]">
              <Avatar src={m.avatar} name={m.name} size={46} />
              <p className="m-0 mt-2 w-full truncate font-['Outfit',sans-serif] text-[12px] font-extrabold text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{m.name}</p>
              <p className="m-0 mt-0.5 text-[10px] text-[var(--text-faint)]">{memberSince(m)}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

// ───────────────────────── Page ─────────────────────────
export default function AtrastiPage() {
  const [newMembers, setNewMembers] = useState<NewMember[] | null>(null)
  useEffect(() => {
    let on = true
    fetch('/api/atradimai/active-members?days=7&limit=14').then(r => r.json()).then(d => {
      if (!on) return
      setNewMembers(d.new_members || [])
    }).catch(() => { if (on) setNewMembers([]) })
    return () => { on = false }
  }, [])

  return (
    <div className="page-shell">
      <SlimHeader />

      {/* Top band: Dienos daina + „Kas vyksta" dešinėje (mobile — po juo) */}
      <section className="mb-9 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0"><DienosDainaSection /></div>
        <div className="min-w-0">
          <div className="h-[360px] overflow-hidden"><ActivityWidget /></div>
        </div>
      </section>

      {/* PROMINENTŪS muzikos įrašai */}
      <BigBlogRow title="Muzikos apžvalgos" query="editorial=recenzija" allHref="/blogas" writeType="review" accent="#ef4444" inviteLabel="Parašyk apžvalgą" />
      <BigBlogRow title="Koncertų įspūdžiai" query="editorial=koncertai" allHref="/blogas" writeType="article" accent="#3b82f6" inviteLabel="Pasidalink koncerto įspūdžiu" />
      <TopaiRow />

      <MuzikosAtradimaiRow />
      <NaujausiRow />
      <DiskusijosRow />
      <NaujiNariaiRow list={newMembers || []} loading={newMembers === null} />

      {/* ATSKIRAI ŽEMIAU: kūryba ir vertimai (nesietina su muzikos įrašais) */}
      <div className="mt-12 border-t border-[var(--border-default)] pt-8">
        <div className="mb-5">
          <h2 className="m-0 font-['Outfit',sans-serif] text-[15px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-muted)]">Kūryba ir vertimai</h2>
          <p className="m-0 mt-1 text-[12.5px] text-[var(--text-muted)]">Narių eilėraščiai, esė ir dainų tekstų vertimai</p>
        </div>
        <BlogRow title="Kūryba" query="type=creation" allHref="/blogas?type=creation" writeType="creation" accent="#ec4899" inviteLabel="Įkelk kūrybą" />
        <BlogRow title="Vertimai" query="type=translation" allHref="/blogas?type=translation" writeType="translation" accent="#10b981" inviteLabel="Pridėk vertimą" />
      </div>
    </div>
  )
}
