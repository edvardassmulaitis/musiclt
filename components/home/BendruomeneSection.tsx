'use client'
// components/home/BendruomeneSection.tsx — per-tipo rich cards, viskas scrollinama.
//
// 2026-06-10 redesign (suderinta su /atrasti „Pulsas" kortelių kalba):
//   • aukštesnės kortelės (min-height 330) su daugiau turinio — excerpt iki 4
//     eilučių, topas iki 4 pozicijų, diskusija su pilnesniu komentaru;
//   • spalvoti tipo badge'ai (ta pati paletė kaip /atrasti chips);
//   • DD kortelė — STABILI: solid fonas + cover thumb (jokio teksto ant foto);
//   • senų įrašų data slepiama (>45 d. — legacy turinys gali kabėti ilgai,
//     bet neturi atrodyti apmiręs);
//   • like/comment skaičiai rodomi TIK kai > 0.
// Admin apsauga (hide_from_homepage + topas_approved_at) lieka API pusėje.

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Scroller from '@/components/ui/Scroller'
import { proxyImg } from '@/lib/img-proxy'

// ── Types ──────────────────────────────────────────────────────────────────────
type Entry = { rank: number; title: string; artist: string | null; image: string | null }
type LastComment = { text: string; author: string | null; avatar: string | null; time: string }
type Candidate = { rank?: number; title: string; artist: string | null; cover: string | null; votes: number }

type CommunityItem = {
  id: string
  type: 'dd' | 'blog' | 'discussion' | 'atradimas'
  subtype?: string | null
  editorial_type?: string | null
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
  excerpt?: string | null
  entries?: Entry[] | null
  last_comment?: LastComment | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function strHue(s: string) {
  let h = 0
  for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360
  return h
}
// Data rodoma tik šviežiems įrašams (≤45 d.) — seni „perlai" gali kabėti be
// „prieš 37 mėn." įspūdžio.
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return m < 2 ? 'ką tik' : `${m} min.`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} val.`
  const d = Math.floor(h / 24)
  if (d <= 45) return `${d} d.`
  return ''
}

type TypeMeta = { label: string; color: string }
function getTypeMeta(type: string, sub?: string | null, editorial?: string | null): TypeMeta {
  if (type === 'dd') return { label: 'Dienos daina', color: '#f97316' }
  if (type === 'discussion') return { label: 'Diskusija', color: '#8b5cf6' }
  if (type === 'atradimas') return { label: 'Atradimas', color: '#f97316' }
  if (sub === 'topas') return { label: 'Topas', color: '#f59e0b' }
  if (sub === 'creation') return { label: 'Kūryba', color: '#ec4899' }
  if (sub === 'translation') return { label: 'Vertimas', color: '#10b981' }
  if (sub === 'review') return { label: 'Apžvalga', color: '#ef4444' }
  if (sub === 'article') {
    if (editorial === 'recenzija') return { label: 'Apžvalga', color: '#ef4444' }
    if (editorial === 'koncertai') return { label: 'Koncertų įspūdžiai', color: '#3b82f6' }
    return { label: 'Įrašas', color: '#94a3b8' }
  }
  return { label: 'Įrašas', color: '#94a3b8' }
}

const CARD_W = 256
const CARD_MIN_H = 330

function Badge({ meta }: { meta: TypeMeta }) {
  return (
    <span className="absolute left-2.5 top-2.5 z-[2] rounded-[7px] px-2 py-1 font-['Outfit',sans-serif] text-[9px] font-extrabold uppercase tracking-[0.08em] text-white"
      style={{ background: meta.color }}>{meta.label}</span>
  )
}
function BadgeInline({ meta }: { meta: TypeMeta }) {
  return (
    <span className="self-start rounded-[7px] px-2 py-1 font-['Outfit',sans-serif] text-[9px] font-extrabold uppercase tracking-[0.08em] text-white"
      style={{ background: meta.color }}>{meta.label}</span>
  )
}

// ── Shared cover ───────────────────────────────────────────────────────────────
function Cover({ url, alt, hue, h = 134 }: { url: string | null; alt: string; hue: number; h?: number }) {
  return (
    <div className="relative shrink-0 overflow-hidden" style={{ height: h }}>
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
function AuthorRow({ it }: { it: CommunityItem }) {
  const name = it.author_name
  const h = strHue(name || it.title)
  const ago = timeAgo(it.created_at)
  return (
    <div className="flex items-center gap-1.5 border-t border-[var(--border-subtle)] px-3 py-2.5">
      {it.author_avatar
        ? <img src={proxyImg(it.author_avatar)} alt="" loading="lazy" // eslint-disable-line @next/next/no-img-element
            className="h-[18px] w-[18px] shrink-0 rounded-full object-cover" />
        : name
          ? <div className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[8px] font-extrabold"
              style={{ fontFamily: "'Outfit',sans-serif", background: `hsl(${h},32%,18%)`, color: `hsl(${h},45%,55%)` }}>
              {name.charAt(0).toUpperCase()}
            </div>
          : null
      }
      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[var(--text-secondary)]"
            style={{ fontFamily: "'Outfit',sans-serif" }}>{name || 'narys'}</span>
      {ago && <span className="shrink-0 text-[9.5px] text-[var(--text-faint)]">{ago}</span>}
    </div>
  )
}

// ── Dienos daina card — STABILI (solid fonas, cover kaip thumb) ────────────────
function DDCard({ it }: { it: CommunityItem }) {
  const isToday = it.subtype === 'today_leader'
  const h = strHue(it.author_name || it.title)
  const candidates = (it.candidates || []).slice(0, 3)
  return (
    <Link href={it.href} className="hp-card group flex flex-col overflow-hidden p-0 no-underline"
      style={{ width: CARD_W, minHeight: CARD_MIN_H, flexShrink: 0, background: 'linear-gradient(135deg,#1b1208 0%,var(--bg-surface) 65%)', borderColor: 'rgba(249,115,22,0.3)' }}>
      <div className="flex items-center gap-3 px-3.5 pt-3.5">
        <div className="relative h-[86px] w-[86px] shrink-0 overflow-hidden rounded-xl shadow-[0_8px_22px_rgba(0,0,0,0.45)]">
          {it.cover
            ? <img src={proxyImg(it.cover)} alt={it.title} loading="lazy" // eslint-disable-line @next/next/no-img-element
                className="h-full w-full object-cover" />
            : <div className="flex h-full w-full items-center justify-center"
                style={{ background: `linear-gradient(135deg,hsl(${h},50%,18%),hsl(${(h+30)%360},40%,10%))` }}>
                <span className="font-['Outfit',sans-serif] text-2xl font-black text-white/30">♪</span>
              </div>
          }
          <div className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-orange)] text-white">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </span>
          </div>
        </div>
        {/* DD kortelės fonas visada tamsus → tekstas hard-coded šviesus (ne theme-var). */}
        <div className="min-w-0 flex-1">
          <p className="m-0 font-['Outfit',sans-serif] text-[9px] font-extrabold uppercase tracking-[0.13em] text-[var(--accent-orange)]">Dienos daina</p>
          <p className="m-0 mt-1 line-clamp-2 font-['Outfit',sans-serif] text-[15px] font-extrabold leading-tight text-[#f0f4fc]">{it.title}</p>
          {it.author_name && <p className="m-0 mt-0.5 truncate text-[11.5px] text-[#aec4dd]">{it.author_name}</p>}
        </div>
      </div>
      {candidates.length > 0 && (
        <div className="mx-3.5 mt-3 flex flex-col gap-1.5 border-t border-[rgba(255,255,255,0.08)] pt-2.5">
          <p className="m-0 font-['Outfit',sans-serif] text-[8.5px] font-extrabold uppercase tracking-[0.1em] text-[#8ea8c4]">Siūlomos dainos</p>
          {candidates.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-3 shrink-0 text-center font-['Outfit',sans-serif] text-[10px] font-extrabold text-[#8ea8c4]">{c.rank ?? i + 2}</span>
              {c.cover
                ? <img src={proxyImg(c.cover)} alt="" loading="lazy" // eslint-disable-line @next/next/no-img-element
                    className="h-[24px] w-[24px] shrink-0 rounded object-cover" />
                : <div className="h-[24px] w-[24px] shrink-0 rounded" style={{ background: `hsl(${strHue(c.title)},30%,22%)` }} />
              }
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-[11px] font-semibold leading-tight text-[#f0f4fc]" style={{ fontFamily: "'Outfit',sans-serif" }}>{c.title}</p>
                {c.artist && <p className="m-0 truncate text-[9.5px] leading-tight text-[#8ea8c4]">{c.artist}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      <span className="mt-auto px-3.5 pb-3.5 pt-3 font-['Outfit',sans-serif] text-[11.5px] font-bold text-[var(--accent-orange)]">
        {isToday ? 'Balsuoti dabar →' : 'Dienos daina →'}
      </span>
    </Link>
  )
}

// ── Blog card (article / review / creation / translation / quick) ──────────────
function BlogCard({ it }: { it: CommunityItem }) {
  const h = strHue(it.author_name || it.title)
  const meta = getTypeMeta(it.type, it.subtype, it.editorial_type)
  return (
    <Link href={it.href} className="hp-card group relative flex flex-col overflow-hidden p-0 no-underline" style={{ width: CARD_W, minHeight: CARD_MIN_H, flexShrink: 0 }}>
      <Badge meta={meta} />
      <Cover url={it.cover} alt={it.author_name || it.title} hue={h} />
      <div className="flex flex-1 flex-col gap-1.5 px-3 pb-2 pt-2.5">
        <p className="m-0 line-clamp-2 text-[14px] font-extrabold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]"
           style={{ fontFamily: "'Outfit',sans-serif" }}>{it.title}</p>
        {it.excerpt && (
          <p className="m-0 line-clamp-4 text-[11.5px] leading-relaxed text-[var(--text-secondary)]">{it.excerpt}</p>
        )}
      </div>
      <AuthorRow it={it} />
    </Link>
  )
}

// ── Topas card — iki 4 ranked entries ──────────────────────────────────────────
function TopasCard({ it }: { it: CommunityItem }) {
  const h = strHue(it.author_name || it.title)
  const meta = getTypeMeta(it.type, it.subtype, it.editorial_type)
  const entries = (it.entries || []).slice(0, 4)
  return (
    <Link href={it.href} className="hp-card group flex flex-col overflow-hidden p-0 no-underline" style={{ width: CARD_W, minHeight: CARD_MIN_H, flexShrink: 0 }}>
      <div className="px-3 pt-3"><BadgeInline meta={meta} /></div>
      <div className="flex flex-1 flex-col gap-1 px-3 pb-1 pt-2">
        <p className="m-0 line-clamp-2 text-[14px] font-extrabold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]"
           style={{ fontFamily: "'Outfit',sans-serif" }}>{it.title}</p>
        {entries.length > 0 && (
          <div className="mt-1 flex flex-col">
            {entries.map(e => (
              <div key={e.rank} className="flex items-center gap-2 border-b border-[var(--border-subtle)] py-[6px] last:border-b-0">
                <span className="w-4 shrink-0 text-center text-[12px] font-black"
                      style={{ color: e.rank === 1 ? '#fbbf24' : e.rank === 2 ? '#94a3b8' : e.rank === 3 ? '#c97d4d' : 'var(--text-faint)', fontFamily: "'Outfit',sans-serif" }}>
                  {e.rank}
                </span>
                {e.image
                  ? <img src={proxyImg(e.image)} alt="" loading="lazy" // eslint-disable-line @next/next/no-img-element
                      className="h-[30px] w-[30px] shrink-0 rounded-md object-cover" />
                  : <div className="h-[30px] w-[30px] shrink-0 rounded-md"
                      style={{ background: `hsl(${strHue(e.title)},30%,20%)` }} />
                }
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-[11.5px] font-bold leading-tight text-[var(--text-primary)]"
                     style={{ fontFamily: "'Outfit',sans-serif" }}>{e.title}</p>
                  {e.artist && (
                    <p className="m-0 truncate text-[9.5px] leading-tight text-[var(--text-muted)]"
                       style={{ fontFamily: "'Outfit',sans-serif" }}>{e.artist}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {(it.entries?.length || 0) > 4 && (
          <p className="m-0 pt-1 text-[10.5px] text-[var(--text-muted)]">+ dar {(it.entries!.length - 4)} →</p>
        )}
      </div>
      <AuthorRow it={it} />
    </Link>
  )
}

// ── Discussion card — grupės foto (cover) + pilnesnis komentaras ───────────────
function DiscCard({ it }: { it: CommunityItem }) {
  const h = strHue(it.title)
  const lc = it.last_comment
  const meta = getTypeMeta(it.type, it.subtype, it.editorial_type)
  return (
    <Link href={it.href} className="hp-card group relative flex flex-col overflow-hidden p-0 no-underline"
      style={{ width: CARD_W, minHeight: CARD_MIN_H, flexShrink: 0, background: 'linear-gradient(160deg,rgba(139,92,246,0.1),var(--bg-surface) 60%)' }}>
      {it.cover ? (
        <>
          <Badge meta={meta} />
          <div className="relative shrink-0 overflow-hidden" style={{ height: 110 }}>
            <img src={proxyImg(it.cover)} alt={it.title} loading="lazy" // eslint-disable-line @next/next/no-img-element
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" />
            <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(to bottom,transparent 40%,rgba(13,19,32,0.8))' }} />
            {(it.comment_count ?? 0) > 0 && (
              <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm"
                    style={{ fontFamily: "'Outfit',sans-serif" }}>{it.comment_count} atsak.</span>
            )}
          </div>
        </>
      ) : (
        <div className="px-3 pt-3"><BadgeInline meta={meta} /></div>
      )}
      <div className="flex flex-1 flex-col gap-1.5 px-3 pb-2 pt-2.5">
        <p className="m-0 line-clamp-2 text-[13.5px] font-extrabold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]"
           style={{ fontFamily: "'Outfit',sans-serif" }}>{it.title}</p>
        {lc?.text && (
          <div className="flex flex-col gap-1 rounded-[4px_12px_12px_12px] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.05)] px-2.5 py-2">
            <div className="flex items-center gap-1.5">
              {lc.avatar
                ? <img src={proxyImg(lc.avatar)} alt="" loading="lazy" // eslint-disable-line @next/next/no-img-element
                    className="h-[15px] w-[15px] shrink-0 rounded-full object-cover" />
                : <div className="h-[15px] w-[15px] shrink-0 rounded-full"
                    style={{ background: `hsl(${strHue(lc.author || '')},30%,25%)` }} />
              }
              {lc.author && <span className="truncate text-[10px] font-bold text-[var(--text-primary)]">{lc.author}</span>}
            </div>
            <p className="m-0 line-clamp-4 text-[11px] leading-relaxed text-[var(--text-secondary)]">{lc.text}</p>
          </div>
        )}
        <span className="mt-auto pt-1 text-[11px] font-bold" style={{ color: '#b79df7' }}>atsakyk →</span>
      </div>
      <AuthorRow it={it} />
    </Link>
  )
}

// ── Skeletonai ─────────────────────────────────────────────────────────────────
function CardSkel() {
  return <div className="hp-skel shrink-0 rounded-xl" style={{ width: CARD_W, height: CARD_MIN_H }} />
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

      <Scroller gap={12} ariaLabel="Bendruomenė">
        {loading
          ? Array(5).fill(null).map((_, i) => <CardSkel key={i} />)
          : items.map(it => {
              if (it.type === 'dd') return <DDCard key={it.id} it={it} />
              if (it.type === 'discussion') return <DiscCard key={it.id} it={it} />
              if (it.type === 'atradimas') return <BlogCard key={it.id} it={it} />
              if (it.subtype === 'topas') return <TopasCard key={it.id} it={it} />
              return <BlogCard key={it.id} it={it} />
            })
        }
      </Scroller>
    </section>
  )
}
