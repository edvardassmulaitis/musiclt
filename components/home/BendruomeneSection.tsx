'use client'
// components/home/BendruomeneSection.tsx
//
// Sujungtas bendruomenės strip'as homepage'ui.
// Viskas scrollinama — DD kortelė yra pirmas elementas, ne sticky.
//
// items[0].type === 'dd'         → DDCard (šiandien lyderis / vakarykštis)
// items[n].type === 'blog'       → BlogCard (diary/review/creation/translation/topas)
// items[n].type === 'discussion' → DiscCard (diskusija su atlikėjo cover)

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Scroller from '@/components/ui/Scroller'
import { proxyImg } from '@/lib/img-proxy'

// ── Types ──────────────────────────────────────────────────────────────────────
type CommunityItem = {
  id: string
  type: 'dd' | 'blog' | 'discussion'
  subtype?: string | null
  title: string
  href: string
  cover: string | null
  author_name: string | null
  author_slug?: string | null
  author_avatar: string | null
  created_at: string
  comment_count?: number
  vote_count?: number | null
  vote_total?: number | null
  engagement?: number
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function strHue(s: string) {
  let h = 0
  for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360
  return h
}
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return m < 2 ? 'ką tik' : `${m} min.`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} val.`
  const d = Math.floor(h / 24)
  return d < 30 ? `${d} d.` : `${Math.floor(d / 30)} mėn.`
}
function blogTypeLabel(sub?: string | null) {
  const map: Record<string, string> = {
    review: '⭐ Recenzija', creation: '🎨 Kūryba', translation: '🌐 Vertimas',
    topas: '📊 Topas', event: '📅 Renginys', article: '✍️ Dienoraštis', quick: '✍️ Įrašas',
  }
  return map[sub || ''] || '✍️ Įrašas'
}
function blogTypeColor(sub?: string | null) {
  const map: Record<string, string> = {
    review: 'var(--accent-yellow,#f59e0b)', creation: '#3cca7e',
    translation: 'var(--accent-link,#5b9be8)', topas: '#a78bfa', event: '#fb923c',
  }
  return map[sub || ''] || 'var(--accent-orange,#f2641a)'
}

// ── Cover with gradient fallback ───────────────────────────────────────────────
function Cover({ url, alt, hue }: { url: string | null; alt: string; hue: number }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={proxyImg(url)} alt={alt} loading="lazy"
      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
    />
  ) : (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{ background: `linear-gradient(135deg, hsl(${hue},34%,22%), hsl(${(hue + 40) % 360},30%,12%))` }}
    >
      <span className="font-['Outfit',sans-serif] text-3xl font-black text-white/60">
        {(alt || '?').charAt(0).toUpperCase()}
      </span>
    </div>
  )
}

// ── Avatar row ─────────────────────────────────────────────────────────────────
function AvatarRow({ name, avatar, time, hue }: { name: string | null; avatar: string | null; time: string; hue: number }) {
  return (
    <div className="mt-auto flex items-center gap-1.5 pt-2">
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={proxyImg(avatar)} alt="" className="h-[16px] w-[16px] shrink-0 rounded-full object-cover" />
      ) : name ? (
        <div
          className="flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full text-[7px] font-extrabold"
          style={{ fontFamily: "'Outfit',sans-serif", background: `hsl(${hue},32%,18%)`, color: `hsl(${hue},45%,55%)` }}
        >
          {name.charAt(0).toUpperCase()}
        </div>
      ) : null}
      <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--text-secondary)]" style={{ fontFamily: "'Outfit',sans-serif" }}>
        {name || 'Narys'}
      </span>
      <span className="shrink-0 text-[9px] text-[var(--text-faint)]">{timeAgo(time)}</span>
    </div>
  )
}

// ── Dienos daina card ──────────────────────────────────────────────────────────
function DDCard({ it }: { it: CommunityItem }) {
  const isToday = it.subtype === 'today_leader'
  const h = strHue(it.author_name || it.title)
  return (
    <Link href={it.href} className="hp-card group flex flex-col overflow-hidden p-0 no-underline" style={{ width: 200, flexShrink: 0 }}>
      {/* Square cover for DD */}
      <div className="relative overflow-hidden" style={{ aspectRatio: '1/1' }}>
        <Cover url={it.cover} alt={it.title} hue={h} />
        <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 45%, rgba(0,0,0,0.7))' }} />
        <span
          className="absolute left-2 top-2 rounded px-1.5 py-0.5 font-['Outfit',sans-serif] text-[8.5px] font-extrabold uppercase tracking-[0.06em] text-white backdrop-blur-sm"
          style={{ background: isToday ? 'var(--accent-orange,#f2641a)' : 'rgba(30,10,0,0.75)' }}
        >
          {isToday ? '🎵 Šiandien lyderis' : '🏆 Vakarykštis'}
        </span>
        {isToday && (it.vote_count ?? 0) > 0 && (
          <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 font-['Outfit',sans-serif] text-[9px] font-bold text-white backdrop-blur-sm">
            {it.vote_count} bals.
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-2.5" style={{ background: 'linear-gradient(160deg,#1c0a00,#2d1400)' }}>
        <p className="m-0 line-clamp-2 font-['Outfit',sans-serif] text-[12.5px] font-extrabold leading-snug text-white">
          {it.title}
        </p>
        {it.author_name && (
          <p className="m-0 mt-1 truncate text-[10.5px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{it.author_name}</p>
        )}
        <span className="mt-auto pt-2 text-[10px] font-semibold text-[var(--accent-orange)] opacity-80">
          {isToday ? 'Balsuoti dabar →' : 'Dienos daina →'}
        </span>
      </div>
    </Link>
  )
}

// ── Blog card ──────────────────────────────────────────────────────────────────
function BlogCard({ it }: { it: CommunityItem }) {
  const h = strHue(it.author_name || it.title)
  return (
    <Link href={it.href} className="hp-card group flex flex-col overflow-hidden p-0 no-underline" style={{ width: 210, flexShrink: 0 }}>
      <div className="relative overflow-hidden" style={{ aspectRatio: '16/9' }}>
        <Cover url={it.cover} alt={it.author_name || it.title} hue={h} />
        <span
          className="absolute left-2 top-2 rounded px-1.5 py-0.5 font-['Outfit',sans-serif] text-[8.5px] font-extrabold uppercase tracking-[0.05em] text-white backdrop-blur-sm"
          style={{ background: blogTypeColor(it.subtype) }}
        >
          {blogTypeLabel(it.subtype)}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-2.5">
        <p className="m-0 line-clamp-2 font-['Outfit',sans-serif] text-[12.5px] font-extrabold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">
          {it.title}
        </p>
        <AvatarRow name={it.author_name} avatar={it.author_avatar} time={it.created_at} hue={h} />
      </div>
    </Link>
  )
}

// ── Discussion card ────────────────────────────────────────────────────────────
function DiscCard({ it }: { it: CommunityItem }) {
  const h = strHue(it.title)
  return (
    <Link href={it.href} className="hp-card group flex flex-col overflow-hidden p-0 no-underline" style={{ width: 210, flexShrink: 0 }}>
      <div className="relative overflow-hidden" style={{ aspectRatio: '16/9' }}>
        <Cover url={it.cover} alt={it.title} hue={h} />
        <span
          className="absolute left-2 top-2 rounded px-1.5 py-0.5 font-['Outfit',sans-serif] text-[8.5px] font-extrabold uppercase tracking-[0.05em] text-white backdrop-blur-sm"
          style={{ background: 'var(--accent-link,#5b9be8)' }}
        >
          💬 Diskusija
        </span>
        {(it.comment_count ?? 0) > 0 && (
          <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 font-['Outfit',sans-serif] text-[9px] font-bold text-white backdrop-blur-sm">
            {it.comment_count} atsak.
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-2.5">
        <p className="m-0 line-clamp-2 font-['Outfit',sans-serif] text-[12.5px] font-extrabold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">
          {it.title}
        </p>
        <AvatarRow name={it.author_name} avatar={it.author_avatar} time={it.created_at} hue={h} />
      </div>
    </Link>
  )
}

// ── Skeletonai ─────────────────────────────────────────────────────────────────
function CardSkel({ w = 210, ratio = '16/9' }: { w?: number; ratio?: string }) {
  return (
    <div className="shrink-0" style={{ width: w }}>
      <div className="hp-skel rounded-t-xl" style={{ aspectRatio: ratio }} />
      <div className="hp-skel mt-0.5 h-[80px] rounded-b-xl" />
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function BendruomeneSection() {
  const [items, setItems] = useState<CommunityItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetch('/api/home/community')
      .then(r => r.json())
      .then((data: { items: CommunityItem[] }) => {
        if (!alive) return
        setItems(Array.isArray(data.items) ? data.items : [])
        setLoading(false)
      })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  if (!loading && items.length === 0) return null

  return (
    <section>
      <div className="mb-3.5 flex items-center justify-between">
        <h2 className="m-0 font-['Outfit',sans-serif] text-[17px] font-extrabold tracking-[-0.01em] text-[var(--text-primary)] sm:text-[18px]">
          Bendruomenė
        </h2>
        <Link
          href="/atrasti"
          className="font-['Outfit',sans-serif] text-[11.5px] font-bold text-[var(--accent-orange)] no-underline transition-opacity hover:opacity-70"
        >
          Atrasti →
        </Link>
      </div>

      <Scroller gap={10} ariaLabel="Bendruomenė">
        {loading
          ? [
              <CardSkel key="s0" w={200} ratio="1/1" />,
              ...Array(4).fill(null).map((_, i) => <CardSkel key={i + 1} />),
            ]
          : items.map(it =>
              it.type === 'dd'
                ? <DDCard key={it.id} it={it} />
                : it.type === 'discussion'
                  ? <DiscCard key={it.id} it={it} />
                  : <BlogCard key={it.id} it={it} />,
            )}
      </Scroller>
    </section>
  )
}
