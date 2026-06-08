'use client'
// components/home/BendruomeneSection.tsx — per-tipo rich cards, viskas scrollinama

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Scroller from '@/components/ui/Scroller'
import { proxyImg } from '@/lib/img-proxy'

// ── Types ──────────────────────────────────────────────────────────────────────
type Entry = { rank: number; title: string; artist: string | null; image: string | null }
type LastComment = { text: string; author: string | null; avatar: string | null; time: string }

type Candidate = { title: string; artist: string | null; cover: string | null; votes: number }

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
  candidates?: Candidate[]
  engagement?: number
  // blog extras
  excerpt?: string | null
  entries?: Entry[] | null
  // discussion extras
  last_comment?: LastComment | null
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
function blogLabel(sub?: string | null) {
  const m: Record<string, string> = {
    review: '⭐ Recenzija', creation: '🎨 Kūryba', translation: '🌐 Vertimas',
    topas: '📊 Topas', event: '📅 Renginys', article: '✍️ Dienoraštis', quick: '✍️ Įrašas',
  }
  return m[sub || ''] || '✍️ Įrašas'
}
function blogColor(sub?: string | null) {
  const m: Record<string, string> = {
    review: 'var(--accent-yellow,#f59e0b)', creation: '#3cca7e',
    translation: 'var(--accent-link,#5b9be8)', topas: '#a78bfa', event: '#fb923c',
  }
  return m[sub || ''] || 'var(--accent-orange,#f2641a)'
}

// ── Shared cover ───────────────────────────────────────────────────────────────
function Cover({ url, alt, hue, ratio = '16/9' }: { url: string | null; alt: string; hue: number; ratio?: string }) {
  return (
    <div className="relative overflow-hidden" style={{ aspectRatio: ratio }}>
      {url
        ? <img src={proxyImg(url)} alt={alt} loading="lazy" // eslint-disable-line @next/next/no-img-element
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" />
        : <div className="flex h-full w-full items-center justify-center"
            style={{ background: `linear-gradient(135deg,hsl(${hue},34%,22%),hsl(${(hue+40)%360},30%,12%))` }}>
            <span className="font-['Outfit',sans-serif] text-3xl font-black text-white/50">
              {(alt || '?').charAt(0).toUpperCase()}
            </span>
          </div>
      }
    </div>
  )
}

// ── Author row ─────────────────────────────────────────────────────────────────
function AuthorRow({ name, avatar, time, hue }: { name: string | null; avatar: string | null; time: string; hue: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {avatar
        ? <img src={proxyImg(avatar)} alt="" loading="lazy" // eslint-disable-line @next/next/no-img-element
            className="h-[15px] w-[15px] shrink-0 rounded-full object-cover" />
        : name
          ? <div className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full text-[7px] font-extrabold"
              style={{ fontFamily: "'Outfit',sans-serif", background: `hsl(${hue},32%,18%)`, color: `hsl(${hue},45%,55%)` }}>
              {name.charAt(0).toUpperCase()}
            </div>
          : null
      }
      <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--text-secondary)]"
            style={{ fontFamily: "'Outfit',sans-serif" }}>{name || 'Narys'}</span>
      <span className="shrink-0 text-[9px] text-[var(--text-faint)]">{timeAgo(time)}</span>
    </div>
  )
}

// ── Badge overlay ──────────────────────────────────────────────────────────────
function Badge({ label, bg }: { label: string; bg: string }) {
  return (
    <span className="absolute left-2 top-2 rounded px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase tracking-[0.05em] text-white backdrop-blur-sm"
          style={{ fontFamily: "'Outfit',sans-serif", background: bg }}>
      {label}
    </span>
  )
}

// ── Dienos daina card ──────────────────────────────────────────────────────────
function DDCard({ it }: { it: CommunityItem }) {
  const isToday = it.subtype === 'today_leader'
  const h = strHue(it.author_name || it.title)
  const candidates = it.candidates || []
  return (
    <Link href={it.href} className="hp-card group flex flex-col overflow-hidden p-0 no-underline" style={{ width: 240, flexShrink: 0 }}>
      {/* 16:9 — YT thumbnail */}
      <div className="relative overflow-hidden" style={{ aspectRatio: '16/9' }}>
        {it.cover
          ? <img src={proxyImg(it.cover)} alt={it.title} loading="lazy" // eslint-disable-line @next/next/no-img-element
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" />
          : <div className="flex h-full w-full items-center justify-center"
              style={{ background: `linear-gradient(135deg,hsl(${h},50%,18%),hsl(${(h+30)%360},40%,10%))` }}>
              <span className="text-4xl">🎵</span>
            </div>
        }
        <div className="pointer-events-none absolute inset-0"
             style={{ background: 'linear-gradient(to bottom,transparent 45%,rgba(0,0,0,0.65))' }} />
        <Badge label={isToday ? '🎵 Šiandien lyderis' : '🏆 Vakarykštis'}
               bg={isToday ? 'var(--accent-orange,#f2641a)' : 'rgba(20,8,0,0.75)'} />
        {isToday && (it.vote_count ?? 0) > 0 && (
          <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm"
                style={{ fontFamily: "'Outfit',sans-serif" }}>
            {it.vote_count} bals.
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-2.5" style={{ background: 'linear-gradient(160deg,#1c0a00,#2d1400)' }}>
        <p className="m-0 line-clamp-1 text-[12.5px] font-extrabold leading-snug text-white"
           style={{ fontFamily: "'Outfit',sans-serif" }}>{it.title}</p>
        {it.author_name && (
          <p className="m-0 mt-0.5 truncate text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{it.author_name}</p>
        )}
        {/* Kiti kandidatai */}
        {candidates.length > 0 && (
          <div className="mt-2 flex flex-col gap-1 border-t pt-2" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
            <p className="m-0 text-[8.5px] font-extrabold uppercase tracking-[0.08em]"
               style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Outfit',sans-serif" }}>
              Kiti kandidatai
            </p>
            {candidates.map((c, i) => (
              <div key={i} className="flex items-center gap-1.5">
                {c.cover
                  ? <img src={proxyImg(c.cover)} alt="" loading="lazy" // eslint-disable-line @next/next/no-img-element
                      className="h-[18px] w-[18px] shrink-0 rounded object-cover" />
                  : <div className="h-[18px] w-[18px] shrink-0 rounded"
                      style={{ background: `hsl(${strHue(c.title)},30%,22%)` }} />
                }
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-[10px] font-semibold leading-tight text-white/80"
                     style={{ fontFamily: "'Outfit',sans-serif" }}>{c.title}</p>
                  {c.artist && <p className="m-0 truncate text-[8.5px] leading-tight" style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Outfit',sans-serif" }}>{c.artist}</p>}
                </div>
                {c.votes > 0 && (
                  <span className="shrink-0 text-[8.5px]" style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Outfit',sans-serif" }}>{c.votes}b</span>
                )}
              </div>
            ))}
          </div>
        )}
        <span className="mt-auto pt-2 text-[10px] font-semibold text-[var(--accent-orange)] opacity-80">
          {isToday ? 'Balsuoti dabar →' : 'Dienos daina →'}
        </span>
      </div>
    </Link>
  )
}

// ── Blog card (article / review / creation / translation / quick) ──────────────
function BlogCard({ it }: { it: CommunityItem }) {
  const h = strHue(it.author_name || it.title)
  return (
    <Link href={it.href} className="hp-card group flex flex-col overflow-hidden p-0 no-underline" style={{ width: 220, flexShrink: 0 }}>
      <div className="relative">
        <Cover url={it.cover} alt={it.author_name || it.title} hue={h} />
        <Badge label={blogLabel(it.subtype)} bg={blogColor(it.subtype)} />
      </div>
      <div className="flex flex-1 flex-col p-2.5 gap-1.5">
        <p className="m-0 line-clamp-2 text-[12.5px] font-extrabold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]"
           style={{ fontFamily: "'Outfit',sans-serif" }}>{it.title}</p>
        {it.excerpt && (
          <p className="m-0 line-clamp-2 text-[10.5px] leading-relaxed text-[var(--text-secondary)]"
             style={{ fontFamily: "'Outfit',sans-serif" }}>{it.excerpt}</p>
        )}
        <div className="mt-auto">
          <AuthorRow name={it.author_name} avatar={it.author_avatar} time={it.created_at} hue={h} />
        </div>
      </div>
    </Link>
  )
}

// ── Topas card — shows top 3 ranked entries ────────────────────────────────────
function TopasCard({ it }: { it: CommunityItem }) {
  const h = strHue(it.author_name || it.title)
  const entries = it.entries || []
  return (
    <Link href={it.href} className="hp-card group flex flex-col overflow-hidden p-0 no-underline" style={{ width: 220, flexShrink: 0 }}>
      {/* Cover: pirmoji vieta su vizualu, arba gradientas */}
      <div className="relative">
        <Cover url={it.cover} alt={entries[0]?.title || it.title} hue={h} />
        <Badge label="📊 Topas" bg="#a78bfa" />
      </div>
      <div className="flex flex-1 flex-col p-2.5 gap-1">
        <p className="m-0 line-clamp-1 text-[12px] font-extrabold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]"
           style={{ fontFamily: "'Outfit',sans-serif" }}>{it.title}</p>
        {/* Top 3 rows */}
        {entries.length > 0 && (
          <div className="flex flex-col gap-0.5 mt-0.5">
            {entries.map(e => (
              <div key={e.rank} className="flex items-center gap-1.5">
                <span className="shrink-0 w-4 text-center text-[9px] font-extrabold"
                      style={{ color: e.rank === 1 ? '#fbbf24' : e.rank === 2 ? '#94a3b8' : '#c97d4d', fontFamily: "'Outfit',sans-serif" }}>
                  {e.rank}
                </span>
                {e.image
                  ? <img src={proxyImg(e.image)} alt="" loading="lazy" // eslint-disable-line @next/next/no-img-element
                      className="h-[22px] w-[22px] shrink-0 rounded object-cover" />
                  : <div className="h-[22px] w-[22px] shrink-0 rounded"
                      style={{ background: `hsl(${strHue(e.title)},30%,20%)` }} />
                }
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-[10px] font-bold leading-tight text-[var(--text-primary)]"
                     style={{ fontFamily: "'Outfit',sans-serif" }}>{e.title}</p>
                  {e.artist && (
                    <p className="m-0 truncate text-[8.5px] leading-tight text-[var(--text-secondary)]"
                       style={{ fontFamily: "'Outfit',sans-serif" }}>{e.artist}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-auto pt-1">
          <AuthorRow name={it.author_name} avatar={it.author_avatar} time={it.created_at} hue={h} />
        </div>
      </div>
    </Link>
  )
}

// ── Discussion card ────────────────────────────────────────────────────────────
function DiscCard({ it }: { it: CommunityItem }) {
  const h = strHue(it.title)
  const lc = it.last_comment
  return (
    <Link href={it.href} className="hp-card group flex flex-col overflow-hidden p-0 no-underline" style={{ width: 220, flexShrink: 0 }}>
      <div className="relative">
        <Cover url={it.cover} alt={it.title} hue={h} />
        <Badge label="💬 Diskusija" bg="var(--accent-link,#5b9be8)" />
        {(it.comment_count ?? 0) > 0 && (
          <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm"
                style={{ fontFamily: "'Outfit',sans-serif" }}>
            {it.comment_count} atsak.
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-2.5 gap-1.5">
        <p className="m-0 line-clamp-2 text-[12.5px] font-extrabold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]"
           style={{ fontFamily: "'Outfit',sans-serif" }}>{it.title}</p>
        {/* Latest comment preview */}
        {lc?.text && (
          <div className="flex items-start gap-1.5 rounded px-1.5 py-1"
               style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {lc.avatar
              ? <img src={proxyImg(lc.avatar)} alt="" loading="lazy" // eslint-disable-line @next/next/no-img-element
                  className="mt-0.5 h-[13px] w-[13px] shrink-0 rounded-full object-cover" />
              : <div className="mt-0.5 h-[13px] w-[13px] shrink-0 rounded-full"
                  style={{ background: `hsl(${strHue(lc.author || '')},30%,25%)` }} />
            }
            <p className="m-0 line-clamp-2 text-[9.5px] leading-relaxed text-[var(--text-secondary)]"
               style={{ fontFamily: "'Outfit',sans-serif" }}>{lc.text}</p>
          </div>
        )}
        <div className="mt-auto">
          <AuthorRow name={lc?.author || it.author_name} avatar={null} time={it.created_at} hue={h} />
        </div>
      </div>
    </Link>
  )
}

// ── Skeletonai ─────────────────────────────────────────────────────────────────
function CardSkel() {
  return (
    <div className="shrink-0" style={{ width: 220 }}>
      <div className="hp-skel rounded-t-xl" style={{ aspectRatio: '16/9' }} />
      <div className="hp-skel mt-0.5 h-[95px] rounded-b-xl" />
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
        <Link href="/atrasti"
              className="font-['Outfit',sans-serif] text-[11.5px] font-bold text-[var(--accent-orange)] no-underline transition-opacity hover:opacity-70">
          Atrasti →
        </Link>
      </div>

      <Scroller gap={10} ariaLabel="Bendruomenė">
        {loading
          ? Array(5).fill(null).map((_, i) => <CardSkel key={i} />)
          : items.map(it => {
              if (it.type === 'dd') return <DDCard key={it.id} it={it} />
              if (it.type === 'discussion') return <DiscCard key={it.id} it={it} />
              if (it.subtype === 'topas') return <TopasCard key={it.id} it={it} />
              return <BlogCard key={it.id} it={it} />
            })
        }
      </Scroller>
    </section>
  )
}
