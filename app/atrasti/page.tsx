'use client'

// app/atrasti/page.tsx
//
// „Atrasti" — bendruomenės hub'as (2026-06-10 redesign pagal mockup v4).
//
// Struktūra:
//   0. Mobile stories juosta (featured + dienos daina + feed highlights)
//   1. FEATURED „Verta dėmesio" — kuruotas (admin featured_until, max ~48h);
//      1 įrašas = per visą plotį, 2 = main + antrinis (per-tipo išvaizda);
//      nieko featured → blokas nerodomas.
//   2. ŠIANDIEN: Dienos dainos hero (lyderis + kandidatai + vakar laimėjusi
//      integruota apačioje) + „Kas vyksta" (tab'ai: Veikla | Pokalbiai/shoutbox).
//   3. Prompt'ų juosta — kvietimai kurti turinį.
//   4. PULSAS — mišrus magazine grid (apžvalgos/koncertai/topai/atradimai/
//      diskusijos) su tipo filtrais (chips = kortelių badge spalvos) ir
//      „Rodyti daugiau" (feed auga su aktyvumu).
//   5. Kūrybos kampas — kūryba + vertimai + laisvi įrašai (viena kukli eilė).
//   6. Nauji nariai — didesni avatarai + muzikos skonio chips.
//
// Balsų skaičiai niekur nerodomi tiesiogiai — popbar (5 brūkšneliai, kaip
// artist page). Like/comment skaičiai rodomi TIK kai > 0.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { proxyImg } from '@/lib/img-proxy'
import { useActivity, ActivityModal } from '@/components/ActivityWidget'
import { DainaSuggestModal } from '@/components/DienosDainaSection'
import { HomeListModal } from '@/components/HomeListModal'
import { HomeTrackModal } from '@/components/HomeTrackModal'

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
  // onDark — DD hero fonas visada tamsus (nepriklausomai nuo temos), tad
  // neužpildyti brūkšneliai ten turi būti šviesūs permatomi, ne theme-var.
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
  cover: string | null; collage: string[] | null; entries: ListEntry[] | null; blog_slug: string | null
  author: { id: string | null; full_name: string | null; username: string | null; avatar_url: string | null } | null
}
type Diskusija = {
  id: number; slug: string; title: string; author_name: string | null; author_avatar: string | null
  comment_count: number; created_at: string; artist_name?: string | null; artist_image?: string | null
  latest_comment?: { author: string; excerpt: string; avatar?: string | null; created_at?: string | null } | null
}
type Atradimas = {
  id: number; artist_name: string | null; track_name: string | null; body: string | null
  embed_type: string | null; embed_id: string | null; artist_cover: string | null
  like_count: number | null; created_at: string | null
  author: { username: string | null; full_name: string | null; avatar_url: string | null } | null
}
type NewMember = { username: string; name: string | null; avatar: string | null; created_at: string; joined_legacy_at?: string | null; tastes?: string[] }
type Proposer = { username: string | null; full_name: string | null; avatar_url: string | null }
type TrackLite = { id: number; title: string; cover_url: string | null; slug?: string | null; video_url?: string | null; artists: { name: string; slug?: string | null; cover_image_url?: string | null } | null }
type Nomination = { id: number; votes: number; weighted_votes: number; comment?: string | null; tracks: TrackLite | null; proposer?: Proposer | null; own?: boolean }
type DainaWinner = { id: number; date: string; total_votes: number; weighted_votes: number; winning_comment?: string | null; proposer?: Proposer | null; tracks: TrackLite | null }

function feedHref(p: FeedPost) { return p.blog_slug ? `/blogas/${p.blog_slug}/${p.slug}` : '/blogas' }
function trackImg(t: TrackLite | null): string | null {
  if (!t) return null
  const yt = extractYouTubeId(t.video_url)
  return t.cover_url || (yt ? `https://img.youtube.com/vi/${yt}/mqdefault.jpg` : null) || t.artists?.cover_image_url || null
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
  apzvalga: { label: 'Apžvalga', color: '#ef4444' },
  koncertai: { label: 'Koncertų įspūdžiai', color: '#3b82f6' },
  topas: { label: 'Topas', color: '#f59e0b' },
  atradimas: { label: 'Atradimas', color: '#f97316' },
  diskusija: { label: 'Diskusija', color: '#8b5cf6' },
  kuryba: { label: 'Kūryba', color: '#ec4899' },
  vertimas: { label: 'Vertimas', color: '#10b981' },
  irasas: { label: 'Įrašas', color: '#94a3b8' },
}

function KindBadge({ kind, abs = true }: { kind: string; abs?: boolean }) {
  const m = KIND_META[kind] || KIND_META.irasas
  return (
    <span className={`${abs ? 'absolute left-3 top-3 z-[2]' : ''} rounded-[7px] px-2 py-1 font-['Outfit',sans-serif] text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-white`}
      style={{ background: m.color }}>{m.label}</span>
  )
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

function AuthorMeta({ author, date, likes, comments }: { author?: { username?: string | null; full_name?: string | null; avatar_url?: string | null } | null; date?: string | null; likes?: number | null; comments?: number | null }) {
  const ago = timeAgo(date)
  return (
    <div className="mt-auto flex items-center gap-2 border-t border-[var(--border-subtle)] px-3.5 py-2.5">
      <Avatar src={author?.avatar_url} name={uname(author)} size={20} />
      <span className="min-w-0 truncate text-[11.5px] font-semibold text-[var(--text-secondary)]">{uname(author)}</span>
      {ago && <span className="shrink-0 text-[10px] text-[var(--text-faint)]">{ago}</span>}
      <Stats likes={likes} comments={comments} />
    </div>
  )
}

// ═════════════════════════ 1. FEATURED ═════════════════════════
function FeaturedTopasCard({ p }: { p: FeedPost }) {
  const entries = (p.entries || []).slice(0, 3)
  return (
    <Link href={feedHref(p)} className="group relative flex flex-col overflow-hidden rounded-[20px] border border-[rgba(245,158,11,0.3)] p-5 no-underline transition-transform hover:-translate-y-0.5"
      style={{ background: 'linear-gradient(150deg, rgba(245,158,11,0.12), var(--bg-surface) 62%)' }}>
      <KindBadge kind="topas" abs={false} />
      <p className="m-0 mt-3 line-clamp-2 font-['Outfit',sans-serif] text-[17px] font-extrabold leading-snug text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{sani(p.title)}</p>
      <div className="mt-2.5 flex flex-col">
        {entries.map(e => (
          <div key={e.rank} className="flex items-center gap-2.5 py-[5px]">
            <span className="w-4 shrink-0 text-center font-['Outfit',sans-serif] text-[13px] font-black text-[#f59e0b]">{e.rank}</span>
            {e.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={proxyImg(e.image)} alt="" loading="lazy" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
            ) : <div className="h-8 w-8 shrink-0 rounded-lg" style={{ background: `hsl(${hue(e.title)},30%,20%)` }} />}
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-[12.5px] font-bold text-[var(--text-primary)]">{sani(e.title)}</p>
              {e.artist && <p className="m-0 truncate text-[11px] text-[var(--text-muted)]">{e.artist}</p>}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
        <Avatar src={p.author?.avatar_url} name={uname(p.author)} size={22} />
        <span className="truncate text-[12px] font-semibold text-[var(--text-secondary)]">{uname(p.author)}</span>
        <span className="ml-auto shrink-0 text-[11px] font-bold text-[var(--text-faint)]">+ dar {Math.max(0, (p.entries?.length || 0) - 3) || '?'} →</span>
      </div>
    </Link>
  )
}

function FeaturedMainCard({ p, solo }: { p: FeedPost; solo: boolean }) {
  const kind = postKind(p)
  return (
    <Link href={feedHref(p)} className={`group relative grid overflow-hidden rounded-[22px] border border-[var(--border-default)] no-underline transition-transform hover:-translate-y-0.5 ${solo ? 'sm:grid-cols-[1.15fr_1fr]' : 'sm:grid-cols-1 lg:grid-cols-[1fr_1.05fr]'}`}
      style={{ minHeight: 280 }}>
      <KindBadge kind={kind} />
      <div className="relative min-h-[180px] overflow-hidden bg-[var(--cover-placeholder)]">
        {p.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyImg(p.cover)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
        ) : (
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, hsl(${hue(p.title)},34%,22%), hsl(${(hue(p.title) + 40) % 360},30%,12%))` }} />
        )}
      </div>
      <div className="relative flex flex-col justify-center p-6 sm:p-7" style={{ background: 'linear-gradient(135deg, #131c2e 0%, var(--bg-surface) 70%)' }}>
        <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(520px 280px at 0% 100%, rgba(249,115,22,0.12), transparent 60%)' }} />
        <span className="relative inline-flex items-center gap-2 self-start rounded-full border border-[rgba(249,115,22,0.35)] bg-[rgba(249,115,22,0.13)] px-3 py-1.5 font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#fdba74]">
          <Ic d={I.star} size={12} /> Verta dėmesio
        </span>
        <h2 className="relative m-0 mt-3.5 line-clamp-3 font-['Outfit',sans-serif] text-[22px] font-black leading-[1.15] tracking-[-0.02em] text-[var(--text-primary)] sm:text-[26px]">{sani(p.title)}</h2>
        {p.excerpt && <p className="relative m-0 mt-2.5 line-clamp-3 text-[13.5px] leading-relaxed text-[var(--text-secondary)]">{p.excerpt}</p>}
        <div className="relative mt-4 flex items-center gap-2.5">
          <Avatar src={p.author?.avatar_url} name={uname(p.author)} size={28} />
          <span className="text-[12.5px] font-bold text-[var(--text-primary)]">{uname(p.author)}</span>
          {timeAgo(p.published_at) && <span className="text-[11.5px] text-[var(--text-muted)]">· {timeAgo(p.published_at)}</span>}
          <Stats likes={p.like_count} comments={p.comment_count} />
        </div>
      </div>
    </Link>
  )
}

function FeaturedBlock() {
  const [posts, setPosts] = useState<FeedPost[] | null>(null)
  useEffect(() => {
    let on = true
    fetch('/api/atradimai/feed?featured=1&nodedup=1&limit=4').then(r => r.json()).then(d => { if (on) setPosts(d.posts || []) }).catch(() => { if (on) setPosts([]) })
    return () => { on = false }
  }, [])
  if (posts === null) return null
  if (!posts.length) return null
  const [main, second] = posts
  return (
    <section className={`mb-5 hidden gap-4 sm:grid ${second ? 'lg:grid-cols-[1.6fr_1fr]' : ''}`}>
      <FeaturedMainCard p={main} solo={!second} />
      {second && (second.post_type === 'topas'
        ? <FeaturedTopasCard p={second} />
        : (
          <Link href={feedHref(second)} className="group relative flex flex-col overflow-hidden rounded-[20px] border border-[var(--border-default)] bg-[var(--bg-surface)] no-underline transition-transform hover:-translate-y-0.5">
            <KindBadge kind={postKind(second)} />
            <div className="relative h-[150px] shrink-0 overflow-hidden bg-[var(--cover-placeholder)]">
              {second.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={proxyImg(second.cover)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
              ) : <div className="h-full w-full" style={{ background: `linear-gradient(135deg, hsl(${hue(second.title)},34%,22%), hsl(${(hue(second.title) + 40) % 360},30%,12%))` }} />}
            </div>
            <div className="flex flex-1 flex-col p-4">
              <p className="m-0 line-clamp-2 font-['Outfit',sans-serif] text-[16px] font-extrabold leading-snug text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{sani(second.title)}</p>
              {second.excerpt && <p className="m-0 mt-1.5 line-clamp-3 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">{second.excerpt}</p>}
            </div>
            <AuthorMeta author={second.author} date={second.published_at} likes={second.like_count} comments={second.comment_count} />
          </Link>
        ))}
    </section>
  )
}

// ═════════════════════════ 2. DIENOS DAINA hero ═════════════════════════
function Countdown() {
  const [txt, setTxt] = useState('—:—:—')
  useEffect(() => {
    const tick = () => {
      const n = new Date(); const m = new Date(n); m.setHours(24, 0, 0, 0)
      const s = Math.max(0, Math.floor((m.getTime() - n.getTime()) / 1000))
      setTxt(`${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`)
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [])
  return <b className="font-bold text-[#fdba74]" style={{ fontVariantNumeric: 'tabular-nums' }}>{txt}</b>
}

function WinnersModal({ onClose, onOpenTrack }: { onClose: () => void; onOpenTrack: (t: any) => void }) {
  const [list, setList] = useState<DainaWinner[] | null>(null)
  useEffect(() => {
    let on = true
    fetch('/api/dienos-daina/winners?limit=30').then(r => r.json()).then(d => { if (on) setList(d.winners || []) }).catch(() => { if (on) setList([]) })
    return () => { on = false }
  }, [])
  return (
    <HomeListModal open onClose={onClose} title="Laimėjusios dainos" subtitle="Dienos dainų istorija">
      {list === null ? (
        <div className="py-8 text-center text-[12px] text-[var(--text-muted)]">Kraunama…</div>
      ) : list.length === 0 ? (
        <div className="py-8 text-center text-[12px] text-[var(--text-muted)]">Istorijos dar nėra.</div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {list.filter(w => w.tracks).map(w => {
            const t = w.tracks!
            const img = trackImg(t)
            return (
              <button key={w.id} type="button" onClick={() => { onClose(); onOpenTrack({ id: t.id, title: t.title, slug: t.slug, cover_url: t.cover_url, video_url: t.video_url, artists: t.artists }) }}
                className="hp-card group flex items-center gap-3 p-3 text-left">
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={proxyImg(img)} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                ) : <div className="h-12 w-12 shrink-0 rounded-lg" style={{ background: `hsl(${hue(t.title)},30%,18%)` }} />}
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{sani(t.title)}</p>
                  <p className="m-0 truncate text-[11.5px] text-[var(--text-muted)]">{t.artists?.name}</p>
                  <p className="m-0 mt-0.5 text-[10.5px] text-[var(--text-faint)]">{w.date}{w.proposer ? ` · siūlė ${uname(w.proposer)}` : ''}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </HomeListModal>
  )
}

function DienosDainaHero() {
  const [noms, setNoms] = useState<Nomination[]>([])
  const [winner, setWinner] = useState<DainaWinner | null>(null)
  const [loading, setLoading] = useState(true)
  const [alreadyNominated, setAlreadyNominated] = useState(false)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [winnersOpen, setWinnersOpen] = useState(false)
  const [votedIds, setVotedIds] = useState<Set<number>>(new Set())
  const [voting, setVoting] = useState<number | null>(null)
  const [voteErr, setVoteErr] = useState('')
  const [track, setTrack] = useState<any | null>(null)

  const load = useCallback(() => {
    Promise.all([
      fetch('/api/dienos-daina/nominations').then(r => r.json()).catch(() => ({})),
      fetch('/api/dienos-daina/winners?limit=1').then(r => r.json()).catch(() => ({})),
    ]).then(([n, w]) => {
      setNoms(n.nominations || [])
      setAlreadyNominated(!!n.already_nominated)
      setWinner((w.winners && w.winners[0]) || null)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    fetch('/api/dienos-daina/votes').then(r => r.json()).then(d => setVotedIds(new Set<number>(d.voted_nomination_ids || []))).catch(() => {})
  }, [])

  const handleVote = useCallback(async (id: number) => {
    if (votedIds.has(id) || voting !== null) return
    setVoting(id); setVoteErr('')
    try {
      const res = await fetch('/api/dienos-daina/votes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nomination_id: id }) })
      const d = await res.json()
      if (res.ok) {
        const wt = d.weight || 1
        setVotedIds(prev => { const next = new Set(prev); next.add(id); return next })
        setNoms(prev => prev.map(n => n.id === id ? { ...n, votes: (n.votes || 0) + 1, weighted_votes: (n.weighted_votes || 0) + wt } : n))
      } else { setVoteErr(d.error || 'Klaida'); setTimeout(() => setVoteErr(''), 3000) }
    } catch { setVoteErr('Tinklo klaida'); setTimeout(() => setVoteErr(''), 3000) }
    finally { setVoting(null) }
  }, [votedIds, voting])

  const sorted = useMemo(() => [...noms].filter(n => n.tracks).sort((a, b) => (b.weighted_votes || b.votes || 0) - (a.weighted_votes || a.votes || 0)), [noms])
  const maxVotes = Math.max(1, ...sorted.map(n => n.weighted_votes || n.votes || 0))
  const leader = sorted[0] || null
  const rest = sorted.slice(1)
  const openTrack = (t: TrackLite) => setTrack({ id: t.id, title: t.title, slug: t.slug, cover_url: t.cover_url, video_url: t.video_url, artists: t.artists })

  const leaderImg = leader ? trackImg(leader.tracks) : null

  if (loading) {
    return <div className="hp-skel h-[420px] rounded-[20px]" />
  }

  const CandRow = ({ n }: { n: Nomination }) => {
    const t = n.tracks!
    const img = trackImg(t)
    const votes = n.weighted_votes || n.votes || 0
    const level = votes > 0 ? Math.max(1, Math.round((votes / maxVotes) * 5)) : 0
    const voted = votedIds.has(n.id)
    return (
      <div className="flex items-center gap-2.5 rounded-[10px] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.05)] px-2.5 py-2 transition-colors hover:bg-[rgba(255,255,255,0.09)]">
        <button type="button" onClick={() => openTrack(t)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 border-0 bg-transparent p-0 text-left">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proxyImg(img)} alt="" loading="lazy" className="h-[34px] w-[34px] shrink-0 rounded-[7px] object-cover" />
          ) : <div className="h-[34px] w-[34px] shrink-0 rounded-[7px]" style={{ background: `hsl(${hue(t.title)},30%,18%)` }} />}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-baseline gap-1.5">
              <span className="truncate text-[12.5px] font-bold text-[#f0f4fc]">{sani(t.title)}</span>
              <span className="truncate text-[11px] text-[#8ea8c4]">{t.artists?.name}</span>
            </div>
            {n.comment && <p className="m-0 mt-0.5 truncate text-[11px] italic text-[#8ea8c4]">„{n.comment}"</p>}
            {level > 0 && <div className="mt-1"><PopBar level={level} w={9} onDark /></div>}
          </div>
        </button>
        {n.proposer && (
          <span className="hidden shrink-0 items-center gap-1.5 text-[11px] text-[#aec4dd] md:flex">
            <Avatar src={n.proposer.avatar_url} name={uname(n.proposer)} size={18} />
            {uname(n.proposer)}
          </span>
        )}
        {n.own ? (
          <span className="shrink-0 rounded-lg border border-dashed border-[rgba(255,255,255,0.25)] px-2.5 py-1 font-['Outfit',sans-serif] text-[10.5px] font-bold text-[#8ea8c4]">Tavo</span>
        ) : (
          <button type="button" onClick={() => handleVote(n.id)} disabled={voted || voting !== null}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-['Outfit',sans-serif] text-[11px] font-extrabold transition-colors ${
              voted ? 'border-[rgba(249,115,22,0.5)] bg-[rgba(249,115,22,0.16)] text-[#fdba74]' : 'border-[rgba(255,255,255,0.25)] text-[#aec4dd] hover:border-[var(--accent-orange)] hover:text-[var(--accent-orange)]'
            }`}>
            <Ic d={I.heart} size={11} filled={voted} /> {voting === n.id ? '…' : voted ? 'Balsuota' : 'Balsuok'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div id="dienos-daina" className="relative flex flex-col overflow-hidden rounded-[20px] border border-[var(--border-default)]" style={{ background: '#0a101c' }}>
      {/* fonas iš lyderio cover */}
      <div className="absolute inset-0">
        {leaderImg && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyImg(leaderImg)} alt="" className="h-full w-full object-cover opacity-30" style={{ filter: 'blur(40px) saturate(1.3)', transform: 'scale(1.3)' }} />
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(100deg, rgba(8,13,20,0.96) 0%, rgba(8,13,20,0.8) 60%, rgba(249,115,22,0.12) 100%)' }} />
      </div>

      {/* lyderis */}
      <div className="relative flex flex-wrap items-center gap-5 px-5 pb-4 pt-5 sm:px-6">
        {leader ? (
          <>
            <button type="button" onClick={() => openTrack(leader.tracks!)} className="group relative shrink-0 cursor-pointer border-0 bg-transparent p-0">
              <div className="relative h-[120px] w-[120px] overflow-hidden rounded-[14px] shadow-[0_18px_50px_rgba(0,0,0,0.55)] sm:h-[140px] sm:w-[140px]">
                {leaderImg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={proxyImg(leaderImg)} alt="" className="h-full w-full object-cover" />
                ) : <div className="h-full w-full" style={{ background: `hsl(${hue(leader.tracks!.title)},30%,18%)` }} />}
                <div className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-orange)] text-white shadow-[0_8px_24px_rgba(249,115,22,0.5)]"><Ic d={I.play} size={18} filled /></span>
                </div>
              </div>
              <span className="absolute -left-2 -top-2 rounded-[9px] bg-[var(--accent-orange)] px-2 py-1 font-['Outfit',sans-serif] text-[12px] font-black text-white shadow-[0_6px_16px_rgba(249,115,22,0.45)]">#1</span>
            </button>
            <div className="min-w-[220px] flex-1">
              <div className="flex items-center gap-2 font-['Outfit',sans-serif] text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-[var(--accent-orange)]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent-orange)]" /> Dienos daina
              </div>
              <h2 className="m-0 mt-1.5 line-clamp-2 font-['Outfit',sans-serif] text-[24px] font-black leading-[1.08] tracking-[-0.02em] text-[#f0f4fc] sm:text-[28px]">{sani(leader.tracks!.title)}</h2>
              <p className="m-0 mt-0.5 text-[14.5px] font-semibold text-[#aec4dd]">{leader.tracks!.artists?.name}</p>
              {leader.comment && <p className="m-0 mt-2 line-clamp-2 text-[12.5px] italic leading-snug text-[#aec4dd]">„{leader.comment}"</p>}
              {leader.proposer && (
                <div className="mt-2 flex items-center gap-2 text-[12px] text-[#8ea8c4]">
                  <Avatar src={leader.proposer.avatar_url} name={uname(leader.proposer)} size={20} />
                  siūlo <b className="font-semibold text-[#f0f4fc]">{uname(leader.proposer)}</b>
                </div>
              )}
              <div className="mt-3 flex items-center gap-3">
                <PopBar level={Math.max(1, Math.round(((leader.weighted_votes || leader.votes || 0) / maxVotes) * 5))} onDark />
                <span className="flex items-center gap-1.5 text-[11.5px] text-[#8ea8c4]"><Ic d={I.clock} size={12} /> liko <Countdown /></span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex w-full flex-col items-start gap-2 py-4">
            <div className="flex items-center gap-2 font-['Outfit',sans-serif] text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-[var(--accent-orange)]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent-orange)]" /> Dienos daina
            </div>
            <p className="m-0 text-[15px] font-bold text-[#f0f4fc]">Šiandien dar nėra pasiūlymų — tavo daina gali būti pirma.</p>
            <button type="button" onClick={() => setSuggestOpen(true)} className="mt-1 cursor-pointer rounded-xl border-0 bg-[var(--accent-orange)] px-5 py-2.5 font-['Outfit',sans-serif] text-[13px] font-extrabold text-white shadow-[0_6px_20px_rgba(249,115,22,0.35)]">+ Pasiūlyti dainą</button>
          </div>
        )}
      </div>

      {/* kandidatai */}
      {rest.length > 0 || (leader && !alreadyNominated) ? (
        <div className="relative border-t border-[rgba(255,255,255,0.08)] px-4 pb-4 pt-3 sm:px-5">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="font-['Outfit',sans-serif] text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-[#8ea8c4]">Siūlomos dainos</span>
            <div className="flex items-center gap-3">
              {voteErr && <span className="text-[11px] font-bold text-[#f87171]">{voteErr}</span>}
              {!alreadyNominated && (
                <button type="button" onClick={() => setSuggestOpen(true)} className="cursor-pointer border-0 bg-transparent p-0 font-['Outfit',sans-serif] text-[12px] font-bold text-[var(--accent-orange)] transition-opacity hover:opacity-70">+ Pasiūlyk savo dainą</button>
              )}
            </div>
          </div>
          {/* mobile: visi kandidatai iškart; desktop: vidinis scroll, kad hero neišsitemptų */}
          <div className="flex flex-col gap-[5px] sm:max-h-[238px] sm:overflow-y-auto sm:pr-1.5 [&::-webkit-scrollbar-thumb]:rounded-[3px] [&::-webkit-scrollbar-thumb]:bg-[rgba(255,255,255,0.14)] [&::-webkit-scrollbar]:w-[6px]">
            {rest.map(n => <CandRow key={n.id} n={n} />)}
            {rest.length === 0 && <p className="m-0 px-1 py-2 text-[12px] text-[#8ea8c4]">Kol kas vienintelis kandidatas — pasiūlyk alternatyvą!</p>}
          </div>
        </div>
      ) : null}

      {/* vakar laimėjusi — integruota */}
      {winner?.tracks && (
        <div className="relative flex items-center gap-3 border-t border-[rgba(251,191,36,0.22)] px-4 py-2.5 sm:px-5" style={{ background: 'linear-gradient(90deg, rgba(251,191,36,0.08), transparent 65%)' }}>
          <span className="flex shrink-0 items-center gap-1.5 font-['Outfit',sans-serif] text-[9.5px] font-extrabold uppercase tracking-[0.13em] text-[#fbbf24]"><Ic d={I.trophy} size={12} /> Vakar laimėjo</span>
          <button type="button" onClick={() => openTrack(winner.tracks!)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 border-0 bg-transparent p-0 text-left">
            {trackImg(winner.tracks) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={proxyImg(trackImg(winner.tracks)!)} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
            ) : <div className="h-9 w-9 shrink-0 rounded-lg" style={{ background: `hsl(${hue(winner.tracks.title)},30%,18%)` }} />}
            <span className="min-w-0 truncate text-[12.5px] text-[#aec4dd]">
              <b className="font-bold text-[#f0f4fc]">{sani(winner.tracks.title)}</b> — {winner.tracks.artists?.name}{winner.proposer ? ` · siūlė ${uname(winner.proposer)}` : ''}
            </span>
          </button>
          <button type="button" onClick={() => setWinnersOpen(true)} className="shrink-0 cursor-pointer border-0 bg-transparent p-0 font-['Outfit',sans-serif] text-[11.5px] font-bold text-[#fbbf24] transition-opacity hover:opacity-70">Visos →</button>
        </div>
      )}

      {suggestOpen && <DainaSuggestModal onClose={() => setSuggestOpen(false)} onDone={load} />}
      {winnersOpen && <WinnersModal onClose={() => setWinnersOpen(false)} onOpenTrack={setTrack} />}
      {track && <HomeTrackModal track={track} onClose={() => setTrack(null)} />}
    </div>
  )
}

// ═════════════════════════ 2b. Kas vyksta / Pokalbiai (tab'ai) ═════════════════════════
type ShoutMsg = { id: string; user_id: string | null; author_name: string | null; author_avatar: string | null; body: string; created_at: string }

function ShoutPane() {
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
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto py-1">
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
            <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send() }} maxLength={255} placeholder="Parašyk žinutę…"
              className="min-w-0 flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-orange)]" />
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

function HappeningBox() {
  const { events, loading } = useActivity()
  const [tab, setTab] = useState<'act' | 'shout'>('act')
  const [modalOpen, setModalOpen] = useState(false)
  return (
    <div className="flex h-full max-h-[480px] min-h-[380px] flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] lg:max-h-none lg:min-h-0">
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
              ) : events.slice(0, 20).map(e => {
                const name = e.actor_name || 'narys'
                return (
                  <div key={e.id} className="flex items-start gap-2.5 border-b border-[var(--border-subtle)] py-2 last:border-b-0">
                    <Avatar src={e.actor_avatar} name={name} size={26} />
                    <div className="min-w-0 flex-1">
                      <p className="m-0 text-[12.3px] leading-snug text-[var(--text-secondary)]">
                        <b className="font-semibold text-[var(--text-primary)]">{name}</b> {ACT_VERB[e.event_type] || 'atnaujino'}
                        {e.entity_title ? (
                          e.entity_url
                            ? <> <Link href={e.entity_url} className="font-semibold text-[#fdba74] no-underline hover:underline">{sani(e.entity_title)}</Link></>
                            : <> <span className="font-semibold text-[#fdba74]">{sani(e.entity_title)}</span></>
                        ) : null}
                      </p>
                      <span className="text-[10px] text-[var(--text-faint)]">{timeAgo(e.created_at)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            {events.length > 0 && (
              <button type="button" onClick={() => setModalOpen(true)} className="mt-1 shrink-0 cursor-pointer border-0 bg-transparent p-0 pt-2 text-left font-['Outfit',sans-serif] text-[12px] font-bold text-[var(--accent-orange)] transition-opacity hover:opacity-70">Visa veikla →</button>
            )}
          </>
        ) : <ShoutPane />}
      </div>
      {modalOpen && <ActivityModal events={events} onClose={() => setModalOpen(false)} />}
    </div>
  )
}

// ═════════════════════════ 3. Prompt'ai ═════════════════════════
const PROMPTS = [
  { href: '/blogas/rasyti?type=article', icon: I.mic, bg: 'rgba(59,130,246,0.15)', color: '#60a5fa', title: 'Buvai koncerte?', sub: 'Pasidalink įspūdžiais' },
  { href: '/muzikos-atradimai', icon: I.spark, bg: 'rgba(249,115,22,0.15)', color: '#fb923c', title: 'Atradai kažką įdomaus?', sub: 'Pasidalink atradimu' },
  { href: '/blogas/rasyti?type=review', icon: I.pen, bg: 'rgba(239,68,68,0.15)', color: '#f87171', title: 'Turi minčių apie muziką?', sub: 'Parašyk apžvalgą' },
  { href: '/blogas/rasyti?type=topas', icon: I.trophy, bg: 'rgba(245,158,11,0.15)', color: '#fbbf24', title: 'Turi favoritų?', sub: 'Sudaryk savo topą' },
]

function PromptsRow() {
  return (
    <div className="mb-9 mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {PROMPTS.map(p => (
        <Link key={p.title} href={p.href} className="group flex items-center gap-3 rounded-[14px] border border-dashed border-[var(--border-strong)] bg-[var(--card-bg)] px-3.5 py-3 no-underline transition-colors hover:border-[var(--accent-orange)] hover:bg-[rgba(249,115,22,0.07)]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]" style={{ background: p.bg, color: p.color }}><Ic d={p.icon} size={17} /></span>
          <span className="min-w-0">
            <b className="block truncate text-[12.5px] font-bold leading-tight text-[var(--text-primary)]">{p.title}</b>
            <span className="block truncate text-[11px] text-[var(--text-muted)]">{p.sub}</span>
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

function PostFeatureCard({ p }: { p: FeedPost }) {
  return (
    <Link href={feedHref(p)} className="group relative col-span-1 flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] no-underline transition-all hover:-translate-y-1 hover:border-[var(--border-strong)] sm:col-span-2">
      <KindBadge kind={postKind(p)} />
      <div className="relative h-[210px] shrink-0 overflow-hidden bg-[var(--cover-placeholder)]">
        {p.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyImg(p.cover)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
        ) : <div className="h-full w-full" style={{ background: `linear-gradient(135deg, hsl(${hue(p.title)},34%,22%), hsl(${(hue(p.title) + 40) % 360},30%,12%))` }} />}
        <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 55%, rgba(13,19,32,0.85))' }} />
        {p.rating != null && <span className="absolute right-2.5 top-2.5 rounded-lg bg-black/75 px-2 py-1 text-[13px] font-black text-amber-300">★ {p.rating}</span>}
      </div>
      <div className="flex flex-1 flex-col px-4 pb-2 pt-3.5">
        <h3 className="m-0 line-clamp-2 font-['Outfit',sans-serif] text-[19px] font-extrabold leading-snug text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{sani(p.title)}</h3>
        {p.excerpt && <p className="m-0 mt-2 line-clamp-4 text-[13px] leading-relaxed text-[var(--text-secondary)]">{p.excerpt}</p>}
      </div>
      <AuthorMeta author={p.author} date={p.published_at} likes={p.like_count} comments={p.comment_count} />
    </Link>
  )
}

function PostStdCard({ p }: { p: FeedPost }) {
  return (
    <Link href={feedHref(p)} className="group relative flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] no-underline transition-all hover:-translate-y-1 hover:border-[var(--border-strong)]">
      <KindBadge kind={postKind(p)} />
      <div className="relative h-[150px] shrink-0 overflow-hidden bg-[var(--cover-placeholder)]">
        {p.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyImg(p.cover)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
        ) : <div className="h-full w-full" style={{ background: `linear-gradient(135deg, hsl(${hue(p.title)},34%,22%), hsl(${(hue(p.title) + 40) % 360},30%,12%))` }} />}
        {p.rating != null && <span className="absolute right-2 top-2 rounded-md bg-black/75 px-1.5 py-0.5 text-[11.5px] font-black text-amber-300">★ {p.rating}</span>}
      </div>
      <div className="flex flex-1 flex-col px-3.5 pb-2 pt-3">
        <h3 className="m-0 line-clamp-2 font-['Outfit',sans-serif] text-[15px] font-extrabold leading-snug text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{sani(p.title)}</h3>
        {p.excerpt && <p className="m-0 mt-1.5 line-clamp-[6] text-[12.5px] leading-relaxed text-[var(--text-secondary)]">{p.excerpt}</p>}
      </div>
      <AuthorMeta author={p.author} date={p.published_at} likes={p.like_count} comments={p.comment_count} />
    </Link>
  )
}

function PostTopasCard({ p }: { p: FeedPost }) {
  const entries = (p.entries || []).slice(0, 5)
  return (
    <Link href={feedHref(p)} className="group relative flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] no-underline transition-all hover:-translate-y-1 hover:border-[rgba(245,158,11,0.5)]">
      <div className="px-3.5 pt-3.5"><KindBadge kind="topas" abs={false} /></div>
      <div className="flex flex-1 flex-col px-3.5 pb-1 pt-2.5">
        <h3 className="m-0 line-clamp-2 font-['Outfit',sans-serif] text-[15px] font-extrabold leading-snug text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{sani(p.title)}</h3>
        <div className="mt-2 flex flex-col">
          {entries.length === 0 ? (
            <p className="m-0 py-4 text-center text-[12px] text-[var(--text-muted)]">Tuščias topas</p>
          ) : entries.map(e => (
            <div key={e.rank} className="flex items-center gap-2.5 border-b border-[var(--border-subtle)] py-[7px] last:border-b-0">
              <span className={`w-4 shrink-0 text-center font-['Outfit',sans-serif] text-[13px] font-black ${e.rank <= 3 ? 'text-[var(--accent-orange)]' : 'text-[var(--text-faint)]'}`}>{e.rank}</span>
              {e.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={proxyImg(e.image)} alt="" loading="lazy" className="h-8 w-8 shrink-0 rounded-[7px] object-cover" />
              ) : <div className="h-8 w-8 shrink-0 rounded-[7px]" style={{ background: `hsl(${hue(e.title)},30%,20%)` }} />}
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-[12.5px] font-bold text-[var(--text-primary)]">{sani(e.title)}</p>
                {e.artist && <p className="m-0 truncate text-[10.5px] text-[var(--text-muted)]">{e.artist}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
      <AuthorMeta author={p.author} date={p.published_at} likes={p.like_count} comments={p.comment_count} />
    </Link>
  )
}

function DiskusijaGridCard({ d }: { d: Diskusija }) {
  return (
    <Link href={`/diskusijos/${d.slug}`} className="group relative flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] no-underline transition-all hover:-translate-y-1 hover:border-[rgba(139,92,246,0.5)]"
      style={{ background: 'linear-gradient(160deg, rgba(139,92,246,0.1), var(--bg-surface) 60%)' }}>
      {/* susietos grupės/atlikėjo foto */}
      {d.artist_image ? (
        <div className="relative h-[130px] shrink-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={proxyImg(d.artist_image)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
          <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 40%, rgba(13,19,32,0.85))' }} />
          <KindBadge kind="diskusija" />
          {d.artist_name && <span className="absolute bottom-2 left-3 font-['Outfit',sans-serif] text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-white/90">{d.artist_name}</span>}
        </div>
      ) : (
        <div className="px-3.5 pt-3.5"><KindBadge kind="diskusija" abs={false} /></div>
      )}
      <div className="flex flex-1 flex-col gap-2 px-3.5 pb-2 pt-3">
        <h3 className="m-0 line-clamp-2 font-['Outfit',sans-serif] text-[15px] font-extrabold leading-snug text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{sani(d.title)}</h3>
        {d.latest_comment?.excerpt && (
          <div className="rounded-[4px_14px_14px_14px] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.06)] px-3 py-2">
            <div className="mb-1 flex items-center gap-1.5">
              <Avatar src={d.latest_comment.avatar} name={d.latest_comment.author} size={17} />
              <b className="text-[11px] font-bold text-[var(--text-primary)]">{d.latest_comment.author}</b>
            </div>
            <p className="m-0 line-clamp-[7] text-[12.3px] leading-relaxed text-[var(--text-secondary)]">{d.latest_comment.excerpt}</p>
          </div>
        )}
        <span className="mt-auto pt-1 text-[11.5px] font-bold text-[#b79df7]">{d.comment_count > 0 ? `${d.comment_count} koment. · ` : ''}atsakyk →</span>
      </div>
      <div className="flex items-center gap-2 border-t border-[var(--border-subtle)] px-3.5 py-2.5">
        <Avatar src={d.author_avatar} name={d.author_name} size={20} />
        <span className="min-w-0 truncate text-[11.5px] font-semibold text-[var(--text-secondary)]">{d.author_name || 'narys'}</span>
        {timeAgo(d.latest_comment?.created_at || d.created_at) && <span className="ml-auto shrink-0 text-[10px] text-[var(--text-faint)]">{timeAgo(d.latest_comment?.created_at || d.created_at)}</span>}
      </div>
    </Link>
  )
}

function AtradimasGridCard({ a }: { a: Atradimas }) {
  const thumb = a.embed_type === 'youtube' && a.embed_id ? `https://i.ytimg.com/vi/${a.embed_id}/mqdefault.jpg` : (a.artist_cover ? proxyImg(a.artist_cover) : null)
  const quote = sani(a.body)
  return (
    <Link href={`/muzikos-atradimai/${a.id}`} className="group relative flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] no-underline transition-all hover:-translate-y-1 hover:border-[rgba(249,115,22,0.5)]">
      <KindBadge kind="atradimas" />
      <div className="relative h-[150px] shrink-0 overflow-hidden bg-[var(--cover-placeholder)]">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
        ) : <div className="h-full w-full" style={{ background: `linear-gradient(135deg, hsl(${hue(a.artist_name || 'x')},34%,22%), hsl(${(hue(a.artist_name || 'x') + 40) % 360},30%,12%))` }} />}
        <div className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-90 transition-opacity group-hover:opacity-100">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[rgba(249,115,22,0.95)] text-white shadow-[0_6px_18px_rgba(0,0,0,0.4)]"><Ic d={I.play} size={16} filled /></span>
        </div>
      </div>
      <div className="flex flex-1 flex-col px-3.5 pb-2 pt-3">
        <h3 className="m-0 line-clamp-2 font-['Outfit',sans-serif] text-[15px] font-extrabold leading-snug text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">
          {a.artist_name || 'Atradimas'}{a.track_name ? ` — ${a.track_name}` : ''}
        </h3>
        {quote && <p className="m-0 mt-1.5 line-clamp-[6] text-[12.5px] italic leading-relaxed text-[var(--text-secondary)]">„{quote.length > 300 ? quote.slice(0, 300).replace(/\s+\S*$/, '') + '…' : quote}"</p>}
      </div>
      <AuthorMeta author={a.author} date={a.created_at} likes={a.like_count} />
    </Link>
  )
}

const PULSE_CHIPS: { key: string; label: string; color?: string }[] = [
  { key: 'visi', label: 'Visi' },
  { key: 'apzvalga', label: 'Apžvalgos', color: '#ef4444' },
  { key: 'koncertai', label: 'Koncertų įspūdžiai', color: '#3b82f6' },
  { key: 'topas', label: 'Topai', color: '#f59e0b' },
  { key: 'atradimas', label: 'Atradimai', color: '#f97316' },
  { key: 'diskusija', label: 'Diskusijos', color: '#8b5cf6' },
]

const PAGE_SIZE = 15

function PulsasSection() {
  const [chip, setChip] = useState('visi')
  const [posts, setPosts] = useState<FeedPost[] | null>(null)
  const [discs, setDiscs] = useState<Diskusija[]>([])
  const [atrads, setAtrads] = useState<Atradimas[]>([])
  const [postsHasMore, setPostsHasMore] = useState(false)
  const [shown, setShown] = useState(PAGE_SIZE)
  const [loadingMore, setLoadingMore] = useState(false)
  const offsetRef = useRef(0)

  // Bazinis mix'as: blog feed (be kūrybos/vertimų — jie Kūrybos kampe) +
  // diskusijos + muzikos atradimai. Visi tipai matomi „Visi" rodinyje.
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

  // Mišrus srautas: postai pagal datą + diskusijos/atradimai įterpiami kas kelias
  // korteles (kad tipai maišytųsi, o ne lipdytųsi blokais).
  const mixed: MixItem[] = useMemo(() => {
    const p = (posts || []).map(post => ({ kind: 'post' as const, date: post.published_at || '', post }))
    const d = discs.map(x => ({ kind: 'disc' as const, date: x.latest_comment?.created_at || x.created_at || '', d: x }))
    const a = atrads.map(x => ({ kind: 'atrad' as const, date: x.created_at || '', a: x }))
    if (chip === 'diskusija') return d
    if (chip === 'atradimas') return a
    if (chip !== 'visi') return p.filter(it => postKind(it.post) === chip)
    // „Visi": weave — kas 3 postai įterpiam diskusiją arba atradimą.
    const out: MixItem[] = []
    let di = 0, ai = 0
    for (let i = 0; i < p.length; i++) {
      out.push(p[i])
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
    return out
  }, [posts, discs, atrads, chip])

  const visible = mixed.slice(0, shown)
  const hasMore = mixed.length > shown || (chip !== 'diskusija' && chip !== 'atradimas' && postsHasMore)

  const more = async () => {
    if (mixed.length <= shown + 3 && postsHasMore) await loadMorePosts()
    setShown(s => s + PAGE_SIZE)
  }

  // Feature kortelė: pirmas postas su cover (apžvalga/koncertai/įrašas) tampa plačia.
  let featureUsed = false

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
            <button key={c.key} type="button" onClick={() => { setChip(c.key); setShown(PAGE_SIZE) }}
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array(8).fill(null).map((_, i) => <div key={i} className={`hp-skel h-[420px] rounded-2xl ${i === 0 ? 'sm:col-span-2' : ''}`} />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-default)] p-8 text-center text-[13px] text-[var(--text-muted)]">
          Šioje skiltyje įrašų dar nėra. <Link href="/blogas/rasyti" className="font-bold text-[var(--accent-orange)] no-underline">Būk pirmas →</Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {visible.map((it, idx) => {
              if (it.kind === 'disc') return <DiskusijaGridCard key={`d-${it.d.id}`} d={it.d} />
              if (it.kind === 'atrad') return <AtradimasGridCard key={`a-${it.a.id}`} a={it.a} />
              const p = it.post
              if (p.post_type === 'topas') return <PostTopasCard key={`p-${p.id}`} p={p} />
              if (!featureUsed && idx < 3 && p.cover && postKind(p) !== 'topas') {
                featureUsed = true
                return <PostFeatureCard key={`p-${p.id}`} p={p} />
              }
              return <PostStdCard key={`p-${p.id}`} p={p} />
            })}
          </div>
          {hasMore && (
            <div className="mt-6 flex justify-center">
              <button type="button" onClick={more} disabled={loadingMore}
                className="cursor-pointer rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] px-9 py-2.5 font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-orange)] hover:text-[var(--accent-orange)] disabled:opacity-50">
                {loadingMore ? 'Kraunama…' : 'Rodyti daugiau ↓'}
              </button>
            </div>
          )}
        </>
      )}
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
    { v: 'article', l: 'Įrašai' },
  ]
  return (
    <HomeListModal open onClose={onClose} title="Kūrybos kampas" subtitle="Eilėraščiai, vertimai ir laisvi įrašai">
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
    fetch(`/api/atradimai/feed?${KORNER_QUERY}&limit=12`).then(r => r.json()).then(d => { if (on) setPosts(d.posts || []) }).catch(() => { if (on) setPosts([]) })
    return () => { on = false }
  }, [])
  return (
    <section className="mb-10 border-t border-[var(--border-default)] pt-7">
      <div className="mb-3.5 flex items-end justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="h-[18px] w-1 rounded-[3px] bg-[#ec4899]" />
          <h2 className="m-0 font-['Outfit',sans-serif] text-[16px] font-extrabold tracking-[-0.01em] text-[var(--text-primary)]">Kūrybos kampas</h2>
          <span className="hidden text-[12px] text-[var(--text-muted)] sm:inline">eilėraščiai · vertimai · laisvi įrašai</span>
        </div>
        <button type="button" onClick={() => setModalOpen(true)} className="shrink-0 cursor-pointer border-0 bg-transparent p-0 font-['Outfit',sans-serif] text-[12px] font-bold text-[var(--accent-orange)] transition-opacity hover:opacity-70">Viskas →</button>
      </div>
      <div className="hp-scroll flex snap-x gap-3 overflow-x-auto pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {posts === null ? (
          Array(5).fill(null).map((_, i) => <div key={i} className="hp-skel h-[150px] w-[200px] shrink-0 rounded-[13px]" />)
        ) : (
          <>
            {posts.map(p => <KornerCard key={p.id} p={p} />)}
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

// ═════════════════════════ 6. Nauji nariai ═════════════════════════
function NaujiNariaiSection() {
  const [list, setList] = useState<NewMember[] | null>(null)
  useEffect(() => {
    let on = true
    fetch('/api/atradimai/active-members?days=7&limit=12').then(r => r.json()).then(d => { if (on) setList(d.new_members || []) }).catch(() => { if (on) setList([]) })
    return () => { on = false }
  }, [])
  if (list !== null && list.length === 0) return null
  return (
    <section className="mb-12">
      <div className="mb-3.5 flex items-center gap-2.5">
        <span className="h-[18px] w-1 rounded-[3px] bg-[#10b981]" />
        <h2 className="m-0 font-['Outfit',sans-serif] text-[16px] font-extrabold tracking-[-0.01em] text-[var(--text-primary)]">Nauji nariai</h2>
        <span className="hidden text-[12px] text-[var(--text-muted)] sm:inline">ir jų muzikos skonis</span>
      </div>
      <div className="hp-scroll flex snap-x gap-3.5 overflow-x-auto pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {list === null ? (
          Array(6).fill(null).map((_, i) => <div key={i} className="hp-skel h-[170px] w-[180px] shrink-0 rounded-[15px]" />)
        ) : list.map(m => (
          <Link key={m.username} href={`/@${m.username}`} className="group flex w-[180px] shrink-0 snap-start flex-col items-center rounded-[15px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-4 pb-4 pt-5 text-center no-underline transition-colors hover:bg-[var(--card-hover)]">
          <Avatar src={m.avatar} name={m.username} size={60} />
            <p className="m-0 mt-2.5 w-full truncate font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{m.username}</p>
            {m.tastes && m.tastes.length > 0 ? (
              <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
                {m.tastes.slice(0, 3).map(t => (
                  <span key={t} className="max-w-full truncate rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.06)] px-2.5 py-[3px] text-[10.5px] font-semibold text-[var(--text-secondary)]">{t}</span>
                ))}
              </div>
            ) : (
              <p className="m-0 mt-2 text-[10.5px] text-[var(--text-faint)]">{m.joined_legacy_at ? `narys nuo ${new Date(m.joined_legacy_at).getFullYear()}` : 'naujas narys'}</p>
            )}
          </Link>
        ))}
      </div>
    </section>
  )
}

// ═════════════════════════ 0. Mobile stories ═════════════════════════
function MobileStories({ featured, leader }: { featured: FeedPost[]; leader: { title: string; img: string | null } | null }) {
  const [feedTop, setFeedTop] = useState<FeedPost[]>([])
  useEffect(() => {
    let on = true
    fetch('/api/atradimai/feed?limit=10&exclude_type=creation,translation,quick').then(r => r.json()).then(d => { if (on) setFeedTop((d.posts || []).filter((p: FeedPost) => p.cover).slice(0, 6)) }).catch(() => {})
    return () => { on = false }
  }, [])
  const featIds = new Set(featured.map(f => f.id))
  const rest = feedTop.filter(p => !featIds.has(p.id))
  if (!featured.length && !leader && !rest.length) return null
  return (
    <div className="hp-scroll -mx-1 mb-5 flex gap-2.5 overflow-x-auto px-1 pb-1 sm:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {featured.map(p => (
        <Link key={`f-${p.id}`} href={feedHref(p)} className="relative h-[132px] w-[92px] shrink-0 overflow-hidden rounded-[14px] border-2 border-[var(--accent-orange)] no-underline">
          {p.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proxyImg(p.cover)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          ) : <div className="absolute inset-0" style={{ background: `hsl(${hue(p.title)},30%,18%)` }} />}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(8,13,20,0.05) 30%, rgba(8,13,20,0.88))' }} />
          <span className="absolute left-1.5 top-1.5 rounded-[5px] bg-[rgba(249,115,22,0.95)] px-1.5 py-0.5 font-['Outfit',sans-serif] text-[7.5px] font-extrabold uppercase tracking-[0.06em] text-white">Verta dėmesio</span>
          <span className="absolute bottom-1.5 left-2 right-2 line-clamp-2 text-[10.5px] font-bold leading-tight text-white" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>{sani(p.title)}</span>
        </Link>
      ))}
      {leader && (
        <a href="#dienos-daina" className="relative h-[132px] w-[92px] shrink-0 overflow-hidden rounded-[14px] border border-[var(--border-default)] no-underline">
          {leader.img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proxyImg(leader.img)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          ) : <div className="absolute inset-0" style={{ background: `hsl(${hue(leader.title)},30%,18%)` }} />}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(8,13,20,0.05) 30%, rgba(8,13,20,0.88))' }} />
          <span className="absolute bottom-1.5 left-2 right-2 text-[10.5px] font-bold leading-tight text-white" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>Dienos daina</span>
        </a>
      )}
      {rest.map(p => (
        <Link key={`s-${p.id}`} href={feedHref(p)} className="relative h-[132px] w-[92px] shrink-0 overflow-hidden rounded-[14px] border border-[var(--border-default)] no-underline">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={proxyImg(p.cover!)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(8,13,20,0.05) 30%, rgba(8,13,20,0.88))' }} />
          <span className="absolute bottom-1.5 left-2 right-2 line-clamp-2 text-[10.5px] font-bold leading-tight text-white" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>{sani(p.title)}</span>
        </Link>
      ))}
    </div>
  )
}

// ═════════════════════════ Page ═════════════════════════
export default function AtrastiPage() {
  // Mobile stories duomenys (featured + DD lyderis) — gaunami čia, kad
  // nepersikrautų su FeaturedBlock/DienosDainaHero (jie turi savo fetch'us;
  // dėl ISR/cache tie patys užklausimai pigūs).
  const [storiesFeatured, setStoriesFeatured] = useState<FeedPost[]>([])
  const [storiesLeader, setStoriesLeader] = useState<{ title: string; img: string | null } | null>(null)
  useEffect(() => {
    let on = true
    fetch('/api/atradimai/feed?featured=1&nodedup=1&limit=4').then(r => r.json()).then(d => { if (on) setStoriesFeatured(d.posts || []) }).catch(() => {})
    fetch('/api/dienos-daina/nominations').then(r => r.json()).then(d => {
      if (!on) return
      const sorted = ((d.nominations || []) as Nomination[]).filter(n => n.tracks).sort((a, b) => (b.weighted_votes || b.votes || 0) - (a.weighted_votes || a.votes || 0))
      const l = sorted[0]
      if (l?.tracks) setStoriesLeader({ title: l.tracks.title, img: trackImg(l.tracks) })
    }).catch(() => {})
    return () => { on = false }
  }, [])

  return (
    <div className="page-shell">
      <div className="page-head">
        <h1>Atrasti</h1>
        <p>Muzika, kurią verta išgirsti, ir žmonės, kurie apie ją kalba</p>
      </div>

      <MobileStories featured={storiesFeatured} leader={storiesLeader} />

      <FeaturedBlock />

      {/* ŠIANDIEN: DD hero + Kas vyksta/Pokalbiai. items-start — hero netempiamas
          iki dešinės kolonos aukščio; dešinė kolona ribojama fiksuotu aukščiu. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_350px]">
        <DienosDainaHero />
        <div className="lg:h-[540px]"><HappeningBox /></div>
      </div>

      <PromptsRow />

      <PulsasSection />

      <KornerSection />

      <NaujiNariaiSection />
    </div>
  )
}
