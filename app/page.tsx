'use client'
// homepage — dienos daina (suggest/winner/voters) + istorija + pulsas
import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useSite } from '@/components/SiteContext'
import { HomeChatsWidget } from '@/components/HomeChatsWidget'
import { ShoutboxWidget } from '@/components/ShoutboxWidget'
import { ActivityWidget } from '@/components/ActivityWidget'
import { LazySection } from '@/components/LazySection'
import { proxyImg } from '@/lib/img-proxy'
import { HomeTrackModal } from '@/components/HomeTrackModal'
import AlbumInfoModal from '@/components/AlbumInfoModal'
import { HomeListModal, StickyMoreButton } from '@/components/HomeListModal'
import { HomeListContent } from '@/components/HomeListContent'

/* ────────────────────────────── Types ────────────────────────────── */
type Track = { id: number; slug: string; title: string; cover_url: string | null; created_at: string; artists: { id: number; slug: string; name: string; cover_image_url?: string | null } | null }
type Album = { id: number; slug: string; title: string; year: number | null; cover_image_url: string | null; created_at: string; artists: { id: number; slug: string; name: string; cover_image_url?: string | null } | null }
type Artist = { id: number; slug: string; name: string; cover_image_url: string | null }
type EventArtist = { artists?: { id: number; name: string; slug: string; cover_image_url?: string | null; country?: string | null } | null; artist_id?: number; sort_order?: number; is_headliner?: boolean }
type Event = { id: number; slug: string; title: string; event_date?: string; start_date?: string; end_date?: string; venue_custom?: string | null; venue_name?: string | null; venue_id?: number | null; image_small_url?: string | null; cover_image_url?: string | null; image_url?: string | null; city?: string | null; address?: string | null; created_at?: string; venues?: { name: string; city: string } | null; event_artists?: EventArtist[] | null }
type NewsItem = { id: number; slug: string; title: string; image_small_url: string | null; image_title_url?: string | null; published_at: string; type: string | null; excerpt?: string | null; songs?: { youtube_url?: string | null; title?: string | null; artist_name?: string | null; cover_url?: string | null }[]; artist: { name: string; slug: string; cover_image_url?: string | null } | null }
type TopEntry = { pos: number; track_id: number; title: string; artist: string; cover_url: string | null; artist_image: string | null; trend: string; wks?: number; slug?: string; artist_slug?: string }
type Proposer = { username: string | null; full_name: string | null; avatar_url: string | null }
type Nomination = { id: number; votes: number; weighted_votes: number; comment?: string | null; user_id?: string | null; tracks: { id: number; title: string; cover_url: string | null; slug?: string | null; video_url?: string | null; artists: { name: string; slug?: string | null; cover_image_url?: string | null } | null } | null; proposer?: Proposer | null; voters?: Proposer[]; anon_votes?: number; own?: boolean }
type DainaWinner = { id: number; date: string; total_votes: number; weighted_votes: number; winning_comment?: string | null; proposer?: Proposer | null; tracks: { id: number; title: string; cover_url: string | null; slug?: string | null; video_url?: string | null; artists: { name: string; slug?: string | null; cover_image_url?: string | null } | null } | null }
type Discussion = { id: number; slug: string; title: string; author_name: string | null; comment_count: number; created_at: string; tags: string[] }
type HeroSlide = {
  type: string; chip: string; chipBg: string; title: string; subtitle: string
  href: string; bgImg?: string | null; videoId?: string | null
  songTitle?: string | null; songArtist?: string | null; songCover?: string | null
  artist?: { name: string; slug: string; image?: string | null } | null
  chartTops?: TopEntry[]
}

/* ────────────────────────────── Helpers ────────────────────────────── */
const MONTHS_LT = ['Sau', 'Vas', 'Kov', 'Bal', 'Geg', 'Bir', 'Lie', 'Rgp', 'Rgs', 'Spa', 'Lap', 'Gru']
const MONTHS_FULL_LT = ['sausio', 'vasario', 'kovo', 'balandžio', 'gegužės', 'birželio', 'liepos', 'rugpjūčio', 'rugsėjo', 'spalio', 'lapkričio', 'gruodžio']

function sanitizeTitle(raw: string): string {
  return raw.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Quick LT-aware slugify — naudoja tas pačias char mappings kaip server-side
 *  slugify (lib/supabase-artists.ts). Track DB row'ai ne visada turi slug,
 *  todėl URL'ą generuojam iš title — trailing -{id} segmento route handler
 *  vis tiek išskaidys tikslų track'ą + redirect'ins į canonical su DB slug'u. */
function quickSlugify(s: string): string {
  return s.toLowerCase()
    .replace(/[ąä]/g, 'a').replace(/[čç]/g, 'c').replace(/[ęè]/g, 'e')
    .replace(/[ėé]/g, 'e').replace(/[į]/g, 'i').replace(/[š]/g, 's')
    .replace(/[ų]/g, 'u').replace(/[ū]/g, 'u').replace(/[ž]/g, 'z')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'track'
}

function smartTruncate(text: string, maxLen: number): string {
  if (!text || text.length <= maxLen) return text
  const cut = text.slice(0, maxLen)
  const lastEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('.„'), cut.lastIndexOf('."'))
  if (lastEnd > maxLen * 0.4) return cut.slice(0, lastEnd + 1)
  const lastSpace = cut.lastIndexOf(' ')
  return lastSpace > 0 ? cut.slice(0, lastSpace) + '…' : cut + '…'
}

function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?\s]{11})/)
  return m?.[1] || null
}

function formatDateLT(d: string) {
  const date = new Date(d)
  return `${date.getFullYear()} m. ${MONTHS_FULL_LT[date.getMonth()]} ${date.getDate()} d.`
}

/** „Prieš X d." style: jei data šių 30 dienų — rodom relative ("Prieš 5 d."),
 *  jei senesnė — rodom „Spa. 28, 2026" formatą. „Šiandien" / „Vakar" / „Prieš
 *  X d." dalyboje 0/1/2-30. */
function formatRelativeDateLT(input: string | null | undefined): string | null {
  if (!input) return null
  const d = new Date(input)
  if (isNaN(d.getTime())) return null
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (diffDays < 0) return null // ateities data
  if (diffDays === 0) return 'Šiandien'
  if (diffDays === 1) return 'Vakar'
  // Kuo paprasčiau: pirmą savaitę — dienomis, toliau — savaitėmis („Prieš 3
  // sav." vietoj „Prieš 23 d."), po mėnesio — mėnesiais, po metų — metais.
  // 2026-05-29 v2.
  if (diffDays < 7) return `Prieš ${diffDays} d.`
  if (diffDays < 30) return `Prieš ${Math.round(diffDays / 7)} sav.`
  const months = Math.floor(diffDays / 30)
  if (months < 12) return `Prieš ${months} mėn.`
  return `Prieš ${Math.floor(diffDays / 365)} m.`
}

/** Future date formatas „Greitai pasirodys" sekcijai. Iki 30 d. — „Po X d.",
 *  vėliau — „Spa. 28, 2026" konkreti data (lengviau perskaityti dideliu
 *  intervalu). */
function formatFutureDateLT(input: string | null | undefined): { label: string | null; highlight: boolean } {
  if (!input) return { label: null, highlight: false }
  const d = new Date(input)
  if (isNaN(d.getTime())) return { label: null, highlight: false }
  const diffDays = Math.ceil((d.getTime() - Date.now()) / 86_400_000)
  if (diffDays < 0) return { label: null, highlight: false }
  if (diffDays === 0) return { label: 'Šiandien', highlight: true }
  if (diffDays === 1) return { label: 'Rytoj', highlight: true }
  if (diffDays <= 30) return { label: `Po ${diffDays} d.`, highlight: diffDays <= 14 }
  return { label: `${MONTHS_LT[d.getMonth()]}. ${d.getDate()}, ${d.getFullYear()}`, highlight: false }
}

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'ką tik'
  if (m < 60) return `${m} min.`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} val.`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days} d.`
  return new Date(d).toLocaleDateString('lt-LT', { month: 'short', day: 'numeric' })
}

function strHue(s: string) {
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h
}

/* ────────────────────────────── Shared UI ────────────────────────────── */

function Cover({ src, alt, size = 44, radius = 10, ytId, artistSrc }: { src?: string | null; alt: string; size?: number; radius?: number; ytId?: string | null; artistSrc?: string | null }) {
  const h = strHue(alt)
  // Thumbnail prioritetas: dainos cover → YouTube thumbnail → atlikėjo nuotrauka.
  // 2026-05-29: anksčiau artistSrc turėjo pirmenybę prieš ytId, todėl LT
  // atlikėjams (turintiems profilio nuotrauką) rodydavo atlikėjo veidą, o
  // užsienio (be nuotraukos) — YouTube thumb'ą. Dabar visur song-specific
  // thumbnail (cover arba YT), atlikėjo nuotrauka tik kraštutinis fallback'as.
  const imgSrc = src || (ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : null) || artistSrc
  if (imgSrc) return <img src={proxyImg(imgSrc)} alt={alt} loading="lazy" style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', flexShrink: 0, display: 'block' }} />
  return (
    <div style={{ width: size, height: size, borderRadius: radius, flexShrink: 0, background: `linear-gradient(135deg, hsl(${h},38%,16%), hsl(${(h + 40) % 360},28%,10%))`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: `hsl(${h},45%,45%)`, fontSize: size * 0.38, fontWeight: 800, fontFamily: 'Outfit, sans-serif' }}>
      {alt[0]?.toUpperCase() || '?'}
    </div>
  )
}

function TrendIcon({ t }: { t: string }) {
  if (t === 'up') return <span className="text-[10px] font-black text-[var(--accent-green)]">▲</span>
  if (t === 'down') return <span className="text-[10px] font-black text-[var(--accent-red)]">▼</span>
  if (t === 'new') return <span className="rounded-[3px] bg-[var(--accent-yellow)]/15 px-[5px] py-px text-[8px] font-extrabold tracking-[0.04em] text-[var(--accent-yellow)]">N</span>
  return <span className="text-[10px] text-[var(--text-faint)]">–</span>
}

function Skel({ w, h, r = 6 }: { w: number | string; h: number; r?: number }) {
  return <div className="hp-skel" style={{ width: w, height: h, borderRadius: r, flexShrink: 0 }} />
}

/** Tailwind versija SH'o — naudojam naujose sekcijose, kad font/letter-spacing
 *  atitiktų artist page'o tipografiją (`font-['Outfit',sans-serif]` +
 *  `tracking-[-0.01em]` + truputį didesnis font-size 18px). */
function SectionHead({ label, href, cta = 'Daugiau →' }: { label: React.ReactNode; href?: string; cta?: string }) {
  return (
    <div className="mb-3.5 flex items-center justify-between">
      <h2 className="m-0 font-['Outfit',sans-serif] text-[17px] font-extrabold tracking-[-0.01em] text-[var(--text-primary)] sm:text-[18px]">{label}</h2>
      {href && (
        <Link
          href={href}
          className="font-['Outfit',sans-serif] text-[11.5px] font-bold text-[var(--accent-orange)] no-underline transition-opacity hover:opacity-70"
        >
          {cta}
        </Link>
      )}
    </div>
  )
}

/* ────────────────────────────── Dienos Daina ────────────────────────────── */

function DienosDainaWidget() {
  const [noms, setNoms] = useState<Nomination[]>([])
  const [voted, setVoted] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    fetch('/api/dienos-daina/nominations').then(r => r.json()).then(d => { setNoms(d.nominations || []); setLoading(false) }).catch(() => setLoading(false))
  }, [])
  const w = noms[0]
  if (loading) return (
    <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
      <div className="mb-3.5 flex items-center gap-3">
        <Skel w={54} h={54} r={10} />
        <div className="flex-1">
          <Skel w="40%" h={9} />
          <div className="mt-1.5"><Skel w="70%" h={12} /></div>
          <div className="mt-1"><Skel w="45%" h={9} /></div>
        </div>
      </div>
      {Array(3).fill(null).map((_, i) => (
        <div key={i} className="flex items-center gap-2 py-[7px]">
          <Skel w={14} h={10} /><Skel w={26} h={26} r={6} />
          <div className="flex-1"><Skel w="65%" h={10} /></div>
        </div>
      ))}
    </div>
  )
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
      <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3.5">
        <Cover src={w?.tracks?.cover_url} alt={w?.tracks?.title || 'daina'} size={54} radius={10} />
        <div className="min-w-0 flex-1">
          <p className="m-0 mb-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Šiandien pirmauja</p>
          <h3 className="m-0 truncate font-['Outfit',sans-serif] text-[15px] font-extrabold leading-tight text-[var(--text-primary)]">
            {sanitizeTitle(w?.tracks?.title || 'Dar nėra')}
          </h3>
          <p className="m-0 text-[11px] text-[var(--text-muted)]">{w?.tracks?.artists?.name || ''}</p>
        </div>
        <Link
          href="/dienos-daina"
          className="shrink-0 rounded-[20px] bg-[var(--accent-orange)] px-3.5 py-[7px] text-[11px] font-extrabold text-white no-underline shadow-[0_3px_14px_rgba(249,115,22,0.35)] transition-transform hover:-translate-y-px"
        >
          Balsuoti
        </Link>
      </div>
      <div>
        <div className="flex items-center justify-between px-4 pb-1.5 pt-2">
          <span className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-faint)]">Rytdienos kandidatai</span>
          <Link href="/dienos-daina" className="text-[9px] font-bold text-[var(--accent-link)] no-underline">+ Siūlyti</Link>
        </div>
        {noms.length === 0 ? (
          <div className="px-4 py-3.5 text-center text-[12px] text-[var(--text-muted)]">Kol kas nėra nominacijų</div>
        ) : noms.slice(0, 5).map((n, i) => (
          <div
            key={n.id}
            className="flex items-center gap-2 border-t border-[var(--border-subtle)] px-4 py-1.5 transition-colors hover:bg-[var(--bg-hover)]"
          >
            <span className="w-3.5 shrink-0 text-center text-[10px] font-extrabold text-[var(--text-faint)]">{i + 1}</span>
            <Cover src={n.tracks?.cover_url} alt={n.tracks?.title || '?'} size={26} radius={6} />
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-[11px] font-bold text-[var(--text-primary)]">{sanitizeTitle(n.tracks?.title || '')}</p>
              <p className="m-0 text-[10px] text-[var(--text-muted)]">{n.tracks?.artists?.name}</p>
            </div>
            <button
              onClick={() => voted === null && setVoted(i)}
              disabled={voted !== null}
              className={`shrink-0 rounded-[10px] border px-2 py-[3px] text-[10px] font-bold transition-all ${
                voted === i
                  ? 'border-[var(--accent-green)]/30 bg-[var(--accent-green)]/10 text-[var(--accent-green)] cursor-default'
                  : voted !== null
                    ? 'border-[var(--border-default)] bg-transparent text-[var(--text-faint)] cursor-default'
                    : 'border-[var(--border-default)] bg-transparent text-[var(--accent-link)] cursor-pointer'
              }`}
            >
              {voted === i ? '✓' : 'Balsuoti'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ────────────────────────────── Boombox home widget ────────────────────────────── */

function BoomboxHomeWidget() {
  const [state, setState] = useState<{ streak: number; hasContent: boolean; completedToday: number; loading: boolean }>({
    streak: 0, hasContent: false, completedToday: 0, loading: true,
  })

  useEffect(() => {
    let alive = true
    fetch('/api/boombox/today').then(r => r.json()).then(d => {
      if (!alive) return
      const completed = [d.completions?.image, d.completions?.duel, d.completions?.verdict].filter(Boolean).length
      setState({
        streak: d.streak?.current || 0,
        hasContent: !!(d.image || d.duel || d.verdict || (d.videos?.length || 0) > 0),
        completedToday: completed,
        loading: false,
      })
    }).catch(() => setState(s => ({ ...s, loading: false })))
    return () => { alive = false }
  }, [])

  return (
    <Link
      href="/boombox"
      className="block rounded-2xl border border-[var(--accent-orange)]/25 bg-gradient-to-br from-[var(--accent-orange)]/10 to-[var(--accent-blue)]/[0.06] p-4 text-[var(--text-primary)] no-underline transition-all hover:-translate-y-px"
    >
      <div className="mb-2.5 flex h-8 items-end gap-1">
        {[40, 75, 55, 95, 68, 50, 80].map((h, i) => (
          <div
            key={i}
            className="w-[5px] rounded-[2px] bg-gradient-to-t from-[var(--accent-orange)] to-[var(--accent-yellow)]"
            style={{ height: `${h}%`, animation: `bbHomeEq 1.1s infinite ease-in-out ${i * 0.12}s` }}
          />
        ))}
      </div>
      <style>{`@keyframes bbHomeEq { 0%, 100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }`}</style>

      <div className="mb-1 font-['Outfit','system-ui',sans-serif] text-[22px] font-black tracking-[-0.5px]">
        BOOMBOX
      </div>
      <div className="mb-3 text-[12px] text-[var(--text-secondary)]">
        3 misijos · ~2 min · drop'ai
      </div>

      {state.loading ? null : state.hasContent ? (
        <div className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
          {state.completedToday > 0 && (
            <span className="text-[var(--accent-green)]">✓ {state.completedToday}/3</span>
          )}
          {state.streak > 0 && (
            <span className="text-[var(--accent-orange)]">🔥 {state.streak} d.</span>
          )}
          <span className="ml-auto font-semibold text-[var(--accent-orange)]">Pradėti →</span>
        </div>
      ) : (
        <div className="text-[12px] text-[var(--text-faint)]">Šiandien dar nepublikuota</div>
      )}
    </Link>
  )
}

/* Shoutbox widget'as išperkeltas į components/HomeChatsWidget.tsx ir
   dabar yra dalis pokalbių sistemos (rodoma user'io pastarosios DM/grupės). */

/* ────────────────────────────── Žmonės ──────────────────────────────
   Žmonių sekcija — blogai, vertimai, kūryba (forumas).
   Sujungia /api/blog/latest + /api/diskusijos į vieną horizontal row.
   Empty state — kai nieko nėra, rodom CTA naujiems autoriams. */

type ZmonesItem = {
  id: string
  type: 'blog' | 'discussion'
  title: string
  href: string
  meta: string  // autorius arba diskusijos kategorija
  excerpt: string | null
  cover: string | null
  badge: string | null
  created_at: string
}

function ZmonesSection() {
  const [items, setItems] = useState<ZmonesItem[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    Promise.all([
      fetch('/api/blog/latest?limit=8').then(r => r.json()).catch(() => []),
      fetch('/api/diskusijos?sort=activity&limit=8').then(r => r.json()).catch(() => ({ discussions: [] })),
    ]).then(([blogs, diskRes]: any[]) => {
      if (!alive) return
      const arr: ZmonesItem[] = []
      ;(Array.isArray(blogs) ? blogs : []).forEach((b: any) => {
        arr.push({
          id: `b-${b.id}`,
          type: 'blog',
          title: sanitizeTitle(b.title || ''),
          href: `/blogai/${b.blog_slug || b.author_slug || ''}/${b.slug || b.id}`,
          meta: b.author_name || 'Autorius',
          excerpt: b.excerpt || null,
          cover: b.cover_url || b.image_url || null,
          badge: 'BLOGAS',
          created_at: b.created_at || new Date().toISOString(),
        })
      })
      ;((diskRes?.discussions) || []).forEach((d: any) => {
        arr.push({
          id: `d-${d.id}`,
          type: 'discussion',
          title: sanitizeTitle(d.title || ''),
          href: `/diskusijos/${d.slug || d.id}`,
          meta: d.author_name || 'Anonimas',
          excerpt: null,
          cover: null,
          badge: 'DISKUSIJA',
          created_at: d.created_at || new Date().toISOString(),
        })
      })
      arr.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      setItems(arr)
      setLoading(false)
    }).catch(() => setLoading(false))
    return () => { alive = false }
  }, [])

  return (
    <section>
      <SectionHead label="Žmonės" href="/bendruomene" cta="Daugiau →" />
      <div className="hp-scroll flex items-stretch gap-3 pb-1">
        {loading ? Array(5).fill(null).map((_, i) => (
          <div key={i} className="shrink-0 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3" style={{ width: 260, height: 130 }}>
            <Skel w="35%" h={9} /><div className="mt-2"><Skel w="92%" h={12} /></div>
            <div className="mt-1.5"><Skel w="78%" h={11} /></div>
            <div className="mt-3"><Skel w="55%" h={9} /></div>
          </div>
        )) : items.length === 0 ? (
          <div className="hp-card flex shrink-0 flex-col justify-center px-4 py-3" style={{ width: 360 }}>
            <p className="m-0 font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--text-primary)]">Žmonių zona — netrukus</p>
            <p className="m-0 mt-1 text-[11.5px] text-[var(--text-muted)]">
              Čia atsiras autorių blogai, vertimai, kūryba ir aktyviausios diskusijos. Pirmas tampi autoriumi <Link href="/blogai/naujas" className="text-[var(--accent-link)] no-underline">čia</Link>.
            </p>
          </div>
        ) : items.slice(0, 14).map(it => (
          <Link
            key={it.id}
            href={it.href}
            className="hp-card group flex shrink-0 flex-col overflow-hidden p-3 no-underline"
            style={{ width: 260 }}
          >
            <div className="mb-1.5 flex items-center gap-1.5">
              {it.badge && (
                <span className={`rounded px-1.5 py-0.5 font-['Outfit',sans-serif] text-[8.5px] font-extrabold uppercase tracking-[0.06em] ${
                  it.type === 'blog'
                    ? 'bg-[var(--accent-orange)]/15 text-[var(--accent-orange)]'
                    : 'bg-[var(--accent-link)]/15 text-[var(--accent-link)]'
                }`}>{it.badge}</span>
              )}
              <span className="ml-auto text-[9px] text-[var(--text-faint)]">{timeAgo(it.created_at)}</span>
            </div>
            <p className="m-0 line-clamp-2 font-['Outfit',sans-serif] text-[13px] font-extrabold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">
              {it.title}
            </p>
            {it.excerpt && (
              <p className="m-0 mt-1.5 line-clamp-2 text-[11.5px] text-[var(--text-muted)]">
                {it.excerpt}
              </p>
            )}
            <p className="m-0 mt-auto pt-2 truncate text-[11px] text-[var(--text-secondary)]">
              {it.meta}
            </p>
          </Link>
        ))}
      </div>
    </section>
  )
}

/* ────────────────────────────── Discussions ────────────────────────────── */

function DiscussionsWidget() {
  const [discs, setDiscs] = useState<Discussion[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { fetch('/api/diskusijos?sort=activity&limit=4').then(r => r.json()).then(d => { setDiscs(d.discussions || []); setLoading(false) }).catch(() => setLoading(false)) }, [])
  if (loading || !discs.length) return (
    <div className="hp-disc-grid">
      {Array(4).fill(null).map((_, i) => (
        <div key={i} className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-3.5 py-3">
          <div className="mb-2"><Skel w="30%" h={8} /></div>
          <Skel w="90%" h={11} />
          <div className="mt-1"><Skel w="60%" h={11} /></div>
          <div className="mt-2"><Skel w="45%" h={8} /></div>
        </div>
      ))}
    </div>
  )
  return (
    <div className="hp-disc-grid">
      {discs.map(d => (
        <Link
          key={d.id}
          href={`/diskusijos/${d.slug}`}
          className="block rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-3.5 py-3 no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
        >
          <div className="mb-1.5 flex items-center gap-1.5">
            {(d.tags || []).slice(0, 1).map(t => (
              <span key={t} className="rounded bg-[var(--bg-active)] px-1.5 py-0.5 text-[9px] font-extrabold text-[var(--accent-link)]">{t}</span>
            ))}
            <span className="ml-auto text-[9px] text-[var(--text-faint)]">{timeAgo(d.created_at)}</span>
          </div>
          <p className="m-0 mb-1.5 line-clamp-2 font-['Outfit',sans-serif] text-[13px] font-bold leading-snug text-[var(--text-primary)]">{d.title}</p>
          <p className="m-0 text-[10px] text-[var(--text-muted)]">{d.author_name} · {d.comment_count} atsak.</p>
        </Link>
      ))}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════
                         REELS OVERLAY COMPONENT
   ════════════════════════════════════════════════════════════════════ */

const REELS_DURATION = 8000

function ReelsOverlay({ slides, initialIdx, seenSlides, onSeen, onClose, onChartVote, dk }: {
  slides: HeroSlide[]
  initialIdx: number
  seenSlides: Set<string>
  onSeen: (href: string) => void
  onClose: () => void
  /** Optional — chart slides swipe-down ar Balsuok mygtukas atveria voting
   *  sheet'ą per šitą callback'ą. Reels'ai LIEKA atviri foną — po balsavimo
   *  user'is gali tęsti horizontalų navigavimą per news/event slides. */
  onChartVote?: (slide: HeroSlide) => void
  dk: boolean
}) {
  const [idx, setIdx] = useState(initialIdx)
  const [videoOpen, setVideoOpen] = useState(false)
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState(0)

  const progressRef = useRef<number>(0)
  const startRef = useRef<number>(0)
  const rafRef = useRef<any>(null)
  const touchStartX = useRef<number>(0)
  const touchStartY = useRef<number>(0)
  const trackRef = useRef<HTMLDivElement>(null)

  const slide = slides[idx]

  /* ── Progress animation ── */
  const startProgress = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    startRef.current = Date.now()
    setProgress(0)
    const tick = () => {
      const p = Math.min((Date.now() - startRef.current) / REELS_DURATION, 1)
      setProgress(p)
      progressRef.current = p
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  const stopProgress = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
  }, [])

  /* ── Navigation ── */
  const goTo = useCallback((newIdx: number) => {
    if (newIdx < 0 || newIdx >= slides.length) { onClose(); return }
    setVideoOpen(false)
    setIdx(newIdx)
  }, [slides.length, onClose])

  /* Mark seen + start progress on slide change */
  useEffect(() => {
    if (!slide) return
    if (!videoOpen) startProgress()
    return () => {
      stopProgress()
      onSeen(slide.href) // mark seen when leaving this slide
    }
  }, [idx]) // eslint-disable-line

  /* Pause/resume when video opens */
  useEffect(() => {
    if (videoOpen) stopProgress()
    else startProgress()
  }, [videoOpen]) // eslint-disable-line

  /* Auto-advance */
  useEffect(() => {
    if (progress >= 1 && !videoOpen) goTo(idx + 1)
  }, [progress]) // eslint-disable-line

  /* ── Touch swipe (horizontal) ── */
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    setDragging(true)
    stopProgress()
  }

  const onTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX.current
    const dy = e.touches[0].clientY - touchStartY.current
    // Only horizontal drag if clearly not a vertical scroll
    if (Math.abs(dx) > Math.abs(dy)) {
      e.preventDefault()
      setDragOffset(dx)
    }
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    setDragging(false)
    setDragOffset(0)

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      // Horizontal swipe → navigate slides
      if (dx < 0) goTo(idx + 1)
      else goTo(idx - 1)
    } else if (dy > 80 && Math.abs(dy) > Math.abs(dx)) {
      // Swipe DOWN — chart slide'uose atveria voting sheet'ą; visur kitur
      // uždaro reels (default Stories-style behavior).
      const cur = slides[idx]
      const isChart = cur && (cur.type === 'chart_lt' || cur.type === 'chart_world')
      if (isChart && onChartVote) {
        onChartVote(cur)
        // Reels lieka atviri fone — pause progress kol sheet'as atviras
        stopProgress()
      } else {
        onClose()
      }
    } else {
      // No significant swipe — resume progress
      startProgress()
    }
  }

  /* ── Mouse drag (desktop) ── */
  const onMouseDown = (e: React.MouseEvent) => {
    touchStartX.current = e.clientX
    touchStartY.current = e.clientY
    setDragging(true)
    stopProgress()
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return
    setDragOffset(e.clientX - touchStartX.current)
  }

  const onMouseUp = (e: React.MouseEvent) => {
    const dx = e.clientX - touchStartX.current
    setDragging(false)
    setDragOffset(0)
    if (Math.abs(dx) > 50) {
      if (dx < 0) goTo(idx + 1)
      else goTo(idx - 1)
    } else {
      startProgress()
    }
  }

  /* ── Tap left/right halves to navigate (Instagram style) ── */
  const onTap = (e: React.MouseEvent) => {
    if (Math.abs(dragOffset) > 10) return // was a drag, not a tap
    if (videoOpen) return
    const x = e.clientX
    const mid = window.innerWidth / 2
    if (x < mid) goTo(idx - 1)
    else goTo(idx + 1)
  }

  const translateX = -idx * 100 + (dragOffset / window.innerWidth) * 100

  return (
    <div className="hp-reels" style={{ userSelect: 'none' }}>
      {/* Progress bars */}
      <div style={{
        position: 'fixed', top: 14, left: 16, right: 56, zIndex: 310,
        display: 'flex', gap: 4, alignItems: 'center', pointerEvents: 'none',
      }}>
        {slides.map((s, i) => {
          const isSeen = seenSlides.has(s.href)
          const isPast = i < idx
          const isCurrent = i === idx
          const barColor = isCurrent
            ? '#f97316'
            : isPast
              ? (isSeen ? 'rgba(255,255,255,0.7)' : '#f97316')
              : 'rgba(255,255,255,0.0)'
          return (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.22)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2,
                background: barColor,
                width: isPast ? '100%' : isCurrent ? `${progress * 100}%` : '0%',
              }} />
            </div>
          )
        })}
      </div>

      {/* Close button */}
      <button onClick={onClose} style={{
        position: 'fixed', top: 10, right: 16, zIndex: 310,
        width: 36, height: 36, borderRadius: '50%',
        background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)',
        color: '#fff', fontSize: 16, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(8px)',
      }}>✕</button>

      {/* Horizontal slide track */}
      <div
        ref={trackRef}
        className="hp-reels-track"
        style={{
          transform: `translateX(${translateX}%)`,
          transition: dragging ? 'none' : 'transform .32s cubic-bezier(.4,0,.2,1)',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onClick={onTap}
      >
        {slides.map((s, i) => (
          <div key={i} className="hp-reels-slide">
            {/* Image zone */}
            <div className="hp-reels-img">
              {s.bgImg
                ? <img src={proxyImg(s.bgImg)} alt="" draggable={false} />
                : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#0a1428,#162040)' }} />
              }
              {/* Video popup — on top of image */}
              {s.videoId && videoOpen && i === idx && (
                <div className="hp-reels-video-popup" onClick={e => e.stopPropagation()}>
                  {/* Close bar — always visible at top */}
                  <div style={{
                    flexShrink: 0, height: 52, display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', padding: '0 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                        <img src={`https://img.youtube.com/vi/${s.videoId}/mqdefault.jpg`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#fff', margin: 0, lineHeight: 1.2 }}>{s.songTitle || 'Video'}</p>
                        {s.songArtist && <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', margin: 0 }}>{s.songArtist}</p>}
                      </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setVideoOpen(false) }} style={{
                      width: 32, height: 32, borderRadius: '50%',
                      background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.15)',
                      color: '#fff', fontSize: 14, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>✕</button>
                  </div>
                  <iframe
                    src={`https://www.youtube.com/embed/${s.videoId}?autoplay=1&rel=0&playsinline=1`}
                    allow="autoplay; encrypted-media"
                    allowFullScreen
                  />
                </div>
              )}
            </div>

            {/* Content */}
            <div className="hp-reels-info" onClick={e => e.stopPropagation()}>
              {/* Chip — orange if unseen, muted if seen */}
              <span style={{
                display: 'inline-block', padding: '4px 12px', borderRadius: 16,
                fontSize: 10, fontWeight: 900, color: '#fff',
                background: seenSlides.has(s.href) ? 'rgba(255,255,255,0.15)' : s.chipBg,
                fontFamily: 'Outfit,sans-serif', letterSpacing: '0.08em', textTransform: 'uppercase',
                marginBottom: 10, alignSelf: 'flex-start',
                transition: 'background .3s',
              }}>{s.chip}</span>

              {/* Title — tap advances to next slide */}
              <p
                onClick={() => goTo(idx + 1)}
                style={{
                  fontFamily: 'Outfit,sans-serif', fontSize: 26, fontWeight: 900,
                  color: '#fff', lineHeight: 1.1, margin: '0 0 8px',
                  letterSpacing: '-0.02em', cursor: 'pointer',
                  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>{s.title}</p>

              {/* Subtitle/excerpt pašalintas — naudotojas paprašė rodyti tik
                  main title naujienoms (mobile + desktop). Subtitle dažnai
                  buvo nuvedamas (excerpt'as), todėl card'as atrodė užkrautas. */}

              {/* Video trigger */}
              {s.videoId && !videoOpen && i === idx && (
                <button onClick={(e) => { e.stopPropagation(); setVideoOpen(true) }} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px 8px 8px',
                  background: 'rgba(255,255,255,0.07)', borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', width: '100%',
                }}>
                  <div style={{ width: 42, height: 42, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                    <img src={`https://img.youtube.com/vi/${s.videoId}/mqdefault.jpg`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} draggable={false} />
                  </div>
                  <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#fff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.songTitle || 'Klausyti'}</p>
                    {s.songArtist && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: '2px 0 0' }}>{s.songArtist}</p>}
                  </div>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: 'rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff" style={{ marginLeft: 1 }}><path d="M8 5v14l11-7z"/></svg>
                  </div>
                </button>
              )}

              {/* Bottom action area — chart slide'ams 'Balsuok' (atveria sheet'ą,
                  reels lieka), kitiems standard 'Daugiau' link'as. */}
              {(s.type === 'chart_lt' || s.type === 'chart_world') && onChartVote ? (
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); onChartVote(s); stopProgress() }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                      padding: '13px 20px', borderRadius: 14, border: 'none', cursor: 'pointer',
                      background: s.type === 'chart_lt' ? '#f97316' : '#3b82f6',
                      color: '#fff', fontFamily: 'Outfit,sans-serif', fontSize: 14, fontWeight: 800,
                      letterSpacing: '-0.01em',
                      boxShadow: `0 4px 20px ${s.type === 'chart_lt' ? 'rgba(249,115,22,0.35)' : 'rgba(59,130,246,0.35)'}`,
                    }}
                  >
                    Balsuok
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 19l-7-7 7-7" transform="rotate(90 12 12)"/></svg>
                  </button>
                  <p style={{ margin: 0, textAlign: 'center', fontSize: 10.5, color: 'rgba(255,255,255,0.5)', fontWeight: 600, letterSpacing: '0.04em' }}>
                    arba pertempk žemyn ↓
                  </p>
                </div>
              ) : (
                <div style={{ marginTop: 14, paddingTop: 0, display: 'flex', alignItems: 'center' }}>
                  <Link
                    href={s.href}
                    onClick={onClose}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                      padding: '13px 20px', borderRadius: 14,
                      background: seenSlides.has(s.href) ? 'rgba(255,255,255,0.12)' : '#f97316',
                      color: '#fff', fontFamily: 'Outfit,sans-serif', fontSize: 14, fontWeight: 800,
                      textDecoration: 'none', letterSpacing: '-0.01em',
                      boxShadow: seenSlides.has(s.href) ? 'none' : '0 4px 20px rgba(249,115,22,0.35)',
                      transition: 'all .2s',
                    }}
                  >
                    Daugiau
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </Link>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Inline SVG icons for LT/World labels ── */
function RowDivider({ icon }: { icon: 'lt' | 'world' }) {
  return icon === 'lt' ? (
    <div style={{ display: 'flex', flexDirection: 'column', width: 3, height: 38, borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ flex: 1, background: '#FDBA12' }} />
      <div style={{ flex: 1, background: '#006A44' }} />
      <div style={{ flex: 1, background: '#C1272D' }} />
    </div>
  ) : (
    <div style={{ width: 3, height: 38, borderRadius: 2, background: '#3b82f6', flexShrink: 0, opacity: 0.65 }} />
  )
}



/* ────────────────────────────── Chart widget bits ──────────────────────────────
   Bendri komponentai naudojami DESKTOP hero sidebar ir MOBILE chart blokuose,
   kad neturėtume daryti lygiai to paties dk-branching'o dviejose vietose.
   `compact` flag — desktop versija mažesnis font + padding'as. */

function ChartTabs({ active, onSelect, compact = false }: {
  active: 'lt' | 'world'
  onSelect: (k: 'lt' | 'world') => void
  compact?: boolean
}) {
  const tabPad = compact ? 'py-[7px] text-[11px]' : 'py-[9px] text-[12px]'
  return (
    <div className="mb-3 flex">
      <div className="flex flex-1 gap-[3px] rounded-[10px] bg-[var(--bg-hover)] p-[3px]">
        {([['lt', 'LT TOP 30'], ['world', 'TOP 40']] as const).map(([k, l]) => (
          <button
            key={k}
            onClick={() => onSelect(k)}
            className={`flex-1 rounded-lg border-none font-['Outfit',sans-serif] font-bold transition-all ${tabPad} ${
              active === k
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                : 'bg-transparent text-[var(--text-muted)]'
            }`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  )
}

function ChartRow({ t, compact = false }: { t: TopEntry; compact?: boolean }) {
  const titleSize = compact ? 'text-[12.5px]' : 'text-[13px]'
  const metaSize = compact ? 'text-[10.5px]' : 'text-[11px]'
  return (
    <Link
      href={t.slug ? `/muzika/${t.slug}` : '/topai'}
      className="hp-card flex items-center gap-2.5 px-2.5 py-2 no-underline"
    >
      <div className="w-7 shrink-0 text-center">
        <span
          className={`block font-['Outfit',sans-serif] text-[16px] font-black leading-none ${
            t.pos <= 3 ? 'text-[var(--accent-orange)]' : 'text-[var(--text-faint)]'
          }`}
        >
          {t.pos}
        </span>
        <div className="mt-[2px]"><TrendIcon t={t.trend} /></div>
      </div>
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg">
        <Cover src={t.cover_url || t.artist_image} alt={t.title} size={40} radius={8} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`m-0 truncate font-bold text-[var(--text-primary)] ${titleSize}`}>{t.title}</p>
        <p className={`m-0 mt-[2px] truncate text-[var(--text-muted)] ${metaSize}`}>{t.artist}</p>
      </div>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--bg-active)] transition-colors">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="ml-px text-[var(--text-primary)]"><path d="M8 5v14l11-7z"/></svg>
      </div>
    </Link>
  )
}

function ChartVoteCTA({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/top40"
      className={`mt-2.5 flex items-center justify-center rounded-[10px] bg-[var(--accent-orange)] p-2.5 font-['Outfit',sans-serif] text-[12px] font-extrabold text-white no-underline shadow-[0_2px_12px_rgba(249,115,22,0.3)] transition-all hover:-translate-y-px hover:shadow-[0_4px_18px_rgba(249,115,22,0.45)] ${className}`}
    >
      Balsuok
    </Link>
  )
}


/* ────────────────────────────── Bendruomenė cards ──────────────────────────────
   Trys bokso pavyzdys: discussions, main chat preview, user posts. Stilistika
   atitinka kitas widget kortelės — rounded-2xl + bg-surface + border-default. */

type DiscActivityItem = {
  id: number
  slug: string
  title: string
  author_name: string | null
  comment_count: number
  created_at: string
  last_comment_at: string | null
  latest_comment: { excerpt: string; author: string; avatar: string | null; created_at: string } | null
}

// „Diskusijos" stulpelis — naujausios aktyvios temos su PASKUTINIU komentaru
// (Edvardo prašymu 2026-06-02). Duomenys per /api/diskusijos/recent.
function CommunityDiscussionsCard() {
  const [discs, setDiscs] = useState<DiscActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    fetch('/api/diskusijos/recent?limit=6')
      .then(r => r.json())
      .then(d => { if (alive) { setDiscs(d.items || []); setLoading(false) } })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4 py-2.5">
        <span className="font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--text-primary)]">Diskusijos</span>
        <Link href="/diskusijos" className="text-[11px] font-bold text-[var(--accent-link)] no-underline">Visos →</Link>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? Array(4).fill(null).map((_, i) => (
          <div key={i} className="border-b border-[var(--border-subtle)] px-4 py-2.5">
            <Skel w="80%" h={11} /><div className="mt-2"><Skel w="95%" h={9} /></div>
          </div>
        )) : discs.length === 0 ? (
          <div className="px-4 py-6 text-center text-[12px] text-[var(--text-muted)]">Diskusijų dar nėra</div>
        ) : discs.map((d, i) => {
          const lc = d.latest_comment
          const hue = strHue(lc?.author || d.author_name || '?')
          return (
            <Link key={d.id} href={`/diskusijos/${d.slug}`} className="block border-b border-[var(--border-subtle)] px-4 py-2.5 no-underline transition-colors hover:bg-[var(--bg-hover)]" style={{ borderBottomWidth: i === discs.length - 1 ? 0 : 1 }}>
              <p className="m-0 line-clamp-1 font-['Outfit',sans-serif] text-[12.5px] font-bold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">{d.title}</p>
              {lc ? (
                <div className="mt-1 flex items-start gap-1.5">
                  {lc.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proxyImg(lc.avatar)} alt="" className="mt-px h-[15px] w-[15px] shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="mt-px flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full text-[8px] font-extrabold" style={{ background: `hsl(${hue},32%,20%)`, color: `hsl(${hue},48%,60%)` }}>{(lc.author || '?').charAt(0).toUpperCase()}</span>
                  )}
                  <p className="m-0 line-clamp-2 text-[11px] leading-snug text-[var(--text-muted)]">
                    <span className="font-bold text-[var(--text-secondary)]">{lc.author}:</span> {lc.excerpt}
                  </p>
                </div>
              ) : (
                <p className="m-0 mt-0.5 text-[10.5px] text-[var(--text-muted)]">{d.author_name || 'Anonimas'} · {d.comment_count} ats. · {timeAgo(d.created_at)}</p>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function CommunityChatCard() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
        <span className="font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--text-primary)]">Pokalbiai</span>
        <Link href="/pokalbiai" className="text-[11px] font-bold text-[var(--accent-link)] no-underline">Atidaryti →</Link>
      </div>
      <div className="flex-1 overflow-hidden">
        <HomeChatsWidget />
      </div>
    </div>
  )
}

function CommunityUserPostsCard() {
  type Post = { id: string; type: 'blog'|'discussion'; title: string; href: string; meta: string; created_at: string; badge: string }
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    Promise.all([
      fetch('/api/blog/latest?limit=6').then(r => r.json()).catch(() => []),
      fetch('/api/diskusijos?sort=activity&limit=4').then(r => r.json()).catch(() => ({ discussions: [] })),
    ]).then(([blogs, diskRes]: any[]) => {
      if (!alive) return
      const arr: Post[] = []
      ;(Array.isArray(blogs) ? blogs : []).forEach((b: any) => arr.push({
        id: `b-${b.id}`, type: 'blog', title: sanitizeTitle(b.title || ''),
        href: `/blogai/${b.blog_slug || b.author_slug || ''}/${b.slug || b.id}`,
        meta: b.author_name || 'Autorius',
        created_at: b.created_at || new Date().toISOString(),
        badge: 'BLOGAS',
      }))
      ;((diskRes?.discussions) || []).slice(0, 2).forEach((d: any) => arr.push({
        id: `d-${d.id}`, type: 'discussion', title: sanitizeTitle(d.title || ''),
        href: `/diskusijos/${d.slug || d.id}`,
        meta: d.author_name || 'Anonimas',
        created_at: d.created_at || new Date().toISOString(),
        badge: 'DISKUSIJA',
      }))
      arr.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      setPosts(arr.slice(0, 5))
      setLoading(false)
    }).catch(() => setLoading(false))
    return () => { alive = false }
  }, [])
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
        <span className="font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--text-primary)]">Vartotojų įrašai</span>
        <Link href="/blogai" className="text-[11px] font-bold text-[var(--accent-link)] no-underline">Visi →</Link>
      </div>
      <div className="flex-1">
        {loading ? Array(3).fill(null).map((_, i) => (
          <div key={i} className="border-b border-[var(--border-subtle)] px-4 py-2.5">
            <Skel w="35%" h={9} /><div className="mt-1.5"><Skel w="85%" h={11} /></div>
          </div>
        )) : posts.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="m-0 text-[12px] font-bold text-[var(--text-secondary)]">Pirmas autorius — tu?</p>
            <p className="m-0 mt-1 text-[11px] text-[var(--text-muted)]">Blogai, vertimai, kūryba — dalinkis su bendruomene.</p>
            <Link href="/blogai/naujas" className="mt-2 inline-flex rounded-md bg-[var(--accent-orange)] px-3 py-1.5 text-[11px] font-bold text-white no-underline">Pradėti</Link>
          </div>
        ) : posts.map((p, i) => (
          <Link key={p.id} href={p.href} className="block border-b border-[var(--border-subtle)] px-4 py-2.5 no-underline transition-colors hover:bg-[var(--bg-hover)]" style={{ borderBottomWidth: i === posts.length - 1 ? 0 : 1 }}>
            <div className="mb-0.5 flex items-center gap-1.5">
              <span className={`rounded px-1.5 py-px font-['Outfit',sans-serif] text-[8.5px] font-extrabold uppercase tracking-[0.06em] ${
                p.type === 'blog' ? 'bg-[var(--accent-orange)]/15 text-[var(--accent-orange)]' : 'bg-[var(--accent-link)]/15 text-[var(--accent-link)]'
              }`}>{p.badge}</span>
              <span className="text-[9px] text-[var(--text-faint)]">{timeAgo(p.created_at)}</span>
            </div>
            <p className="m-0 line-clamp-2 font-['Outfit',sans-serif] text-[12.5px] font-bold text-[var(--text-primary)]">{p.title}</p>
            <p className="m-0 mt-0.5 truncate text-[10.5px] text-[var(--text-muted)]">{p.meta}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

/* ────────────────────────────── Pulsas section ──────────────────────────────
   Naujausių UGC įrašų aktyvumo feed'as — keičia anksčiau buvusią „Bendruomenė"
   sekciją. Rodo blog įrašus, diskusijas ir komentarus mažomis kortelėmis
   (panašiai kaip news cards). Vienas vientisas sąrašas, sortuotas pagal datą. */

type PulsasItem = {
  id: string
  type: 'blog' | 'discussion' | 'comment'
  subtype?: string | null
  title: string
  excerpt: string | null
  href: string
  cover: string | null
  author_name: string | null
  author_slug: string | null
  author_avatar: string | null
  created_at: string
  meta?: string | null
}

/* ────────────────────────────── Dienos daina sekcija ──────────────────────────────
   Horizontalios dainų kortelės (desktop) / vertikalus sąrašas (mobile) su balsų
   pop bar'u (kaip artist page) — matosi kurios dainos pirmauja. Click → track
   modalas (HomeTrackModal per onOpenTrack). 2026-05-29. */
/** Proposer vardas iš profilio (full_name → username → fallback). */
function proposerName(p?: Proposer | null): string | null {
  if (!p) return null
  return p.full_name || p.username || null
}

/** Mažas proposer avatar'as + „Pasiūlė X" eilutė. */
function ProposerLine({ p }: { p?: Proposer | null }) {
  const name = proposerName(p)
  if (!name) return null
  return (
    <span className="flex min-w-0 items-center gap-1">
      {p?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={proxyImg(p.avatar_url)} alt="" className="h-[14px] w-[14px] shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full text-[7px] font-extrabold" style={{ background: `hsl(${strHue(name)},32%,20%)`, color: `hsl(${strHue(name)},48%,58%)` }}>{name.charAt(0).toUpperCase()}</span>
      )}
      <span className="truncate text-[10.5px] font-semibold text-[var(--text-secondary)]">{name}</span>
    </span>
  )
}

/** Balsų pop-bar (5 dash'ai) — bendras laimėtojo ir siūlomų dainų kortelėms,
 *  kad vienodai lygiuotųsi (iškart po thumbnail). 2026-06-02. */
function DainaPopBar({ level }: { level: number }) {
  return (
    <span className="mt-2 flex items-center gap-[3px] px-0.5" aria-label={`Balsų lygis ${level}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={`h-[3px] w-[11px] rounded-[2px] ${i < level ? 'bg-[var(--accent-orange)]' : 'bg-[var(--border-default)]'}`} />
      ))}
    </span>
  )
}

/** Dainos siūlymo modalas — TIK dainos (tracks). Reuse'ina /api/tracks paiešką
 *  (kaip top-nav search, bet restricted į songs), POST'ina į
 *  /api/dienos-daina/nominations. CSS variables stilius (ne legacy dark). */
function DainaSuggestModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<any | null>(null)
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  // Background scroll lock — kad po modalu nesiscroll'intų puslapis (Edvardo
  // prašymu 2026-06-01). Tas pats pattern'as kaip HomeListModal.
  useEffect(() => {
    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    document.body.style.width = '100%'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.left = ''
      document.body.style.right = ''
      document.body.style.width = ''
      window.scrollTo(0, scrollY)
    }
  }, [onClose])

  // Paieška — TA PATI logika kaip top-nav search (/api/search-master su
  // categories=tracks). Palaiko compound „atlikėjas + daina" (pvz. „U2 with",
  // „Kanye flashing") — anksčiau /api/tracks?search match'ino tik title ir
  // nieko nerasdavo. 2026-06-01.
  useEffect(() => {
    const qq = query.trim()
    if (qq.length < 2) { setResults([]); setSearching(false); return }
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search-master?q=${encodeURIComponent(qq)}&categories=tracks&limit=12`)
        const d = await res.json()
        setResults((d.results?.tracks || []).map((h: any) => ({
          id: h.id,
          title: h.title,
          artist_name: h.subtitle || '',
          image_url: h.image_url || null,
        })))
      } catch { setResults([]) }
      finally { setSearching(false) }
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  const submit = async () => {
    if (!selected || sending) return
    setSending(true); setError('')
    try {
      const res = await fetch('/api/dienos-daina/nominations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_id: selected.id, comment: comment.trim() || null }),
      })
      const d = await res.json()
      if (res.ok) { onDone(); onClose() }
      else setError(d.error || 'Klaida')
    } catch { setError('Tinklo klaida') }
    finally { setSending(false) }
  }

  if (typeof document === 'undefined') return null
  return createPortal(
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div className="flex w-full max-w-[480px] flex-col overflow-hidden rounded-t-2xl bg-[var(--bg-surface)] shadow-[0_24px_60px_-10px_rgba(0,0,0,0.5)] sm:mx-4 sm:rounded-2xl" style={{ maxHeight: 'min(85vh, 640px)' }}>
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
          <span className="font-['Outfit',sans-serif] text-[14px] font-extrabold text-[var(--text-primary)]">Pasiūlyti dieną dainą</span>
          <button onClick={onClose} aria-label="Uždaryti" className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-active)] text-[var(--text-secondary)]">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {!selected ? (
            <>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoFocus
                placeholder="Ieškoti dainos…"
                type="text"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                name="daina-paieska"
                // fontSize 16px — kad iOS NEzoom'intų į input'ą fokuse (mažesnis
                // už 16px triggerina native zoom + accessory bar). 2026-06-01.
                style={{ fontSize: 16 }}
                className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-hover)] px-3 py-2.5 text-[var(--text-primary)] outline-none focus:border-[var(--accent-orange)]"
              />
              <div className="mt-2 flex flex-col gap-1.5">
                {results.map((t: any) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelected(t)}
                    className="flex items-center gap-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-hover)] p-2 text-left transition-colors hover:border-[var(--accent-orange)]"
                  >
                    <Cover src={t.image_url} artistSrc={t.image_url} alt={sanitizeTitle(t.title || '')} size={36} radius={6} />
                    <div className="min-w-0 flex-1">
                      <p className="m-0 truncate text-[12.5px] font-bold text-[var(--text-primary)]">{sanitizeTitle(t.title || '')}</p>
                      <p className="m-0 truncate text-[11px] text-[var(--text-muted)]">{t.artist_name || ''}</p>
                    </div>
                    <span className="shrink-0 text-[11px] font-bold text-[var(--accent-link)]">Rinktis →</span>
                  </button>
                ))}
                {searching && results.length === 0 && (
                  <p className="px-1 py-2 text-[11.5px] text-[var(--text-faint)]">Ieškoma…</p>
                )}
                {!searching && query.trim().length >= 2 && results.length === 0 && (
                  <p className="px-1 py-2 text-[11.5px] text-[var(--text-faint)]">Nieko nerasta — pabandyk kitą užklausą.</p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2.5 rounded-lg border border-[var(--accent-orange)]/30 bg-[var(--accent-orange)]/10 p-2.5">
                <Cover src={selected.image_url} artistSrc={selected.image_url} alt={sanitizeTitle(selected.title || '')} size={40} radius={8} />
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-[13px] font-extrabold text-[var(--text-primary)]">{sanitizeTitle(selected.title || '')}</p>
                  <p className="m-0 truncate text-[11.5px] text-[var(--text-muted)]">{selected.artist_name || ''}</p>
                </div>
                <button onClick={() => setSelected(null)} className="shrink-0 text-[11px] text-[var(--text-faint)] hover:text-[var(--text-primary)]">Keisti</button>
              </div>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={3}
                placeholder="Kodėl ši daina? (neprivaloma)"
                style={{ fontSize: 16 }}
                className="mt-3 w-full resize-none rounded-lg border border-[var(--border-default)] bg-[var(--bg-hover)] px-3 py-2.5 text-[var(--text-primary)] outline-none focus:border-[var(--accent-orange)]"
              />
              {error && <p className="m-0 mt-2 text-[11px] text-[var(--accent-red)]">{error}</p>}
              <button
                onClick={submit}
                disabled={sending}
                className="mt-3 w-full rounded-xl bg-[var(--accent-orange)] py-3 text-[13px] font-extrabold text-white shadow-[0_3px_14px_rgba(249,115,22,0.35)] transition-transform hover:-translate-y-px disabled:opacity-50"
              >
                {sending ? 'Siunčiama…' : 'Pasiūlyti dainą'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Vakar laimėjusios dainos highlight kortelė. Vertikalus stilius — toks pat
 *  kaip „Naujos dainos" kortelės (16:9 cover viršuje + info apačioje), su
 *  oranžiniu rėmu ir „🏆 Vakar laimėjo" badge'u. 2026-05-31. */
function DainaWinnerCard({ w, onOpenTrack, maxVotes = 1 }: { w: DainaWinner; onOpenTrack: (t: any) => void; maxVotes?: number }) {
  const t = w.tracks
  if (!t) return null
  const v = extractYouTubeId(t.video_url)
  const ytThumb = v ? `https://img.youtube.com/vi/${v}/mqdefault.jpg` : null
  const imgSrc = t.cover_url || ytThumb || t.artists?.cover_image_url || null
  const votes = w.weighted_votes || w.total_votes || 0
  const level = votes > 0 ? Math.max(1, Math.round((votes / Math.max(1, maxVotes)) * 5)) : 0
  return (
    <div className="group flex shrink-0 flex-col" style={{ width: 188 }}>
      <button
        type="button"
        onClick={() => onOpenTrack({ id: t.id, title: t.title, slug: t.slug, cover_url: t.cover_url, video_url: t.video_url, artists: t.artists })}
        className="block no-underline text-left p-0 bg-transparent border-0 cursor-pointer"
      >
        <div className="relative aspect-video overflow-hidden rounded-xl border bg-[var(--cover-placeholder)] shadow-[0_4px_12px_rgba(0,0,0,0.25)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[0_14px_32px_rgba(249,115,22,0.18)]" style={{ borderColor: 'rgba(249,115,22,0.5)' }}>
          {imgSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proxyImg(imgSrc)} alt={sanitizeTitle(t.title)} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" style={{ filter: 'saturate(1.05) contrast(1.02)' }} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl text-[var(--text-faint)]">🎵</div>
          )}
        </div>
        {/* Balsai — IŠKART po thumbnail, vienodai su siūlomomis dainomis. */}
        <DainaPopBar level={level} />
        <div className="mt-1 px-0.5">
          <p className="m-0 truncate font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">{sanitizeTitle(t.title)}</p>
          <p className="m-0 mt-0.5 truncate text-[11.5px] text-[var(--text-muted)]">{t.artists?.name}</p>
        </div>
      </button>
      {w.proposer && <div className="mt-1.5 px-0.5"><ProposerLine p={w.proposer} /></div>}
      {w.winning_comment && <p className="m-0 mt-1 px-0.5 line-clamp-2 text-[10.5px] italic text-[var(--text-muted)]">„{w.winning_comment}"</p>}
    </div>
  )
}

function DienosDainaSection({ onOpenTrack }: { onOpenTrack: (t: any) => void }) {
  const [noms, setNoms] = useState<Nomination[]>([])
  const [winner, setWinner] = useState<DainaWinner | null>(null)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [suggestOpen, setSuggestOpen] = useState(false)
  // Ar prisijungęs vartotojas jau pasiūlė šiandien (vienas pasiūlymas/d.).
  const [alreadyNominated, setAlreadyNominated] = useState(false)
  // Vakar dienos pilnas pasiūlymų sąrašas (užkraunamas paspaudus „Visi vakar").
  const [ydayOpen, setYdayOpen] = useState(false)
  const [ydayNoms, setYdayNoms] = useState<Nomination[]>([])
  const [ydayLoading, setYdayLoading] = useState(false)
  // Balsavimo būsena (veikia ir neprisijungus — backend anon balsą riboja per IP).
  // Multi-vote: galima balsuoti už VISAS dainas (po vieną kartą už kiekvieną).
  const [votedIds, setVotedIds] = useState<Set<number>>(new Set())
  const [voting, setVoting] = useState<number | null>(null)
  const [voteErr, setVoteErr] = useState('')

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

  const openYesterday = useCallback(() => {
    if (!winner?.date) return
    setYdayOpen(true); setYdayLoading(true)
    fetch(`/api/dienos-daina/nominations?date=${winner.date}`)
      .then(r => r.json())
      .then(d => setYdayNoms(d.nominations || []))
      .catch(() => setYdayNoms([]))
      .finally(() => setYdayLoading(false))
  }, [winner])

  // Už kurias dainas jau balsuota šiandien (per user_id arba IP).
  useEffect(() => {
    fetch('/api/dienos-daina/votes')
      .then(r => r.json())
      .then(d => setVotedIds(new Set<number>(d.voted_nomination_ids || [])))
      .catch(() => {})
  }, [])

  const handleVote = useCallback(async (id: number) => {
    if (votedIds.has(id) || voting !== null) return
    setVoting(id); setVoteErr('')
    try {
      const res = await fetch('/api/dienos-daina/votes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nomination_id: id }),
      })
      const d = await res.json()
      if (res.ok) {
        const wt = d.weight || 1
        setVotedIds(prev => { const next = new Set(prev); next.add(id); return next })
        setNoms(prev => prev.map(n => n.id === id ? { ...n, votes: (n.votes || 0) + 1, weighted_votes: (n.weighted_votes || 0) + wt } : n))
      } else {
        setVoteErr(d.error || 'Klaida'); setTimeout(() => setVoteErr(''), 3000)
      }
    } catch {
      setVoteErr('Tinklo klaida'); setTimeout(() => setVoteErr(''), 3000)
    } finally {
      setVoting(null)
    }
  }, [votedIds, voting])

  const sorted = [...noms].filter(n => n.tracks).sort((a, b) => (b.weighted_votes || b.votes || 0) - (a.weighted_votes || a.votes || 0))
  const maxVotes = Math.max(1, ...sorted.map(n => n.weighted_votes || n.votes || 0))

  // Sekcijos antraštė renderinama VIDUJE komponento (ne per <SectionHead>), kad
  // mobile'e galėtume pridėti „list" ikoną, atveriančią pilną sąrašą (desktop'e
  // tą daro „+N" mygtukas juostos gale). Pavadinimas „Šiandien siūloma".
  // Edvardo prašymu 2026-06-02.
  const SectionHeader = (
    <div className="mb-3.5 flex items-center justify-between gap-3">
      <h2 className="m-0 font-['Outfit',sans-serif] text-[17px] font-extrabold tracking-[-0.01em] text-[var(--text-primary)] sm:text-[18px]">Dienos daina</h2>
      {sorted.length > 0 && (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          aria-label="Visas siūlomų dainų sąrašas"
          title="Visas sąrašas"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:text-[var(--accent-orange)] sm:hidden"
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="14" y2="17" /></svg>
        </button>
      )}
    </div>
  )

  if (loading) {
    return (
      <>
        <div className="mb-3.5 flex items-center justify-between gap-3">
          <h2 className="m-0 font-['Outfit',sans-serif] text-[17px] font-extrabold tracking-[-0.01em] text-[var(--text-primary)] sm:text-[18px]">Dienos daina</h2>
        </div>
        <div className="hp-scroll flex items-stretch gap-3 pb-0.5">
          {Array(6).fill(null).map((_, i) => (
            <div key={i} className="shrink-0" style={{ width: 200 }}>
              <Skel w={200} h={112} r={12} />
              <div className="mt-2"><Skel w="80%" h={12} /></div>
              <div className="mt-1"><Skel w="55%" h={10} /></div>
              <div className="mt-2"><Skel w="100%" h={28} r={8} /></div>
            </div>
          ))}
        </div>
      </>
    )
  }

  // Vertikali kortelė — toks pat dizainas kaip „Naujos dainos" (16:9 cover +
  // info apačioje). Balsai rodomi pop-bar dash'ais (ne tiksliais skaičiais —
  // „daugiau paslapties kas laimi"), rank skaičius pašalintas (painiojosi su
  // balsais). Balsavimo mygtukas — subtilus pill, ne bulky juosta. 2026-05-31.
  const NomCard = ({ n }: { n: Nomination; idx?: number }) => {
    const t = n.tracks!
    const votes = n.weighted_votes || n.votes || 0
    const level = votes > 0 ? Math.max(1, Math.round((votes / maxVotes) * 5)) : 0
    const v = extractYouTubeId(t.video_url)
    const ytThumb = v ? `https://img.youtube.com/vi/${v}/mqdefault.jpg` : null
    const imgSrc = t.cover_url || ytThumb || t.artists?.cover_image_url || null
    const isVotedThis = votedIds.has(n.id)
    return (
      <div className="group flex shrink-0 flex-col" style={{ width: 188 }}>
        <button
          type="button"
          onClick={() => onOpenTrack({ id: t.id, title: t.title, slug: t.slug, cover_url: t.cover_url, video_url: t.video_url, artists: t.artists })}
          className="block no-underline text-left p-0 bg-transparent border-0 cursor-pointer"
        >
          <div className="relative aspect-video overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--cover-placeholder)] shadow-[0_4px_12px_rgba(0,0,0,0.25)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-[rgba(249,115,22,0.5)] group-hover:shadow-[0_14px_32px_rgba(249,115,22,0.18)]">
            {imgSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={proxyImg(imgSrc)} alt={sanitizeTitle(t.title)} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" style={{ filter: 'saturate(1.05) contrast(1.02)' }} />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl text-[var(--text-faint)]">🎵</div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgba(249,115,22,0.12)] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          </div>
          {/* Balsai (dash'ai) — IŠKART po thumbnail, kad vienodai lygiuotųsi su
              laimėtojo kortele (Edvardo prašymu 2026-06-02). */}
          <DainaPopBar level={level} />
          <div className="mt-1 px-0.5">
            <p className="m-0 truncate font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">{sanitizeTitle(t.title)}</p>
            <p className="m-0 mt-0.5 truncate text-[11.5px] text-[var(--text-muted)]">{t.artists?.name}</p>
          </div>
        </button>
        {/* Pasiūlytojo username PIRMA, po juo — balsavimo mygtukas. Už savo
            pasiūlymą balsuoti negalima: tokiu atveju mygtuko NĖRA (kad tai tavo,
            matosi iš username — nereikia atskiro „Tavo pasiūlymas"). 2026-06-02. */}
        {n.proposer && <div className="mt-1.5 px-0.5"><ProposerLine p={n.proposer} /></div>}
        {!n.own && (
          <div className="mt-1.5 px-0.5">
            <button
              type="button"
              onClick={() => handleVote(n.id)}
              disabled={isVotedThis || voting !== null}
              className={`block w-full rounded-full py-[3px] font-['Outfit',sans-serif] text-[10.5px] font-extrabold transition-all ${
                isVotedThis ? 'cursor-default' : voting !== null ? 'opacity-60' : 'hover:bg-[rgba(249,115,22,0.12)]'
              }`}
              style={{
                background: isVotedThis ? 'rgba(249,115,22,0.14)' : 'transparent',
                color: 'var(--accent-orange)',
                border: '1px solid rgba(249,115,22,0.4)',
              }}
            >
              {voting === n.id ? '…' : isVotedThis ? '✓ Balsuota' : 'Balsuoti'}
            </button>
          </div>
        )}
        {n.comment && <p className="m-0 mt-1 px-0.5 line-clamp-2 text-[10.5px] italic text-[var(--text-muted)]">„{n.comment}"</p>}
      </div>
    )
  }

  return (
    <>
      {SectionHeader}
      {/* Header'iai virš juostos: „VAKAR LAIMĖJO" (virš laimėtojo, su list ikona →
          vakar pasiūlymai) ir „ŠIANDIEN SIŪLOMOS". „Visi (N)" link'as pašalintas —
          pilną sąrašą atveria standartinis „+N" button'as juostos gale (tik kai
          persipildo). 2026-06-02. */}
      {winner?.tracks ? (
        <div className="mb-2 flex items-end gap-3">
          <div style={{ width: 188 }} className="flex shrink-0 items-center gap-1.5 px-0.5">
            <span className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--accent-orange)]">Vakar laimėjo</span>
            <button type="button" onClick={openYesterday} aria-label="Visi vakar dienos pasiūlymai" title="Visi vakar dienos pasiūlymai" className="flex h-4 w-4 items-center justify-center rounded text-[var(--text-faint)] transition-colors hover:text-[var(--accent-orange)]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="14" y2="17" /></svg>
            </button>
          </div>
          <div className="shrink-0" style={{ width: 9 }} />
          <div className="flex flex-1 items-center justify-between gap-3">
            <span className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-faint)]">Šiandien siūloma</span>
            {voteErr && <span className="text-[11px] font-bold text-[var(--accent-red,#ef4444)]">{voteErr}</span>}
          </div>
        </div>
      ) : voteErr ? (
        <div className="mb-2 text-[11.5px] font-bold text-[var(--accent-red,#ef4444)]">{voteErr}</div>
      ) : null}

      <div className="flex items-stretch gap-3">
        <div className="hp-scroll flex flex-1 min-w-0 items-stretch gap-3 pb-0.5">
          {/* Vakar laimėjusi daina — pirma; vertikali linija atskiria nuo šiandienos. */}
          {winner?.tracks && (
            <>
              <DainaWinnerCard w={winner} onOpenTrack={onOpenTrack} maxVotes={maxVotes} />
              <div className="flex shrink-0 items-stretch self-stretch px-1">
                <div className="w-px self-stretch bg-[var(--border-default)]" />
              </div>
            </>
          )}

          {sorted.slice(0, 14).map((n) => <NomCard key={n.id} n={n} />)}

        {/* Paskutinė kortelė — „Pasiūlyti dainą". Jau pasiūliusiam vartotojui jos
            NErodom (jo pasiūlymas jau matosi sąraše — atskira „jau pasiūlei"
            būsena nereikalinga). Edvardo prašymu 2026-06-02. */}
        {!alreadyNominated && (
          <button
            type="button"
            onClick={() => setSuggestOpen(true)}
            className="group flex shrink-0 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] text-center transition-all hover:-translate-y-0.5 hover:border-[rgba(249,115,22,0.5)] hover:bg-[rgba(249,115,22,0.05)]"
            style={{ width: 188, minHeight: 178 }}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[rgba(249,115,22,0.12)] font-['Outfit',sans-serif] text-[24px] font-bold leading-none text-[var(--accent-orange)] transition-colors group-hover:bg-[var(--accent-orange)] group-hover:text-white">+</span>
            <span className="px-3 font-['Outfit',sans-serif] text-[12.5px] font-extrabold text-[var(--text-primary)]">Pasiūlyti dainą</span>
            <span className="px-3 text-[10.5px] text-[var(--text-muted)]">Pridėk savo kandidatą</span>
          </button>
        )}
        </div>
        {/* Pilno sąrašo „+N" button'as — tik kai pasiūlymų pakanka scroll'ui
            (kaip kitose sekcijose). 2026-06-02. */}
        {sorted.length > 6 && (
          <StickyMoreButton
            count={sorted.length}
            height={190}
            ariaLabel={`Žiūrėti visus (${sorted.length})`}
            onClick={() => setModalOpen(true)}
          />
        )}
      </div>

      {modalOpen && (
        <HomeListModal open onClose={() => setModalOpen(false)} title="Dienos daina" subtitle="Šiandienos kandidatai pagal balsus">
          {winner?.tracks && (
            <div className="mb-4">
              <p className="mb-2 font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--accent-orange)]">Vakar laimėjo</p>
              <DainaWinnerCard w={winner} onOpenTrack={(t) => { setModalOpen(false); onOpenTrack(t) }} maxVotes={maxVotes} />
            </div>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {sorted.map((n, idx) => {
              const t = n.tracks!
              const votes = n.weighted_votes || n.votes || 0
              const level = votes > 0 ? Math.max(1, Math.round((votes / maxVotes) * 5)) : 0
              const isVotedThis = votedIds.has(n.id)
              return (
                <div key={n.id} className="hp-card group flex items-start gap-3 p-3 text-left">
                  <button
                    type="button"
                    onClick={() => { setModalOpen(false); onOpenTrack({ id: t.id, title: t.title, slug: t.slug, cover_url: t.cover_url, video_url: t.video_url, artists: t.artists }) }}
                    className="flex min-w-0 flex-1 items-start gap-3 border-0 bg-transparent p-0 text-left cursor-pointer"
                  >
                    <div className="relative shrink-0">
                      <Cover src={t.cover_url} ytId={extractYouTubeId(t.video_url)} artistSrc={t.artists?.cover_image_url} alt={sanitizeTitle(t.title)} size={56} radius={8} />
                      {idx < 3 && <span className="absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-orange)] text-[10px] font-black text-white">{idx + 1}</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="m-0 line-clamp-1 font-['Outfit',sans-serif] text-[13.5px] font-extrabold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">{sanitizeTitle(t.title)}</p>
                      <p className="m-0 truncate text-[11.5px] text-[var(--text-muted)]">{t.artists?.name}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="flex items-center gap-[3px]" aria-hidden>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <span key={i} className={`h-[3px] w-[14px] rounded-[2px] ${i < level ? 'bg-[var(--accent-orange)]' : 'bg-[var(--border-default)]'}`} />
                          ))}
                        </span>
                        <span className="shrink-0 text-[10px] font-bold text-[var(--text-faint)]">{votes} bal.</span>
                      </div>
                      <div className="mt-1"><ProposerLine p={n.proposer} /></div>
                      {/* Kas balsavo už šią dainą (registruoti) + anonimų skaičius. */}
                      {((n.voters && n.voters.length > 0) || (n.anon_votes || 0) > 0) && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-[var(--text-faint)]">Balsavo:</span>
                          <span className="flex -space-x-1.5">
                            {(n.voters || []).slice(0, 5).map((vp, i) => {
                              const nm = vp.full_name || vp.username || '?'
                              return vp.avatar_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={i} src={proxyImg(vp.avatar_url)} alt={nm} title={nm} className="h-[18px] w-[18px] rounded-full border border-[var(--bg-surface)] object-cover" />
                              ) : (
                                <span key={i} title={nm} className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-[var(--bg-surface)] text-[8px] font-extrabold" style={{ background: `hsl(${strHue(nm)},32%,20%)`, color: `hsl(${strHue(nm)},48%,58%)` }}>{nm.charAt(0).toUpperCase()}</span>
                              )
                            })}
                          </span>
                          {(() => {
                            const extra = Math.max(0, (n.voters?.length || 0) - 5) + (n.anon_votes || 0)
                            return extra > 0 ? <span className="text-[10px] text-[var(--text-faint)]">+{extra}</span> : null
                          })()}
                        </div>
                      )}
                      {n.comment && <p className="m-0 mt-1.5 line-clamp-2 text-[11px] italic text-[var(--text-muted)]">„{n.comment}"</p>}
                    </div>
                  </button>
                  {n.own ? (
                    <span className="shrink-0 self-center rounded-lg border border-dashed border-[var(--border-default)] px-3 py-2 font-['Outfit',sans-serif] text-[10.5px] font-bold text-[var(--text-faint)]">Tavo</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleVote(n.id)}
                      disabled={isVotedThis || voting !== null}
                      className={`shrink-0 self-center rounded-lg px-3 py-2 font-['Outfit',sans-serif] text-[11.5px] font-extrabold transition-all ${
                        isVotedThis ? 'cursor-default' : voting !== null ? 'opacity-60' : 'hover:-translate-y-px'
                      }`}
                      style={{
                        background: isVotedThis ? 'rgba(249,115,22,0.15)' : 'var(--accent-orange)',
                        color: isVotedThis ? 'var(--accent-orange)' : '#fff',
                        border: isVotedThis ? '1px solid rgba(249,115,22,0.4)' : '1px solid transparent',
                      }}
                    >
                      {voting === n.id ? '…' : isVotedThis ? '✓' : 'Balsuoti'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </HomeListModal>
      )}

      {ydayOpen && (
        <HomeListModal open onClose={() => setYdayOpen(false)} title="Vakar dienos pasiūlymai" subtitle={winner?.date ? `${winner.date} · pagal balsus` : null}>
          {ydayLoading ? (
            <div className="py-8 text-center text-[12px] text-[var(--text-muted)]">Kraunama…</div>
          ) : ydayNoms.filter(n => n.tracks).length === 0 ? (
            <div className="py-8 text-center text-[12px] text-[var(--text-muted)]">Vakar pasiūlymų nerasta.</div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[...ydayNoms].filter(n => n.tracks).sort((a, b) => (b.weighted_votes || b.votes || 0) - (a.weighted_votes || a.votes || 0)).map((n, idx) => {
                const t = n.tracks!
                const votes = n.weighted_votes || n.votes || 0
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => { setYdayOpen(false); onOpenTrack({ id: t.id, title: t.title, slug: t.slug, cover_url: t.cover_url, video_url: t.video_url, artists: t.artists }) }}
                    className={`hp-card group flex items-start gap-3 p-3 text-left ${idx === 0 ? 'border-[rgba(249,115,22,0.45)]' : ''}`}
                  >
                    <Cover src={t.cover_url} ytId={extractYouTubeId(t.video_url)} artistSrc={t.artists?.cover_image_url} alt={sanitizeTitle(t.title)} size={56} radius={8} />
                    <div className="min-w-0 flex-1">
                      <p className="m-0 line-clamp-1 font-['Outfit',sans-serif] text-[13.5px] font-extrabold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">{sanitizeTitle(t.title)}{idx === 0 && <span className="ml-1.5 rounded-full bg-[var(--accent-orange)] px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-white">Laimėjo</span>}</p>
                      <p className="m-0 truncate text-[11.5px] text-[var(--text-muted)]">{t.artists?.name}</p>
                      <p className="m-0 mt-1 text-[11px] font-bold text-[var(--text-secondary)]">{votes} {votes === 1 ? 'taškas' : votes < 10 ? 'taškai' : 'taškų'}</p>
                      <div className="mt-1"><ProposerLine p={n.proposer} /></div>
                      {/* Kas balsavo (nariai + anonimai). Narių balsas sveria 3x. */}
                      {((n.voters && n.voters.length > 0) || (n.anon_votes || 0) > 0) && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-[var(--text-faint)]">Balsavo:</span>
                          <span className="flex -space-x-1.5">
                            {(n.voters || []).slice(0, 6).map((vp, i) => {
                              const nm = vp.full_name || vp.username || '?'
                              return vp.avatar_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={i} src={proxyImg(vp.avatar_url)} alt={nm} title={nm} className="h-[18px] w-[18px] rounded-full border border-[var(--bg-surface)] object-cover" />
                              ) : (
                                <span key={i} title={nm} className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-[var(--bg-surface)] text-[8px] font-extrabold" style={{ background: `hsl(${strHue(nm)},32%,20%)`, color: `hsl(${strHue(nm)},48%,58%)` }}>{nm.charAt(0).toUpperCase()}</span>
                              )
                            })}
                          </span>
                          {(() => {
                            const extra = Math.max(0, (n.voters?.length || 0) - 6) + (n.anon_votes || 0)
                            return extra > 0 ? <span className="text-[10px] text-[var(--text-faint)]">+{extra} svečių</span> : null
                          })()}
                        </div>
                      )}
                      {n.comment && <p className="m-0 mt-1.5 line-clamp-2 text-[11px] italic text-[var(--text-muted)]">„{n.comment}"</p>}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </HomeListModal>
      )}

      {suggestOpen && <DainaSuggestModal onClose={() => setSuggestOpen(false)} onDone={load} />}
    </>
  )
}

const PULSAS_FILTERS = [['all', 'Visi'], ['blog', 'Blogai'], ['discussion', 'Diskusijos'], ['comment', 'Komentarai']] as const

function pulsasAccent(t: string, sub?: string | null): string {
  if (t === 'discussion') return 'var(--accent-link)'
  if (t === 'comment') return 'var(--accent-green)'
  if (sub === 'review') return 'var(--accent-yellow)'
  if (sub === 'translation') return 'var(--accent-link)'
  return 'var(--accent-orange)'
}
function pulsasEmoji(t: string, sub?: string | null): string {
  if (t === 'discussion') return '💬'
  if (t === 'comment') return '💭'
  if (sub === 'review') return '📝'
  if (sub === 'creation') return '🎨'
  if (sub === 'translation') return '🌐'
  if (sub === 'topas') return '📊'
  if (sub === 'event') return '📅'
  return '✍️'
}

function PulsasCard({ it, inModal, onNavigate }: { it: PulsasItem; inModal: boolean; onNavigate?: () => void }) {
  const ac = pulsasAccent(it.type, it.subtype)
  // Komentarams — kitokia kortelė (FIX 4): komentaro tekstas NEbold (tai citata,
  // ne pavadinimas), entity mini nuotrauka + „kam" eilutė apačioje. Aiškiau
  // skiriasi nuo blog/diskusijos kortelės.
  if (it.type === 'comment') {
    return (
      <Link
        href={it.href}
        onClick={onNavigate}
        className={`hp-card group flex flex-col overflow-hidden no-underline ${inModal ? 'w-full' : 'shrink-0'}`}
        style={inModal ? { borderColor: 'rgba(34,197,94,0.3)' } : { width: 240, borderColor: 'rgba(34,197,94,0.3)' }}
      >
        <div className="flex items-center gap-1.5 border-b border-[var(--border-subtle)] bg-[var(--accent-green)]/10 px-3 py-2">
          <span className="text-[12px]">💬</span>
          <span className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.06em] text-[var(--accent-green)]">Komentaras</span>
        </div>
        <div className="flex flex-1 gap-2.5 p-3">
          {it.cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proxyImg(it.cover)} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <p className={`m-0 ${inModal ? 'line-clamp-5' : 'line-clamp-3'} text-[12.5px] leading-relaxed text-[var(--text-primary)]`}>{it.title}</p>
            {it.meta && <p className="m-0 mt-1.5 line-clamp-1 text-[10.5px] font-bold text-[var(--text-muted)]">{it.meta}</p>}
          </div>
        </div>
        <div className="mt-auto flex items-center gap-2 px-3 pb-3">
          {it.author_avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proxyImg(it.author_avatar)} alt="" className="h-[20px] w-[20px] flex-shrink-0 rounded-full object-cover" />
          ) : it.author_name ? (
            <div className="flex h-[20px] w-[20px] flex-shrink-0 items-center justify-center rounded-full font-['Outfit',sans-serif] text-[9px] font-extrabold" style={{ background: `hsl(${strHue(it.author_name)},32%,18%)`, color: `hsl(${strHue(it.author_name)},45%,55%)` }}>{it.author_name.charAt(0).toUpperCase()}</div>
          ) : null}
          <span className="min-w-0 flex-1 truncate text-[10.5px] text-[var(--text-secondary)]">{it.author_name || 'Anonimas'}</span>
          <span className="shrink-0 text-[9px] text-[var(--text-faint)]">{timeAgo(it.created_at)}</span>
        </div>
      </Link>
    )
  }
  return (
    <Link
      href={it.href}
      onClick={onNavigate}
      className={`hp-card group flex flex-col overflow-hidden p-0 no-underline ${inModal ? 'w-full' : 'shrink-0'}`}
      style={inModal ? undefined : { width: 240 }}
    >
      {/* Vizualas viršuje — cover (jei istraukėm) arba tipinis gradient+emoji. */}
      <div className="relative aspect-video overflow-hidden bg-[var(--cover-placeholder)]">
        {it.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyImg(it.cover)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" />
        ) : (
          <div
            className="flex h-full w-full flex-col items-center justify-center gap-1"
            style={{ background: `linear-gradient(135deg, hsl(${strHue(it.author_name || it.title)},34%,22%), hsl(${(strHue(it.author_name || it.title) + 40) % 360},30%,12%))` }}
          >
            <span className="font-['Outfit',sans-serif] text-3xl font-black text-white/85">{(it.author_name || it.title || '?').charAt(0).toUpperCase()}</span>
            {it.meta && <span className="font-['Outfit',sans-serif] text-[9px] font-extrabold uppercase tracking-[0.12em] text-white/55">{it.meta}</span>}
          </div>
        )}
        {it.meta && (
          <span className="absolute left-2 top-2 rounded px-1.5 py-0.5 font-['Outfit',sans-serif] text-[8.5px] font-extrabold uppercase tracking-[0.06em] text-white backdrop-blur-sm" style={{ background: ac }}>
            {it.meta}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <p className="m-0 line-clamp-2 font-['Outfit',sans-serif] text-[13px] font-extrabold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">{it.title}</p>
        {/* FIX 5: ilgesnis excerpt'as (section 4 eil., modale 6) užpildo kortelės
            vertikalų plotą — nelieka tuščios baltos apačios prie aukštų gretimų
            kortelių. */}
        {it.excerpt && <p className={`m-0 mt-1.5 ${inModal ? 'line-clamp-6' : 'line-clamp-4'} text-[11.5px] leading-relaxed text-[var(--text-muted)]`}>{it.excerpt}</p>}
        <div className="mt-auto flex items-center gap-2 pt-2.5">
          {it.author_name ? (
            it.author_avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={proxyImg(it.author_avatar)} alt="" className="h-[20px] w-[20px] flex-shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex h-[20px] w-[20px] flex-shrink-0 items-center justify-center rounded-full font-['Outfit',sans-serif] text-[9px] font-extrabold" style={{ background: `hsl(${strHue(it.author_name)},32%,18%)`, color: `hsl(${strHue(it.author_name)},45%,55%)` }}>{it.author_name.charAt(0).toUpperCase()}</div>
            )
          ) : null}
          <span className="min-w-0 flex-1 truncate text-[10.5px] text-[var(--text-secondary)]">{it.author_name || 'Anonimas'}</span>
          <span className="shrink-0 text-[9px] text-[var(--text-faint)]">{timeAgo(it.created_at)}</span>
        </div>
      </div>
    </Link>
  )
}

function PulsasSection() {
  const [items, setItems] = useState<PulsasItem[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [typeFilter, setTypeFilter] = useState<'all' | 'blog' | 'discussion' | 'comment'>('all')
  useEffect(() => {
    let alive = true
    fetch('/api/pulsas?limit=200')
      .then(r => r.json())
      .then(d => { if (alive) { setItems(d.items || []); setLoading(false) } })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  // Homepage juosta = TIK realių narių BLOG įrašai SU VIZUALAIS (Edvardo prašymu).
  // Diskusijos/komentarai gyvena modale + Pokalbių/Aktyvumo dėžutėse. Dedup per autorių.
  const seenU = new Set<string>()
  const deduped: PulsasItem[] = []
  for (const it of items) {
    if (it.type !== 'blog') continue
    if (!it.cover) continue            // su vizualais
    if (!it.author_name) continue      // realūs nariai (ne Anonimas)
    const key = it.author_slug || it.author_name
    if (seenU.has(key)) continue
    seenU.add(key); deduped.push(it)
  }
  const sectionItems = deduped.slice(0, 12)
  const modalItems = typeFilter === 'all' ? items : items.filter(i => i.type === typeFilter)

  return (
    <>
      {/* ── Vartotojų įrašai — narių blog įrašai (vizualios kortelės). ATSKIRTA
          nuo Pulso (Edvardo prašymu 2026-06-02). „+N" mygtukas atveria pilną
          bendruomenės aktyvumo modalą (blog + diskusijos + komentarai). ── */}
      <section>
        <SectionHead label="Atradimai" href="/feed" cta="Daugiau →" />
        <div className="flex items-stretch gap-3">
          <div className="hp-scroll flex min-w-0 flex-1 items-stretch gap-3 pb-1">
            {loading ? Array(5).fill(null).map((_, i) => (
              <div key={i} className="shrink-0" style={{ width: 240 }}>
                <div className="hp-skel aspect-video rounded-xl" />
                <div className="hp-skel mt-2 h-3 w-4/5 rounded" />
                <div className="hp-skel mt-1 h-2.5 w-3/5 rounded" />
              </div>
            )) : sectionItems.length === 0 ? (
              <div className="flex shrink-0 items-center px-3 text-[12px] text-[var(--text-faint)]" style={{ height: 250 }}>Narių įrašų su vizualais dar nėra</div>
            ) : sectionItems.map(it => <PulsasCard key={it.id} it={it} inModal={false} />)}
          </div>
          {!loading && items.length > 0 && (
            <StickyMoreButton count={items.length} height={258} ariaLabel="Atverti visą bendruomenės aktyvumą" onClick={() => setModalOpen(true)} />
          )}
        </div>
      </section>

      {/* ── Pulsas — trys stulpeliai per visą plotį: Diskusijos / Pokalbiai /
          Kas vyksta. Desktop'e grid 3-col; mobile'e sukrauti vertikaliai.
          Edvardo prašymu 2026-06-02. ── */}
      <section className="mt-8">
        <SectionHead label="Pulsas" />
        {/* Desktop: 3 lygūs stulpeliai */}
        <div className="hidden gap-3 sm:grid sm:grid-cols-3" style={{ height: 380 }}>
          <CommunityDiscussionsCard />
          <ShoutboxWidget />
          <ActivityWidget />
        </div>
        {/* Mobile: sukrauti (Diskusijos box pridėtas Edvardo prašymu) */}
        <div className="grid grid-cols-1 gap-3 sm:hidden">
          <div style={{ height: 360 }}><CommunityDiscussionsCard /></div>
          <div style={{ height: 340 }}><ShoutboxWidget /></div>
          <div style={{ height: 340 }}><ActivityWidget /></div>
        </div>
      </section>

      {modalOpen && (
        <HomeListModal open onClose={() => setModalOpen(false)} title="Pulsas" subtitle="Naujausi bendruomenės įrašai">
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            {PULSAS_FILTERS.map(([k, label]) => {
              const cnt = k === 'all' ? items.length : items.filter(i => i.type === k).length
              if (k !== 'all' && cnt === 0) return null
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTypeFilter(k)}
                  className={`rounded-full px-3 py-1.5 font-['Outfit',sans-serif] text-[12px] font-bold transition-colors ${typeFilter === k ? 'bg-[var(--accent-orange)] text-white' : 'bg-[var(--bg-active)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                >
                  {label} {cnt > 0 && <span className="opacity-60">{cnt}</span>}
                </button>
              )
            })}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {modalItems.map(it => <PulsasCard key={it.id} it={it} inModal onNavigate={() => setModalOpen(false)} />)}
          </div>
        </HomeListModal>
      )}
    </>
  )
}

/* Pramogos kortelės (Boombox intro + Music Manager placeholder) pašalintos
   2026-05-29 — „Pramogos" sekcija pakeista į „Dienos daina". Boombox + Music
   Manager pasiekiami tik per top menu. */

/* ────────────────────────────── Istorija sekcija ──────────────────────────────
   Šiandien aktualu istorijos kontekste: gimtadieniai, mirties metinės, albumų
   jubiliejai. Duomenys per /api/istorija/today (artists.birth_date,
   artists.death_date, albums.month+day matching dabartinę dieną). */

type IstApiItem = {
  id: string
  type: 'birthday' | 'death_anniversary' | 'album_anniversary'
  title: string
  subtitle: string
  href: string
  emoji: string
  cover: string | null
  year: number | null
  age?: number | null
  deceased?: boolean
  groups?: { name: string; cover: string | null }[]
  artist?: string | null
  albumId?: number | null
  pop?: number
  likeCount?: number
}

// Istorijos kategorijų konfigūracija (3 box'ai).
const IST_CATS = {
  album_anniversary: { label: 'Šiandien išleisti albumai' },
  birthday: { label: 'Gimė' },
  death_anniversary: { label: 'Mirties metinės' },
} as const
type IstCatKey = keyof typeof IST_CATS

// Istorijos thumbnail'as — atlikėjo/albumo cover'is arba monograma (NE emoji).
// `size` px — sekcijos kortelės naudoja didesnį (56), modalas standartinį (48).
function IstThumb({ cover, name, size = 48, radius = 10, gray = false }: { cover: string | null; name: string; size?: number; radius?: number; gray?: boolean }) {
  if (cover) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={proxyImg(cover)} alt="" loading="lazy" className="shrink-0 object-cover" style={{ width: size, height: size, borderRadius: radius, filter: gray ? 'grayscale(1)' : undefined }} />
  }
  return (
    <div className="flex shrink-0 items-center justify-center font-['Outfit',sans-serif] font-extrabold" style={{ width: size, height: size, borderRadius: radius, fontSize: size * 0.34, background: gray ? 'hsl(0,0%,18%)' : `hsl(${strHue(name)},32%,20%)`, color: gray ? 'hsl(0,0%,55%)' : `hsl(${strHue(name)},48%,58%)` }}>
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  )
}

// Kategorijos akcentas — gimtadieniai oranžiniai, albumai mėlyni, atminimas pilkas.
const IST_ACCENT: Record<string, string> = {
  album_anniversary: 'var(--accent-link)',
  birthday: 'var(--accent-orange)',
  death_anniversary: 'var(--text-muted)',
}

// Grupės, kurioms priklauso gimtadienio atlikėjas — kiekviena ATSKIROJE
// eilutėje su didesniu avataru (Edvardo prašymu 2026-06-02: inline čipai buvo
// per smulkūs/suspausti). `avatar` px ir `max` skiriasi kortelei/modalui.
function IstGroupChips({ groups, max = 99, avatar = 20 }: { groups?: { name: string; cover: string | null }[]; max?: number; avatar?: number }) {
  if (!groups || groups.length === 0) return null
  const shown = groups.slice(0, max)
  const extra = groups.length - shown.length
  return (
    <span className="mt-1.5 flex flex-col gap-1">
      {shown.map((g, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1.5">
          {g.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proxyImg(g.cover)} alt="" loading="lazy" className="shrink-0 rounded-full object-cover" style={{ width: avatar, height: avatar }} />
          ) : (
            <span className="flex shrink-0 items-center justify-center rounded-full font-['Outfit',sans-serif] font-extrabold" style={{ width: avatar, height: avatar, fontSize: avatar * 0.42, background: `hsl(${strHue(g.name)},32%,24%)`, color: `hsl(${strHue(g.name)},48%,62%)` }}>{(g.name || '?').charAt(0).toUpperCase()}</span>
          )}
          <span className="min-w-0 truncate text-[11.5px] font-semibold text-[var(--text-secondary)]">{g.name}</span>
        </span>
      ))}
      {extra > 0 && <span className="text-[10.5px] font-bold text-[var(--text-faint)]" style={{ paddingLeft: avatar + 6 }}>+{extra} grupė(s)</span>}
    </span>
  )
}

// Horizontalūs popbar brūkšneliai — toks pat stilius kaip HomeListContent.
function IstPopBar({ level }: { level?: number }) {
  if (!level || level <= 0) return null
  return (
    <span className="flex items-center gap-[3px]" aria-hidden title="Populiarumas pagal YouTube peržiūras">
      {Array.from({ length: level }).map((_, i) => <span key={i} className="h-[3px] w-[12px] rounded-[2px] bg-[var(--accent-orange)]" />)}
    </span>
  )
}

function IstorijaSection({ onOpenAlbum }: { onOpenAlbum?: (id: number, preview: { title: string; cover_image_url?: string | null; year?: number | null }) => void }) {
  const [items, setItems] = useState<IstApiItem[]>([])
  const [loading, setLoading] = useState(true)
  const [openCat, setOpenCat] = useState<IstCatKey | null>(null)
  useEffect(() => {
    let alive = true
    fetch('/api/istorija/today')
      .then(r => r.json())
      .then(d => { if (alive) { setItems(d.items || []); setLoading(false) } })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        {Array(2).fill(null).map((_, i) => (
          <div key={i}>
            <div className="mb-2.5"><Skel w={140} h={14} /></div>
            <div className="hp-scroll flex items-stretch gap-3">
              {Array(7).fill(null).map((_, j) => (
                <div key={j} className="shrink-0" style={{ width: 156 }}>
                  <Skel w={156} h={156} r={12} />
                  <div className="mt-2"><Skel w="80%" h={12} /></div>
                  <div className="mt-1"><Skel w="55%" h={10} /></div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="hp-card flex flex-col items-center justify-center p-6 text-center" style={{ minHeight: 130 }}>
        <p className="m-0 font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--text-primary)]">Šiandien istorijos kalendoriuje tylu</p>
        <p className="m-0 mt-1 text-[11.5px] text-[var(--text-muted)]">Nepamiršk — kiekvieną dieną čia atsiras gimtadieniai, jubiliejai ir sukaktys.</p>
      </div>
    )
  }

  // Eilė: šiandien išleisti albumai → gimtadieniai → mirties metinės.
  // Items iš API jau surūšiuoti pagal atlikėjo populiarumą (score desc).
  const order: IstCatKey[] = ['album_anniversary', 'birthday', 'death_anniversary']
  // Rodom TIK tas kategorijas, kurios turi įrašų (tuščios — pvz. mirties metinės
  // dieną be mirčių — nerodom placeholderio). Edvardo prašymu 2026-06-01.
  const cats = order
    .map(t => ({ t, cfg: IST_CATS[t], list: items.filter(i => i.type === t) }))
    .filter(c => c.list.length > 0)
  const openList = openCat ? items.filter(i => i.type === openCat) : []

  return (
    <>
      {/* FIX 8: turtingesnis kortelių dizainas — featured kortelė su dideliu
          cover'iu viršuje + kompaktiški įrašai apačioje. Vizualiai stipresnis,
          atitinka Pulsas/albumų sekcijų kalbą (cover-forward). */}
      {/* Kategorijos — horizontalios cover-kortelių juostos, toks pat dizainas
          kaip „Nauji albumai" / „Naujos dainos" sekcijos (kvadratiniai cover'iai
          + „+N" modalo button'as). Edvardo prašymu 2026-05-31 — vizualiai
          suvienodinta su aukščiau esančiomis sekcijomis. */}
      <div className="flex flex-col gap-6">
        {cats.map(({ t, cfg, list }) => {
          const accent = IST_ACCENT[t] || 'var(--accent-orange)'
          return (
            <div key={t}>
              <div className="mb-2.5 flex items-center gap-2">
                <span style={{ width: 3, height: 16, borderRadius: 2, background: accent }} />
                <h3 className="m-0 font-['Outfit',sans-serif] text-[14.5px] font-extrabold tracking-[-0.01em] text-[var(--text-primary)]">{cfg.label}</h3>
                <span className="text-[11px] font-bold text-[var(--text-faint)]">{list.length}</span>
              </div>
              <div className="flex items-stretch gap-3">
                <div className="hp-scroll flex flex-1 min-w-0 items-stretch gap-3 pb-0.5">
                  {list.slice(0, 14).map(it => {
                    // Badge: albumams — albumo amžius (sukaktis); gimtadieniams —
                    // kiek sukako GYVAM (miręs → „gimimo metinės" rodom tekste, ne
                    // ant badge'o); mirties metinėms — metai.
                    const badge = it.type === 'album_anniversary'
                      ? (it.age ? `${it.age} m.` : null)
                      : it.type === 'birthday'
                        ? (it.age ? (it.deceased ? `${it.age} gimimo metinės` : `${it.age} m.`) : null)
                        : (it.year ? `${it.year} m.` : null)
                    // Miręs atlikėjas → grayscale nuotrauka. Edvardo prašymu 2026-06-01.
                    const gray = it.type === 'death_anniversary' || it.deceased
                    // Cover + badge — bendra abiem (button album'ui / Link kitiems).
                    const coverBlock = (
                      <div className="relative aspect-square overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--cover-placeholder)] shadow-[0_4px_12px_rgba(0,0,0,0.25)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-[rgba(249,115,22,0.5)] group-hover:shadow-[0_14px_32px_rgba(249,115,22,0.18)]">
                        {it.cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={proxyImg(it.cover)} alt={it.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" style={{ filter: gray ? 'grayscale(1)' : 'saturate(1.05) contrast(1.02)' }} />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center font-['Outfit',sans-serif] font-extrabold" style={{ fontSize: 46, background: gray ? 'hsl(0,0%,18%)' : `hsl(${strHue(it.title)},32%,20%)`, color: gray ? 'hsl(0,0%,55%)' : `hsl(${strHue(it.title)},48%,58%)` }}>
                            {(it.title || '?').charAt(0).toUpperCase()}
                          </div>
                        )}
                        {badge && (
                          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 font-['Outfit',sans-serif] text-[9px] font-bold text-white backdrop-blur-sm">{badge}</span>
                        )}
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgba(249,115,22,0.12)] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                      </div>
                    )
                    // Tekstinė dalis po cover'iu (skiriasi pagal tipą).
                    const textBlock = (
                      <div className="mt-2 px-0.5">
                        <p className={`m-0 font-['Outfit',sans-serif] text-[13px] font-extrabold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)] ${it.type === 'album_anniversary' ? 'truncate' : 'line-clamp-2'}`}>{it.title}</p>
                        {it.type === 'album_anniversary' && it.artist && (
                          <p className="m-0 mt-1 truncate text-[12px] text-[var(--text-muted)]">{it.artist}</p>
                        )}
                        {it.type === 'birthday' && <IstGroupChips groups={it.groups} avatar={20} />}
                        {it.type === 'death_anniversary' && it.subtitle && (
                          <p className="m-0 mt-1 truncate text-[11.5px] text-[var(--text-muted)]">{it.subtitle}</p>
                        )}
                      </div>
                    )
                    // Albumai → atidaro AlbumInfoModal (kaip „Nauji albumai"); kiti
                    // tipai → navigacija į atlikėjo puslapį.
                    if (it.type === 'album_anniversary' && it.albumId && onOpenAlbum) {
                      return (
                        <button
                          key={it.id}
                          type="button"
                          onClick={() => onOpenAlbum(it.albumId!, { title: it.title, cover_image_url: it.cover, year: it.year })}
                          className="group block shrink-0 cursor-pointer border-0 bg-transparent p-0 text-left no-underline"
                          style={{ width: 156 }}
                        >
                          {coverBlock}
                          {textBlock}
                        </button>
                      )
                    }
                    return (
                      <Link key={it.id} href={it.href} className="group block shrink-0 no-underline text-left" style={{ width: 156 }}>
                        {coverBlock}
                        {textBlock}
                      </Link>
                    )
                  })}
                </div>
                {/* „+N" button'as tik kai juosta tikrai persipildo (>7) — kitaip
                    visi telpa be scroll'o ir button'as nereikalingas. 2026-06-01. */}
                {list.length > 7 && (
                  <StickyMoreButton
                    count={list.length}
                    height={200}
                    ariaLabel={`Žiūrėti visus (${list.length})`}
                    onClick={() => setOpenCat(t)}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {openCat && openCat === 'album_anniversary' && (
        // Albumų modalas — kortelių grid'as kaip „Nauji albumai" (kvadratinis
        // cover + amžiaus badge + popbar VIRŠ title + ♥). Atidaro AlbumInfoModal.
        <HomeListModal open onClose={() => setOpenCat(null)} title={IST_CATS[openCat].label} subtitle="Šiandien istorijoje">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {openList.map(it => (
              <button
                key={it.id}
                type="button"
                onClick={() => { if (it.albumId && onOpenAlbum) { onOpenAlbum(it.albumId, { title: it.title, cover_image_url: it.cover, year: it.year }); setOpenCat(null) } }}
                className="group block w-full cursor-pointer border-0 bg-transparent p-0 text-left no-underline"
              >
                <div className="relative aspect-square overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--cover-placeholder)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-[rgba(249,115,22,0.5)]">
                  {it.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proxyImg(it.cover)} alt={it.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" />
                  ) : <div className="flex h-full w-full items-center justify-center text-2xl text-[var(--text-faint)]">💿</div>}
                  {it.age ? <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 font-['Outfit',sans-serif] text-[9px] font-bold text-white backdrop-blur-sm">{it.age} m.</span> : null}
                </div>
                <div className="mt-2 px-0.5">
                  {(it.pop ?? 0) > 0 && <span className="mb-1 flex"><IstPopBar level={it.pop} /></span>}
                  <p className="m-0 truncate font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">{it.title}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="m-0 min-w-0 flex-1 truncate text-[11.5px] text-[var(--text-muted)]">{it.artist}</p>
                    {(it.likeCount ?? 0) > 0 && (
                      <span className="flex shrink-0 items-center gap-0.5 text-[10.5px] font-bold text-[var(--text-muted)]"><span className="text-[var(--accent-orange)]">♥</span>{it.likeCount}</span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </HomeListModal>
      )}

      {openCat && openCat !== 'album_anniversary' && (
        <HomeListModal open onClose={() => setOpenCat(null)} title={IST_CATS[openCat].label} subtitle="Šiandien istorijoje">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {openList.map(it => (
              <Link
                key={it.id}
                href={it.href}
                onClick={() => setOpenCat(null)}
                className="hp-card group flex items-center gap-3 p-2.5 no-underline"
              >
                <IstThumb cover={it.cover} name={it.title} size={52} radius={10} gray={it.type === 'death_anniversary' || it.deceased} />
                <div className="min-w-0 flex-1">
                  <p className="m-0 line-clamp-1 font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">{it.title}</p>
                  {it.type === 'death_anniversary' && it.subtitle && (
                    <p className="m-0 mt-0.5 line-clamp-1 text-[11px] text-[var(--text-muted)]">{it.subtitle}</p>
                  )}
                  {it.type === 'birthday' && <IstGroupChips groups={it.groups} avatar={24} />}
                  {/* Amžiaus/„gimimo metinės" badge'as (ne tekstas) — Edvardo
                      prašymu 2026-06-02. */}
                  {it.type === 'birthday' && it.age && (
                    <span className="mt-1.5 inline-block rounded-full bg-[var(--bg-active)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-faint)]">{it.deceased ? `${it.age} gimimo metinės` : `${it.age} m.`}</span>
                  )}
                  {it.type === 'death_anniversary' && it.year && (
                    <span className="mt-1.5 inline-block rounded-full bg-[var(--bg-active)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-faint)]">{it.year} m.</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </HomeListModal>
      )}
    </>
  )
}

/* ────────────────────────────── Hero v2 Card ──────────────────────────────
   Vienoda kortelė rendinama hero karuselėje. Trys tipai:
   - 'chart_lt' / 'chart_world' — koliažas su top atlikėjais ir top 3 dainomis
   - default (news/event/promo) — bg image + chip + title + subtitle */

function HeroV2Card({ slide, dk }: { slide: HeroSlide; dk: boolean }) {
  if (slide.type === 'chart_lt' || slide.type === 'chart_world') {
    return <HeroChartCard slide={slide} />
  }
  // Regular slide (news/event/promo)
  return (
    <Link
      href={slide.href}
      className="group relative block aspect-[16/9] overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] no-underline shadow-[0_8px_32px_rgba(0,0,0,0.25)] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_42px_rgba(0,0,0,0.35)]"
    >
      {/* BG image — height-driven, hugs right side for portrait covers */}
      <div className="absolute inset-0 flex items-stretch justify-end overflow-hidden">
        {slide.bgImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxyImg(slide.bgImg)}
            alt=""
            loading="lazy"
            className="h-full w-auto max-w-full object-cover"
            style={{
              objectPosition: 'center 25%',
              WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 18%, black 100%)',
              maskImage: 'linear-gradient(to right, transparent 0%, black 18%, black 100%)',
            }}
          />
        ) : (
          <div className="h-full w-full" style={{ background: 'var(--homepage-hero-gradient)' }} />
        )}
      </div>
      {/* Bottom gradient for text readability */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-end p-5">
        <span
          className="mb-2 inline-flex w-fit rounded-full px-3 py-1 font-['Outfit',sans-serif] text-[10px] font-black uppercase tracking-[0.08em] text-white"
          style={{ background: slide.chipBg }}
        >
          {slide.chip}
        </span>
        <h3 className="m-0 max-w-[460px] font-['Outfit',sans-serif] text-[28px] font-black leading-[1.08] tracking-tight text-white transition-opacity group-hover:opacity-90">
          {slide.title}
        </h3>
        {/* Subtitle/excerpt naujienoms pašalintas — UI'as paprastesnis,
            tik main title (žr. naudotojo paaiškinimą 2026-05-28). */}
      </div>
    </Link>
  )
}

function HeroChartCard({ slide }: { slide: HeroSlide }) {
  const isLT = slide.type === 'chart_lt'
  const tops = slide.chartTops || []
  const accent = isLT ? '#f97316' : '#3b82f6'
  const accentSoft = isLT ? 'rgba(249,115,22,0.22)' : 'rgba(59,130,246,0.22)'
  const cover = (t: TopEntry | undefined) => t ? (t.cover_url || t.artist_image) : null

  // Value tekstas — paminime KAS yra naujas pretendentas (vardais). Jei naujų
  // nėra, eyebrow + sąrašas išvis nerodomas (kortelė lieka švari su mosaic'u).
  const dedupArtists = (entries: TopEntry[]) => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const t of entries) {
      const a = (t.artist || '').trim()
      if (!a || seen.has(a)) continue
      seen.add(a); out.push(a)
    }
    return out
  }
  const newArtists = dedupArtists(tops.filter(t => t.trend === 'new'))
  const valueLead = newArtists.length > 0 ? 'Tarp naujų pretendentų:' : ''
  const valueNames = newArtists.slice(0, 4)

  // Tile renders a single mosaic cover with title overlay + position number.
  const Tile = ({ entry, size }: { entry: TopEntry | undefined; size: 'big' | 'md' | 'sm' }) => {
    const c = cover(entry)
    const titleSize = size === 'big' ? 14.5 : size === 'md' ? 12.5 : 11
    const artistSize = size === 'big' ? 12 : size === 'md' ? 10.5 : 10
    const padding = size === 'big' ? '10px 11px 10px' : '7px 8px 7px'
    const numSize = size === 'big' ? 30 : size === 'md' ? 24 : 22
    const numFont = size === 'big' ? 13.5 : 11.5
    if (!entry || !c) {
      return <div className="rounded-lg" style={{ background: 'rgba(255,255,255,0.05)', height: '100%', width: '100%' }} />
    }
    return (
      <div className="relative h-full w-full overflow-hidden rounded-lg" style={{ boxShadow: size === 'big' ? '0 6px 22px rgba(0,0,0,0.5)' : '0 4px 14px rgba(0,0,0,0.4)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={proxyImg(c)}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
        />
        <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.55) 35%, rgba(0,0,0,0.12) 60%, rgba(0,0,0,0) 80%)' }} />
        <span
          className="absolute left-2 top-2 inline-flex items-center justify-center rounded-md font-['Outfit',sans-serif] font-black text-white"
          style={{
            background: entry.pos === 1 ? accent : 'rgba(0,0,0,0.78)',
            height: numSize, minWidth: numSize, fontSize: numFont,
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(2px)',
          }}
        >{entry.pos}</span>
        <div className="absolute bottom-0 left-0 right-0" style={{ padding }}>
          <p
            className="m-0 truncate font-['Outfit',sans-serif] font-black text-white"
            style={{ fontSize: titleSize, lineHeight: 1.15, letterSpacing: '-0.01em', textShadow: '0 2px 6px rgba(0,0,0,0.85)' }}
          >{entry.title}</p>
          <p
            className="m-0 truncate text-white/85"
            style={{ fontSize: artistSize, lineHeight: 1.2, marginTop: 1, textShadow: '0 1px 4px rgba(0,0,0,0.85)' }}
          >{entry.artist}</p>
        </div>
      </div>
    )
  }

  return (
    <Link
      href={slide.href}
      className="group relative block aspect-[16/9] overflow-hidden rounded-2xl border border-[var(--border-default)] no-underline shadow-[0_8px_32px_rgba(0,0,0,0.25)] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_42px_rgba(0,0,0,0.4)]"
      style={{
        background: isLT
          ? `radial-gradient(ellipse at top left, ${accentSoft}, rgba(10,14,26,0.98) 60%), linear-gradient(135deg, #1a1426 0%, #0a0e1a 100%)`
          : `radial-gradient(ellipse at top left, ${accentSoft}, rgba(8,13,20,0.98) 60%), linear-gradient(135deg, #14182a 0%, #080d14 100%)`,
      }}
    >
      {/* ── LEFT side: chip + value stat + CTA (38% width) ── */}
      <div
        className="relative z-[1] flex h-full flex-col justify-between p-6"
        style={{ width: '38%' }}
      >
        {/* Top: TOP chip — vienintelis chart name'o atvaizdavimas */}
        <span
          className="inline-flex w-fit items-center gap-1.5 rounded-full px-3.5 py-1.5 font-['Outfit',sans-serif] text-[11px] font-black uppercase tracking-[0.08em] text-white"
          style={{ background: accent, boxShadow: `0 2px 14px ${accentSoft}`, alignSelf: 'flex-start' }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17h2v-7H3v7zm4 0h2V7H7v10zm4 0h2v-4h-2v4zm4 0h2v-9h-2v9zm4-13v13h2V4h-2z"/></svg>
          {isLT ? 'LT TOP 30' : 'TOP 40'}
        </span>

        {/* Middle: bulleted list — kiekvienas atlikėjas savo eilutėje su
            truncation'u, kad ilgi pavadinimai nelįstų ant dešinės mosaic'o.
            Renderiamas TIK kai yra naujų pretendentų — kitaip kortelė lieka
            švari su mosaic'u dešinėje + chip + Balsuok kairėje. */}
        {valueNames.length > 0 && (
          <div className="flex flex-col gap-1.5" style={{ minWidth: 0 }}>
            <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
              {valueLead}
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {valueNames.slice(0, 4).map((n, i) => (
                <li
                  key={i}
                  style={{
                    fontFamily: 'Outfit,sans-serif',
                    fontSize: 14.5, fontWeight: 600, color: 'rgba(255,255,255,0.78)',
                    lineHeight: 1.3, letterSpacing: '-0.005em',
                    display: 'flex', alignItems: 'center', gap: 8,
                    minWidth: 0,
                  }}
                >
                  <span style={{
                    flexShrink: 0, width: 4, height: 4, borderRadius: '50%',
                    background: accent, opacity: 0.7,
                  }} />
                  <span style={{
                    minWidth: 0, flex: 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{n}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Bottom: Vote CTA — match tcv-btn-primary scale (13px font, 10×22 pad) */}
        <span
          className="inline-flex w-fit items-center gap-1.5 rounded-[10px] font-['Outfit',sans-serif] text-white no-underline transition-all"
          style={{
            background: accent,
            padding: '10px 20px',
            fontSize: 13, fontWeight: 700, letterSpacing: '0.02em',
            boxShadow: `0 4px 14px ${accentSoft}`,
          }}
        >
          Balsuok
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </span>
      </div>

      {/* ── RIGHT side: magazine mosaic (58% width) ── */}
      {tops.length > 0 && (
        <div
          className="absolute right-4 top-4 bottom-4"
          style={{
            width: '58%',
            display: 'grid',
            gridTemplateColumns: '3fr 2fr',
            gridTemplateRows: '3fr 2fr',
            gap: 7,
          }}
        >
          <div style={{ gridColumn: 1, gridRow: 1 }}><Tile entry={tops[0]} size="big" /></div>
          <div style={{ gridColumn: 2, gridRow: 1 }}><Tile entry={tops[1]} size="md" /></div>
          <div
            style={{
              gridColumn: '1 / -1', gridRow: 2,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 7,
            }}
          >
            <Tile entry={tops[2]} size="sm" />
            <Tile entry={tops[3]} size="sm" />
            <Tile entry={tops[4]} size="sm" />
          </div>
        </div>
      )}
    </Link>
  )
}

/* ────────────────────────────── Chart bottom sheet ──────────────────────────────
   Mobile-first full-screen sheet, slides up from bottom. Lazy-loads full top
   (30/40 entries) + balsavimo statusą. Inline vote per /api/top/vote — same
   API kaip /top30 ir /top40 puslapiuose, todėl balsų limitai sutampa. */

type ChartSheetEntry = {
  position: number
  track_id: number
  title: string
  artist: string
  cover_url: string | null
  artist_image: string | null
  is_new?: boolean
  weeks_in_top?: number
  prev_position?: number | null
}

function ChartBottomSheet({
  open, onClose, topType, title, accent,
}: {
  open: boolean
  onClose: () => void
  topType: 'lt_top30' | 'top40'
  title: string
  accent: string
}) {
  const [entries, setEntries] = useState<ChartSheetEntry[]>([])
  const [weekId, setWeekId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [votedIds, setVotedIds] = useState<number[]>([])
  const [votesRemaining, setVotesRemaining] = useState<number>(5)
  const [voteErr, setVoteErr] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<number | null>(null)

  // Load entries + vote status when opened. Reset state when closed so a fresh
  // open re-fetches (rotating-week scenarios + chart switches).
  useEffect(() => {
    if (!open) return
    let cancel = false
    setLoading(true)
    setVoteErr(null)
    fetch(`/api/top/entries?type=${topType}`)
      .then(r => r.json())
      .then(d => {
        if (cancel) return
        const wId = d.week?.id ?? null
        setWeekId(wId)
        const list: ChartSheetEntry[] = (d.entries || []).map((e: any, i: number) => ({
          position: e.position ?? (i + 1),
          track_id: e.track_id,
          title: sanitizeTitle(e.tracks?.title || ''),
          artist: e.tracks?.artists?.name || '',
          cover_url: e.tracks?.cover_url || null,
          artist_image: e.tracks?.artists?.cover_image_url || null,
          is_new: e.is_new,
          weeks_in_top: e.weeks_in_top,
          prev_position: e.prev_position,
        }))
        setEntries(list)
        if (wId) {
          fetch(`/api/top/vote?week_id=${wId}`).then(r => r.json()).then(v => {
            if (cancel) return
            setVotedIds(v.voted_track_ids || [])
            setVotesRemaining(v.votes_remaining ?? 5)
          }).catch(() => {})
        }
      })
      .catch(() => { if (!cancel) setEntries([]) })
      .finally(() => { if (!cancel) setLoading(false) })
    return () => { cancel = true }
  }, [open, topType])

  // Lock body scroll while sheet is open. Restore previous overflow on unmount.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const handleVote = async (trackId: number) => {
    if (!weekId || votedIds.includes(trackId) || pendingId === trackId) return
    if (votesRemaining <= 0) {
      setVoteErr('Pasiekei savaitės balsų limitą')
      setTimeout(() => setVoteErr(null), 2500)
      return
    }
    setPendingId(trackId)
    try {
      const res = await fetch('/api/top/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_id: trackId, week_id: weekId, vote_type: 'like' }),
      })
      const d = await res.json()
      if (res.ok) {
        setVotedIds(p => [...p, trackId])
        setVotesRemaining(p => Math.max(0, p - 1))
      } else {
        setVoteErr(d.error || 'Klaida')
        setTimeout(() => setVoteErr(null), 2500)
      }
    } catch {
      setVoteErr('Tinklo klaida')
      setTimeout(() => setVoteErr(null), 2500)
    } finally {
      setPendingId(null)
    }
  }

  if (!open) return null
  if (typeof document === 'undefined') return null

  // Portal į body — escape'ina bet kokį parent transform/filter/overflow,
  // kuris galėtų sulaužyti `position: fixed` (iOS Safari ypač jautrus).
  return createPortal((
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} balsavimas`}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1200,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)',
        animation: 'cbs-fade 0.18s ease-out',
      }}
      onClick={onClose}
    >
      <style>{`
        @keyframes cbs-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes cbs-slide { from { transform: translateY(100%) } to { transform: translateY(0) } }
        @keyframes cbs-spin { to { transform: rotate(360deg) } }
        .cbs-vote-btn { transition: all 0.15s; }
        .cbs-vote-btn:active:not(:disabled) { transform: scale(0.94); }
      `}</style>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, maxHeight: '90vh',
          background: 'linear-gradient(180deg, #0f1320 0%, #060912 100%)',
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          borderTop: `2px solid ${accent}`,
          boxShadow: '0 -24px 80px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column',
          animation: 'cbs-slide 0.28s cubic-bezier(0.32,0.72,0.28,1)',
          animationFillMode: 'forwards',
        }}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
          <div style={{ width: 44, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.22)' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 18px 12px', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: accent, fontFamily: 'Outfit,sans-serif' }}>
              Balsuoti · šios savaitės topas
            </span>
            <h2 style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 900, color: '#fff', fontFamily: 'Outfit,sans-serif', letterSpacing: '-0.02em', lineHeight: 1.05 }}>
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Uždaryti"
            style={{
              flexShrink: 0, width: 38, height: 38, borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.06)',
              color: '#fff', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>

        {/* Vote status bar */}
        <div style={{
          margin: '0 18px 8px', padding: '9px 12px', borderRadius: 10,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}>
          <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>
            Balsų liko: <span style={{ color: accent, fontWeight: 900 }}>{votesRemaining}</span>
          </span>
          <Link
            href={topType === 'lt_top30' ? '/top30' : '/top40'}
            style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.65)', textDecoration: 'none', fontWeight: 700 }}
          >
            Visas puslapis →
          </Link>
        </div>

        {voteErr && (
          <div style={{ margin: '0 18px 8px', padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.4)', color: '#fecaca', fontSize: 12, fontWeight: 600 }}>
            {voteErr}
          </div>
        )}

        {/* Entries list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 18px', WebkitOverflowScrolling: 'touch' }}>
          {loading && entries.length === 0 && (
            <div style={{ padding: '40px 0', display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 28, height: 28, border: `2.5px solid ${accent}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'cbs-spin 0.7s linear infinite' }} />
            </div>
          )}
          {entries.map(e => {
            const c = e.cover_url || e.artist_image
            const voted = votedIds.includes(e.track_id)
            const pending = pendingId === e.track_id
            const trend =
              e.is_new ? 'new'
              : e.prev_position == null ? 'same'
              : e.position < e.prev_position ? 'up'
              : e.position > e.prev_position ? 'down'
              : 'same'
            return (
              <div
                key={e.track_id || e.position}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 6px', borderRadius: 10,
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                {/* Position */}
                <div style={{ width: 28, textAlign: 'center', flexShrink: 0 }}>
                  <div style={{
                    fontSize: 16, fontWeight: 900, color: e.position <= 3 ? accent : 'rgba(255,255,255,0.9)',
                    fontFamily: 'Outfit,sans-serif', lineHeight: 1,
                  }}>{e.position}</div>
                  {trend !== 'same' && (
                    <div style={{ fontSize: 8.5, fontWeight: 700, color: trend === 'up' ? '#22c55e' : trend === 'down' ? '#ef4444' : accent, marginTop: 2, lineHeight: 1 }}>
                      {trend === 'up' ? '▲' : trend === 'down' ? '▼' : 'NEW'}
                    </div>
                  )}
                </div>
                {/* Cover */}
                <div style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.05)' }}>
                  {c && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proxyImg(c)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  )}
                </div>
                {/* Title + artist */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: '#fff', fontFamily: 'Outfit,sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.005em' }}>{e.title}</p>
                  <p style={{ margin: '1px 0 0', fontSize: 11.5, color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.artist}</p>
                </div>
                {/* Vote button */}
                <button
                  className="cbs-vote-btn"
                  onClick={() => handleVote(e.track_id)}
                  disabled={voted || pending || votesRemaining <= 0}
                  aria-label={voted ? 'Jau balsavai' : 'Balsuoti'}
                  style={{
                    flexShrink: 0,
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '7px 11px', borderRadius: 999,
                    border: voted ? `1.5px solid ${accent}` : '1.5px solid rgba(255,255,255,0.18)',
                    background: voted ? `${accent}` : 'rgba(255,255,255,0.04)',
                    color: voted ? '#fff' : 'rgba(255,255,255,0.85)',
                    fontFamily: 'Outfit,sans-serif', fontSize: 11.5, fontWeight: 800,
                    cursor: (voted || pending || votesRemaining <= 0) ? 'default' : 'pointer',
                    opacity: !voted && votesRemaining <= 0 ? 0.4 : 1,
                  }}
                >
                  {pending ? (
                    <span style={{ width: 12, height: 12, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'cbs-spin 0.7s linear infinite' }} />
                  ) : voted ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12l5 5L20 7"/>
                    </svg>
                  ) : null}
                  <span>{voted ? 'Balsavai' : 'Balsuok'}</span>
                </button>
              </div>
            )
          })}
          {!loading && entries.length === 0 && (
            <p style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Topas dar tuščias.</p>
          )}
        </div>
      </div>
    </div>
  ), document.body)
}

/* ────────────────────────────── Mobile chart slide ──────────────────────────────
   Asimetrinis mosaic + swipe-down gestural. Tap atidaro sheet'ą; swipe-down
   tą patį, su pull animacija. Kortelė neslinkamos juostos child'as — todėl
   horizontal swipe NETURI būti perimtas (ignore'uojam, jei dx > dy). */

function MobileChartSlide({
  slide, onOpen,
}: {
  slide: HeroSlide
  onOpen: () => void
}) {
  const tops = slide.chartTops || []
  const accent = slide.type === 'chart_lt' ? '#f97316' : '#3b82f6'
  const accentShadow = slide.type === 'chart_lt' ? 'rgba(249,115,22,0.45)' : 'rgba(59,130,246,0.45)'
  const cover = (t: TopEntry | undefined) => t ? (t.cover_url || t.artist_image) : null

  // Plain onClick — kaip news/event preview kortelės. Joks touch handler
  // nereikalingas: paprastas tap'as atidaro reels (kuris pats turi swipe-down
  // logiką balsavimo sheet'ui).
  const handleClick = () => onOpen()

  // Top 3 only (ne 4) — #1 didžiausias top half, #2 + #3 50/50 apačioje.
  const t1 = tops[0]
  const t2 = tops[1]
  const t3 = tops[2]

  // Render single tile — #1 (big) gauna title + artist, #2/#3 tik artist'o
  // vardą (paprastesnis preview, kad nesusikrautų teksto kiekiu).
  const renderTile = (t: TopEntry | undefined, big: boolean) => {
    const c = cover(t)
    if (!t || !c) return <div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: 8 }} />
    const numSize = big ? 13 : 10.5
    const numPad = big ? '3px 8px' : '2px 6px'
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={proxyImg(c)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.25) 45%, transparent 70%)' }} />
        <span style={{
          position: 'absolute', top: 5, left: 5, padding: numPad, borderRadius: 6,
          background: t.pos === 1 ? accent : 'rgba(0,0,0,0.82)',
          color: '#fff', fontSize: numSize, fontWeight: 900,
          fontFamily: 'Outfit,sans-serif', lineHeight: 1,
          boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
        }}>{t.pos}</span>
        {big ? (
          // #1 — title + artist (du eilutes)
          <div style={{ position: 'absolute', left: 8, right: 8, bottom: 6 }}>
            <p style={{
              margin: 0, fontSize: 12.5, fontWeight: 900, color: '#fff',
              fontFamily: 'Outfit,sans-serif',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              letterSpacing: '-0.01em', textShadow: '0 1px 4px rgba(0,0,0,0.95)',
              lineHeight: 1.15,
            }}>{t.title}</p>
            <p style={{
              margin: '1px 0 0', fontSize: 10.5, fontWeight: 600, color: 'rgba(255,255,255,0.85)',
              fontFamily: 'Outfit,sans-serif',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              textShadow: '0 1px 3px rgba(0,0,0,0.9)',
              lineHeight: 1.2,
            }}>{t.artist}</p>
          </div>
        ) : (
          // #2/#3 — tik artist'o vardas
          <p style={{
            position: 'absolute', left: 5, right: 5, bottom: 4,
            margin: 0, fontSize: 10.5, fontWeight: 800, color: '#fff',
            fontFamily: 'Outfit,sans-serif',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            letterSpacing: '-0.005em', textShadow: '0 1px 4px rgba(0,0,0,0.95)',
            lineHeight: 1.15,
          }}>{t.artist}</p>
        )}
      </>
    )
  }

  return (
    <button
      onClick={handleClick}
      style={{
        flexShrink: 0, position: 'relative', borderRadius: 16, overflow: 'hidden',
        border: `2px solid ${accent}`,
        background: '#000', cursor: 'pointer', padding: 0, width: 188, height: 290,
        scrollSnapAlign: 'start',
        transition: 'border-color 0.15s, transform 0.15s',
        boxShadow: '0 8px 22px rgba(0,0,0,0.45)',
        textAlign: 'left',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* BG gradient base — absolutus, neblokuoja flex layout'o */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: slide.type === 'chart_lt'
          ? `linear-gradient(180deg, rgba(249,115,22,0.32) 0%, #0a0e1a 30%, #050810 100%)`
          : `linear-gradient(180deg, rgba(59,130,246,0.32) 0%, #0a0e1a 30%, #050810 100%)`,
      }} />

      {/* CHIP — virš kortelės */}
      <div style={{ position: 'relative', zIndex: 2, padding: '10px 12px 8px', display: 'flex', justifyContent: 'flex-start' }}>
        <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 900, color: '#fff', background: accent, fontFamily: 'Outfit,sans-serif', letterSpacing: '0.08em', textTransform: 'uppercase', boxShadow: '0 2px 10px rgba(0,0,0,0.4)' }}>
          {slide.chip}
        </span>
      </div>

      {/* MOSAIC — flex'as imantis likusios erdvės. #1 70% aukščio, #2+#3 30%. */}
      <div style={{
        position: 'relative', zIndex: 2, flex: 1,
        padding: '0 12px',
        display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0,
      }}>
        <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', boxShadow: '0 5px 18px rgba(0,0,0,0.5)', flex: '1.55 1 0', minHeight: 0 }}>
          {renderTile(t1, true)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, flex: '1 1 0', minHeight: 0 }}>
          <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', boxShadow: '0 3px 12px rgba(0,0,0,0.45)' }}>
            {renderTile(t2, false)}
          </div>
          <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', boxShadow: '0 3px 12px rgba(0,0,0,0.45)' }}>
            {renderTile(t3, false)}
          </div>
        </div>
      </div>

      {/* CTA "Balsuok" — flex item apačioje, fixed dydžio. Niekas po juo nelenda. */}
      <div style={{ position: 'relative', zIndex: 2, padding: '8px 12px 10px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '9px 12px', borderRadius: 10,
          background: accent, color: '#fff',
          fontFamily: 'Outfit,sans-serif', fontSize: 12, fontWeight: 900,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          boxShadow: `0 4px 14px ${accentShadow}`,
        }}>
          Balsuok
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </div>
      </div>
    </button>
  )
}

/* ────────────────────────────── HScroll wrapper ──────────────────────────────
   Wrap horizontal scroll containers su mini ◄ ► buttons dešinėj pusėj —
   desktop only. Click → scrollLeft/scrollRight by container width × 0.85. */

function HScrollHints() {
  // Component scoped — Naudojama hp-scroll containers per ref forwarding.
  // Šiuo momentu generic — prisirišame per parent .hp-scroll-wrap class'ę.
  return null
}

export default function Home() {
  const { dk } = useSite()

  const [chartTab, setChartTab] = useState<'lt' | 'world'>('lt')

  /* ── Reels state ── */
  const [reelsOpen, setReelsOpen] = useState(false)
  const [reelsIdx, setReelsIdx] = useState(0)

  /* ── Chart bottom sheet state (mobile + naudojama bet kur) ── */
  const [chartSheet, setChartSheet] = useState<{ topType: 'lt_top30' | 'top40'; title: string; accent: string } | null>(null)

  /* ── Modal state ── */
  // Track/Album modal'ai homepage'e — atidaromi spaudžiant track/album card.
  // openTrack: track obj iš homepage'o payload'o (lengvas info — modal'as
  // dofetchina papildomą per /api/tracks/[id]).
  // openAlbumId: tik ID — AlbumInfoModal pats fetch'ina pilnus duomenis.
  const [openTrack, setOpenTrack] = useState<Track | null>(null)
  const [openAlbumId, setOpenAlbumId] = useState<number | null>(null)
  const [openAlbumPreview, setOpenAlbumPreview] = useState<{ title: string; cover_image_url?: string | null; year?: number | null } | null>(null)

  /* ── List modal state — pilnam sekcijos sąrašui per HomeListModal'ą ──
   * key — sekcijos identifikatorius: 'tracks-lt', 'tracks-world', 'albums-lt',
   * 'albums-world', 'upcoming', 'news', 'events-lt', 'events-world'. */
  const [listModal, setListModal] = useState<string | null>(null)

  /* ── Hero state ── */
  const [ltTop, setLtTop] = useState<TopEntry[]>([])
  const [worldTop, setWorldTop] = useState<TopEntry[]>([])
  const [tracks, setTracks] = useState<Track[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
  // „Greitai pasirodys" — bendras (LT + INTL) sąrašas, dar neišleistų albumų
  // (is_upcoming=true arba release_date ateityje). Vienas lane'as, sortinta
  // pagal artimiausią datą ASC.
  const [upcomingAlbums, setUpcomingAlbums] = useState<Album[]>([])
  // Total counts iš DB (po dedupe, prieš slice). Rodom „+N" badge'uose, kad
  // user'is matytų realų DB count'ą, ne tik 10 UI items.
  const [totals, setTotals] = useState<{ tracksLt: number; tracksWorld: number; albumsLt: number; albumsWorld: number; upcoming: number }>({ tracksLt: 0, tracksWorld: 0, albumsLt: 0, albumsWorld: 0, upcoming: 0 })
  const [artists, setArtists] = useState<Artist[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [news, setNews] = useState<NewsItem[]>([])
  const [pageReady, setPageReady] = useState(false)
  // overlayVisible — kontroliuoja kada pageReady overlay pašalinamas iš DOM.
  // pageReady true → CSS .overlay-fade-out 320ms fade → po 350ms unmount.
  const [overlayVisible, setOverlayVisible] = useState(true)
  // Per-section progress feedback'as buvo padarytas, bet po greitaveikos
  // optimizacijų (Promise.all batch'inimas, CDN cache, batched news+songs)
  // visi 7 fetch'ai paprastai baigiasi <300ms — naudotojas matydavo per-step
  // dash'us tik 1-2 frame'us. Atgal grąžintas paprastas centrinis equalizer'is
  // toks pat kaip MasterSearch'o BigEqualizer (.eq-loader-big globalsCSS).
  useEffect(() => {
    if (!pageReady) return
    const t = setTimeout(() => setOverlayVisible(false), 350)
    return () => clearTimeout(t)
  }, [pageReady])
  // Fail-safe: jei kuris nors fetch'as „kabo" (pvz. /api/home/latest cold-start
  // > Vercel function timeout), po 7s vis tiek paslepiam loader'į, kad
  // user'is matytų bent dalinę homepage'o (kitos sekcijos lazyloadina arba
  // gauna duomenis vėliau). Anksčiau toks scenario'as palikdavo white screen.
  useEffect(() => {
    const t = setTimeout(() => setPageReady(true), 7000)
    return () => clearTimeout(t)
  }, [])
  const mountTime = useRef(Date.now())
  const readyBits = useRef({ hero: false, tops: false, tracks: false })
  const tryReady = useRef(() => {
    const { hero, tops, tracks } = readyBits.current
    if (hero && tops && tracks) {
      // Anksčiau: setTimeout(..., Math.max(0, 600 - elapsed)) — 600ms
      // artificial minimum delay (sukėlė "ilgokai kraunasi" jausmą net
      // kai duomenys atvažiavo per 200ms). Dabar be delay'aus.
      setPageReady(true)
    }
  })
  const filtEvt = events
  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>([])
  const [heroIdx, setHeroIdx] = useState(0)

  /* Horizontal scroll arrows — ant ne-touch įrenginių prie kiekvieno .hp-scroll
     parent'o pridedam ◄ ► mygtukus. Mygtukai scrollina 85% conteinerio pločio
     ir slepia/rodo save pagal scrollLeft poziciją. */
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return
    const cleanups: Array<() => void> = []
    const attach = () => {
      document.querySelectorAll<HTMLElement>('.hp-scroll').forEach(el => {
        if (el.dataset.scrollAttached === '1') return
        const parent = el.parentElement
        if (!parent) return
        // Sekcijos su „+N" (StickyMoreButton) NEgauna injected scroll rodyklių —
        // dešinioji rodyklė (right:-8px) persidengdavo su +N button'u. Tose
        // sekcijose +N + native trackpad scroll'as pakanka. 2026-05-29.
        if (parent.querySelector('[data-sticky-more]')) { el.dataset.scrollAttached = '1'; return }
        el.dataset.scrollAttached = '1'
        if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative'
        const btnL = document.createElement('button')
        btnL.className = 'hp-scroll-arrow hp-scroll-arrow-l'
        btnL.type = 'button'
        btnL.setAttribute('aria-label', 'Slinkti į kairę')
        btnL.textContent = '‹'
        const btnR = document.createElement('button')
        btnR.className = 'hp-scroll-arrow hp-scroll-arrow-r'
        btnR.type = 'button'
        btnR.setAttribute('aria-label', 'Slinkti į dešinę')
        btnR.textContent = '›'
        const update = () => {
          const maxScroll = el.scrollWidth - el.clientWidth - 4
          btnL.style.opacity = el.scrollLeft > 4 ? '1' : '0'
          btnL.style.pointerEvents = el.scrollLeft > 4 ? 'auto' : 'none'
          btnR.style.opacity = el.scrollLeft < maxScroll ? '1' : '0'
          btnR.style.pointerEvents = el.scrollLeft < maxScroll ? 'auto' : 'none'
        }
        btnL.onclick = () => el.scrollBy({ left: -el.clientWidth * 0.85, behavior: 'smooth' })
        btnR.onclick = () => el.scrollBy({ left: el.clientWidth * 0.85, behavior: 'smooth' })
        el.addEventListener('scroll', update, { passive: true })
        parent.appendChild(btnL)
        parent.appendChild(btnR)
        update()
        cleanups.push(() => {
          el.removeEventListener('scroll', update)
          btnL.remove()
          btnR.remove()
          delete el.dataset.scrollAttached
        })
      })
    }
    // Initial attach + retry kelis kartus, nes content async render'inasi.
    attach()
    const t1 = setTimeout(attach, 400)
    const t2 = setTimeout(attach, 1200)
    const t3 = setTimeout(attach, 3000)
    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3)
      cleanups.forEach(fn => fn())
    }
  }, [])

  const [heroImgLoaded, setHeroImgLoaded] = useState(false)
  const [heroVideoPlaying, setHeroVideoPlaying] = useState(false)
  const [newsSongs, setNewsSongs] = useState<Record<number, { youtube_url: string; title: string | null; artist_name: string | null }[]>>({})
  const timerRef = useRef<any>(null)
  const heroRef = useRef<HTMLElement>(null)

  const parseTop = (entries: any[]): TopEntry[] => entries.slice(0, 7).map(e => {
    const prev = e.prev_position; const cur = e.position
    const trend = e.is_new ? 'new' : !prev ? 'same' : cur < prev ? 'up' : cur > prev ? 'down' : 'same'
    return { pos: e.position, track_id: e.track_id, title: sanitizeTitle(e.tracks?.title || ''), artist: e.tracks?.artists?.name || '', cover_url: e.tracks?.cover_url || null, artist_image: e.tracks?.artists?.cover_image_url || null, trend, wks: e.weeks_in_top, slug: e.tracks?.slug, artist_slug: e.tracks?.artists?.slug }
  })

  useEffect(() => {
    // Homepage fetch'ai paraleliai. Po 2026-05-28 optimizacijos:
    //   - /api/home/latest grąžina tracks + albums vienu round-trip'u, su
    //     server-side LT/World lane split, per-artist dedupe (tracks),
    //     90d window. Cache'inamas su tag'u (home:tracks-latest, home:albums-latest).
    //   - /api/news apriboja į 30 d. ir 12 įrašų (anksčiau 30 modern + 30 legacy).
    //   - /api/artists fetch'as PAŠALINTAS — "Atrask atlikėjus" UI yra po
    //     `{false &&` toggle'u (kol kas paslėpta). Brangus reverse'as DB nieko.
    fetch('/api/top/entries?type=lt_top30').then(r => r.json()).then(d => { setLtTop(parseTop(d.entries || [])); readyBits.current.tops = true; tryReady.current() }).catch(() => { readyBits.current.tops = true; tryReady.current() })
    fetch('/api/top/entries?type=top40').then(r => r.json()).then(d => setWorldTop(parseTop(d.entries || []))).catch(() => {})

    // tracks + albums vienu fetch'u — { tracks: { lt, world }, albums: { lt, world } }
    // Po Pro plan upgrade DB queries grįžo ~200ms; 8s AbortController saugiklis
    // cold-start'o atvejui. pageReady fail-safe per 7s vis tiek suveikia jei
    // network'as visiškai užkimba.
    const tracksAbort = new AbortController()
    const tracksTimer = setTimeout(() => tracksAbort.abort(), 8000)
    fetch('/api/home/latest', { signal: tracksAbort.signal })
      .then(r => r.json())
      .then(d => {
        clearTimeout(tracksTimer)
        return d
      })
      .then(d => {
        const tLt = (d.tracks?.lt || []) as any[]
        const tWorld = (d.tracks?.world || []) as any[]
        // Concat'inam į flat array — existing render skiria lane'us per client-side
        // `isLT()` filtrą pagal `artists.country`. Backend jau pre-filtravo per
        // lane'ą, tad client-side filtr'as veiks idempotentiškai (LT eis į LT
        // lane'ą, World į World lane'ą).
        setTracks([...tLt, ...tWorld])
        readyBits.current.tracks = true
        tryReady.current()
        const aLt = (d.albums?.lt || []) as any[]
        const aWorld = (d.albums?.world || []) as any[]
        setAlbums([...aLt, ...aWorld])
        setUpcomingAlbums((d.upcoming || []) as any[])
        setTotals({
          tracksLt: d.tracks?.totalLt || 0,
          tracksWorld: d.tracks?.totalWorld || 0,
          albumsLt: d.albums?.totalLt || 0,
          albumsWorld: d.albums?.totalWorld || 0,
          upcoming: d.upcomingTotal || 0,
        })
      })
      .catch(() => { clearTimeout(tracksTimer); readyBits.current.tracks = true; tryReady.current() })

    fetch('/api/events?limit=24').then(r => r.json()).then(d => setEvents(d.events || [])).catch(() => {})
    // News + songs vienu request'u. `since_days=30` apriboja į pastarąsias 30 d.
    // tiek modern, tiek legacy news. Limit 12 vietoj 30 — hero reels rodo
    // max ~10 slide'ų; daugiau payload tik teršia bandwidth'ą.
    fetch('/api/news?limit=12&include=songs&since_days=30')
      .then(r => r.json())
      .then(d => {
        const newsList = d.news || []
        setNews(newsList)
        const songsMap: Record<number, any[]> = {}
        for (const n of newsList) {
          if (Array.isArray(n.songs) && n.songs.length > 0) {
            songsMap[n.id] = n.songs
          }
        }
        setNewsSongs(songsMap)
      })
      .catch(() => {})
  }, [])

  /* ── Hero slides ── */
  useEffect(() => {
    const slides: HeroSlide[] = []
    if (ltTop.length > 0) {
      slides.push({
        type: 'chart_lt', chip: 'LT TOP 30', chipBg: '#ea580c',
        title: 'LT TOP 30',
        subtitle: ltTop.slice(0, 3).map(t => `${t.pos}. ${t.title}`).join(' · '),
        href: '/top30',
        bgImg: ltTop[0]?.artist_image || ltTop[0]?.cover_url || null,
        chartTops: ltTop.slice(0, 5),
      } as any)
    }
    if (worldTop.length > 0) {
      slides.push({
        type: 'chart_world', chip: 'TOP 40', chipBg: '#1d4ed8',
        title: 'TOP 40',
        subtitle: worldTop.slice(0, 3).map(t => `${t.pos}. ${t.title}`).join(' · '),
        href: '/top40',
        bgImg: worldTop[0]?.artist_image || worldTop[0]?.cover_url || null,
        chartTops: worldTop.slice(0, 5),
      } as any)
    }
    news.slice(0, 30).forEach(n => {
      const typeLT = n.type === 'review' ? 'Recenzija' : n.type === 'interview' ? 'Interviu' : n.type === 'report' ? 'Reportažas' : 'Naujiena'
      const songs = newsSongs[n.id] || []
      const song = songs.find((s: any) => s.youtube_url)
      slides.push({
        type: 'news', chip: typeLT.toUpperCase(), chipBg: '#1d4ed8',
        title: sanitizeTitle(n.title),
        subtitle: n.excerpt ? smartTruncate(n.excerpt, 180) : '',
        bgImg: n.image_title_url || n.image_small_url,
        href: `/news/${n.slug}`,
        videoId: extractYouTubeId(song?.youtube_url || null),
        songTitle: song?.title || null,
        songArtist: song?.artist_name || n.artist?.name || null,
        songCover: null,
        artist: n.artist ? { name: n.artist.name, slug: n.artist.slug, image: n.artist.cover_image_url || null } : null,
      })
    })
    events.slice(0, 3).forEach(ev => {
      const dateRaw = (ev as any).start_date || ev.event_date
      const d = dateRaw ? new Date(dateRaw) : null
      const dateStr = d && !isNaN(d.getTime()) ? `${d.getDate()} ${MONTHS_FULL_LT[d.getMonth()]} ${d.getFullYear()} m.` : ''
      const venue = ev.venue_name || ev.venues?.name || ev.venue_custom || ''
      const city = ev.city || ev.venues?.city || ''
      const cityVenue = [city, venue].filter(Boolean).join(', ')
      const artistList = (ev.event_artists || [])
        .filter(ea => ea.artists?.name)
        .map(ea => ea.artists!.name)
      const artistText = artistList.length > 0
        ? artistList.slice(0, 3).join(', ') + (artistList.length > 3 ? ` +${artistList.length - 3}` : '')
        : sanitizeTitle(ev.title)  // fallback to title if no artists
      const firstArtist = (ev.event_artists || []).find(ea => ea.artists?.cover_image_url)
      slides.push({
        type: 'event', chip: 'RENGINYS', chipBg: '#047857',
        title: artistText,  // ARTISTS as primary text
        subtitle: [dateStr, cityVenue].filter(Boolean).join(' · '),
        bgImg: ev.image_small_url || ev.cover_image_url || null,
        href: `/renginiai/${ev.slug}`,
        artist: firstArtist?.artists ? { name: firstArtist.artists.name, slug: firstArtist.artists.slug, image: firstArtist.artists.cover_image_url || null } : null,
      })
    })
    if (!slides.length) slides.push({
      type: 'promo', chip: '🇱🇹 LIETUVIŠKA MUZIKA', chipBg: '#f97316',
      title: 'music.lt',
      subtitle: 'Visi Lietuvos atlikėjai vienoje vietoje',
      href: '/atlikejai',
    })
    setHeroSlides(slides)
    setHeroIdx(0)
    readyBits.current.hero = true
    tryReady.current()
  }, [news, events, newsSongs, ltTop, worldTop])

  useEffect(() => {
    if (!heroSlides.length || heroVideoPlaying) return
    timerRef.current = setTimeout(() => {
      setHeroImgLoaded(false)
      setHeroVideoPlaying(false)
      setHeroIdx(p => (p + 1) % heroSlides.length)
    }, 8000)
    return () => clearTimeout(timerRef.current)
  }, [heroIdx, heroSlides.length, heroVideoPlaying])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!heroSlides.length) return
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setHeroImgLoaded(false); setHeroVideoPlaying(false)
        setHeroIdx(p => (p - 1 + heroSlides.length) % heroSlides.length)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setHeroImgLoaded(false); setHeroVideoPlaying(false)
        setHeroIdx(p => (p + 1) % heroSlides.length)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [heroSlides.length])

  useEffect(() => {
    if (!heroSlides.length) return
    const next = heroSlides[(heroIdx + 1) % heroSlides.length]
    if (next?.bgImg) { const img = new Image(); img.src = next.bgImg }
  }, [heroIdx, heroSlides])

  /* ── "seen" tracking ── */
  const [seenSlides, setSeenSlides] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('reels_seen') || '[]') as string[]) }
    catch { return new Set() }
  })

  const hero = heroSlides[heroIdx]
  const chartData = chartTab === 'lt' ? ltTop : worldTop

  return (
    <>
      <style>{`
        .hp{font-family:'DM Sans',sans-serif;background:var(--bg-body);min-height:100vh}
        @keyframes hp-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        @keyframes hp-img-in{from{opacity:0;transform:scale(1.04)}to{opacity:1;transform:scale(1)}}
        @keyframes hp-pulse{0%,100%{opacity:.05}50%{opacity:.08}}
        .hp-skel{background:var(--homepage-skeleton-bg);animation:hp-pulse 1.8s ease-in-out infinite}
        .hp-scroll{overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;scroll-behavior:smooth}
        .hp-hero-slot{width:580px;flex-shrink:0;min-width:0}
        /* >=1400px: siauresnės kortelės, kad 3-čia naujiena aiškiau matytųsi
           (peek ~38% vietoj ankstesnio ~10%). Edvardo prašymu 2026-05-31. */
        @media(min-width:1400px){.hp-hero-slot{width:calc((100% - 64px) / 2.3)}}
        @media(max-width:768px){.hp-hero-slot{width:calc(88vw)}}
        .hp-scroll::-webkit-scrollbar{display:none}
        /* 2026-05-29: desktop side-scroll rodyklės pašalintos (Edvardo prašymu) —
           native trackpad/shift-scroll + „Visi" modalas pakanka. display:none
           paslepia injected ‹ › mygtukus visur (anksčiau tik coarse pointer'iuose). */
        .hp-scroll-arrow{display:none !important}
        .hp-scroll-arrow:hover{background:var(--accent-orange);color:#fff;border-color:var(--accent-orange);transform:translateY(-50%) scale(1.08)}
        .hp-scroll-arrow-l{left:-8px}
        .hp-scroll-arrow-r{right:-8px}
        @media (pointer: coarse){.hp-scroll-arrow{display:none}}
        .hp-pill{cursor:pointer;padding:5px 13px;border-radius:18px;font-size:11px;font-weight:700;border:1px solid var(--border-default);color:var(--text-muted);background:transparent;transition:all .15s;white-space:nowrap;font-family:'DM Sans',sans-serif}
        .hp-pill.hp-act{background:var(--homepage-pill-active);border-color:${dk ? 'rgba(29,78,216,.32)' : 'rgba(29,78,216,.2)'};color:var(--accent-blue)}
        .hp-pill:hover{color:${dk ? '#b8d0e8' : '#1a2a40'};border-color:var(--border-strong)}
        .hp-tr{transition:background .1s}
        .hp-tr:hover{background:var(--bg-hover)!important}
        .hp-card{background:var(--card-bg);border:1px solid var(--border-default);border-radius:11px;text-decoration:none;transition:border-color .15s,background .15s}
        .hp-card:hover{border-color:var(--border-strong);background:var(--card-hover)}
        .hp-art:hover .hp-art-img{transform:scale(1.06)}
        .hp-disc-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .hp-hero-v2{display:block}
        @media(max-width:768px){.hp-hero-v2{display:none}}
        .hp-feed-strip{display:none}
        .hp-mobile-chart{display:none}
        @media(max-width:960px){.hp-feed-strip{display:flex}.hp-mobile-chart{display:block}}

        /* ── Reels overlay — horizontal Stories ── */
        .hp-reels{position:fixed;inset:0;z-index:300;background:#000;overflow:hidden;touch-action:pan-x}
        .hp-reels-track{height:100%;display:flex;flex-direction:row;will-change:transform;transition:transform .32s cubic-bezier(.4,0,.2,1)}
        .hp-reels-slide{height:100vh;width:100vw;flex-shrink:0;display:flex;flex-direction:column;background:#000;position:relative;overflow:hidden}

        /* Image zone — video pops on top */
        .hp-reels-img{flex:0 0 55%;position:relative;overflow:hidden}
        .hp-reels-img img{width:100%;height:100%;object-fit:cover}
        .hp-reels-img::after{content:'';position:absolute;bottom:0;left:0;right:0;height:40%;background:linear-gradient(to top,#000,transparent)}
        .hp-reels-video-popup{position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;background:rgba(0,0,0,0.92);animation:hp-in .2s ease both}
        .hp-reels-video-popup iframe{width:100%;flex:1;border:none}

        .hp-reels-info{flex:1;padding:0 20px 28px;display:flex;flex-direction:column;justify-content:flex-start;position:relative;margin-top:-32px;z-index:1}

        /* ── Hero cinematic ── */
        .hp-hero{position:relative;overflow:hidden;min-height:420px;display:flex;background:var(--bg-body)}
        .hp-hero-bg{position:absolute;top:0;bottom:0;left:35%;right:340px;z-index:0;overflow:hidden;display:flex;align-items:stretch;justify-content:flex-end;-webkit-mask-image:linear-gradient(to bottom, black 65%, transparent 100%);mask-image:linear-gradient(to bottom, black 65%, transparent 100%)}
        .hp-hero-bg img{width:auto;height:100%;max-width:100%;object-fit:cover;object-position:center 25%;display:block;animation:hp-img-in .8s ease both;-webkit-mask-image:linear-gradient(to right, transparent 0%, black 12%, black 100%);mask-image:linear-gradient(to right, transparent 0%, black 12%, black 100%)}
        .hp-hero-grad{display:none}
        .hp-hero-content{position:relative;z-index:2;display:flex;align-items:stretch;max-width:1360px;margin:0 auto;padding:0 20px;width:100%;flex:1}
        .hp-hero-content > .hp-hero-bg{position:absolute;top:0;bottom:0;left:35%;right:340px;z-index:0;overflow:hidden;display:flex;align-items:stretch;justify-content:flex-end}
        .hp-hero-spacer{flex:1;min-height:120px}
        .hp-hero-left{flex:1;display:flex;flex-direction:column;justify-content:flex-end;padding:36px 0 40px;min-width:0}
        .hp-hero-right{width:340px;flex-shrink:0;padding:20px 16px 20px 20px;display:flex;flex-direction:column;border-left:1px solid var(--border-default);background:var(--bg-body);position:relative;z-index:3}

        @media(max-width:960px){
          .hp-hero{min-height:auto;overflow:hidden;height:420px;flex-direction:column}
          .hp-hero-bg{position:absolute!important;top:0;left:0!important;right:0!important;bottom:0!important;height:100%!important;z-index:0}
          .hp-hero-content{flex:1;z-index:2}
          .hp-hero-bg::after{content:'';position:absolute;inset:0;background:linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.75) 100%);z-index:1}
          .hp-hero-bg img{object-position:center 10%!important;-webkit-mask-image:linear-gradient(to bottom, black 40%, transparent 100%)!important;mask-image:linear-gradient(to bottom, black 40%, transparent 100%)!important}
          .hp-hero-content{flex-direction:column;position:relative;min-height:0}
          .hp-hero-left{padding:0 0 20px!important;position:relative;z-index:2;display:flex;flex-direction:column}
          .hp-hero-left *{color:#fff!important}
          .hp-hero-spacer{flex:1;min-height:160px}
          .hp-hero-title{font-size:24px!important;line-height:1.1!important;display:-webkit-box!important;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
          .hp-hero-right{display:none!important}
          .hp-hero-title{font-size:24px!important;line-height:1.1!important}
          .hp-hero-excerpt{font-size:13px!important;margin-bottom:12px!important;-webkit-line-clamp:2!important;display:-webkit-box!important;-webkit-box-orient:vertical!important;overflow:hidden!important;max-height:42px}
          .hp-hero-dots{display:none!important}
          .hp-hero-vidcard{width:100%!important}
          .hp-disc-grid{grid-template-columns:1fr!important}
          .hp-triple{grid-template-columns:1fr!important}
          .hp-music-grid{grid-template-columns:1fr!important}
        }
        @media(max-width:600px){
          .hp-hero{height:360px}
          .hp-hero-left{padding:0 0 18px!important}
          .hp-hero-spacer{min-height:130px}
          .hp-hero-title{font-size:21px!important;-webkit-line-clamp:2}
          .hp-hero-title{font-size:21px!important}
          .hp-hero-excerpt{-webkit-line-clamp:2}
        }

        @media(max-width:900px){
          .hp-triple{grid-template-columns:1fr!important}
          .hp-ne{grid-template-columns:1fr!important}
        }
        @media(max-width:768px){
          .hp-cnt{padding:26px 14px!important;gap:36px!important}
          .hp-ag{grid-template-columns:repeat(4,1fr)!important;gap:14px!important}
          .hp-disc-grid{grid-template-columns:1fr!important}
          .hp-cta{flex-direction:column!important;align-items:flex-start!important;gap:14px!important;padding:22px 16px!important}
          .hp-ctabtn{width:100%!important;justify-content:center!important;text-align:center!important}
        }
        @media(max-width:480px){
          .hp-ag{grid-template-columns:repeat(3,1fr)!important}
        }
      `}</style>
      <div className="hp route-enter">

        {/* ═══════════════════════ HOMEPAGE LOAD OVERLAY ═══════════════════════
            Centruotas equalizer'is — toks pat stilius kaip MasterSearch'o
            BigEqualizer (klasė `.eq-loader-big` iš globals.css, 5 bars,
            6×44px, asymmetric ms-eqBar animacija). Po greitaveikos
            optimizacijų užklausos baigiasi <300ms — todėl per-section
            progress feedback'as buvo nereikalingas (matosi tik 1-2 frames).
            Overlay stays in DOM 350ms po pageReady=true; CSS
            .overlay-fade-out per 320ms fade'ina opacity iki 0. */}
        {overlayVisible && typeof document !== 'undefined' && createPortal((
          <div
            className={pageReady ? 'overlay-fade-out' : ''}
            style={{
              // zIndex 45 — ŽEMIAU header'io (z-50) ir apatinio baro (z-150),
              // kad shell'as (top bar + bottom nav) liktų matomas ir aktyvus per
              // home load'ą. Anksčiau z-9999 dengdavo viską → atrodė kaip pilnas
              // reload'as ir „dingdavo" apatinis meniu. Loaderis užima tik turinio
              // zoną tarp header'io ir baro.
              position: 'fixed', inset: 0, zIndex: 45,
              background: dk ? '#080e1a' : '#f0f4fa',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 18,
              // pointerEvents none — apatinis baras/headeris (virš loader'io)
              // paspaudžiami iškart, nelaukiant pageReady.
              pointerEvents: 'none',
            }}
          >
            {/* BigEqualizer + „Tavo muzikos pasaulis" tagline — IDENTIŠKAS
                PageLoader'iui (components/PageLoader.tsx), kurį naudoja artist/
                album/track puslapiai. Anksčiau homepage rodė brand mark be
                tagline'o → loader'iai nesutapdavo. Dabar visur tas pats. */}
            <span className="eq-loader-big" aria-label="Loading">
              <span /><span /><span /><span /><span />
            </span>
            <div style={{
              fontFamily: 'Outfit,sans-serif', fontWeight: 600, fontSize: 14,
              color: 'var(--text-muted)', letterSpacing: '0.03em', opacity: 0.85,
            }}>
              Tavo muzikos pasaulis
            </div>
          </div>
        ), document.body)}
        {pageReady && heroSlides.length > 0 && (
          <section className="hp-hero-v2" ref={heroRef}>
            <div className="mx-auto max-w-[1360px] px-5 pt-5">
              <div className="hp-scroll hp-hero-track flex items-stretch gap-4 pb-1 snap-x snap-mandatory">
                {heroSlides.map((slide) => (
                  <div key={`${slide.type}-${slide.href}`} className="hp-hero-slot shrink-0 snap-start">
                    <HeroV2Card slide={slide} dk={dk} />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}


        {/* ═══════════════════════ BELOW-HERO CONTENT ═══════════════════════ */}
        <div style={{ opacity: pageReady ? 1 : 0, transition: 'opacity 0.3s ease', pointerEvents: pageReady ? 'auto' : 'none' }}>

        {heroSlides.length > 0 && (
          <div className="hp-feed-strip" style={{ padding: '14px 16px 0' }}>
            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', scrollbarWidth: 'none', height: 296, alignItems: 'stretch', scrollSnapType: 'x mandatory' }}>
              {heroSlides.map((slide, i) => {
                const isChart = slide.type === 'chart_lt' || slide.type === 'chart_world'
                const chartTops = slide.chartTops || []
                if (isChart && chartTops.length > 0) {
                  // ── Chart slide — asimetrinis mosaic preview. Tap → reels
                  // open su tuo idx (visa news/event juosta, su chart kaip
                  // dalimi). Reels'ų viduj swipe-down ant chart slide atveria
                  // chartSheet'ą balsavimui. ──
                  return (
                    <MobileChartSlide
                      key={`${slide.type}-${slide.href}`}
                      slide={slide}
                      onOpen={() => { setReelsIdx(i); setReelsOpen(true) }}
                    />
                  )
                }
                // ── Default slide (news/event/promo) — opens reels ──
                const isSeen = seenSlides.has(slide.href)
                const artistName = slide.artist?.name || null
                // showExcerpt — naujienoms NEBE rodom subtitle (excerpt'as).
                // Card'as paprastesnis: chip + title (+ artist'as jei yra).
                // Eventams paliekam subtitle (data/vieta) — jis kontekstinis.
                const showExcerpt = slide.type === 'event' && slide.subtitle && slide.subtitle.length > 5
                return (
                  <button key={`${slide.type}-${slide.href}`} onClick={() => { setReelsIdx(i); setReelsOpen(true) }}
                    style={{ flexShrink: 0, position: 'relative', borderRadius: 16, overflow: 'hidden',
                      border: isSeen ? '2px solid rgba(255,255,255,0.10)' : '2px solid #f97316',
                      background: '#000', cursor: 'pointer', padding: 0, width: 188, height: 290,
                      scrollSnapAlign: 'start',
                      transition: 'opacity .15s, border-color .15s, transform .15s',
                      boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
                    }}
                  >
                    {slide.bgImg
                      ? <img src={proxyImg(slide.bgImg)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#0a1428,#162040)' }} />
                    }
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.55) 35%, rgba(0,0,0,0.10) 60%, rgba(0,0,0,0) 75%)' }} />
                    {/* Bottom: title + excerpt + artist */}
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10px 12px 12px', textAlign: 'left' }}>
                      <p style={{ fontSize: 13.5, fontWeight: 800, color: '#fff', margin: 0, lineHeight: 1.22, fontFamily: 'Outfit,sans-serif', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.01em' } as any}>{slide.title}</p>
                      {showExcerpt && (
                        <p style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.78)', margin: '5px 0 0', lineHeight: 1.32, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis' } as any}>{slide.subtitle}</p>
                      )}
                      {artistName && (
                        <p style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,0.65)', margin: '6px 0 0', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{artistName}</p>
                      )}
                    </div>
                    {/* Top: chip badge */}
                    <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', alignItems: 'center', gap: 4, zIndex: 2 }}>
                      <span style={{ padding: '4px 9px', borderRadius: 12, fontSize: 9, fontWeight: 900, color: '#fff', background: slide.chipBg, fontFamily: 'Outfit,sans-serif', letterSpacing: '0.06em', textTransform: 'uppercase', backdropFilter: 'blur(4px)' }}>
                        {slide.chip}
                      </span>
                    </div>
                    {!isSeen && (
                      <div style={{ position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: '50%', background: '#f97316', boxShadow: '0 0 0 2px #000', zIndex: 2 }} />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Mobile chart pašalintas — chart'ai integruoti į hero v2. */}

        {/* ═══════════════════════ REELS OVERLAY — horizontal Stories ═══════════════════════ */}
        {reelsOpen && (
          <ReelsOverlay
            slides={heroSlides}
            initialIdx={reelsIdx}
            seenSlides={seenSlides}
            onSeen={(href) => setSeenSlides(prev => {
              const next = new Set(prev); next.add(href)
              try { localStorage.setItem('reels_seen', JSON.stringify(Array.from(next))) } catch {}
              return next
            })}
            onClose={() => setReelsOpen(false)}
            onChartVote={(s) => setChartSheet({
              topType: s.type === 'chart_lt' ? 'lt_top30' : 'top40',
              title: s.title,
              accent: s.type === 'chart_lt' ? '#f97316' : '#3b82f6',
            })}
            dk={dk}
          />
        )}

        {/* ═══════════════════════ CHART BOTTOM SHEET ═══════════════════════ */}
        <ChartBottomSheet
          open={chartSheet != null}
          onClose={() => setChartSheet(null)}
          topType={chartSheet?.topType || 'lt_top30'}
          title={chartSheet?.title || 'TOPAS'}
          accent={chartSheet?.accent || '#f97316'}
        />

        {/* ═══════════════════════ MAIN CONTENT ═══════════════════════ */}
        <div className="hp-cnt" style={{ maxWidth: 1360, margin: '0 auto', padding: '42px 20px', display: 'flex', flexDirection: 'column', gap: 44 }}>

          {/* ── Muzika full-width: Naujos dainos + Nauji albumai ── */}

              {/* Naujos dainos — kompaktiškas horizontal row,
                  thumb + title + artist. Tylesnė vizualinė akcentuotė nei
                  albumai (jie turi didesnius cover'ius). */}
              <section>
                {/* SectionHead be CTA — „+N" button'as juostos dešinėje yra
                    primaryinis būdas atidaryti pilną sąrašą. */}
                <SectionHead label="Naujos dainos" />
                {(() => {
                  const isLT = (x: any) => {
                    const c = x.artists?.country
                    return !c || c === 'Lietuva' || c === 'LT' || c === 'Lithuania'
                  }
                  const ltT = tracks.filter(t => sanitizeTitle(t.title) && isLT(t))
                  const wT = tracks.filter(t => sanitizeTitle(t.title) && !isLT(t))
                  return [
                    { lane: 'lt' as const, items: ltT, total: totals.tracksLt },
                    { lane: 'world' as const, items: wT, total: totals.tracksWorld },
                  ]
                })().map(({ lane, items, total }, laneIdx) => (
                  <div key={lane} className={laneIdx === 0 ? 'mb-3' : ''}>
                    {/* Wrapper: scroll container + sticky „+N" button šalia.
                        2026-05-29: dainos perdarytos į vertikalią kortelę (cover
                        viršuje + info apačioje) — vienodas stilius su albumais
                        ir renginiais. */}
                    <div className="flex items-stretch gap-3">
                      <RowDivider icon={lane} />
                      <div className="hp-scroll flex flex-1 min-w-0 items-stretch gap-3 pb-0.5">
                        {tracks.length === 0 ? Array(8).fill(null).map((_, i) => (
                          <div key={i} className="shrink-0" style={{ width: 200 }}>
                            <Skel w={200} h={112} r={12} />
                            <div className="mt-2"><Skel w="80%" h={12} /></div>
                            <div className="mt-1"><Skel w="60%" h={10} /></div>
                          </div>
                        )) : items.length === 0 ? (
                          <div className="flex h-[112px] shrink-0 items-center px-3 text-[12px] text-[var(--text-faint)]">
                            {lane === 'lt' ? 'Lietuviškų dainų netrukus' : 'Užsienio dainų netrukus'}
                          </div>
                        ) : items.slice(0, 14).map(t => {
                          const v = extractYouTubeId((t as any).video_url)
                          const ytThumb = v ? `https://img.youtube.com/vi/${v}/mqdefault.jpg` : null
                          const imgSrc = t.cover_url || (t as any).albums_list?.[0]?.cover_image_url || ytThumb || t.artists?.cover_image_url || null
                          const rd = (t as any).video_uploaded_at || (t as any).release_date
                          const rel = formatRelativeDateLT(rd)
                          const dDiff = rd ? Math.floor((Date.now() - new Date(rd).getTime()) / 86400000) : null
                          const highlight = dDiff !== null && dDiff >= 0 && dDiff <= 14
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => setOpenTrack(t)}
                              className="group block shrink-0 no-underline text-left p-0 bg-transparent border-0 cursor-pointer"
                              style={{ width: 200 }}
                            >
                              {/* 16:9 (YouTube-style) — dainos vizualiai skiriasi nuo
                                  kvadratinių albumų cover'ių. */}
                              <div className="relative aspect-video overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--cover-placeholder)] shadow-[0_4px_12px_rgba(0,0,0,0.25)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-[rgba(249,115,22,0.5)] group-hover:shadow-[0_14px_32px_rgba(249,115,22,0.18)]">
                                {imgSrc ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={proxyImg(imgSrc)}
                                    alt={sanitizeTitle(t.title)}
                                    loading="lazy"
                                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
                                    style={{ filter: 'saturate(1.05) contrast(1.02)' }}
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-2xl text-[var(--text-faint)]">🎵</div>
                                )}
                                {/* Play overlay (hover) — atskiria dainą nuo albumo. */}
                                <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-orange)] shadow-[0_4px_16px_rgba(249,115,22,0.5)]">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
                                  </span>
                                </div>
                                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgba(249,115,22,0.12)] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                                {rel && (
                                  <span className={`absolute bottom-1.5 right-1.5 rounded px-1.5 py-0.5 font-['Outfit',sans-serif] text-[9px] font-bold backdrop-blur-sm ${
                                    highlight ? 'bg-[var(--accent-orange)] text-white' : 'bg-black/70 text-white'
                                  }`}>
                                    {rel}
                                  </span>
                                )}
                              </div>
                              <div className="mt-2 px-0.5">
                                <p className="m-0 truncate font-['Outfit',sans-serif] text-[13.5px] font-extrabold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">
                                  {sanitizeTitle(t.title)}
                                </p>
                                <p className="m-0 mt-1 truncate text-[12px] text-[var(--text-muted)]">
                                  {t.artists?.name}
                                </p>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                      {items.length > 0 && (
                        <StickyMoreButton
                          count={total || items.length}
                          height={156}
                          ariaLabel={`Žiūrėti visus (${total || items.length})`}
                          onClick={() => setListModal(`tracks-${lane}`)}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </section>

              {/* Nauji albumai — vertikali kortelė su kvadratiniu cover'iu
                  (atitinka artist page'o AlbumCard pattern'ą). Cover'is
                  ~140px aiškiai didesnis nei track row'o 38px thumb'as. */}
              <section>
                <SectionHead label="Nauji albumai" />
                {(() => {
                  const isLT = (x: any) => {
                    const c = x.artists?.country
                    return !c || c === 'Lietuva' || c === 'LT' || c === 'Lithuania'
                  }
                  return [
                    { lane: 'lt' as const, items: albums.filter(isLT), total: totals.albumsLt },
                    { lane: 'world' as const, items: albums.filter(a => !isLT(a)), total: totals.albumsWorld },
                  ]
                })().map(({ lane, items, total }, laneIdx) => (
                  <div key={lane} className={laneIdx === 0 ? 'mb-3' : ''}>
                    <div className="flex items-stretch gap-3">
                      <RowDivider icon={lane} />
                      <div className="hp-scroll flex flex-1 min-w-0 items-stretch gap-3 pb-0.5">
                        {albums.length === 0 ? Array(8).fill(null).map((_, i) => (
                        <div key={i} className="shrink-0" style={{ width: 156 }}>
                          <Skel w={156} h={156} r={12} />
                          <div className="mt-2"><Skel w="80%" h={12} /></div>
                          <div className="mt-1"><Skel w="60%" h={10} /></div>
                        </div>
                      )) : items.length === 0 ? (
                        <div className="flex h-[156px] shrink-0 items-center px-3 text-[12px] text-[var(--text-faint)]">
                          {lane === 'lt' ? 'Lietuviškų albumų netrukus' : 'Užsienio albumų netrukus'}
                        </div>
                      ) : items.slice(0, 14).map(a => {
                        // Album card → atidaro AlbumInfoModal (vietoj /albumai
                        // navigacijos). Modal'as turi visą funkcionalumą:
                        // tracklist, lyrics, prev/next ir t.t.
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => { setOpenAlbumId(a.id); setOpenAlbumPreview({ title: sanitizeTitle(a.title), cover_image_url: a.cover_image_url || a.artists?.cover_image_url || null, year: a.year || null }) }}
                            className="group block shrink-0 no-underline text-left p-0 bg-transparent border-0 cursor-pointer"
                            style={{ width: 156 }}
                          >
                            <div className="relative aspect-square overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--cover-placeholder)] shadow-[0_4px_12px_rgba(0,0,0,0.25)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-[rgba(249,115,22,0.5)] group-hover:shadow-[0_14px_32px_rgba(249,115,22,0.18)]">
                              {a.cover_image_url || a.artists?.cover_image_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={proxyImg(a.cover_image_url || a.artists?.cover_image_url || '')}
                                  alt={sanitizeTitle(a.title)}
                                  loading="lazy"
                                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
                                  style={{ filter: 'saturate(1.05) contrast(1.02)' }}
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-2xl text-[var(--text-faint)]">💿</div>
                              )}
                              {/* Hover orange tint nuo apačios */}
                              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgba(249,115,22,0.12)] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                              {(() => {
                                // Nauji albumai sekcijoje rodom „Prieš X d."
                                // (jei <30 d.) arba „Mėn. D, YYYY" senesnėms
                                // datoms. Upcoming albumai vis tiek matomi su
                                // „Po X d./Greitai" — bet jie dažniausiai į
                                // Greitai pasirodys sekciją iškeliami.
                                const rd = (a as any).release_date as string | null
                                const releaseD = rd ? new Date(rd) : null
                                const validRD = releaseD && !isNaN(releaseD.getTime())
                                const diff = validRD ? Math.ceil((releaseD!.getTime() - Date.now()) / 86400000) : null
                                const isUpcoming = (a as any).is_upcoming === true || (diff !== null && diff > 0)
                                const hasContent = !!(a.cover_image_url)
                                let label: string | null = null
                                let highlight = false
                                if (isUpcoming) {
                                  const f = formatFutureDateLT(rd)
                                  if (f.label) { label = f.label; highlight = f.highlight }
                                  else if (hasContent) { label = 'Greitai'; highlight = true }
                                } else if (validRD) {
                                  const rel = formatRelativeDateLT(rd)
                                  label = rel || String(a.year || '')
                                  if (diff !== null && diff <= -2 && diff >= -30) highlight = true
                                } else if (a.year) {
                                  label = String(a.year)
                                }
                                return label ? (
                                  <span className={`absolute bottom-1.5 right-1.5 rounded px-1.5 py-0.5 font-['Outfit',sans-serif] text-[9px] font-bold backdrop-blur-sm ${
                                    highlight ? 'bg-[var(--accent-orange)] text-white' : 'bg-black/70 text-white'
                                  }`}>
                                    {label}
                                  </span>
                                ) : null
                              })()}
                            </div>
                            <div className="mt-2 px-0.5">
                              <p className="m-0 truncate font-['Outfit',sans-serif] text-[13.5px] font-extrabold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">
                                {sanitizeTitle(a.title)}
                              </p>
                              <p className="m-0 mt-1 truncate text-[12px] text-[var(--text-muted)]">
                                {a.artists?.name}
                              </p>
                            </div>
                          </button>
                        )
                      })}
                      </div>
                      {items.length > 0 && (
                        <StickyMoreButton
                          count={total || items.length}
                          height={200}
                          ariaLabel={`Žiūrėti visus (${total || items.length})`}
                          onClick={() => setListModal(`albums-${lane}`)}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </section>

              {/* ── Greitai pasirodys — albumai dar neišleisti (bendras
                  LT + INTL sąrašas, sortuotas pagal artimiausią datą ASC).
                  Tas pats kortelės stilius kaip „Nauji albumai" — kvadratiniai
                  cover'iai 156px, badge'as su data/„Greitai". ── */}
              {upcomingAlbums.length > 0 && (
                <section>
                  <SectionHead label="Greitai pasirodys" />
                  <div className="flex items-stretch gap-3">
                    <div className="hp-scroll flex flex-1 min-w-0 items-stretch gap-3 pb-0.5">
                    {upcomingAlbums.slice(0, 14).map(a => {
                      const rd = (a as any).release_date as string | null
                      // formatFutureDateLT: ≤30 d. → „Po X d.", >30 d. →
                      // konkreti data (lengviau perskaityti dideliu intervalu).
                      const f = formatFutureDateLT(rd)
                      let label: string | null = f.label
                      let highlight: boolean = f.highlight
                      if (!label && a.year) label = String(a.year)
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => { setOpenAlbumId(a.id); setOpenAlbumPreview({ title: sanitizeTitle(a.title), cover_image_url: a.cover_image_url || a.artists?.cover_image_url || null, year: a.year || null }) }}
                          className="group block shrink-0 no-underline text-left p-0 bg-transparent border-0 cursor-pointer"
                          style={{ width: 156 }}
                        >
                          <div className="relative aspect-square overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--cover-placeholder)] shadow-[0_4px_12px_rgba(0,0,0,0.25)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-[rgba(249,115,22,0.5)] group-hover:shadow-[0_14px_32px_rgba(249,115,22,0.18)]">
                            {a.cover_image_url || a.artists?.cover_image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={proxyImg(a.cover_image_url || a.artists?.cover_image_url || '')}
                                alt={sanitizeTitle(a.title)}
                                loading="lazy"
                                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
                                style={{ filter: 'saturate(1.05) contrast(1.02)' }}
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-2xl text-[var(--text-faint)]">⏳</div>
                            )}
                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgba(249,115,22,0.12)] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                            {label && (
                              <span className={`absolute bottom-1.5 right-1.5 rounded px-1.5 py-0.5 font-['Outfit',sans-serif] text-[9px] font-bold backdrop-blur-sm ${
                                highlight ? 'bg-[var(--accent-orange)] text-white' : 'bg-black/70 text-white'
                              }`}>
                                {label}
                              </span>
                            )}
                          </div>
                          <div className="mt-2 px-0.5">
                            <p className="m-0 truncate font-['Outfit',sans-serif] text-[13.5px] font-extrabold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">
                              {sanitizeTitle(a.title)}
                            </p>
                            <p className="m-0 mt-1 truncate text-[12px] text-[var(--text-muted)]">
                              {a.artists?.name}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                    </div>
                    {upcomingAlbums.length > 0 && (
                      <StickyMoreButton
                        count={totals.upcoming || upcomingAlbums.length}
                        height={200}
                        ariaLabel={`Žiūrėti visus (${totals.upcoming || upcomingAlbums.length})`}
                        onClick={() => setListModal('upcoming')}
                      />
                    )}
                  </div>
                </section>
              )}
          {/* ── Renginiai LT + Užsienio: 2 lanes su badge'ais 'NAUJIENA' / 'GREITAI' ── */}
          {/* LazySection — sekcija render'inasi tik kai user'is scroll'iuoja
              arti viewport'o. Be lazy aukščiau matomos Naujos dainos / Nauji
              albumai sekcijos lieka eager. Žr. components/LazySection.tsx. */}
          <LazySection
            rootMargin="400px"
            minHeight={280}
            placeholder={
              <section>
                <SectionHead label="Koncertai" />
                <div className="hp-scroll flex items-stretch gap-3 pb-1">
                  {Array(4).fill(null).map((_, i) => (
                    <div key={i} className="flex shrink-0 items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-2" style={{ height: 110 }}>
                      <Skel w={94} h={94} r={9} />
                      <div className="flex-1" style={{ width: 200 }}>
                        <Skel w="80%" h={11} />
                        <div className="mt-1.5"><Skel w="55%" h={9} /></div>
                        <div className="mt-2"><Skel w="35%" h={8} /></div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            }
          >
          <section>
            <SectionHead label="Renginiai" />
            {(() => {
              // LT/INTL filter logic — pirma žiūrim į artist'us, tada į miestą.
              // Artist'as turi country lauką — jei BENT VIENAS event artist'as
              // LT → renginys LT. Jei artist'ai aiškiai NE LT (visi užsienio) →
              // renginys INTL, nepaisant city (LT artist'as gali koncertuoti Rygoje).
              const LT_COUNTRIES = new Set(['Lietuva', 'LT', 'Lithuania'])
              const LT_CITIES = new Set(['Vilnius','Kaunas','Klaipėda','Klaipeda','Šiauliai','Siauliai','Panevėžys','Panevezys','Alytus','Marijampolė','Marijampole','Mažeikiai','Mazeikiai','Jonava','Utena','Kėdainiai','Kedainiai','Tauragė','Taurage','Telšiai','Telsiai','Visaginas','Plungė','Plunge','Druskininkai','Palanga','Anykščiai','Anyksciai','Trakai','Birštonas','Birstonas','Ukmergė','Ukmerge','Kretinga','Šilutė','Silute','Radviliškis','Radviliskis','Rokiškis','Rokiskis','Elektrėnai','Elektrenai','Šalčininkai','Salcininkai','Pakruojis','Lentvaris'])
              const isLT = (ev: any) => {
                const ea = (ev.event_artists || []).map((a: any) => a.artists).filter(Boolean)
                if (ea.length > 0) {
                  // BENT VIENAS LT artist'as → LT renginys
                  const anyLT = ea.some((a: any) => {
                    const c = a?.country
                    return !c || LT_COUNTRIES.has(c) // unknown country dažniausiai LT
                  })
                  if (anyLT) return true
                  // Visi artist'ai aiškiai užsienio
                  return false
                }
                // Be artist'ų — fallback į city heuristics
                const c = ev.venues?.city || (ev as any).city || ''
                return c ? LT_CITIES.has(c) : true
              }
              const lt = filtEvt.filter(isLT)
              const world = filtEvt.filter(ev => !isLT(ev))
              return (
                <>
                  {[
                    { lane: 'lt' as const, items: lt },
                    { lane: 'world' as const, items: world },
                  ].map(({ lane, items }, laneIdx) => (
                    <div key={lane} className={laneIdx === 0 ? 'mb-3' : ''}>
                      <div className="flex items-stretch gap-3">
                        <RowDivider icon={lane} />
                        <div className="hp-scroll flex flex-1 min-w-0 items-stretch gap-3 pb-1">
                        {filtEvt.length === 0 ? Array(8).fill(null).map((_, i) => (
                          <div key={i} className="shrink-0" style={{ width: 156 }}>
                            <Skel w={156} h={156} r={12} />
                            <div className="mt-2"><Skel w="80%" h={12} /></div>
                            <div className="mt-1"><Skel w="60%" h={10} /></div>
                          </div>
                        )) : items.length === 0 ? (
                          <div className="flex h-[156px] shrink-0 items-center px-3 text-[12px] text-[var(--text-faint)]">
                            {lane === 'lt' ? 'Lietuvoje renginių nėra' : 'Užsienio renginių nėra'}
                          </div>
                        ) : items.slice(0, 14).map(ev => {
                          const dateRaw = (ev as any).start_date || ev.event_date
                          // Data badge ant cover'io — ta pati logika kaip „Greitai pasirodys"
                          // albumams: „Šiandien"/„Rytoj"/„Po X d." (highlight ≤14 d.) / konkreti data.
                          const evDate = formatFutureDateLT(dateRaw)
                          const created = ev.created_at ? new Date(ev.created_at) : null
                          const ageDays = created ? (Date.now() - created.getTime()) / 86400000 : 999
                          // „Naujas" = pridėtas per pask. 2 d. (created_at). 7 d. langas
                          // floodino visus po bulk importo, todėl sumažintas. 2026-05-29.
                          const isNew = ageDays <= 2
                          // Foto fallback: jei renginys neturi cover'io — imam priskirto
                          // atlikėjo nuotrauką. 2026-05-30.
                          const evArtistCover = (ev.event_artists || [])
                            .map(ea => (Array.isArray(ea.artists) ? ea.artists[0] : ea.artists))
                            .find(a => a?.cover_image_url)?.cover_image_url || null
                          const imgSrc = ev.image_small_url || ev.cover_image_url || evArtistCover
                          const city = ev.city || ev.venues?.city || ''
                          const venue = ev.venue_name || ev.venues?.name || ev.venue_custom || ''
                          const venueLabel = [city, venue].filter(Boolean).join(', ')
                          const artistList = (ev.event_artists || []).filter(ea => ea.artists?.name).map(ea => ea.artists!.name)
                          const artistText = artistList.length > 0
                            ? artistList.slice(0, 2).join(', ') + (artistList.length > 2 ? ` +${artistList.length - 2}` : '')
                            : sanitizeTitle(ev.title)
                          return (
                            <Link
                              key={ev.id}
                              href={`/renginiai/${ev.slug}`}
                              className="group block shrink-0 no-underline text-left"
                              style={{ width: 156 }}
                            >
                              {/* Švarus vizualas — data/vieta perkelti ŽEMYN (po cover),
                                  nes ant margų plakatų badge'ai blogai matėsi. Naujai
                                  pridėtas renginys (≤7 d.) — oranžinis rėmelis + taškas
                                  (kaip neskaitytos naujienos). 2026-05-29. */}
                              <div className={`relative aspect-square overflow-hidden rounded-xl border bg-[var(--cover-placeholder)] shadow-[0_4px_12px_rgba(0,0,0,0.25)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[0_14px_32px_rgba(249,115,22,0.18)] ${
                                isNew ? 'border-[var(--accent-orange)]' : 'border-[var(--border-default)] group-hover:border-[rgba(249,115,22,0.5)]'
                              }`}>
                                {imgSrc ? (
                                  <>
                                    {/* Blur backdrop užpildo tuščius plotus; pilnas plakatas — object-contain (mažinam pagal ilgiausią kraštinę). */}
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={proxyImg(imgSrc)} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-xl" />
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={proxyImg(imgSrc)} alt={artistText} loading="lazy" className="absolute inset-0 h-full w-full object-contain transition-transform duration-500 group-hover:scale-[1.04]" />
                                  </>
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-2xl text-[var(--text-faint)]">🎵</div>
                                )}
                                {isNew && (
                                  <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--accent-orange)] shadow-[0_0_0_2px_rgba(0,0,0,0.45)]" />
                                )}
                                {/* Data badge — kaip „Greitai pasirodys" albumams (vietoj
                                    teksto po cover). „Šiandien"/„Rytoj"/„Po X d." (oranžinis
                                    ≤14 d.) arba konkreti data toliau. 2026-05-30. */}
                                {evDate.label && (
                                  <span className={`absolute bottom-1.5 right-1.5 rounded px-1.5 py-0.5 font-['Outfit',sans-serif] text-[9px] font-bold backdrop-blur-sm ${
                                    evDate.highlight ? 'bg-[var(--accent-orange)] text-white' : 'bg-black/70 text-white'
                                  }`}>
                                    {evDate.label}
                                  </span>
                                )}
                                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgba(249,115,22,0.12)] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                              </div>
                              <div className="mt-2 px-0.5">
                                <p className="m-0 line-clamp-2 font-['Outfit',sans-serif] text-[13px] font-extrabold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">
                                  {artistText}
                                </p>
                                {venueLabel && (
                                  <p className="m-0 mt-1 truncate text-[11.5px] text-[var(--text-muted)]">
                                    {venueLabel}
                                  </p>
                                )}
                              </div>
                            </Link>
                          )
                        })}
                        </div>
                        {items.length > 0 && (
                          <StickyMoreButton
                            count={items.length}
                            height={200}
                            ariaLabel={`Žiūrėti visus (${items.length})`}
                            onClick={() => setListModal(`events-${lane}`)}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )
            })()}
          </section>
          </LazySection>

          {/* ── PULSAS — naujausi vartotojų įrašai: blogai, diskusijos, vertimai,
              kūryba, komentarai. Pakeitė buvusią „Bendruomenė" sekciją su 3
              kolonomis (diskusijos / chat / posts). Naujas dizainas — vientisas
              feed'as su mažomis korteles, sortuotas pagal datą. ── */}
          <LazySection
            rootMargin="400px"
            minHeight={280}
            placeholder={
              <section>
                <SectionHead label="Pulsas" href="/bendruomene" cta="Daugiau →" />
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {Array(4).fill(null).map((_, i) => (
                    <div key={i} className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3.5">
                      <Skel w="40%" h={10} />
                      <div className="mt-3"><Skel w="92%" h={12} /></div>
                      <div className="mt-1.5"><Skel w="80%" h={11} /></div>
                    </div>
                  ))}
                </div>
              </section>
            }
          >
            <PulsasSection />
          </LazySection>

          {/* ── DIENOS DAINA — bendruomenės balsavimas (pakeitė „Pramogas". Boombox
              + Music Manager kol kas pasiekiami tik per top menu). 2026-05-29. ── */}
          <LazySection
            rootMargin="400px"
            minHeight={220}
            placeholder={
              <section>
                <SectionHead label="Dienos daina" />
                <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4" style={{ maxWidth: 560 }}>
                  <Skel w="40%" h={11} />
                  <div className="mt-3"><Skel w="100%" h={48} /></div>
                  <div className="mt-2"><Skel w="60%" h={11} /></div>
                </div>
              </section>
            }
          >
          <section>
            <DienosDainaSection onOpenTrack={(t) => setOpenTrack(t)} />
          </section>
          </LazySection>

          {/* ── ISTORIJA — sukaktys, jubiliejai, gimtadieniai ── */}
          <LazySection rootMargin="400px" minHeight={180}>
          <section>
            <SectionHead label="Istorija" href="/istorija" cta="Daugiau →" />
            <IstorijaSection onOpenAlbum={(id, preview) => { setOpenAlbumId(id); setOpenAlbumPreview(preview) }} />
          </section>
          </LazySection>

          {/* ── Atlikėjai + CTA — paslėpta (kol kas) ── */}
          {false && (<>
          <div>
            <section>
              <SectionHead label="Atrask atlikėjus" href="/atlikejai" />
              <div className="hp-ag grid grid-cols-4 gap-3.5">
                {artists.length === 0 ? Array(8).fill(null).map((_, i) => (
                  <div key={i} className="text-center">
                    <div className="mx-auto" style={{ width: 72, height: 72, borderRadius: 36 }}>
                      <Skel w={72} h={72} r={36} />
                    </div>
                    <div className="mx-auto mt-2 max-w-[72px]"><Skel w="100%" h={9} /></div>
                  </div>
                )) : artists.filter(a => ((a as any).score || 0) > 0 || a.cover_image_url).slice(0, 8).map(a => (
                  <Link
                    key={a.id}
                    href={`/atlikejai/${a.slug}`}
                    className="hp-art group block text-center no-underline"
                  >
                    <div
                      className="hp-art-img mx-auto mb-2 overflow-hidden rounded-full transition-transform duration-300 group-hover:scale-[1.06]"
                      style={{
                        width: 72,
                        height: 72,
                        boxShadow: `0 6px 20px ${dk ? `hsla(${strHue(a.name)},35%,5%,.9)` : `hsla(${strHue(a.name)},25%,40%,.18)`}`,
                      }}
                    >
                      <Cover src={a.cover_image_url} alt={a.name} size={72} radius={36} />
                    </div>
                    <p className="m-0 truncate font-['Outfit',sans-serif] text-[11.5px] font-bold text-[var(--text-secondary)] transition-colors group-hover:text-[var(--accent-orange)]">
                      {a.name}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          </div>

          {/* ── ROW 6: CTA ── */}
          <section>
            <div className="hp-cta" style={{ padding: '32px 40px', borderRadius: 18, background: dk ? 'linear-gradient(135deg,rgba(29,78,216,.09) 0%,rgba(255,255,255,.015) 100%)' : 'linear-gradient(135deg,rgba(29,78,216,.06) 0%,rgba(255,255,255,.5) 100%)', border: `1px solid ${dk ? 'rgba(29,78,216,.15)' : 'rgba(29,78,216,.12)'}`, display: 'flex', alignItems: 'center', gap: 22, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 0% 50%,rgba(29,78,216,.06) 0%,transparent 55%)', pointerEvents: 'none' }} />
              <div style={{ width: 52, height: 52, borderRadius: 14, flexShrink: 0, background: dk ? 'rgba(29,78,216,.15)' : 'rgba(29,78,216,.1)', border: `1px solid ${dk ? 'rgba(29,78,216,.22)' : 'rgba(29,78,216,.15)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🎤</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontFamily: 'Outfit,sans-serif', fontSize: 19, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 4px' }}>Atlikėjams</h3>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.55, maxWidth: 480 }}>Sukurk arba perimk savo profilį Music.lt platformoje. Skelk naujienas, renginius ir naują muziką tiesiai savo gerbėjams — nemokamai.</p>
              </div>
              <Link href="/atlikejai" className="hp-ctabtn"
                style={{ flexShrink: 0, background: '#f97316', color: '#fff', fontWeight: 800, fontSize: 13, padding: '10px 24px', borderRadius: 20, textDecoration: 'none', boxShadow: '0 4px 16px rgba(249,115,22,.3)', whiteSpace: 'nowrap', fontFamily: 'Outfit,sans-serif', display: 'inline-flex', alignItems: 'center', transition: 'transform .15s, box-shadow .15s' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 22px rgba(249,115,22,.42)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(249,115,22,.3)' }}>
                Pradėti nemokamai →
              </Link>
            </div>
          </section>
          </>)}

        </div>{/* end hp-cnt */}
        </div>{/* end below-hero content */}

        {/* ═══════════════════════ Modal'ai (Track + Album) ═══════════════════════ */}
        <HomeTrackModal track={openTrack as any} onClose={() => setOpenTrack(null)} />
        <AlbumInfoModal
          albumId={openAlbumId}
          preview={openAlbumPreview}
          onClose={() => { setOpenAlbumId(null); setOpenAlbumPreview(null) }}
        />

        {/* ═══════════════════════ HomeListModal — pilnam sekcijos sąrašui ═══════════════════════
            Atidaromas kai user'is spaudžia „+ X" elementą juostos pabaigoje.
            Vienas modal'as — turinys keičiasi pagal `listModal` key. */}
        {listModal && (() => {
          let title = ''
          let body: React.ReactNode = null

          if (listModal === 'tracks-lt' || listModal === 'tracks-world') {
            const lane = listModal === 'tracks-lt' ? 'lt' : 'world'
            title = lane === 'lt' ? 'Naujos lietuvių atlikėjų dainos' : 'Naujos užsienio atlikėjų dainos'
            body = (
              <HomeListContent
                type="tracks"
                lane={lane}
                onOpenTrack={(t) => setOpenTrack(t)}
                onClose={() => setListModal(null)}
              />
            )
          } else if (listModal === 'albums-lt' || listModal === 'albums-world' || listModal === 'upcoming') {
            title = listModal === 'upcoming'
              ? 'Greitai pasirodys'
              : (listModal === 'albums-lt' ? 'Nauji lietuviški albumai' : 'Nauji užsienio albumai')
            body = (
              <HomeListContent
                type={listModal === 'upcoming' ? 'upcoming' : 'albums'}
                lane={listModal === 'albums-world' ? 'world' : 'lt'}
                onOpenAlbum={(a) => {
                  setOpenAlbumId(a.id)
                  setOpenAlbumPreview({ title: sanitizeTitle(a.title), cover_image_url: a.cover_image_url || a.cover_url || a.artists?.cover_image_url || null, year: a.year || null })
                }}
                onClose={() => setListModal(null)}
              />
            )
          } else if (listModal === 'events-lt' || listModal === 'events-world') {
            const lane = listModal === 'events-lt' ? 'lt' : 'world'
            title = lane === 'lt' ? 'Lietuvos atlikėjų renginiai' : 'Užsienio atlikėjų renginiai'
            body = (
              <HomeListContent
                type="events"
                lane={lane}
                onClose={() => setListModal(null)}
              />
            )
          } else if (listModal === 'news') {
            title = 'Naujienos'
            body = (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {news.map(n => (
                  <Link
                    key={n.id}
                    href={`/news/${n.slug}`}
                    onClick={() => setListModal(null)}
                    className="hp-card group flex items-stretch gap-0 overflow-hidden p-0 no-underline"
                    style={{ height: 120 }}
                  >
                    <div className="relative h-full aspect-square shrink-0 overflow-hidden bg-[var(--cover-placeholder)]">
                      {(n.image_title_url || n.image_small_url) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={proxyImg(n.image_title_url || n.image_small_url || '')} alt={n.title} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-2xl text-[var(--text-faint)]">📰</div>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col justify-center px-3 py-2.5">
                      <p className="m-0 line-clamp-3 font-['Outfit',sans-serif] text-[13px] font-extrabold leading-snug text-[var(--text-primary)]">{sanitizeTitle(n.title)}</p>
                      {n.artist?.name && <p className="m-0 mt-1 truncate text-[11px] text-[var(--text-muted)]">{n.artist.name}</p>}
                    </div>
                  </Link>
                ))}
              </div>
            )
          }

          return (
            <HomeListModal
              open={listModal !== null}
              onClose={() => setListModal(null)}
              title={title}
            >
              {body}
            </HomeListModal>
          )
        })()}
      </div>
    </>
  )
}
