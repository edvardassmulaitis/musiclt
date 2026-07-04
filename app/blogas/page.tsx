'use client'
// app/blogas/page.tsx — „Narių įrašai"
//
// 2026-06-11 consistency redesign (pagal UI_CONSISTENCY_AUDIT):
//   • buvo: siauras sąrašas su hard-coded hex spalvom (šviesioj temoj H1 ir
//     pavadinimai NEMATOMI), legacy #hashtag'ai, jokios vizualinės kalbos;
//   • dabar: theme-aware .page-shell/.page-head, pill filter bar su tipo
//     spalvom (kaip /atrasti Pulsas), kortelių grid su cover/excerpt/topo
//     pozicijom (duomenys iš /api/atradimai/feed — vizualų resolve jau ten),
//     „Rodyti daugiau" paginacija, CTA standartinėje vietoje.

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'

type ListEntry = { rank: number; title: string; artist: string | null; image: string | null }
type FeedPost = {
  id: number; slug: string; title: string; post_type: string; rating: number | null
  like_count: number | null; comment_count: number | null; published_at: string | null
  editorial_type: string | null; excerpt: string | null
  cover: string | null; entries: ListEntry[] | null; blog_slug: string | null
  author: { id: string | null; full_name: string | null; username: string | null; avatar_url: string | null } | null
}

function hue(s: string) { let h = 0; for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h }
function sani(s?: string | null) {
  return (s || '').replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim()
}
function timeAgo(d?: string | null) {
  if (!d) return ''
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 60) return m < 2 ? 'ką tik' : `prieš ${m} min.`
  const h = Math.floor(m / 60)
  if (h < 24) return `prieš ${h} val.`
  const days = Math.floor(h / 24)
  if (days < 7) return `prieš ${days} d.`
  if (days < 31) return `prieš ${Math.floor(days / 7)} sav.`
  return ''
}
function uname(a?: FeedPost['author']): string { return a?.username || a?.full_name || 'narys' }
function feedHref(p: FeedPost) { return p.blog_slug ? `/blogas/${p.blog_slug}/${p.slug}` : '/blogas' }

function postKind(p: FeedPost): string {
  if (p.post_type === 'topas') return 'topas'
  if (p.post_type === 'review' || p.editorial_type === 'recenzija') return 'apzvalga'
  if (p.editorial_type === 'koncertai') return 'koncertai'
  if (p.editorial_type === 'atradimas') return 'atradimas'
  if (p.post_type === 'creation') return 'kuryba'
  if (p.post_type === 'translation') return 'vertimas'
  return 'irasas'
}
const KIND_META: Record<string, { label: string; color: string }> = {
  apzvalga: { label: 'Muzikos apžvalga', color: '#ef4444' },
  koncertai: { label: 'Koncertų įspūdžiai', color: '#3b82f6' },
  topas: { label: 'Topas', color: '#f59e0b' },
  atradimas: { label: 'Atradimas', color: 'var(--accent-orange)' },
  kuryba: { label: 'Kūryba', color: '#ec4899' },
  vertimas: { label: 'Vertimas', color: '#10b981' },
  irasas: { label: 'Įrašas', color: '#94a3b8' },
}

const CHIPS: { key: string; label: string; color?: string }[] = [
  { key: 'visi', label: 'Visi' },
  { key: 'apzvalga', label: 'Muzikos apžvalgos', color: '#ef4444' },
  { key: 'koncertai', label: 'Koncertų įspūdžiai', color: '#3b82f6' },
  { key: 'topas', label: 'Topai', color: '#f59e0b' },
  { key: 'kuryba', label: 'Kūryba', color: '#ec4899' },
  { key: 'vertimas', label: 'Vertimai', color: '#10b981' },
  { key: 'irasas', label: 'Įvairūs', color: '#94a3b8' },
]

function Avatar({ src, name, size = 20 }: { src?: string | null; name?: string | null; size?: number }) {
  const nm = name || 'narys'
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={proxyImg(src)} alt="" width={size} height={size} loading="lazy" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  }
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full font-extrabold"
      style={{ width: size, height: size, fontSize: size * 0.42, background: `hsl(${hue(nm)},32%,20%)`, color: `hsl(${hue(nm)},52%,62%)` }}>
      {nm.charAt(0).toUpperCase()}
    </span>
  )
}

function Badge({ kind }: { kind: string }) {
  const m = KIND_META[kind] || KIND_META.irasas
  return (
    <span className="absolute left-3 top-3 z-[2] rounded-[7px] px-2 py-1 font-['Outfit',sans-serif] text-[12px] font-extrabold uppercase tracking-[0.08em] text-white" style={{ background: m.color }}>{m.label}</span>
  )
}

function Meta({ p }: { p: FeedPost }) {
  const ago = timeAgo(p.published_at)
  return (
    <div className="mt-auto flex items-center gap-2 border-t border-[var(--border-subtle)] px-3.5 py-2.5">
      <Avatar src={p.author?.avatar_url} name={uname(p.author)} />
      <span className="min-w-0 truncate text-[14px] font-semibold text-[var(--text-secondary)]">{uname(p.author)}</span>
      {ago && <span className="shrink-0 text-[12px] text-[var(--text-faint)]">{ago}</span>}
      <span className="ml-auto flex shrink-0 items-center gap-2.5 text-[14px] text-[var(--text-muted)]">
        {(p.like_count ?? 0) > 0 && <span>♥ {p.like_count}</span>}
        {(p.comment_count ?? 0) > 0 && <span>💬 {p.comment_count}</span>}
      </span>
    </div>
  )
}

function PostCard({ p }: { p: FeedPost }) {
  const kind = postKind(p)
  if (p.post_type === 'topas') {
    const entries = (p.entries || []).slice(0, 4)
    return (
      <Link href={feedHref(p)} className="group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] no-underline transition-all hover:-translate-y-1 hover:border-[rgba(245,158,11,0.5)] sm:min-h-[340px]">
        <div className="flex px-3.5 pt-3.5">
          <span className="inline-flex self-start rounded-[7px] px-2 py-1 font-['Outfit',sans-serif] text-[12px] font-extrabold uppercase tracking-[0.08em] text-white" style={{ background: '#f59e0b' }}>Topas</span>
        </div>
        <div className="flex flex-1 flex-col px-3.5 pb-1 pt-2.5">
          <h3 className="m-0 line-clamp-2 font-['Outfit',sans-serif] text-[16px] font-extrabold leading-snug text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{sani(p.title)}</h3>
          <div className="mt-2 flex flex-col">
            {entries.map(e => (
              <div key={e.rank} className="flex items-center gap-2.5 border-b border-[var(--border-subtle)] py-[6px] last:border-b-0">
                <span className={`w-4 shrink-0 text-center font-['Outfit',sans-serif] text-[14px] font-black ${e.rank <= 3 ? 'text-[var(--accent-orange)]' : 'text-[var(--text-faint)]'}`}>{e.rank}</span>
                {e.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={proxyImg(e.image)} alt="" loading="lazy" className="h-7 w-7 shrink-0 rounded-[7px] object-cover" />
                ) : <div className="h-7 w-7 shrink-0 rounded-[7px]" style={{ background: `hsl(${hue(e.title)},30%,20%)` }} />}
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-[14px] font-bold text-[var(--text-primary)]">{sani(e.title)}</p>
                  {e.artist && <p className="m-0 truncate text-[12px] text-[var(--text-muted)]">{e.artist}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
        <Meta p={p} />
      </Link>
    )
  }
  return (
    <Link href={feedHref(p)} className="group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] no-underline transition-all hover:-translate-y-1 hover:border-[var(--border-strong)] sm:min-h-[340px]">
      <Badge kind={kind} />
      <div className="relative h-[130px] shrink-0 overflow-hidden bg-[var(--cover-placeholder)]">
        {p.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyImg(p.cover)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
        ) : <div className="h-full w-full" style={{ background: `linear-gradient(135deg, hsl(${hue(p.title)},34%,22%), hsl(${(hue(p.title) + 40) % 360},30%,12%))` }} />}
        {p.rating != null && <span className="absolute right-2 top-2 rounded-md bg-black/75 px-1.5 py-0.5 text-[14px] font-black text-amber-300">★ {p.rating}</span>}
      </div>
      <div className="flex flex-1 flex-col px-3.5 pb-2 pt-3">
        <h3 className="m-0 line-clamp-2 font-['Outfit',sans-serif] text-[16px] font-extrabold leading-snug text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{sani(p.title) || '(be pavadinimo)'}</h3>
        {p.excerpt && <p className="m-0 mt-1.5 line-clamp-4 text-[14px] leading-relaxed text-[var(--text-secondary)]">{p.excerpt}</p>}
      </div>
      <Meta p={p} />
    </Link>
  )
}

const pill = (active: boolean, color?: string) =>
  `flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 font-['Outfit',sans-serif] text-[14px] font-bold transition-colors ${
    active ? 'border-transparent text-white' : 'border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
  }`

const PAGE = 18

// chip → feed API užklausos (apžvalgos = review tipas + recenzija editorial)
function chipQueries(chip: string): string[] {
  const base = 'nodedup=1&limit=30'
  switch (chip) {
    case 'apzvalga': return [`type=review&${base}`, `editorial=recenzija&${base}`]
    case 'koncertai': return [`editorial=koncertai&${base}`]
    case 'topas': return [`type=topas&${base}`]
    case 'kuryba': return [`type=creation&${base}`]
    case 'vertimas': return [`type=translation&${base}`]
    case 'irasas': return [`exclude_type=topas,review,creation,translation&exclude_editorial=recenzija,koncertai,atradimas&${base}`]
    default: return [`${base}`]
  }
}

export default function BlogIndexPage() {
  const [chip, setChip] = useState('visi')
  const [posts, setPosts] = useState<FeedPost[] | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [shown, setShown] = useState(PAGE)
  const [loadingMore, setLoadingMore] = useState(false)
  const offsetRef = useRef(0)

  useEffect(() => {
    let on = true
    setPosts(null); setShown(PAGE); offsetRef.current = 0
    Promise.all(chipQueries(chip).map(q => fetch(`/api/atradimai/feed?${q}`).then(r => r.json()).catch(() => ({}))))
      .then(results => {
        if (!on) return
        const seen = new Set<number>()
        const merged: FeedPost[] = []
        for (const r of results) for (const p of (r.posts || []) as FeedPost[]) {
          if (seen.has(p.id)) continue
          seen.add(p.id); merged.push(p)
        }
        merged.sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''))
        setPosts(merged)
        setHasMore(results.some((r: any) => r.hasMore))
        offsetRef.current = Math.max(...results.map((r: any) => (r.posts || []).length), 0)
      })
    return () => { on = false }
  }, [chip])

  const more = async () => {
    if ((posts?.length || 0) > shown) { setShown(s => s + PAGE); return }
    setLoadingMore(true)
    try {
      const results = await Promise.all(chipQueries(chip).map(q => fetch(`/api/atradimai/feed?${q}&offset=${offsetRef.current}`).then(r => r.json()).catch(() => ({}))))
      const seen = new Set((posts || []).map(p => p.id))
      const extra: FeedPost[] = []
      for (const r of results) for (const p of (r.posts || []) as FeedPost[]) {
        if (seen.has(p.id)) continue
        seen.add(p.id); extra.push(p)
      }
      extra.sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''))
      setPosts(prev => [...(prev || []), ...extra])
      setHasMore(results.some((r: any) => r.hasMore))
      offsetRef.current += Math.max(...results.map((r: any) => (r.posts || []).length), 0)
    } catch {}
    setLoadingMore(false)
    setShown(s => s + PAGE)
  }

  const visible = useMemo(() => (posts || []).slice(0, shown), [posts, shown])

  return (
    <div className="page-shell">
      <div className="page-head">
        <h1>Narių įrašai</h1>
        <p>Bendruomenės apžvalgos, topai, kūryba ir vertimai</p>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {CHIPS.map(c => (
          <button key={c.key} type="button" onClick={() => setChip(c.key)}
            className={pill(chip === c.key, c.color)}
            style={chip === c.key ? { background: c.color || 'var(--accent-orange)' } : undefined}>
            {c.color && chip !== c.key && <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />}
            {c.label}
          </button>
        ))}
        <span className="ml-auto" />
        <Link href="/blogas/mano" className="shrink-0 rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] px-3.5 py-1.5 font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-secondary)] no-underline hover:border-[var(--border-strong)]">Mano įrašai</Link>
        <Link href="/blogas/rasyti" className="shrink-0 rounded-xl bg-[var(--accent-orange)] px-4 py-2 font-['Outfit',sans-serif] text-[14px] font-extrabold text-white no-underline shadow-[0_4px_16px_rgba(249,115,22,0.3)] transition-transform hover:-translate-y-px">+ Rašyti</Link>
      </div>

      {posts === null ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array(6).fill(null).map((_, i) => <div key={i} className="hp-skel h-[340px] rounded-2xl" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-default)] py-16 text-center">
          <p className="m-0 text-[14px] text-[var(--text-muted)]">Šio filtro įrašų dar nėra.</p>
          <Link href="/blogas/rasyti" className="mt-2 inline-block font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--accent-orange)] no-underline">Parašyk pirmąjį →</Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map(p => <PostCard key={p.id} p={p} />)}
          </div>
          {((posts.length > shown) || hasMore) && (
            <div className="mt-6 flex justify-center">
              <button type="button" onClick={more} disabled={loadingMore}
                className="cursor-pointer rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] px-9 py-2.5 font-['Outfit',sans-serif] text-[14px] font-extrabold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-orange)] hover:text-[var(--accent-orange)] disabled:opacity-50">
                {loadingMore ? 'Kraunama…' : 'Rodyti daugiau ↓'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
