'use client'
// components/home/BendruomeneSection.tsx
//
// Sujungtas bendruomenės strip'as homepage'ui (pakeičia PulsasSection +
// HotStrip + DienosDainaSection).
//
// Layout:
//   [ Dienos daina (pinned, 170px) ] [ blog + diskusijų kortelės (Scroller) ]
//
// Dienos daina kortelė yra atskirame div (ne Scroller viduje) — todėl ji
// visada matoma ir nesuka kartu su kitomis korteles (CSS sticky neveikia
// overflow-x kontaineriuose).

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Scroller from '@/components/ui/Scroller'
import { proxyImg } from '@/lib/img-proxy'

// ── Types ──────────────────────────────────────────────────────────────────────
type DDItem = {
  id: string
  href: string
  title: string
  artist: string
  coverUrl: string | null
  date: string
}
type CommunityItem = {
  id: string
  type: 'blog' | 'discussion'
  subtype?: string | null
  title: string
  href: string
  cover: string | null
  author_name: string | null
  author_avatar: string | null
  created_at: string
  comment_count?: number
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
  return `${Math.floor(h / 24)} d.`
}
function typeLabel(type: string, sub?: string | null) {
  if (type === 'discussion') return '💬 Diskusija'
  const map: Record<string, string> = {
    review: '⭐ Recenzija', creation: '🎨 Kūryba', translation: '🌐 Vertimas',
    topas: '📊 Topas', event: '📅 Renginys', article: '✍️ Blogas', quick: '✍️ Įrašas',
  }
  return map[sub || ''] || '✍️ Įrašas'
}
function typeColor(type: string, sub?: string | null) {
  if (type === 'discussion') return 'var(--accent-link,#5b9be8)'
  const map: Record<string, string> = {
    review: 'var(--accent-yellow,#f59e0b)',
    creation: '#3cca7e',
    translation: 'var(--accent-link,#5b9be8)',
  }
  return map[sub || ''] || 'var(--accent-orange,#f2641a)'
}

// ── Dienos daina (pinned) ──────────────────────────────────────────────────────
function DDCard({ dd }: { dd: DDItem }) {
  return (
    <Link
      href={dd.href}
      className="hp-card group flex h-full flex-col overflow-hidden p-0 no-underline"
      style={{ width: 170, flexShrink: 0 }}
    >
      <div className="relative aspect-video overflow-hidden" style={{ background: 'linear-gradient(135deg,#f2641a,#b83800)' }}>
        {dd.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxyImg(dd.coverUrl)}
            alt={dd.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
            style={{ filter: 'brightness(0.85) saturate(1.1)' }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl">🎵</div>
        )}
        <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.65))' }} />
      </div>
      <div className="flex flex-1 flex-col p-2.5" style={{ background: 'linear-gradient(160deg,#1c0a00,#2d1400)' }}>
        <span className="mb-1 block font-['Outfit',sans-serif] text-[8.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--accent-orange)]">
          🏆 Dienos daina
        </span>
        <p className="m-0 line-clamp-2 font-['Outfit',sans-serif] text-[12.5px] font-extrabold leading-snug text-white">
          {dd.title}
        </p>
        {dd.artist && (
          <p className="m-0 mt-1 truncate text-[10.5px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
            {dd.artist}
          </p>
        )}
        <span className="mt-auto pt-2 text-[10px] font-semibold text-[var(--accent-orange)] opacity-80">
          Balsuoti dabar →
        </span>
      </div>
    </Link>
  )
}

// ── Community card ─────────────────────────────────────────────────────────────
function CommunityCard({ it }: { it: CommunityItem }) {
  const ac = typeColor(it.type, it.subtype)
  const label = typeLabel(it.type, it.subtype)
  const h = strHue(it.author_name || it.title)
  return (
    <Link
      href={it.href}
      className="hp-card group flex flex-col overflow-hidden p-0 no-underline"
      style={{ width: 220, flexShrink: 0 }}
    >
      <div className="relative aspect-video overflow-hidden bg-[var(--cover-placeholder)]">
        {it.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxyImg(it.cover)}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
          />
        ) : (
          <div
            className="flex h-full w-full flex-col items-center justify-center"
            style={{ background: `linear-gradient(135deg, hsl(${h},34%,22%), hsl(${(h + 40) % 360},30%,12%))` }}
          >
            <span className="font-['Outfit',sans-serif] text-3xl font-black text-white/80">
              {(it.author_name || it.title || '?').charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <span
          className="absolute left-2 top-2 rounded px-1.5 py-0.5 font-['Outfit',sans-serif] text-[8.5px] font-extrabold uppercase tracking-[0.05em] text-white backdrop-blur-sm"
          style={{ background: ac }}
        >
          {label}
        </span>
        {it.type === 'discussion' && (it.comment_count ?? 0) > 0 && (
          <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 font-['Outfit',sans-serif] text-[9px] font-bold text-white backdrop-blur-sm">
            {it.comment_count} atsak.
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <p className="m-0 line-clamp-2 font-['Outfit',sans-serif] text-[13px] font-extrabold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">
          {it.title}
        </p>
        <div className="mt-auto flex items-center gap-2 pt-2.5">
          {it.author_avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proxyImg(it.author_avatar)} alt="" className="h-[18px] w-[18px] shrink-0 rounded-full object-cover" />
          ) : it.author_name ? (
            <div
              className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full font-['Outfit',sans-serif] text-[8px] font-extrabold"
              style={{ background: `hsl(${h},32%,18%)`, color: `hsl(${h},45%,55%)` }}
            >
              {it.author_name.charAt(0).toUpperCase()}
            </div>
          ) : null}
          <span className="min-w-0 flex-1 truncate text-[10.5px] text-[var(--text-secondary)]">
            {it.author_name || 'Anonimas'}
          </span>
          <span className="shrink-0 text-[9px] text-[var(--text-faint)]">{timeAgo(it.created_at)}</span>
        </div>
      </div>
    </Link>
  )
}

// ── Skeletonai ─────────────────────────────────────────────────────────────────
function DDSkel() {
  return (
    <div className="hp-card flex flex-col overflow-hidden p-0" style={{ width: 170, flexShrink: 0 }}>
      <div className="hp-skel aspect-video" />
      <div className="flex flex-col gap-2 p-2.5" style={{ background: 'linear-gradient(160deg,#1c0a00,#2d1400)' }}>
        <div className="hp-skel h-2 w-24 rounded" style={{ opacity: 0.25 }} />
        <div className="hp-skel h-3 w-full rounded" style={{ opacity: 0.25 }} />
        <div className="hp-skel mt-0.5 h-2.5 w-3/4 rounded" style={{ opacity: 0.2 }} />
      </div>
    </div>
  )
}
function CardSkel() {
  return (
    <div className="shrink-0" style={{ width: 220 }}>
      <div className="hp-skel aspect-video rounded-t-xl" />
      <div className="hp-skel mt-0.5 h-[108px] rounded-b-xl" />
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function BendruomeneSection() {
  const [dd, setDd] = useState<DDItem | null>(null)
  const [items, setItems] = useState<CommunityItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetch('/api/home/community')
      .then(r => r.json())
      .then((data: { dd: DDItem | null; items: CommunityItem[] }) => {
        if (!alive) return
        setDd(data.dd || null)
        setItems(Array.isArray(data.items) ? data.items : [])
        setLoading(false)
      })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  if (!loading && !dd && items.length === 0) return null

  return (
    <section>
      <div className="mb-3.5 flex items-center justify-between">
        <h2 className="m-0 font-['Outfit',sans-serif] text-[17px] font-extrabold tracking-[-0.01em] text-[var(--text-primary)] sm:text-[18px]">
          Karšta dabar
        </h2>
        <Link
          href="/atrasti"
          className="font-['Outfit',sans-serif] text-[11.5px] font-bold text-[var(--accent-orange)] no-underline transition-opacity hover:opacity-70"
        >
          Atrasti →
        </Link>
      </div>

      <div className="flex items-stretch gap-3">
        {/* Pinned: Dienos daina — nesuka kartu su kitomis korteles */}
        <div style={{ width: 170, flexShrink: 0 }}>
          {loading ? <DDSkel /> : dd ? <DDCard dd={dd} /> : null}
        </div>

        {/* Scrollable: blog + diskusijų kortelės */}
        <div className="min-w-0 flex-1">
          <Scroller gap={10} ariaLabel="Bendruomenė">
            {loading
              ? Array(4).fill(null).map((_, i) => <CardSkel key={i} />)
              : items.map(it => <CommunityCard key={it.id} it={it} />)}
          </Scroller>
        </div>
      </div>
    </section>
  )
}
