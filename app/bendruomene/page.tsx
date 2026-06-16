'use client'

// app/atrasti/page.tsx
//
// „Atrasti" — bendruomenės hub'as (2026-06-10 redesign, fix iteracija v2).
//
// Struktūra:
//   1. „DĖMESIO CENTRE" — kuruotas slider'is (admin featured_until su pasirenkama
//      trukme; palaiko įrašus, diskusijas IR muzikos atradimus; ≥2 įrašai →
//      rodyklės + taškai; nieko featured → blokas dingsta). Rodomas ir mobile.
//   2. ŠIANDIEN: Dienos dainos hero (lyderis + kandidatai + vakar laimėjusi;
//      kai kandidatų mažai — užpildoma vakar dienos topu) + „Kas vyksta"/
//      „Pokalbiai" (desktop: tab'ų box'as; mobile: du kompaktiški mygtukai,
//      atidarantys pilnus modalus — be scroll-in-scroll).
//   3. Prompt'ų juosta (koncertas → apžvalga → topas → atradimas).
//   4. PULSAS — mišrus grid su tipo filtrais, per-autoriaus flood limitu,
//      „Rodyti daugiau" + pilno sąrašo nuorodomis.
//   5. Kūrybos kampas. 6. Aktyvūs nariai (nauji — su žaliu tašku).
//
// DD hero/featured fonas VISADA tamsus → tekstai hard-coded šviesūs (ne theme-var).
// Balsų skaičiai nerodomi (popbar); like/comment tik >0; visur username.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { proxyImg } from '@/lib/img-proxy'
import { useActivity, ActivityModal } from '@/components/ActivityWidget'
import { HomeListModal } from '@/components/HomeListModal'
import { DienosDainaHero } from '@/components/DienosDainaHero'

// ───────────────────────── helpers ─────────────────────────
function timeAgo(d?: string | null) {
  if (!d) return ''
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'ką tik'
  if (m < 60) return `prieš ${m} min.`
  const h = Math.floor(m / 60)
  if (h < 24) return `prieš ${h} val.`
  const days = Math.floor(h / 24)
  if (days < 7) return `prieš ${days} d.`
  if (days < 31) return `prieš ${Math.floor(days / 7)} sav.`
  return '' // seni įrašai — datos nerodom (legacy turinys gali kabėti ilgai)
}
function sani(s?: string | null) {
  return (s || '').replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim()
}
function hue(s: string) { let h = 0; for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h }
function extractYouTubeId(url?: string | null): string | null {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?\s]{11})/)
  return m?.[1] || null
}
function uname(a?: { username?: string | null; full_name?: string | null } | null): string {
  return a?.username || a?.full_name || 'narys'
}

// ───────────────────────── inline ikonos (be lucide!) ─────────────────────────
function Ic({ d, size = 14, filled = false }: { d: string; size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d={d} />
    </svg>
  )
}
const I = {
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.9 8.8-8.9a5.5 5.5 0 0 0 0-7.8z',
  comment: 'M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z',
  play: 'M8 5v14l11-7z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  mic: 'M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zM19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8',
  spark: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  pen: 'M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 5M17 6h3a3 3 0 0 1-3 5',
  star: 'M12 2l2.4 7.2H22l-6 4.6 2.3 7.2-6.3-4.4-6.3 4.4L8 13.8 2 9.2h7.6z',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  plus: 'M12 5v14M5 12h14',
  pulse: 'M22 12h-4l-3 9L9 3l-3 9H2',
}

function Avatar({ src, name, size = 24 }: { src?: string | null; name?: string | null; size?: number }) {
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

function PopBar({ level, w = 11, onDark = false }: { level: number; w?: number; onDark?: boolean }) {
  // onDark — DD hero fonas visada tamsus, tad neužpildyti brūkšneliai šviesūs
  // permatomi, ne theme-var.
  return (
    <span className="flex items-center gap-[3px]" aria-label={`Balsų lygis ${level}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={`h-[3px] rounded-[2px] ${i < level ? 'bg-[var(--accent-orange)]' : onDark ? 'bg-[rgba(255,255,255,0.18)]' : 'bg-[var(--border-default)]'}`} style={{ width: w }} />
      ))}
    </span>
  )
}

// ───────────────────────── types ─────────────────────────
type ListEntry = { rank: number; title: string; artist: string | null; image: string | null }
type FeedPost = {
  id: number; slug: string; title: string; post_type: string; rating: number | null
  like_count: number | null; comment_count: number | null; published_at: string | null
  editorial_type: string | null; excerpt: string | null; featured_until: string | null
  cover: string | null; collage: string[] | null; entries: ListEntry[] | null; entry_count?: number | null; blog_slug: string | null
  author: { id: string | null; full_name: string | null; username: string | null; avatar_url: string | null } | null
}
type DiskKomentaras = { author: string; excerpt: string; avatar?: string | null; created_at?: string | null }
type Diskusija = {
  id: number; slug: string; title: string; author_name: string | null; author_avatar: string | null
  comment_count: number; created_at: string; artist_name?: string | null; artist_image?: string | null
  latest_comment?: DiskKomentaras | null
  latest_comments?: DiskKomentaras[]
  featured_until?: string | null
}
type Atradimas = {
  id: number; artist_name: string | null; track_name: string | null; body: string | null
  embed_type: string | null; embed_id: string | null; artist_cover: string | null
  like_count: number | null; created_at: string | null; featured_until?: string | null
  author: { username: string | null; full_name: string | null; avatar_url: string | null } | null
}
type ActiveMember = { user_id?: string; username: string | null; name: string | null; avatar: string | null; tastes?: string[]; isNew?: boolean; joined_legacy_at?: string | null; created_at?: string }
type Proposer = { username: string | null; full_name: string | null; avatar_url: string | null }
type TrackLite = { id: number; title: string; cover_url: string | null; slug?: string | null; video_url?: string | null; artists: { name: string; slug?: string | null; cover_image_url?: string | null } | null }
type Nomination = { id: number; votes: number; weighted_votes: number; comment?: string | null; tracks: TrackLite | null; proposer?: Proposer | null; own?: boolean }
type DainaWinner = { id: number; date: string; total_votes: number; weighted_votes: number; winning_comment?: string | null; proposer?: Proposer | null; tracks: TrackLite | null }

function feedHref(p: FeedPost) { return p.blog_slug ? `/blogas/${p.blog_slug}/${p.slug}` : '/blogas' }
/** Upgrade any YT thumbnail URL to maxresdefault (DB may store mqdefault) */
function ytHQ(url: string | null): string | null {
  if (!url) return null
  return url.replace(/\/(mq|hq|sd)default\.jpg/, '/maxresdefault.jpg')
}
function trackImg(t: TrackLite | null): string | null {
  if (!t) return null
  const yt = extractYouTubeId(t.video_url)
  return ytHQ(t.cover_url) || (yt ? `https://img.youtube.com/vi/${yt}/maxresdefault.jpg` : null) || t.artists?.cover_image_url || null
}
function discThumb(a: Atradimas): string | null {
  return a.embed_type === 'youtube' && a.embed_id ? `https://i.ytimg.com/vi/${a.embed_id}/maxresdefault.jpg` : (a.artist_cover ? proxyImg(a.artist_cover) : null)
}
/** maxresdefault 404 → hqdefault fallback */
function ytFallback(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget
  if (img.src.includes('/maxresdefault.')) {
    img.src = img.src.replace('/maxresdefault.', '/hqdefault.')
  }
}

// Plokščias tipo raktas + spalvos (chips = badge'ai, ta pati paletė).
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
  atradimas: { label: 'Atradimas', color: '#f97316' },
  diskusija: { label: 'Diskusija', color: '#8b5cf6' },
  kuryba: { label: 'Kūryba', color: '#ec4899' },
  vertimas: { label: 'Vertimas', color: '#10b981' },
  irasas: { label: 'Įrašas', color: '#94a3b8' },
}

function KindBadge({ kind, abs = true, label }: { kind: string; abs?: boolean; label?: string }) {
  const m = KIND_META[kind] || KIND_META.irasas
  // !abs — inline-flex + self-start, kad flex-col tėvas neištemptų per visą plotį.
  return (
    <span className={`${abs ? 'absolute left-3 top-3 z-[2]' : 'inline-flex self-start'} rounded-[7px] px-2 py-1 font-['Outfit',sans-serif] text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-white`}
      style={{ background: m.color }}>{label || m.label}</span>
  )
}

// Topo etiketė: „Top N" pagal tikrą topo dydį (entry_count); fallback „Topas".
function topLabel(p: FeedPost): string {
  const n = p.entry_count ?? (p.entries ? p.entries.length : 0)
  return n && n > 0 ? `Top ${n}` : 'Topas'
}

function Stats({ likes, comments }: { likes?: number | null; comments?: number | null }) {
  const l = likes ?? 0, c = comments ?? 0
  if (l <= 0 && c <= 0) return null
  return (
    <span className="ml-auto flex shrink-0 items-center gap-2.5 text-[11px] text-[var(--text-muted)]">
      {l > 0 && <span className="flex items-center gap-1"><Ic d={I.heart} size={12} /> {l}</span>}
      {c > 0 && <span className="flex items-center gap-1"><Ic d={I.comment} size={12} /> {c}</span>}
    </span>
  )
}

// ───────────────────────── Atradimo modalas (#18) ─────────────────────────
function DiscoveryModal({ a, onClose }: { a: Atradimas; onClose: () => void }) {
  const body = sani(a.body)
  return (
    <HomeListModal open onClose={onClose} title={`${a.artist_name || 'Atradimas'}${a.track_name ? ` — ${a.track_name}` : ''}`} subtitle={a.author ? `dalinasi ${uname(a.author)}` : null}>
      {a.embed_type === 'youtube' && a.embed_id ? (
        <div className="overflow-hidden rounded-xl border border-[var(--border-default)]" style={{ aspectRatio: '16/9' }}>
          <iframe src={`https://www.youtube.com/embed/${a.embed_id}`} title="YouTube" className="h-full w-full border-0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        </div>
      ) : a.embed_type === 'spotify' && a.embed_id ? (
        <iframe src={`https://open.spotify.com/embed/track/${a.embed_id}`} title="Spotify" className="w-full rounded-xl border-0" height={152} allow="encrypted-media" />
      ) : discThumb(a) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={discThumb(a)!} alt="" className="w-full rounded-xl object-cover" style={{ maxHeight: 280 }} />
      ) : null}
      {body && <p className="m-0 mt-4 whitespace-pre-line text-[13.5px] leading-relaxed text-[var(--text-secondary)]">{body}</p>}
      <div className="mt-4 flex items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
        <Avatar src={a.author?.avatar_url} name={uname(a.author)} size={24} />
        <span className="text-[12.5px] font-semibold text-[var(--text-secondary)]">{uname(a.author)}</span>
        {timeAgo(a.created_at) && <span className="text-[11px] text-[var(--text-faint)]">· {timeAgo(a.created_at)}</span>}
        {(a.like_count ?? 0) > 0 && <span className="flex items-center gap-1 text-[11.5px] text-[var(--text-muted)]"><Ic d={I.heart} size={12} /> {a.like_count}</span>}
        <Link href={`/muzikos-atradimai/${a.id}`} className="ml-auto shrink-0 font-['Outfit',sans-serif] text-[12px] font-bold text-[var(--accent-orange)] no-underline">Atsakymai ir daugiau →</Link>
      </div>
    </HomeListModal>
  )
}

// ═════════════════════════ 1. DĖMESIO CENTRE — slider ═════════════════════════
type FeatItem =
  | { kind: 'post'; key: string; post: FeedPost; until: string }
  | { kind: 'discussion'; key: string; d: Diskusija; until: string }
  | { kind: 'discovery'; key: string; a: Atradimas; until: string }

function FeatLabel() {
  return (
    <span className="relative inline-flex items-center gap-2 self-start rounded-full border border-[rgba(249,115,22,0.35)] bg-[rgba(249,115,22,0.13)] px-3 py-1.5 font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#fdba74]">
      <Ic d={I.star} size={12} /> Dėmesio centre
    </span>
  )
}

function FeatTextPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex flex-col justify-center p-5 sm:p-7" style={{ background: 'linear-gradient(135deg, #131c2e 0%, #0d1320 70%)' }}>
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(520px 280px at 0% 100%, rgba(249,115,22,0.12), transparent 60%)' }} />
      {children}
    </div>
  )
}

function FeaturedSlide({ it, onOpenDiscovery }: { it: FeatItem; onOpenDiscovery: (a: Atradimas) => void }) {
  // Vizualas kairėje + tamsus tekstinis panelis dešinėje; turinys pagal tipą.
  if (it.kind === 'post') {
    const p = it.post
    const isTopas = p.post_type === 'topas'
    const entries = (p.entries || []).slice(0, 4)
    return (
      <Link href={feedHref(p)} className="grid min-h-[270px] grid-cols-1 no-underline sm:grid-cols-[1fr_1.05fr]">
        <div className="relative min-h-[170px] overflow-hidden bg-[#0d1320]">
          <KindBadge kind={postKind(p)} label={isTopas ? topLabel(p) : undefined} />
          {p.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proxyImg(p.cover)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          ) : isTopas && entries[0]?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proxyImg(entries[0].image)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, hsl(${hue(p.title)},34%,22%), hsl(${(hue(p.title) + 40) % 360},30%,12%))` }} />
          )}
        </div>
        <FeatTextPanel>
          <FeatLabel />
          <h2 className="relative m-0 mt-3 line-clamp-2 font-['Outfit',sans-serif] text-[21px] font-black leading-[1.15] tracking-[-0.02em] text-[#f0f4fc] sm:text-[25px]">{sani(p.title)}</h2>
          {isTopas && entries.length > 0 ? (
            <div className="relative mt-3 flex flex-col gap-1">
              {entries.map(e => (
                <div key={e.rank} className="flex items-center gap-2.5">
                  <span className="w-4 shrink-0 text-center font-['Outfit',sans-serif] text-[13px] font-black text-[#f59e0b]">{e.rank}</span>
                  {e.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proxyImg(e.image)} alt="" loading="lazy" className="h-7 w-7 shrink-0 rounded-md object-cover" />
                  ) : <div className="h-7 w-7 shrink-0 rounded-md" style={{ background: `hsl(${hue(e.title)},30%,22%)` }} />}
                  <span className="min-w-0 truncate text-[12.5px] font-bold text-[#f0f4fc]">{sani(e.title)}</span>
                  {e.artist && <span className="min-w-0 truncate text-[11px] text-[#8ea8c4]">{e.artist}</span>}
                </div>
              ))}
            </div>
          ) : p.excerpt ? (
            <p className="relative m-0 mt-2.5 line-clamp-3 text-[13.5px] leading-relaxed text-[#aec4dd]">{p.excerpt}</p>
          ) : null}
          <div className="relative mt-4 flex items-center gap-2.5">
            <Avatar src={p.author?.avatar_url} name={uname(p.author)} size={26} />
            <span className="text-[12.5px] font-bold text-[#f0f4fc]">{uname(p.author)}</span>
            {timeAgo(p.published_at) && <span className="text-[11.5px] text-[#8ea8c4]">· {timeAgo(p.published_at)}</span>}
          </div>
        </FeatTextPanel>
      </Link>
    )
  }
  if (it.kind === 'discussion') {
    const d = it.d
    const lc = d.latest_comment
    return (
      <Link href={`/diskusijos/${d.slug}`} className="grid min-h-[270px] grid-cols-1 no-underline sm:grid-cols-[1fr_1.05fr]">
        <div className="relative min-h-[170px] overflow-hidden bg-[#0d1320]">
          <KindBadge kind="diskusija" />
          {d.artist_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proxyImg(d.artist_image)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, hsl(${hue(d.title)},34%,22%), hsl(${(hue(d.title) + 40) % 360},30%,12%))` }} />
          )}
          {d.artist_name && <span className="absolute bottom-2.5 left-3 font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.06em] text-white/90" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.7)' }}>{d.artist_name}</span>}
        </div>
        <FeatTextPanel>
          <FeatLabel />
          <h2 className="relative m-0 mt-3 line-clamp-2 font-['Outfit',sans-serif] text-[21px] font-black leading-[1.15] tracking-[-0.02em] text-[#f0f4fc] sm:text-[24px]">{sani(d.title)}</h2>
          {lc?.excerpt && (
            <div className="relative mt-3 rounded-[4px_14px_14px_14px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.06)] px-3 py-2">
              <div className="mb-1 flex items-center gap-1.5">
                <Avatar src={lc.avatar} name={lc.author} size={17} />
                <b className="text-[11px] font-bold text-[#f0f4fc]">{lc.author}</b>
              </div>
              <p className="m-0 line-clamp-3 text-[12.5px] leading-relaxed text-[#aec4dd]">{lc.excerpt}</p>
            </div>
          )}
          <div className="relative mt-4 flex items-center gap-2 text-[12px] text-[#8ea8c4]">
            <Ic d={I.comment} size={13} /> {d.comment_count > 0 ? `${d.comment_count} komentarai` : 'Nauja diskusija'} · įsijunk →
          </div>
        </FeatTextPanel>
      </Link>
    )
  }
  const a = it.a
  const thumb = discThumb(a)
  const quote = sani(a.body)
  return (
    <button type="button" onClick={() => onOpenDiscovery(a)} className="grid min-h-[270px] w-full cursor-pointer grid-cols-1 border-0 bg-transparent p-0 text-left sm:grid-cols-[1fr_1.05fr]">
      <div className="relative min-h-[170px] overflow-hidden bg-[#0d1320]">
        <KindBadge kind="atradimas" />
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        ) : <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, hsl(${hue(a.artist_name || 'x')},34%,22%), hsl(${(hue(a.artist_name || 'x') + 40) % 360},30%,12%))` }} />}
        <div className="absolute inset-0 flex items-center justify-center bg-black/25">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(249,115,22,0.95)] text-white shadow-[0_8px_24px_rgba(0,0,0,0.4)]"><Ic d={I.play} size={17} filled /></span>
        </div>
      </div>
      <FeatTextPanel>
        <FeatLabel />
        <h2 className="relative m-0 mt-3 line-clamp-2 font-['Outfit',sans-serif] text-[21px] font-black leading-[1.15] tracking-[-0.02em] text-[#f0f4fc] sm:text-[24px]">
          {a.artist_name || 'Atradimas'}{a.track_name ? ` — ${a.track_name}` : ''}
        </h2>
        {quote && <p className="relative m-0 mt-2.5 line-clamp-3 text-[13.5px] italic leading-relaxed text-[#aec4dd]">„{quote.length > 240 ? quote.slice(0, 240).replace(/\s+\S*$/, '') + '…' : quote}"</p>}
        <div className="relative mt-4 flex items-center gap-2.5">
          <Avatar src={a.author?.avatar_url} name={uname(a.author)} size={26} />
          <span className="text-[12.5px] font-bold text-[#f0f4fc]">{uname(a.author)}</span>
          {timeAgo(a.created_at) && <span className="text-[11.5px] text-[#8ea8c4]">· {timeAgo(a.created_at)}</span>}
        </div>
      </FeatTextPanel>
    </button>
  )
}

/* ── Featured slider (2026-06-12 v2) — horizontalus scroll su 2 pilnomis
   kortelėmis + trečia „peek", vieningas su homepage hero dizainu. ── */
function FeaturedSlider() {
  const [items, setItems] = useState<FeatItem[] | null>(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const [openDisc, setOpenDisc] = useState<Atradimas | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let on = true
    Promise.all([
      fetch('/api/atradimai/feed?featured=1&nodedup=1&limit=8').then(r => r.json()).catch(() => ({})),
      fetch('/api/diskusijos/recent?featured=1&limit=4').then(r => r.json()).catch(() => ({})),
      fetch('/api/muzikos-atradimai?featured=1&limit=4').then(r => r.json()).catch(() => ({})),
    ]).then(async ([f, d, a]) => {
      if (!on) return
      const out: FeatItem[] = []
      for (const p of (f.posts || []) as FeedPost[]) out.push({ kind: 'post', key: `p-${p.id}`, post: p, until: p.featured_until || '' })
      for (const x of (d.items || []) as Diskusija[]) out.push({ kind: 'discussion', key: `d-${x.id}`, d: x, until: x.featured_until || '' })
      for (const x of (a.items || []) as Atradimas[]) out.push({ kind: 'discovery', key: `a-${x.id}`, a: x, until: x.featured_until || '' })
      // Fallback: kai nėra featured, rodyti naujausius įrašus
      if (out.length === 0) {
        try {
          const fb = await fetch('/api/atradimai/feed?nodedup=1&limit=6').then(r => r.json()).catch(() => ({}))
          for (const p of (fb.posts || []) as FeedPost[]) out.push({ kind: 'post', key: `p-${p.id}`, post: p, until: '' })
        } catch { /* noop */ }
      }
      out.sort((x, y) => (y.until || '').localeCompare(x.until || ''))
      if (on) setItems(out)
    })
    return () => { on = false }
  }, [])

  /* Track scroll for dots */
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const onScroll = () => {
      const card = el.querySelector('.atr-feat-card') as HTMLElement | null
      if (!card) return
      const step = card.offsetWidth + 16
      setActiveIdx(Math.round(el.scrollLeft / step))
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [items])

  if (items !== null && items.length === 0) return null
  const many = items !== null && items.length > 1

  const scrollTo = (i: number) => {
    const el = trackRef.current
    if (!el) return
    const card = el.querySelector('.atr-feat-card') as HTMLElement | null
    if (!card) return
    el.scrollTo({ left: i * (card.offsetWidth + 16), behavior: 'smooth' })
  }
  const scrollByDir = (dir: -1 | 1) => {
    const el = trackRef.current
    if (!el) return
    const card = el.querySelector('.atr-feat-card') as HTMLElement | null
    const step = card ? card.offsetWidth + 16 : el.clientWidth * 0.9
    el.scrollBy({ left: dir * step, behavior: 'smooth' })
  }

  /* Resolve cover image + title for a unified card */
  const cardInfo = (it: FeatItem) => {
    if (it.kind === 'post') {
      const p = it.post
      const isTopas = p.post_type === 'topas'
      const entries = (p.entries || []).slice(0, 4)
      return {
        href: feedHref(p),
        img: p.cover || (isTopas && entries[0]?.image) || null,
        chip: postKind(p),
        chipLabel: isTopas ? topLabel(p) : undefined,
        title: sani(p.title),
        author: uname(p.author),
        avatar: p.author?.avatar_url,
        time: timeAgo(p.published_at),
        onClick: undefined as (() => void) | undefined,
      }
    }
    if (it.kind === 'discussion') {
      const d = it.d
      return {
        href: `/diskusijos/${d.slug}`,
        img: d.artist_image,
        chip: 'diskusija',
        chipLabel: undefined as string | undefined,
        title: sani(d.title),
        author: d.artist_name || '',
        avatar: null,
        time: null,
        onClick: undefined as (() => void) | undefined,
      }
    }
    const a = it.a
    return {
      href: '',
      img: discThumb(a),
      chip: 'atradimas',
      chipBg: '#f97316',
      chipLabel: undefined as string | undefined,
      title: a.artist_name ? `${a.artist_name}${a.track_name ? ` — ${a.track_name}` : ''}` : 'Atradimas',
      author: uname(a.author),
      avatar: a.author?.avatar_url,
      time: timeAgo(a.created_at),
      onClick: () => setOpenDisc(a),
    }
  }

  return (
    <section className="mb-5">
      <style>{`
        .atr-feat-card{width:calc((100% - 16px) / 2.35);min-width:300px;flex-shrink:0}
        @media(max-width:768px){.atr-feat-card{width:calc(88vw)}}
        .atr-feat-track::-webkit-scrollbar{display:none}
        @media(pointer:fine){.atr-feat-arrow{opacity:0;transition:opacity .2s}}
        .atr-feat-wrap:hover .atr-feat-arrow{opacity:1}
        @keyframes atr-fade-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        .atr-feat-loaded .atr-feat-card{animation:atr-fade-in .4s ease-out both}
        .atr-feat-loaded .atr-feat-card:nth-child(2){animation-delay:.08s}
        .atr-feat-loaded .atr-feat-card:nth-child(3){animation-delay:.16s}
        @keyframes atr-skel-pulse{0%,100%{opacity:1}50%{opacity:.45}}
        .atr-skel-card{background:var(--bg-surface);
          border:1px solid var(--border-default);animation:atr-skel-pulse 2s ease-in-out infinite;
          display:flex;align-items:center;justify-content:center}
        @keyframes eq-bar{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}
        .atr-eq{display:flex;align-items:end;gap:3px;height:20px}
        .atr-eq span{width:3px;border-radius:2px;background:var(--accent-orange);opacity:.45;
          animation:eq-bar 1s ease-in-out infinite;transform-origin:bottom}
        .atr-eq span:nth-child(1){height:20px;animation-delay:0s}
        .atr-eq span:nth-child(2){height:14px;animation-delay:.15s}
        .atr-eq span:nth-child(3){height:18px;animation-delay:.3s}
        .atr-eq span:nth-child(4){height:10px;animation-delay:.45s}
        .atr-eq span:nth-child(5){height:16px;animation-delay:.6s}
      `}</style>
      <div className="atr-feat-wrap relative">
        <div ref={trackRef} className={`atr-feat-track flex items-stretch gap-4 pb-1 snap-x snap-mandatory${items !== null ? ' atr-feat-loaded' : ''}`} style={{ overflowX: 'auto', scrollbarWidth: 'none', scrollBehavior: 'smooth' }}>
          {items === null ? (
            <>
              {[0, 1, 2].map(i => (
                <div key={i} className="atr-feat-card shrink-0">
                  <div className="atr-skel-card h-full min-h-[200px] rounded-2xl" style={{ aspectRatio: '16/9' }}>
                    <div className="atr-eq"><span /><span /><span /><span /><span /></div>
                  </div>
                </div>
              ))}
            </>
          ) : items.map((it) => {
            const c = cardInfo(it)
            const inner = (
              <div className="group relative block aspect-[16/9] h-full w-full overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[#0d1320] no-underline transition-all hover:-translate-y-0.5">
                <KindBadge kind={c.chip} label={c.chipLabel} />
                <div className="absolute inset-0 flex items-stretch justify-end overflow-hidden">
                  {c.img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proxyImg(c.img)} alt="" loading="lazy" onError={ytFallback} className="h-full w-auto max-w-full object-cover"
                      style={{ objectPosition: 'center 25%', WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 18%, black 100%)', maskImage: 'linear-gradient(to right, transparent 0%, black 18%, black 100%)' }} />
                  ) : <div className="h-full w-full" style={{ background: `linear-gradient(135deg, hsl(${hue(c.title)},34%,22%), hsl(${(hue(c.title) + 40) % 360},30%,12%))` }} />}
                </div>
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                <div className="absolute inset-0 flex flex-col justify-end p-4">
                  <h3 className="m-0 max-w-[420px] font-['Outfit',sans-serif] text-[19px] font-black leading-[1.15] tracking-tight text-white transition-opacity group-hover:opacity-90 sm:text-[21px]">
                    {c.title}
                  </h3>
                  {c.author && (
                    <p className="m-0 mt-1 text-[12px] font-medium text-white/70">{c.author}{c.time ? ` · ${c.time}` : ''}</p>
                  )}
                </div>
              </div>
            )
            return (
              <div key={it.key} className="atr-feat-card shrink-0 snap-start">
                {c.onClick ? (
                  <button type="button" onClick={c.onClick} className="block h-full w-full cursor-pointer border-0 bg-transparent p-0 text-left">{inner}</button>
                ) : (
                  <Link href={c.href} className="block h-full no-underline">{inner}</Link>
                )}
              </div>
            )
          })}
        </div>
        {items !== null && many && (
          <>
            <button type="button" aria-label="Ankstesnis" onClick={() => scrollByDir(-1)}
              className="atr-feat-arrow absolute top-1/2 z-[4] flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-[rgba(255,255,255,0.2)] bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
              style={{ left: -6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <button type="button" aria-label="Kitas" onClick={() => scrollByDir(1)}
              className="atr-feat-arrow absolute top-1/2 z-[4] flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-[rgba(255,255,255,0.2)] bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
              style={{ right: -6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </>
        )}
      </div>
      {/* Slider dots */}
      {items !== null && many && (
        <div className="mt-3 flex justify-center gap-1.5">
          {items.map((it, i) => (
            <button key={`dot-${it.key}`} type="button" aria-label={`Įrašas ${i + 1}`}
              onClick={() => scrollTo(i)}
              className="cursor-pointer rounded-full border-0 p-0 transition-all"
              style={{ width: i === activeIdx ? 20 : 7, height: 7, background: i === activeIdx ? 'var(--accent-orange)' : 'var(--border-strong)' }} />
          ))}
        </div>
      )}
      {openDisc && <DiscoveryModal a={openDisc} onClose={() => setOpenDisc(null)} />}
    </section>
  )
}

// ═════════════════════════ 2. DIENOS DAINA hero — components/DienosDainaHero.tsx ═════════════════════════

// ═════════════════════════ 2b. Kas vyksta / Pokalbiai ═════════════════════════
type ShoutMsg = { id: string; user_id: string | null; author_name: string | null; author_avatar: string | null; body: string; created_at: string }

function ShoutPane({ tall = false }: { tall?: boolean }) {
  const { data: session } = useSession()
  const [messages, setMessages] = useState<ShoutMsg[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/live/shoutbox?limit=50', { cache: 'no-store' }).then(res => res.json())
      setMessages((r.messages || []).slice().reverse())
    } catch {}
  }, [])
  useEffect(() => { load(); const iv = setInterval(load, 15000); return () => clearInterval(iv) }, [load])
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight }, [messages.length])

  const send = async () => {
    const t = text.trim()
    if (!t || sending) return
    setSending(true); setErr(null)
    try {
      const r = await fetch('/api/live/shoutbox', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t }) })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Klaida'); return }
      setText(''); load()
    } catch { setErr('Tinklo klaida') }
    finally { setSending(false) }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto py-1" style={tall ? { maxHeight: '55vh' } : undefined}>
        {messages.length === 0 ? (
          <div className="px-2 py-6 text-center text-[11.5px] text-[var(--text-muted)]">Dar nėra žinučių — parašyk pirmas!</div>
        ) : messages.map(m => {
          const name = m.author_name || 'narys'
          return (
            <div key={m.id} className="flex items-start gap-2 py-1.5">
              <Avatar src={m.author_avatar} name={name} size={24} />
              <div className="min-w-0 flex-1 rounded-[4px_12px_12px_12px] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.05)] px-2.5 py-1.5">
                <div className="flex items-baseline gap-1.5">
                  <span className="truncate text-[11px] font-extrabold text-[var(--accent-link)]">{name}</span>
                  <span className="shrink-0 text-[9px] text-[var(--text-faint)]">{timeAgo(m.created_at)}</span>
                </div>
                <p className="m-0 break-words text-[12.3px] leading-snug text-[var(--text-secondary)]">{m.body}</p>
              </div>
            </div>
          )
        })}
      </div>
      <div className="shrink-0 pt-2">
        {session?.user ? (
          <div className="flex items-center gap-1.5">
            <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send() }} maxLength={255} placeholder="Parašyk žinutę…" style={{ fontSize: 16 }}
              className="min-w-0 flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-[var(--text-primary)] outline-none focus:border-[var(--accent-orange)]" />
            <button onClick={send} disabled={sending || !text.trim()} className="flex shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-[var(--accent-orange)] px-3 py-2 text-white disabled:opacity-40"><Ic d={I.send} size={14} /></button>
          </div>
        ) : (
          <Link href="/auth/signin" className="block rounded-lg border border-[var(--border-default)] bg-[var(--bg-hover)] px-3 py-2 text-center text-[11px] font-bold text-[var(--accent-link)] no-underline">Prisijunk rašyti pokalbyje →</Link>
        )}
        {err && <p className="m-0 mt-1 text-[10px] text-[#f87171]">{err}</p>}
      </div>
    </div>
  )
}

const ACT_VERB: Record<string, string> = {
  nomination: 'pasiūlė dienos dainą', daily_nomination: 'pasiūlė dienos dainą',
  vote: 'balsavo už', daily_vote: 'balsavo už dienos dainą', top_vote: 'balsavo topuose', voting_vote: 'balsavo už',
  like: 'pamėgo', track_like: 'pamėgo dainą', album_like: 'pamėgo albumą', artist_like: 'pamėgo atlikėją',
  comment: 'pakomentavo', blog: 'parašė įrašą', blog_post: 'parašė įrašą',
  discussion: 'pradėjo diskusiją', thread_created: 'sukūrė temą', review: 'parašė recenziją', follow: 'pradėjo sekti',
}

// Veiklos eilutė su entity mini vizualu (#9).
function ActRow({ e }: { e: any }) {
  const name = e.actor_name || 'narys'
  return (
    <div className="flex items-start gap-2.5 border-b border-[var(--border-subtle)] py-2 last:border-b-0">
      <Avatar src={e.actor_avatar} name={name} size={26} />
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[12.3px] leading-snug text-[var(--text-secondary)]">
          <b className="font-semibold text-[var(--text-primary)]">{name}</b> {ACT_VERB[e.event_type] || 'atnaujino'}
          {e.entity_title ? (
            e.entity_url
              ? <> <Link href={e.entity_url} className="font-semibold text-[#e8913d] no-underline hover:underline">{sani(e.entity_title)}</Link></>
              : <> <span className="font-semibold text-[#e8913d]">{sani(e.entity_title)}</span></>
          ) : null}
        </p>
        <span className="text-[10px] text-[var(--text-faint)]">{timeAgo(e.created_at)}</span>
      </div>
      {e.entity_image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={proxyImg(e.entity_image)} alt="" loading="lazy" className="mt-0.5 h-9 w-9 shrink-0 rounded-lg object-cover" />
      )}
    </div>
  )
}

function ShoutModal({ onClose }: { onClose: () => void }) {
  return (
    <HomeListModal open onClose={onClose} title="Pokalbiai" subtitle="Bendras svetainės pokalbis">
      <ShoutPane tall />
    </HomeListModal>
  )
}

// Desktop: tab'ų box'as. Mobile: du kompaktiški mygtukai → pilni modalai (#21).
function HappeningArea() {
  const { events, loading } = useActivity()
  const [tab, setTab] = useState<'act' | 'shout'>('act')
  const [actModal, setActModal] = useState(false)
  const [shoutModal, setShoutModal] = useState(false)
  const [lastShout, setLastShout] = useState<string | null>(null)
  useEffect(() => {
    let on = true
    fetch('/api/live/shoutbox?limit=1', { cache: 'no-store' }).then(r => r.json()).then(d => { if (on) setLastShout(d.messages?.[0]?.created_at || null) }).catch(() => {})
    return () => { on = false }
  }, [])
  const lastAct = events[0]?.created_at || null

  return (
    <>
      {/* ── Desktop box su tab'ais ── */}
      <div className="hidden h-full flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] lg:flex">
        <div className="flex shrink-0 border-b border-[var(--border-subtle)]">
          <button type="button" onClick={() => setTab('act')}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-2 border-0 bg-transparent px-2 pb-2.5 pt-3 font-['Outfit',sans-serif] text-[12px] font-extrabold transition-colors ${tab === 'act' ? 'text-[var(--text-primary)] shadow-[inset_0_-2px_0_var(--accent-orange)]' : 'text-[var(--text-muted)]'}`}>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#22c55e]" /> Kas vyksta
          </button>
          <button type="button" onClick={() => setTab('shout')}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-2 border-0 bg-transparent px-2 pb-2.5 pt-3 font-['Outfit',sans-serif] text-[12px] font-extrabold transition-colors ${tab === 'shout' ? 'text-[var(--text-primary)] shadow-[inset_0_-2px_0_var(--accent-orange)]' : 'text-[var(--text-muted)]'}`}>
            <Ic d={I.comment} size={13} /> Pokalbiai
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-3.5 pb-3 pt-2">
          {tab === 'act' ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {loading ? (
                  <div className="py-6 text-center text-[11.5px] text-[var(--text-faint)]">Kraunama…</div>
                ) : events.length === 0 ? (
                  <div className="py-6 text-center text-[11.5px] text-[var(--text-muted)]">Dar nėra aktyvumo.</div>
                ) : events.slice(0, 20).map(e => <ActRow key={e.id} e={e} />)}
              </div>
              {events.length > 0 && (
                <button type="button" onClick={() => setActModal(true)} className="mt-1 shrink-0 cursor-pointer border-0 bg-transparent p-0 pt-2 text-left font-['Outfit',sans-serif] text-[12px] font-bold text-[var(--accent-orange)] transition-opacity hover:opacity-70">Visa veikla →</button>
              )}
            </>
          ) : <ShoutPane />}
        </div>
      </div>

      {/* ── Mobile: 2 kompaktiški mygtukai → modalai (be scroll-in-scroll) ── */}
      <div className="grid grid-cols-2 gap-3 lg:hidden">
        <button type="button" onClick={() => setActModal(true)}
          className="flex cursor-pointer flex-col items-start gap-1.5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3.5 text-left">
          <span className="flex items-center gap-2 font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--text-primary)]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#22c55e]" /> Kas vyksta
          </span>
          <span className="text-[11px] text-[var(--text-muted)]">{lastAct ? `paskutinis veiksmas ${timeAgo(lastAct)}` : 'narių veiksmų srautas'}</span>
        </button>
        <button type="button" onClick={() => setShoutModal(true)}
          className="flex cursor-pointer flex-col items-start gap-1.5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3.5 text-left">
          <span className="flex items-center gap-2 font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--text-primary)]">
            <Ic d={I.comment} size={14} /> Pokalbiai
          </span>
          <span className="text-[11px] text-[var(--text-muted)]">{lastShout ? `paskutinė žinutė ${timeAgo(lastShout)}` : 'bendras pokalbis'}</span>
        </button>
      </div>

      {actModal && <ActivityModal events={events} onClose={() => setActModal(false)} />}
      {shoutModal && <ShoutModal onClose={() => setShoutModal(false)} />}
    </>
  )
}

// ═════════════════════════ 3. Prompt'ai ═════════════════════════
// Tvarka (#7): koncertas → apžvalga → topas → atradimas.
const PROMPTS = [
  { href: '/blogas/rasyti?type=event', icon: I.mic, bg: 'rgba(59,130,246,0.15)', color: '#60a5fa', title: 'Buvai koncerte?', sub: 'Pasidalink įspūdžiais' },
  { href: '/blogas/rasyti?type=review', icon: I.pen, bg: 'rgba(239,68,68,0.15)', color: '#f87171', title: 'Turi minčių apie muziką?', sub: 'Parašyk apžvalgą' },
  { href: '/blogas/rasyti?type=topas', icon: I.trophy, bg: 'rgba(245,158,11,0.15)', color: '#fbbf24', title: 'Turi favoritų?', sub: 'Sudaryk savo topą' },
  { href: '/muzikos-atradimai/pasidalink', icon: I.spark, bg: 'rgba(249,115,22,0.15)', color: '#fb923c', title: 'Atradai kažką įdomaus?', sub: 'Pasidalink atradimu' },
]

function PromptsRow() {
  return (
    <div className="mb-9 mt-4 hidden grid-cols-2 gap-2.5 sm:grid sm:gap-3 lg:grid-cols-4">
      {PROMPTS.map(p => (
        <Link key={p.title} href={p.href} className="group flex flex-col items-start gap-2 rounded-[14px] border border-dashed border-[var(--border-strong)] bg-[var(--card-bg)] px-3 py-3 no-underline transition-colors hover:border-[var(--accent-orange)] hover:bg-[rgba(249,115,22,0.07)] sm:flex-row sm:items-center sm:gap-3 sm:px-3.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] sm:h-9 sm:w-9 sm:rounded-[11px]" style={{ background: p.bg, color: p.color }}><Ic d={p.icon} size={16} /></span>
          <span className="min-w-0">
            <b className="block text-[12px] font-bold leading-snug text-[var(--text-primary)] sm:text-[12.5px]">{p.title}</b>
            <span className="block text-[10.5px] leading-snug text-[var(--text-muted)] sm:text-[11px]">{p.sub}</span>
          </span>
        </Link>
      ))}
    </div>
  )
}

// ═════════════════════════ 4. PULSAS — mišrus grid ═════════════════════════
type MixItem =
  | { kind: 'post'; date: string; post: FeedPost }
  | { kind: 'disc'; date: string; d: Diskusija }
  | { kind: 'atrad'; date: string; a: Atradimas }

// Kortelių aukščiai: mobile — pagal turinį (#23), sm+ — vienodi (grid ritmas).
// ═══════════════ Srauto „eilutės" kortelės (viena per eilutę, horizontalios) ═══════════════
// 2026-06-14: /atrasti Pulsas perdarytas iš 4-stulpelių masonry į vientisą srautą —
// vienoda forma, kairysis spalvotas kraštas + etiketė koduoja tipą, viršelis kairėj.
const ROW_BASE = 'group relative flex overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] no-underline transition-all hover:-translate-y-0.5 hover:border-[var(--border-strong)]'
const ROW_THUMB = 'relative w-[100px] shrink-0 self-stretch overflow-hidden bg-[var(--cover-placeholder)] sm:w-[248px]'
const ROW_MINH = 'min-h-[168px] sm:min-h-[150px]'
const ROW_PAD = 'flex min-w-0 flex-1 flex-col px-5 py-4'

function kindColor(kind: string): string {
  return (KIND_META[kind] || KIND_META.irasas).color
}
function AccentBar({ color }: { color: string }) {
  return <span aria-hidden className="w-[3px] shrink-0" style={{ background: color }} />
}
// Bendra apatinė autoriaus eilutė (inline, be border-top — tinka horizontaliai kortelei).
function RowMeta({ author, date, likes, comments }: { author?: { username?: string | null; full_name?: string | null; avatar_url?: string | null } | null; date?: string | null; likes?: number | null; comments?: number | null }) {
  return (
    <div className="mt-2.5 flex items-center gap-2">
      <Avatar src={author?.avatar_url} name={uname(author)} size={18} />
      <span className="min-w-0 truncate text-[11.5px] font-semibold text-[var(--text-secondary)]">{uname(author)}</span>
      {timeAgo(date) && <span className="shrink-0 text-[10px] text-[var(--text-faint)]">{timeAgo(date)}</span>}
      <Stats likes={likes} comments={comments} />
    </div>
  )
}

function PostRowCard({ p }: { p: FeedPost }) {
  const kind = postKind(p)
  return (
    <Link href={feedHref(p)} className={`${ROW_BASE} ${ROW_MINH}`}>
      <AccentBar color={kindColor(kind)} />
      {p.cover && (
        <div className={ROW_THUMB}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={proxyImg(p.cover)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
          {p.rating != null && <span className="absolute right-2 top-2 rounded-md bg-black/75 px-2 py-0.5 text-[12px] font-black text-amber-300">★ {p.rating}</span>}
        </div>
      )}
      <div className={ROW_PAD}>
        <KindBadge kind={kind} abs={false} />
        <h3 className="m-0 mt-2 line-clamp-3 font-['Outfit',sans-serif] text-[16px] font-extrabold leading-snug text-[var(--text-primary)] group-hover:text-[var(--accent-orange)] sm:line-clamp-2 sm:text-[17.5px]">{sani(p.title)}</h3>
        {p.excerpt && <p className="m-0 mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-[var(--text-secondary)] sm:line-clamp-3">{p.excerpt}</p>}
        <RowMeta author={p.author} date={p.published_at} likes={p.like_count} comments={p.comment_count} />
      </div>
    </Link>
  )
}

// Topo entry vizualas (bendras mobile collage + desktop tile).
function TopEntryTile({ e, big = false }: { e: ListEntry; big?: boolean }) {
  return (
    <>
      {e.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={proxyImg(e.image)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
      ) : <div className="absolute inset-0" style={{ background: `hsl(${hue(e.title)},30%,20%)` }} />}
      <span className={`absolute left-1.5 top-1.5 flex items-center justify-center rounded-md px-1 font-['Outfit',sans-serif] font-black ${big ? 'h-[26px] min-w-[26px] text-[15px]' : 'h-[20px] min-w-[20px] text-[11px]'} ${e.rank <= 3 ? 'bg-[var(--accent-orange)] text-white' : 'bg-black/70 text-white'}`}>{e.rank}</span>
      {big && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pb-1.5 pt-5">
          <p className="m-0 truncate text-[12.5px] font-bold leading-tight text-white">{sani(e.title)}</p>
          {e.artist && <p className="m-0 truncate text-[10.5px] text-white/70">{e.artist}</p>}
        </div>
      )}
    </>
  )
}

function PostTopasRowCard({ p }: { p: FeedPost }) {
  const entries = (p.entries || []).slice(0, 5)
  return (
    <Link href={feedHref(p)} className={`${ROW_BASE} ${ROW_MINH} hover:border-[rgba(245,158,11,0.5)]`}>
      <AccentBar color="#f59e0b" />
      <div className={ROW_PAD}>
        <div className="flex flex-wrap items-center gap-2.5">
          <KindBadge kind="topas" abs={false} label={topLabel(p)} />
          <h3 className="m-0 line-clamp-1 font-['Outfit',sans-serif] text-[16px] font-extrabold leading-snug text-[var(--text-primary)] group-hover:text-[var(--accent-orange)] sm:text-[17.5px]">{sani(p.title)}</h3>
        </div>
        {entries.length === 0 ? (
          <p className="m-0 mt-2 py-3 text-[12px] text-[var(--text-muted)]">Tuščias topas</p>
        ) : (
          <>
            {/* Mobile: collage — #1 didesnis (svoris aukštesnėms pozicijoms). */}
            <div className="mt-2.5 grid grid-cols-4 gap-1.5 sm:hidden">
              {entries.map((e, i) => (
                <div key={e.rank} className={`group/t relative aspect-square overflow-hidden rounded-lg bg-[var(--cover-placeholder)] ${i === 0 ? 'col-span-2 row-span-2' : ''}`}>
                  <TopEntryTile e={e} big={i === 0} />
                </div>
              ))}
            </div>
            {/* Desktop: eilė tilių su pavadinimais. */}
            <div className="mt-2.5 hidden flex-wrap gap-3 sm:flex">
              {entries.map(e => (
                <div key={e.rank} className="flex w-[112px] flex-col gap-1.5">
                  <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-[var(--cover-placeholder)]">
                    <TopEntryTile e={e} />
                  </div>
                  <div className="min-w-0">
                    <p className="m-0 truncate text-[12px] font-bold leading-tight text-[var(--text-primary)]">{sani(e.title)}</p>
                    {e.artist && <p className="m-0 truncate text-[10.5px] text-[var(--text-muted)]">{e.artist}</p>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        <RowMeta author={p.author} date={p.published_at} likes={p.like_count} comments={p.comment_count} />
      </div>
    </Link>
  )
}

// Diskusijos eilutė (#12): grupės foto kairėj, iki 3 naujausių komentarų horizontaliai.
function DiskusijaRowCard({ d }: { d: Diskusija }) {
  const comments = (d.latest_comments && d.latest_comments.length ? d.latest_comments : (d.latest_comment ? [d.latest_comment] : [])).slice(0, 3)
  const cols = Math.min(comments.length || 1, 3)
  return (
    <Link href={`/diskusijos/${d.slug}`} className={`${ROW_BASE} ${ROW_MINH} hover:border-[rgba(139,92,246,0.5)]`}
      style={{ background: 'linear-gradient(160deg, rgba(139,92,246,0.08), var(--bg-surface) 55%)' }}>
      <AccentBar color="#8b5cf6" />
      {d.artist_image && (
        <div className={ROW_THUMB}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={proxyImg(d.artist_image)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
          <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 45%, rgba(13,19,32,0.85))' }} />
          {d.artist_name && <span className="absolute bottom-2 left-3 font-['Outfit',sans-serif] text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-white/90">{d.artist_name}</span>}
        </div>
      )}
      <div className={ROW_PAD}>
        <KindBadge kind="diskusija" abs={false} />
        <h3 className="m-0 mt-2 line-clamp-1 font-['Outfit',sans-serif] text-[16px] font-extrabold leading-snug text-[var(--text-primary)] group-hover:text-[var(--accent-orange)] sm:text-[17.5px]">{sani(d.title)}</h3>
        {comments.length > 0 && (
          <>
            {/* Mobile: tik vienas naujausias komentaras (kad nesusiplaktų). */}
            <div className="mt-2 sm:hidden">
              {(() => { const c = comments[0]; return (
                <div className="rounded-[4px_12px_12px_12px] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.05)] px-3 py-2">
                  <div className="mb-1 flex items-center gap-1.5">
                    <Avatar src={c.avatar} name={c.author} size={15} />
                    <b className="min-w-0 flex-1 truncate text-[10.5px] font-bold text-[var(--text-primary)]">{c.author}</b>
                    {c.created_at && timeAgo(c.created_at) && <span className="shrink-0 text-[9.5px] text-[var(--text-faint)]">{timeAgo(c.created_at)}</span>}
                  </div>
                  <p className="m-0 line-clamp-3 text-[12px] leading-relaxed text-[var(--text-secondary)]">{c.excerpt}</p>
                </div>
              ) })()}
            </div>
            {/* Desktop: iki 3 naujausių komentarų greta. */}
            <div className="mt-2 hidden gap-2.5 sm:grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {comments.map((c, i) => (
                <div key={i} className="rounded-[4px_12px_12px_12px] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.05)] px-3 py-2">
                  <div className="mb-1 flex items-center gap-1.5">
                    <Avatar src={c.avatar} name={c.author} size={15} />
                    <b className="min-w-0 flex-1 truncate text-[10.5px] font-bold text-[var(--text-primary)]">{c.author}</b>
                    {c.created_at && timeAgo(c.created_at) && <span className="shrink-0 text-[9.5px] text-[var(--text-faint)]">{timeAgo(c.created_at)}</span>}
                  </div>
                  <p className="m-0 line-clamp-3 text-[12px] leading-relaxed text-[var(--text-secondary)]">{c.excerpt}</p>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="mt-2 flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-[11.5px] font-bold text-[#b79df7]"><Ic d={I.comment} size={12} /> {d.comment_count > 0 ? `${d.comment_count} koment.` : 'Nauja tema'}</span>
          {timeAgo(d.latest_comment?.created_at || d.created_at) && <span className="shrink-0 text-[10px] text-[var(--text-faint)]">{timeAgo(d.latest_comment?.created_at || d.created_at)}</span>}
        </div>
      </div>
    </Link>
  )
}

// Atradimo eilutė (#18): click → modalas su embed'u.
function AtradimasRowCard({ a, onOpen }: { a: Atradimas; onOpen: (a: Atradimas) => void }) {
  const thumb = discThumb(a)
  const quote = sani(a.body)
  return (
    <button type="button" onClick={() => onOpen(a)} className={`${ROW_BASE} ${ROW_MINH} w-full cursor-pointer p-0 text-left hover:border-[rgba(249,115,22,0.5)]`}>
      <AccentBar color="#f97316" />
      <div className={`${ROW_THUMB} flex items-center justify-center`}>
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
        ) : <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, hsl(${hue(a.artist_name || 'x')},34%,22%), hsl(${(hue(a.artist_name || 'x') + 40) % 360},30%,12%))` }} />}
        <span className="relative z-[1] flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(249,115,22,0.95)] text-white shadow-[0_6px_18px_rgba(0,0,0,0.4)] transition-transform group-hover:scale-105"><Ic d={I.play} size={17} filled /></span>
      </div>
      <div className={ROW_PAD}>
        <KindBadge kind="atradimas" abs={false} />
        <h3 className="m-0 mt-2 line-clamp-3 font-['Outfit',sans-serif] text-[16px] font-extrabold leading-snug text-[var(--text-primary)] group-hover:text-[var(--accent-orange)] sm:line-clamp-2 sm:text-[17.5px]">
          {a.artist_name || 'Atradimas'}{a.track_name ? ` — ${a.track_name}` : ''}
        </h3>
        {quote && <p className="m-0 mt-1.5 line-clamp-2 text-[13px] italic leading-relaxed text-[var(--text-secondary)] sm:line-clamp-3">„{quote.length > 280 ? quote.slice(0, 280).replace(/\s+\S*$/, '') + '…' : quote}"</p>}
        <RowMeta author={a.author} date={a.created_at} likes={a.like_count} />
      </div>
    </button>
  )
}

const PULSE_CHIPS: { key: string; label: string; color?: string }[] = [
  { key: 'apzvalga', label: 'Muzikos apžvalgos', color: '#ef4444' },
  { key: 'koncertai', label: 'Koncertų įspūdžiai', color: '#3b82f6' },
  { key: 'topas', label: 'Topai', color: '#f59e0b' },
  { key: 'atradimas', label: 'Atradimai', color: '#f97316' },
  { key: 'diskusija', label: 'Diskusijos', color: '#8b5cf6' },
]

// Pilno sąrašo nuorodos pagal aktyvų chip'ą (#14).
const CHIP_FULL_LIST: Record<string, { href: string; label: string }> = {
  atradimas: { href: '/muzikos-atradimai', label: 'Visi muzikos atradimai' },
  diskusija: { href: '/diskusijos', label: 'Visos diskusijos' },
  apzvalga: { href: '/blogas', label: 'Visi narių įrašai' },
  koncertai: { href: '/blogas', label: 'Visi narių įrašai' },
  topas: { href: '/blogas', label: 'Visi narių įrašai' },
}

const PAGE_SIZE = 15
// Flood limitas (#13): pirmame ekrane vienas autorius — max 2 įrašai; likę jo
// įrašai nukeliami į uodegą (pasiekiami per „Rodyti daugiau").
const PER_AUTHOR_CAP = 2

// Išsklaido sąrašą taip, kad du to paties autoriaus įrašai nestovėtų greta.
function spreadByAuthor<T extends { post: FeedPost }>(items: T[]): T[] {
  const keyOf = (it: T) => it.post.author?.username || it.post.author?.id || `p${it.post.id}`
  const out: T[] = []
  const pool = [...items]
  while (pool.length) {
    const prevKey = out.length ? keyOf(out[out.length - 1]) : null
    let idx = pool.findIndex(it => keyOf(it) !== prevKey)
    if (idx === -1) idx = 0 // liko tik to paties autoriaus — dedam kaip yra
    out.push(pool.splice(idx, 1)[0])
  }
  return out
}

function PulsasSection() {
  const [chip, setChip] = useState('')
  const [posts, setPosts] = useState<FeedPost[] | null>(null)
  const [discs, setDiscs] = useState<Diskusija[]>([])
  const [atrads, setAtrads] = useState<Atradimas[]>([])
  const [postsHasMore, setPostsHasMore] = useState(false)
  const [shown, setShown] = useState(PAGE_SIZE)
  const [loadingMore, setLoadingMore] = useState(false)
  const [openDisc, setOpenDisc] = useState<Atradimas | null>(null)
  const offsetRef = useRef(0)

  useEffect(() => {
    let on = true
    Promise.all([
      fetch(`/api/atradimai/feed?nodedup=1&exclude_type=creation,translation,quick&limit=30`).then(r => r.json()).catch(() => ({})),
      fetch('/api/diskusijos/recent?limit=12').then(r => r.json()).catch(() => ({})),
      fetch('/api/muzikos-atradimai?limit=14').then(r => r.json()).catch(() => ({})),
    ]).then(([f, d, a]) => {
      if (!on) return
      setPosts(f.posts || [])
      setPostsHasMore(!!f.hasMore)
      offsetRef.current = (f.posts || []).length
      setDiscs(d.items || [])
      setAtrads(a.items || [])
    })
    return () => { on = false }
  }, [])

  const loadMorePosts = async () => {
    setLoadingMore(true)
    try {
      const r = await fetch(`/api/atradimai/feed?nodedup=1&exclude_type=creation,translation,quick&limit=30&offset=${offsetRef.current}`).then(res => res.json())
      const next: FeedPost[] = r.posts || []
      setPosts(prev => [...(prev || []), ...next])
      setPostsHasMore(!!r.hasMore)
      offsetRef.current += next.length
    } catch {}
    setLoadingMore(false)
  }

  // Mišrus srautas: postai pagal datą (su per-autoriaus cap'u) + diskusijos/
  // atradimai įterpiami kas kelias korteles.
  const mixed: MixItem[] = useMemo(() => {
    const rawP = (posts || []).map(post => ({ kind: 'post' as const, date: post.published_at || '', post }))
    // Flood limitas: autorius pirmame sraute — max PER_AUTHOR_CAP; perteklius
    // keliauja į uodegą (matomas išskleidus).
    const seen = new Map<string, number>()
    const p: typeof rawP = []
    const overflow: typeof rawP = []
    for (const it of rawP) {
      const key = it.post.author?.username || it.post.author?.id || `p${it.post.id}`
      const cnt = seen.get(key) || 0
      if (cnt >= PER_AUTHOR_CAP) overflow.push(it)
      else { p.push(it); seen.set(key, cnt + 1) }
    }
    // Išsklaidom to paties autoriaus įrašus, kad nestovėtų greta (#7).
    const pOrdered = spreadByAuthor(p)
    const d = discs.map(x => ({ kind: 'disc' as const, date: x.latest_comment?.created_at || x.created_at || '', d: x }))
    const a = atrads.map(x => ({ kind: 'atrad' as const, date: x.created_at || '', a: x }))
    if (chip === 'diskusija') return d
    if (chip === 'atradimas') return a
    // Nuselectinta (chip === '') → rodom viską; kitaip filtruojam pagal tipą.
    if (chip !== '') return spreadByAuthor([...pOrdered, ...overflow].filter(it => postKind(it.post) === chip))
    const out: MixItem[] = []
    let di = 0, ai = 0
    for (let i = 0; i < pOrdered.length; i++) {
      out.push(pOrdered[i])
      if ((i + 1) % 3 === 0) {
        if ((Math.floor(i / 3) % 2 === 0) && di < d.length) out.push(d[di++])
        else if (ai < a.length) out.push(a[ai++])
        else if (di < d.length) out.push(d[di++])
      }
    }
    while (di < d.length || ai < a.length) {
      if (di < d.length) out.push(d[di++])
      if (ai < a.length) out.push(a[ai++])
    }
    out.push(...overflow)
    return out
  }, [posts, discs, atrads, chip])

  const visible = mixed.slice(0, shown)
  const hasMore = mixed.length > shown || (chip !== 'diskusija' && chip !== 'atradimas' && postsHasMore)
  const fullList = CHIP_FULL_LIST[chip]

  const more = async () => {
    if (mixed.length <= shown + 3 && postsHasMore) await loadMorePosts()
    setShown(s => s + PAGE_SIZE)
  }

  return (
    <section className="mb-10">
      <div className="mb-3.5 flex items-end justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="h-[18px] w-1 rounded-[3px] bg-[var(--accent-orange)]" />
          <h2 className="m-0 font-['Outfit',sans-serif] font-extrabold text-[var(--text-primary)]" style={{ fontSize: 'var(--section-title-size)', letterSpacing: 'var(--section-title-tracking)' }}>Pulsas</h2>
          <span className="hidden text-[12.5px] text-[var(--text-muted)] sm:inline">kuo gyvena bendruomenė</span>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {PULSE_CHIPS.map(c => {
          const on = chip === c.key
          return (
            <button key={c.key} type="button" onClick={() => { setChip(chip === c.key ? '' : c.key); setShown(PAGE_SIZE) }}
              className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 font-['Outfit',sans-serif] text-[12.5px] font-bold transition-colors ${
                on ? 'border-transparent text-white' : 'border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
              }`}
              style={on ? { background: c.color || 'var(--accent-orange)' } : undefined}>
              {c.color && !on && <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />}
              {c.label}
            </button>
          )
        })}
      </div>

      {posts === null ? (
        <div className="flex flex-col gap-3">
          {Array(6).fill(null).map((_, i) => <div key={i} className="hp-skel h-[150px] rounded-2xl" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-default)] p-8 text-center text-[13px] text-[var(--text-muted)]">
          Šioje skiltyje įrašų dar nėra. <Link href="/blogas/rasyti" className="font-bold text-[var(--accent-orange)] no-underline">Būk pirmas →</Link>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {visible.map((it) => {
              if (it.kind === 'disc') return <DiskusijaRowCard key={`d-${it.d.id}`} d={it.d} />
              if (it.kind === 'atrad') return <AtradimasRowCard key={`a-${it.a.id}`} a={it.a} onOpen={setOpenDisc} />
              const p = it.post
              if (p.post_type === 'topas') return <PostTopasRowCard key={`p-${p.id}`} p={p} />
              return <PostRowCard key={`p-${p.id}`} p={p} />
            })}
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {hasMore && (
              <button type="button" onClick={more} disabled={loadingMore}
                className="cursor-pointer rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] px-9 py-2.5 font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-orange)] hover:text-[var(--accent-orange)] disabled:opacity-50">
                {loadingMore ? 'Kraunama…' : 'Rodyti daugiau ↓'}
              </button>
            )}
            {fullList && (
              <Link href={fullList.href} className="rounded-full border border-transparent px-5 py-2.5 font-['Outfit',sans-serif] text-[13px] font-bold text-[var(--accent-orange)] no-underline transition-opacity hover:opacity-70">
                {fullList.label} →
              </Link>
            )}
          </div>
        </>
      )}
      {openDisc && <DiscoveryModal a={openDisc} onClose={() => setOpenDisc(null)} />}
    </section>
  )
}

// ═════════════════════════ 5. Kūrybos kampas ═════════════════════════
const KORNER_QUERY = 'exclude_type=topas,review&exclude_editorial=recenzija,koncertai,atradimas'

function KornerModal({ onClose }: { onClose: () => void }) {
  const [activeType, setActiveType] = useState('')
  const [posts, setPosts] = useState<FeedPost[] | null>(null)
  useEffect(() => {
    let on = true
    setPosts(null)
    const q = activeType ? `type=${activeType}&nodedup=1&limit=40` : `${KORNER_QUERY}&nodedup=1&limit=40`
    fetch(`/api/atradimai/feed?${q}`).then(r => r.json()).then(d => { if (on) setPosts(d.posts || []) }).catch(() => { if (on) setPosts([]) })
    return () => { on = false }
  }, [activeType])
  const chips = [
    { v: '', l: 'Visi' },
    { v: 'creation', l: 'Kūryba' },
    { v: 'translation', l: 'Vertimai' },
    { v: 'article', l: 'Įvairūs įrašai' },
  ]
  return (
    <HomeListModal open onClose={onClose} title="Kūrybos kampas" subtitle="Eilėraščiai, vertimai ir įvairūs įrašai">
      <div className="mb-4 flex flex-wrap gap-2">
        {chips.map(c => (
          <button key={c.v} type="button" onClick={() => setActiveType(c.v)}
            className={`cursor-pointer rounded-full border px-3 py-1 font-['Outfit',sans-serif] text-[12px] font-bold transition-colors ${
              activeType === c.v ? 'border-[var(--accent-orange)] bg-[var(--accent-orange)]/12 text-[var(--accent-orange)]' : 'border-[var(--border-default)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'
            }`}>{c.l}</button>
        ))}
      </div>
      {posts === null ? (
        <div className="flex flex-wrap gap-3">{Array(8).fill(null).map((_, i) => <div key={i} className="hp-skel h-[150px] w-[210px] rounded-xl" />)}</div>
      ) : posts.length === 0 ? (
        <div className="py-12 text-center text-[13px] text-[var(--text-muted)]">Įrašų dar nėra.</div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {posts.map(p => <KornerCard key={p.id} p={p} wide />)}
        </div>
      )}
    </HomeListModal>
  )
}

function KornerCard({ p, wide = false }: { p: FeedPost; wide?: boolean }) {
  const kind = postKind(p)
  return (
    <Link href={feedHref(p)} className={`group flex shrink-0 snap-start flex-col rounded-[13px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3.5 no-underline transition-colors hover:bg-[var(--card-hover)] ${wide ? 'w-[210px]' : 'w-[200px]'}`}>
      <KindBadge kind={kind} abs={false} />
      <h4 className="m-0 mt-2.5 line-clamp-2 font-['Outfit',sans-serif] text-[13.5px] font-bold leading-snug text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{sani(p.title) || '(be pavadinimo)'}</h4>
      {p.excerpt && <p className="m-0 mt-1 line-clamp-2 text-[11.5px] leading-snug text-[var(--text-muted)]">{p.excerpt}</p>}
      <div className="mt-auto flex items-center gap-1.5 pt-2.5">
        <Avatar src={p.author?.avatar_url} name={uname(p.author)} size={16} />
        <span className="min-w-0 truncate text-[11px] text-[var(--text-muted)]">{uname(p.author)}</span>
        {(p.like_count ?? 0) > 0 && <span className="ml-auto flex shrink-0 items-center gap-1 text-[10.5px] text-[var(--text-faint)]"><Ic d={I.heart} size={10} /> {p.like_count}</span>}
      </div>
    </Link>
  )
}

function KornerSection() {
  const [posts, setPosts] = useState<FeedPost[] | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  useEffect(() => {
    let on = true
    fetch(`/api/atradimai/feed?${KORNER_QUERY}&limit=15`).then(r => r.json()).then(d => { if (on) setPosts(d.posts || []) }).catch(() => { if (on) setPosts([]) })
    return () => { on = false }
  }, [])
  // Tvarka (#13): įrašas → kūryba → vertimas → ir taip kartojam (round-robin).
  const ordered = useMemo(() => {
    if (!posts) return null
    const buckets: Record<string, FeedPost[]> = { irasas: [], kuryba: [], vertimas: [] }
    for (const p of posts) {
      const k = postKind(p)
      ;(buckets[k] || buckets.irasas).push(p)
    }
    const order = ['irasas', 'kuryba', 'vertimas']
    const out: FeedPost[] = []
    let added = true
    while (added) {
      added = false
      for (const k of order) {
        const next = buckets[k].shift()
        if (next) { out.push(next); added = true }
      }
    }
    return out
  }, [posts])
  return (
    <section className="mb-10 border-t border-[var(--border-default)] pt-7">
      <div className="mb-3.5 flex items-end justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="h-[18px] w-1 rounded-[3px] bg-[#ec4899]" />
          <h2 className="m-0 font-['Outfit',sans-serif] text-[16px] font-extrabold tracking-[-0.01em] text-[var(--text-primary)]">Kūrybos kampas</h2>
          <span className="hidden text-[12px] text-[var(--text-muted)] sm:inline">eilėraščiai · vertimai · įvairūs įrašai</span>
        </div>
        <button type="button" onClick={() => setModalOpen(true)} className="shrink-0 cursor-pointer border-0 bg-transparent p-0 font-['Outfit',sans-serif] text-[12px] font-bold text-[var(--accent-orange)] transition-opacity hover:opacity-70">Daugiau →</button>
      </div>
      <div className="hp-scroll flex snap-x gap-3 overflow-x-auto pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ordered === null ? (
          Array(5).fill(null).map((_, i) => <div key={i} className="hp-skel h-[150px] w-[200px] shrink-0 rounded-[13px]" />)
        ) : (
          <>
            {ordered.map(p => <KornerCard key={p.id} p={p} />)}
            <Link href="/blogas/rasyti?type=creation" className="group flex w-[200px] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-[13px] border border-dashed border-[var(--border-strong)] p-4 text-center no-underline transition-colors hover:border-[var(--accent-orange)]" style={{ minHeight: 150 }}>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(249,115,22,0.15)] text-[var(--accent-orange)]"><Ic d={I.plus} size={15} /></span>
              <b className="font-['Outfit',sans-serif] text-[12.5px] font-extrabold text-[var(--text-primary)]">Įkelk savo kūrybą</b>
              <span className="text-[11px] text-[var(--text-muted)]">eilėraštį, vertimą ar mintis</span>
            </Link>
          </>
        )}
      </div>
      {modalOpen && <KornerModal onClose={() => setModalOpen(false)} />}
    </section>
  )
}

// ═════════════════════════ 6. Aktyvūs nariai (#19) ═════════════════════════
function NariaiSection() {
  const [list, setList] = useState<ActiveMember[] | null>(null)
  useEffect(() => {
    let on = true
    fetch('/api/atradimai/active-members?days=30&limit=10').then(r => r.json()).then(d => {
      if (!on) return
      const actives: ActiveMember[] = (d.members || []).map((m: any) => ({ user_id: m.user_id, username: m.username, name: m.name, avatar: m.avatar, tastes: m.tastes || [], isNew: false }))
      const seen = new Set(actives.map(m => m.username))
      const news: ActiveMember[] = (d.new_members || [])
        .filter((m: any) => !seen.has(m.username) && !m.joined_legacy_at) // tikrai nauji (realios registracijos)
        .slice(0, 4)
        .map((m: any) => ({ username: m.username, name: m.name, avatar: m.avatar, tastes: m.tastes || [], isNew: true }))
      setList([...news, ...actives].slice(0, 14))
    }).catch(() => { if (on) setList([]) })
    return () => { on = false }
  }, [])
  if (list !== null && list.length === 0) return null
  return (
    <section className="mb-12">
      <div className="mb-3.5 flex items-center gap-2.5">
        <span className="h-[18px] w-1 rounded-[3px] bg-[#3b82f6]" />
        <h2 className="m-0 font-['Outfit',sans-serif] text-[16px] font-extrabold tracking-[-0.01em] text-[var(--text-primary)]">Aktyvūs nariai</h2>
        <span className="hidden text-[12px] text-[var(--text-muted)] sm:inline">ir jų muzikos skonis</span>
      </div>
      <div className="hp-scroll flex snap-x gap-3.5 overflow-x-auto pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {list === null ? (
          Array(6).fill(null).map((_, i) => <div key={i} className="hp-skel h-[170px] w-[180px] shrink-0 rounded-[15px]" />)
        ) : list.map(m => (
          <Link key={m.username} href={`/@${m.username}`} className="group flex w-[180px] shrink-0 snap-start flex-col items-center rounded-[15px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-4 pb-4 pt-5 text-center no-underline transition-colors hover:bg-[var(--card-hover)]">
            <div className="relative">
              <Avatar src={m.avatar} name={m.username} size={60} />
              {m.isNew && <span title="Naujas narys" className="absolute -right-0.5 bottom-0.5 h-3.5 w-3.5 rounded-full border-2 border-[var(--bg-body)] bg-[#22c55e]" />}
            </div>
            <p className="m-0 mt-2.5 w-full truncate font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{m.username}</p>
            {m.isNew && <p className="m-0 mt-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#22c55e]">naujas narys</p>}
            {m.tastes && m.tastes.length > 0 && (
              <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
                {m.tastes.slice(0, 3).map(t => (
                  <span key={t} className="max-w-full truncate rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.06)] px-2.5 py-[3px] text-[10.5px] font-semibold text-[var(--text-secondary)]">{t}</span>
                ))}
              </div>
            )}
          </Link>
        ))}
      </div>
    </section>
  )
}

// ═════════════════════════ Page ═════════════════════════
export default function BendruomenePage() {
  return (
    <div className="page-shell">
      <div className="page-head">
        <h1>Bendruomenė</h1>
        <p>Žmonės, kurie gyvena muzika</p>
      </div>

      <FeaturedSlider />

      {/* ŠIANDIEN: DD hero + Kas vyksta/Pokalbiai. items-start — hero netempiamas;
          dešinė kolona ribojama fiksuotu aukščiu (desktop). */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_350px]">
        <DienosDainaHero />
        <div className="lg:h-[540px]"><HappeningArea /></div>
      </div>

      <PromptsRow />

      <PulsasSection />

      <KornerSection />

      <NariaiSection />
    </div>
  )
}
