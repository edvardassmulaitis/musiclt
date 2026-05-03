'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useSite } from '@/components/SiteContext'
import { HomeChatsWidget } from '@/components/HomeChatsWidget'
import { proxyImg } from '@/lib/img-proxy'

/* ────────────────────────────── Types ────────────────────────────── */
type Track = { id: number; slug: string; title: string; cover_url: string | null; created_at: string; artists: { id: number; slug: string; name: string; cover_image_url?: string | null } | null }
type Album = { id: number; slug: string; title: string; year: number | null; cover_image_url: string | null; created_at: string; artists: { id: number; slug: string; name: string; cover_image_url?: string | null } | null }
type Artist = { id: number; slug: string; name: string; cover_image_url: string | null }
type EventArtist = { artists?: { id: number; name: string; slug: string; cover_image_url?: string | null } | null; artist_id?: number; sort_order?: number; is_headliner?: boolean }
type Event = { id: number; slug: string; title: string; event_date?: string; start_date?: string; end_date?: string; venue_custom?: string | null; venue_name?: string | null; venue_id?: number | null; image_small_url?: string | null; cover_image_url?: string | null; image_url?: string | null; city?: string | null; address?: string | null; created_at?: string; venues?: { name: string; city: string } | null; event_artists?: EventArtist[] | null }
type NewsItem = { id: number; slug: string; title: string; image_small_url: string | null; image_title_url?: string | null; published_at: string; type: string | null; excerpt?: string | null; songs?: { youtube_url?: string | null; title?: string | null; artist_name?: string | null; cover_url?: string | null }[]; artist: { name: string; slug: string; cover_image_url?: string | null } | null }
type TopEntry = { pos: number; track_id: number; title: string; artist: string; cover_url: string | null; artist_image: string | null; trend: string; wks?: number; slug?: string; artist_slug?: string }
type Nomination = { id: number; votes: number; weighted_votes: number; tracks: { id: number; title: string; cover_url: string | null; artists: { name: string } | null } | null }
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
  const imgSrc = src || artistSrc || (ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : null)
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

function ReelsOverlay({ slides, initialIdx, seenSlides, onSeen, onClose, dk }: {
  slides: HeroSlide[]
  initialIdx: number
  seenSlides: Set<string>
  onSeen: (href: string) => void
  onClose: () => void
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
      // Swipe DOWN → close feed
      onClose()
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

              {s.subtitle && (
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: '0 0 14px', lineHeight: 1.5,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                  {s.subtitle}
                </p>
              )}

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

              {/* Bottom action area */}
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

function CommunityDiscussionsCard() {
  const [discs, setDiscs] = useState<Discussion[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    fetch('/api/diskusijos?sort=activity&limit=4').then(r => r.json()).then(d => { setDiscs(d.discussions || []); setLoading(false) }).catch(() => setLoading(false))
  }, [])
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
        <span className="font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--text-primary)]">Naujausios diskusijos</span>
        <Link href="/diskusijos" className="text-[11px] font-bold text-[var(--accent-link)] no-underline">Visos →</Link>
      </div>
      <div className="flex-1">
        {loading ? Array(3).fill(null).map((_, i) => (
          <div key={i} className="flex items-center gap-2.5 border-b border-[var(--border-subtle)] px-4 py-2.5">
            <Skel w={28} h={28} r={14} />
            <div className="flex-1"><Skel w="80%" h={11} /><div className="mt-1.5"><Skel w="55%" h={9} /></div></div>
          </div>
        )) : discs.length === 0 ? (
          <div className="px-4 py-6 text-center text-[12px] text-[var(--text-muted)]">Diskusijų dar nėra</div>
        ) : discs.slice(0, 4).map((d, i) => {
          const hue = strHue(d.author_name || '?')
          return (
            <Link key={d.id} href={`/diskusijos/${d.slug}`} className="flex items-center gap-2.5 border-b border-[var(--border-subtle)] px-4 py-2.5 no-underline transition-colors hover:bg-[var(--bg-hover)]" style={{ borderBottomWidth: i === 3 ? 0 : 1 }}>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-['Outfit',sans-serif] text-[11px] font-extrabold" style={{ background: `hsl(${hue},32%,18%)`, color: `hsl(${hue},45%,55%)` }}>
                {(d.author_name || '?').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate font-['Outfit',sans-serif] text-[12.5px] font-bold text-[var(--text-primary)]">{d.title}</p>
                <p className="m-0 mt-0.5 text-[10.5px] text-[var(--text-muted)]">{d.author_name} · {d.comment_count} ats. · {timeAgo(d.created_at)}</p>
              </div>
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

/* ────────────────────────────── Pramogos cards ────────────────────────────── */

function PramogosDienosDainaCard() {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 font-['Outfit',sans-serif] text-[12px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-faint)]">Dienos daina</div>
      <div className="flex-1"><DienosDainaWidget /></div>
    </div>
  )
}

function PramogosBoomboxIntroCard() {
  const [data, setData] = useState<{ image: any; loading: boolean }>({ image: null, loading: true })
  useEffect(() => {
    fetch('/api/boombox/today').then(r => r.json()).then(d => setData({ image: d.image || null, loading: false })).catch(() => setData({ image: null, loading: false }))
  }, [])
  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 font-['Outfit',sans-serif] text-[12px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-faint)]">Boombox</div>
      <Link href="/boombox" className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--accent-orange)]/25 bg-gradient-to-br from-[var(--accent-orange)]/10 to-[var(--accent-blue)]/[0.06] no-underline">
        <div className="relative aspect-video overflow-hidden border-b border-[var(--border-subtle)] bg-[var(--cover-placeholder)]">
          {data.loading ? (
            <div className="absolute inset-0 hp-skel" />
          ) : data.image?.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proxyImg(data.image.image_url)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl">🎵</div>
          )}
          <div className="absolute left-3 top-3 rounded-md bg-black/72 px-2 py-1 backdrop-blur-sm">
            <span className="font-['Outfit',sans-serif] text-[9px] font-extrabold uppercase tracking-[0.08em] text-white">Atspėk iš vaizdo</span>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <p className="m-0 font-['Outfit',sans-serif] text-[15px] font-extrabold leading-tight text-[var(--text-primary)]">{data.image?.title || 'Kuri tai daina?'}</p>
          <p className="m-0 text-[11.5px] text-[var(--text-muted)]">3 misijos · ~2 min · drop'ai. Pradėk nuo paveikslėlio užuominos.</p>
          <span className="mt-auto inline-flex w-fit rounded-md bg-[var(--accent-orange)] px-3 py-1.5 font-['Outfit',sans-serif] text-[11px] font-extrabold text-white">Pradėti →</span>
        </div>
      </Link>
    </div>
  )
}

function PramogosManagerPlaceholderCard() {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 font-['Outfit',sans-serif] text-[12px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-faint)]">Music Manager</div>
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] p-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-blue)]/15 text-2xl">🎚️</div>
        <p className="m-0 font-['Outfit',sans-serif] text-[14px] font-extrabold text-[var(--text-primary)]">Music Manager</p>
        <p className="m-0 text-[11.5px] leading-relaxed text-[var(--text-muted)]">Žaidimas, kuriame valdai savo grupę, planuoji turus, pasirenki pasirodymus. Greitai.</p>
        <span className="mt-1 rounded-md bg-[var(--accent-yellow)]/15 px-2 py-0.5 font-['Outfit',sans-serif] text-[9px] font-extrabold uppercase tracking-[0.08em] text-[var(--accent-yellow)]">Greitai</span>
      </div>
    </div>
  )
}

/* ────────────────────────────── Istorija sekcija ────────────────────────────── */

function IstorijaSection() {
  // Placeholder data — kol nėra DB join'o, rodom tipinius items.
  // TODO: /api/istorija endpoint'as su real anniversaries iš album.year + artist.born/died.
  type IstItem = { id: string; type: 'jubiliejus'|'gimtadienis'|'mirtis'; title: string; subtitle: string; date: string; href: string; emoji: string }
  const items: IstItem[] = [
    { id: 'placeholder-1', type: 'jubiliejus', title: 'Albumų jubiliejai', subtitle: 'Kasdien primename albumų sukaktis', date: 'Kas dieną', href: '/istorija/jubiliejai', emoji: '💿' },
    { id: 'placeholder-2', type: 'gimtadienis', title: 'Atlikėjų gimtadieniai', subtitle: 'Kas šiandien gimęs?', date: 'Šiandien', href: '/istorija/gimtadieniai', emoji: '🎂' },
    { id: 'placeholder-3', type: 'mirtis', title: 'Sukaktys', subtitle: 'Atminčiai — netekties datos', date: 'Atminimas', href: '/istorija/mirtys', emoji: '🕯️' },
  ]
  return (
    <div className="hp-scroll flex items-stretch gap-3 pb-1">
      {items.map(it => (
        <Link
          key={it.id}
          href={it.href}
          className="hp-card group flex shrink-0 flex-col overflow-hidden p-4 no-underline"
          style={{ width: 280, minHeight: 130 }}
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="text-2xl">{it.emoji}</span>
            <span className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--accent-orange)]">{it.date}</span>
          </div>
          <p className="m-0 font-['Outfit',sans-serif] text-[14px] font-extrabold leading-tight text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">{it.title}</p>
          <p className="m-0 mt-1.5 text-[11.5px] leading-relaxed text-[var(--text-muted)]">{it.subtitle}</p>
        </Link>
      ))}
    </div>
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
        <h3 className="m-0 line-clamp-2 max-w-[420px] font-['Outfit',sans-serif] text-[28px] font-black leading-[1.08] tracking-tight text-white transition-opacity group-hover:opacity-90">
          {slide.title}
        </h3>
        {slide.subtitle && (
          <p className="m-0 mt-2 line-clamp-2 max-w-[420px] text-[13px] leading-relaxed text-white/85">
            {slide.subtitle}
          </p>
        )}
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

  // Tile renders a single mosaic cover with title overlay + position number.
  // size 'big' → larger #1 tile; 'sm' → bottom-row tiles.
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
        {/* Bottom gradient for title legibility */}
        <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.55) 35%, rgba(0,0,0,0.12) 60%, rgba(0,0,0,0) 80%)' }} />
        {/* Position badge — top-left */}
        <span
          className="absolute left-2 top-2 inline-flex items-center justify-center rounded-md font-['Outfit',sans-serif] font-black text-white"
          style={{
            background: entry.pos === 1 ? accent : 'rgba(0,0,0,0.78)',
            height: numSize, minWidth: numSize, fontSize: numFont,
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(2px)',
          }}
        >{entry.pos}</span>
        {/* Title + artist — bottom */}
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
      {/* ── LEFT side: chip + chart title + CTA (38% width) ── */}
      <div
        className="relative z-[1] flex h-full flex-col justify-between p-6"
        style={{ width: '38%' }}
      >
        {/* Top: TOP chip + week info */}
        <div className="flex flex-col gap-2.5">
          <span
            className="inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 font-['Outfit',sans-serif] text-[10px] font-black uppercase tracking-[0.08em] text-white"
            style={{ background: accent, boxShadow: `0 2px 12px ${accentSoft}` }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17h2v-7H3v7zm4 0h2V7H7v10zm4 0h2v-4h-2v4zm4 0h2v-9h-2v9zm4-13v13h2V4h-2z"/></svg>
            {isLT ? 'LT TOP 30' : 'TOP 40'}
          </span>
          <p className="m-0 text-[12px] font-medium uppercase tracking-[0.18em] text-white/55">
            Šios savaitės topas
          </p>
        </div>

        {/* Middle: Chart title — extra large */}
        <div className="flex-1 flex items-center">
          <h3
            className="m-0 font-['Outfit',sans-serif] font-black tracking-tight text-white"
            style={{ fontSize: 'clamp(36px, 4.2vw, 56px)', lineHeight: 0.96, letterSpacing: '-0.025em' }}
          >
            {slide.title}
          </h3>
        </div>

        {/* Bottom: Vote CTA + secondary link */}
        <div className="flex flex-col gap-2.5">
          <span
            className="group/cta inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-['Outfit',sans-serif] text-[14px] font-black text-white no-underline transition-all"
            style={{
              background: accent,
              boxShadow: `0 6px 22px ${accentSoft}, 0 2px 8px rgba(0,0,0,0.3)`,
              letterSpacing: '0.02em',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            Balsuok už mėgstamas
          </span>
          <span className="inline-flex items-center gap-1 self-start text-[11.5px] font-bold text-white/55 transition-colors group-hover:text-white/80">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            Pilnas topas
          </span>
        </div>
      </div>

      {/* ── RIGHT side: magazine mosaic (62% width) ── */}
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
          {/* Top-left — #1, large 60% × 60% */}
          <div style={{ gridColumn: 1, gridRow: 1 }}><Tile entry={tops[0]} size="big" /></div>
          {/* Top-right — #2, mid */}
          <div style={{ gridColumn: 2, gridRow: 1 }}><Tile entry={tops[1]} size="md" /></div>
          {/* Bottom row — #3, #4, #5 split equal */}
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} balsavimas`}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
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
          width: '100%', maxWidth: 560, maxHeight: '92vh',
          background: 'linear-gradient(180deg, #0f1320 0%, #060912 100%)',
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          borderTop: `2px solid ${accent}`,
          boxShadow: '0 -24px 80px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column',
          animation: 'cbs-slide 0.28s cubic-bezier(0.32,0.72,0.28,1)',
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
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill={voted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.4">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                    </svg>
                  )}
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
  )
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
  const cover = (t: TopEntry | undefined) => t ? (t.cover_url || t.artist_image) : null

  const [pullY, setPullY] = useState(0)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const pullingRef = useRef(false)
  const justPulledRef = useRef(false)

  const onTouchStart = (e: React.TouchEvent) => {
    startRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    pullingRef.current = false
    setPullY(0)
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!startRef.current) return
    const dx = e.touches[0].clientX - startRef.current.x
    const dy = e.touches[0].clientY - startRef.current.y
    if (!pullingRef.current) {
      if (dy > 14 && dy > Math.abs(dx) * 1.4) {
        pullingRef.current = true
      } else if (Math.abs(dx) > 10) {
        // Horizontal swipe — leisk parent karuselei normaliai scroll'ą
        startRef.current = null
        return
      }
    }
    if (pullingRef.current) {
      setPullY(Math.max(0, Math.min(140, dy)))
    }
  }
  const onTouchEnd = () => {
    const wasPulling = pullingRef.current
    const triggered = wasPulling && pullY > 70
    if (triggered) {
      justPulledRef.current = true
      setTimeout(() => { justPulledRef.current = false }, 350)
      onOpen()
    } else if (wasPulling) {
      // Vartotojas tempė bet nepasiekė threshold — nesuveiks click, bet
      // setTimeout grąžins galimybę paspausti vėliau.
      justPulledRef.current = true
      setTimeout(() => { justPulledRef.current = false }, 200)
    }
    pullingRef.current = false
    setPullY(0)
    startRef.current = null
  }
  const onClick = () => {
    if (justPulledRef.current) return
    onOpen()
  }

  // Vizualinis pull progress — 0..1 mokant CTA hint'ą labiau matomą.
  const pullProgress = Math.min(1, pullY / 70)
  const liftY = pullY * 0.5

  return (
    <button
      onClick={onClick}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        flexShrink: 0, position: 'relative', borderRadius: 16, overflow: 'hidden',
        border: `2px solid ${accent}`,
        background: '#000', cursor: 'pointer', padding: 0, width: 198, height: 300,
        scrollSnapAlign: 'start',
        transform: `translateY(${liftY}px)`,
        transition: pullingRef.current ? 'none' : 'transform 0.25s cubic-bezier(0.32,0.72,0.28,1), border-color 0.15s',
        boxShadow: '0 8px 22px rgba(0,0,0,0.45)',
        textAlign: 'left',
      }}
    >
      {/* BG gradient base */}
      <div style={{
        position: 'absolute', inset: 0,
        background: slide.type === 'chart_lt'
          ? `linear-gradient(180deg, rgba(249,115,22,0.32) 0%, #0a0e1a 35%, #050810 100%)`
          : `linear-gradient(180deg, rgba(59,130,246,0.32) 0%, #0a0e1a 35%, #050810 100%)`,
      }} />

      {/* TOP CHIP */}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 3 }}>
        <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: 9.5, fontWeight: 900, color: '#fff', background: accent, fontFamily: 'Outfit,sans-serif', letterSpacing: '0.08em', textTransform: 'uppercase', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
          {slide.chip}
        </span>
      </div>

      {/* Pull-down indicator — vir top-right, fades-in pulling metu */}
      <div style={{
        position: 'absolute', top: 12, right: 12, zIndex: 3,
        opacity: 0.4 + pullProgress * 0.6,
        transform: `translateY(${pullY * 0.3}px)`,
        transition: pullingRef.current ? 'none' : 'opacity 0.25s, transform 0.25s',
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '4px 8px', borderRadius: 999,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        border: '1px solid rgba(255,255,255,0.18)',
      }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" style={{ transform: `rotate(${pullProgress * 180}deg)`, transition: pullingRef.current ? 'none' : 'transform 0.25s' }}><path d="M6 9l6 6 6-6"/></svg>
        <span style={{ fontSize: 9, fontWeight: 800, color: '#fff', fontFamily: 'Outfit,sans-serif', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Tempk
        </span>
      </div>

      {/* MOSAIC — asimetrinis: #1 didelis kvadratas, #2 šalia, #3-4 apačioj */}
      <div style={{
        position: 'absolute', top: 44, left: 12, right: 12,
        display: 'grid',
        gridTemplateColumns: '2fr 1fr',
        gridTemplateRows: '88px 60px',
        gap: 5,
      }}>
        {/* #1 — top-left, big spans col 1, row 1 */}
        <div style={{ gridColumn: 1, gridRow: 1, position: 'relative', borderRadius: 8, overflow: 'hidden', boxShadow: '0 4px 14px rgba(0,0,0,0.5)' }}>
          {cover(tops[0]) ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={proxyImg(cover(tops[0]) || '')} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 55%)' }} />
              <span style={{ position: 'absolute', top: 5, left: 5, padding: '2px 6px', borderRadius: 5, background: accent, color: '#fff', fontSize: 11, fontWeight: 900, fontFamily: 'Outfit,sans-serif', boxShadow: '0 2px 6px rgba(0,0,0,0.5)' }}>1</span>
              <p style={{ position: 'absolute', left: 5, right: 5, bottom: 4, margin: 0, fontSize: 10.5, fontWeight: 900, color: '#fff', fontFamily: 'Outfit,sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.01em', textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>{tops[0].title}</p>
            </>
          ) : <div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.05)' }} />}
        </div>
        {/* #2 — top-right small */}
        <div style={{ gridColumn: 2, gridRow: 1, position: 'relative', borderRadius: 8, overflow: 'hidden', boxShadow: '0 3px 10px rgba(0,0,0,0.4)' }}>
          {cover(tops[1]) ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={proxyImg(cover(tops[1]) || '')} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.78) 0%, transparent 60%)' }} />
              <span style={{ position: 'absolute', top: 3, left: 3, padding: '1px 5px', borderRadius: 4, background: 'rgba(0,0,0,0.78)', color: '#fff', fontSize: 9.5, fontWeight: 900, fontFamily: 'Outfit,sans-serif' }}>2</span>
              <p style={{ position: 'absolute', left: 3, right: 3, bottom: 2, margin: 0, fontSize: 8.5, fontWeight: 800, color: '#fff', fontFamily: 'Outfit,sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>{tops[1].title}</p>
            </>
          ) : <div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.05)' }} />}
        </div>
        {/* Bottom row spans both cols, split into 2 (3 and 4) */}
        <div style={{ gridColumn: '1 / -1', gridRow: 2, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
          {[2, 3].map(i => (
            <div key={i} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', boxShadow: '0 3px 10px rgba(0,0,0,0.4)' }}>
              {cover(tops[i]) ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={proxyImg(cover(tops[i]) || '')} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 65%)' }} />
                  <span style={{ position: 'absolute', top: 3, left: 3, padding: '1px 5px', borderRadius: 4, background: 'rgba(0,0,0,0.78)', color: '#fff', fontSize: 9.5, fontWeight: 900, fontFamily: 'Outfit,sans-serif' }}>{i + 1}</span>
                  <p style={{ position: 'absolute', left: 4, right: 4, bottom: 2, margin: 0, fontSize: 8.5, fontWeight: 800, color: '#fff', fontFamily: 'Outfit,sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>{tops[i].title}</p>
                </>
              ) : <div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.05)' }} />}
            </div>
          ))}
        </div>
      </div>

      {/* CHART TITLE — centered below mosaic */}
      <div style={{ position: 'absolute', left: 12, right: 12, bottom: 50, zIndex: 2 }}>
        <p style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#fff', fontFamily: 'Outfit,sans-serif', lineHeight: 0.95, letterSpacing: '-0.025em' }}>{slide.title}</p>
      </div>

      {/* CTA "Balsuok" — bottom pinned */}
      <div style={{ position: 'absolute', left: 12, right: 12, bottom: 10, zIndex: 2 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          padding: '8px 10px', borderRadius: 10,
          background: accent, color: '#fff',
          fontFamily: 'Outfit,sans-serif', fontSize: 12, fontWeight: 900,
          letterSpacing: '0.02em',
          boxShadow: `0 4px 14px ${slide.type === 'chart_lt' ? 'rgba(249,115,22,0.45)' : 'rgba(59,130,246,0.45)'}`,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          Balsuok
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

  /* ── Hero state ── */
  const [ltTop, setLtTop] = useState<TopEntry[]>([])
  const [worldTop, setWorldTop] = useState<TopEntry[]>([])
  const [tracks, setTracks] = useState<Track[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
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
    // 7 fetch'ai paraleliai. Kiekvienas baigęsis bumpina loadProgress (0..7)
    // → naudotojas mato realų progresą dash bar'e (mažiau "ilgokai kraunasi"
    // jausmas).
    fetch('/api/top/entries?type=lt_top30').then(r => r.json()).then(d => { setLtTop(parseTop(d.entries || [])); readyBits.current.tops = true; tryReady.current() }).catch(() => { readyBits.current.tops = true; tryReady.current() })
    fetch('/api/top/entries?type=top40').then(r => r.json()).then(d => setWorldTop(parseTop(d.entries || []))).catch(() => {})
    fetch('/api/tracks?limit=24').then(r => r.json()).then(d => { setTracks(d.tracks || []); readyBits.current.tracks = true; tryReady.current() }).catch(() => { readyBits.current.tracks = true; tryReady.current() })
    fetch('/api/albums?limit=24').then(r => r.json()).then(d => setAlbums(d.albums || [])).catch(() => {})
    // Sort artists by score (descending) — kai duomenų bazėje 200+ atlikėjų,
    // Atrask sekcija turėtų rodyti aukščiausiai score'inamus, ne tik
    // alfabetiškai pirmus. Limit'as 24 — pakanka 8 grid'ui + buffer'is jei
    // kas filtruosis.
    fetch('/api/artists?limit=24&sort=score').then(r => r.json()).then(d => setArtists(d.artists || [])).catch(() => {})
    fetch('/api/events?limit=24').then(r => r.json()).then(d => setEvents(d.events || [])).catch(() => {})
    // News + songs vienu request'u (anksčiau buvo /api/news + 30× /api/news/{id}/songs).
    // ?include=songs grąžina { ..., songs: [...] } per news. Hero parsina
    // pirmąją YT-bearing dainą iš to array'aus.
    fetch('/api/news?limit=30&include=songs')
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
  }, [news, events, newsSongs])

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
        @media(min-width:1400px){.hp-hero-slot{width:calc((100% - 80px) / 2)}}
        @media(max-width:768px){.hp-hero-slot{width:calc(88vw)}}
        .hp-scroll::-webkit-scrollbar{display:none}
        .hp-scroll-arrow{position:absolute;top:50%;transform:translateY(-50%);width:28px;height:28px;border-radius:50%;background:rgba(13,19,32,0.85);border:1px solid var(--border-default);color:var(--text-secondary);font-family:'Outfit',sans-serif;font-size:14px;font-weight:600;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:5;transition:opacity .18s,background .15s,color .15s,transform .15s;backdrop-filter:blur(8px);box-shadow:0 2px 10px rgba(0,0,0,0.25);padding:0;line-height:1}
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
        {overlayVisible && (
          <div
            className={pageReady ? 'overlay-fade-out' : ''}
            style={{
              position: 'fixed', inset: 0, zIndex: 9999,
              background: dk ? '#080e1a' : '#f0f4fa',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 18,
              pointerEvents: pageReady ? 'none' : 'auto',
            }}
          >
            {/* music.lt brand mark */}
            <div style={{ display: 'flex', alignItems: 'center', opacity: 0.7 }}>
              <span style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 900, fontSize: 22, color: dk ? '#fff' : '#0f1a2e', letterSpacing: '-0.01em' }}>music.</span>
              <span style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 900, fontSize: 22, color: '#f97316', letterSpacing: '-0.01em' }}>lt</span>
            </div>

            {/* BigEqualizer — vienodas su search'o loader'iu */}
            <span className="eq-loader-big" aria-label="Loading">
              <span /><span /><span /><span /><span />
            </span>
          </div>
        )}
        {pageReady && heroSlides.length > 0 && (
          <section className="hp-hero-v2" ref={heroRef}>
            <div className="mx-auto max-w-[1360px] px-5 pt-5">
              <div className="hp-scroll hp-hero-track flex items-stretch gap-4 pb-1 snap-x snap-mandatory">
                {heroSlides.map((slide, i) => (
                  <div key={i} className="hp-hero-slot shrink-0 snap-start">
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
            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', scrollbarWidth: 'none', height: 318, alignItems: 'stretch', scrollSnapType: 'x mandatory' }}>
              {heroSlides.map((slide, i) => {
                const isChart = slide.type === 'chart_lt' || slide.type === 'chart_world'
                const chartTops = slide.chartTops || []
                if (isChart && chartTops.length > 0) {
                  // ── Chart slide — asimetrinis mosaic + swipe-down → bottom sheet ──
                  return (
                    <MobileChartSlide
                      key={i}
                      slide={slide}
                      onOpen={() => setChartSheet({
                        topType: slide.type === 'chart_lt' ? 'lt_top30' : 'top40',
                        title: slide.title,
                        accent: slide.type === 'chart_lt' ? '#f97316' : '#3b82f6',
                      })}
                    />
                  )
                }
                // ── Default slide (news/event/promo) — opens reels ──
                const isSeen = seenSlides.has(slide.href)
                const artistName = slide.artist?.name || null
                const showExcerpt = slide.type === 'news' && slide.subtitle && slide.subtitle.length > 5
                return (
                  <button key={i} onClick={() => { setReelsIdx(i); setReelsOpen(true) }}
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
                <SectionHead label="Naujos dainos" href="/muzika" />
                {(() => {
                  const isLT = (x: any) => {
                    const c = x.artists?.country
                    return !c || c === 'Lietuva' || c === 'LT' || c === 'Lithuania'
                  }
                  const ltT = tracks.filter(t => sanitizeTitle(t.title) && isLT(t))
                  const wT = tracks.filter(t => sanitizeTitle(t.title) && !isLT(t))
                  return [
                    { lane: 'lt' as const, items: ltT },
                    { lane: 'world' as const, items: wT },
                  ]
                })().map(({ lane, items }, laneIdx) => (
                  <div key={lane} className={laneIdx === 0 ? 'mb-2.5' : ''}>
                    <div className="hp-scroll flex items-center gap-2 pb-0.5">
                      <RowDivider icon={lane} />
                      {tracks.length === 0 ? Array(5).fill(null).map((_, i) => (
                        <div
                          key={i}
                          className="flex shrink-0 items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-3.5 py-3"
                          style={{ width: 220 }}
                        >
                          <Skel w={48} h={48} r={9} />
                          <div className="flex-1">
                            <Skel w="76%" h={11} />
                            <div className="mt-1.5"><Skel w="54%" h={9} /></div>
                          </div>
                        </div>
                      )) : items.length === 0 ? (
                        <div className="flex shrink-0 items-center px-3 py-3 text-[12px] text-[var(--text-faint)]" style={{ width: 220 }}>
                          {lane === 'lt' ? 'Lietuviškų dainų netrukus' : 'Užsienio dainų netrukus'}
                        </div>
                      ) : items.slice(0, 14).map(t => {
                        // API'as grąžina ir `artists.slug` (nested) ir `artist_slug` (flat alias).
                        // Track slug DB'e gali būti null — fallback'inam į client-side
                        // slugify(title), nes route handler trailing-{id} ir taip
                        // redirect'ins į canonical URL su DB slug'u.
                        const artistSlug = t.artists?.slug || (t as any).artist_slug
                        const tSlug = (t as any).slug || quickSlugify(sanitizeTitle(t.title))
                        const href = artistSlug ? `/dainos/${artistSlug}-${tSlug}-${t.id}` : `/dainos/${tSlug}-${t.id}`
                        return (
                          <Link
                            key={t.id}
                            href={href}
                            className="hp-card flex shrink-0 items-center gap-3 px-3.5 py-3"
                            style={{ width: 220 }}
                          >
                            <Cover
                              src={t.cover_url || (t as any).albums_list?.[0]?.cover_image_url}
                              artistSrc={t.artists?.cover_image_url}
                              ytId={extractYouTubeId((t as any).video_url)}
                              alt={sanitizeTitle(t.title)}
                              size={48}
                              radius={9}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="m-0 truncate font-['Outfit',sans-serif] text-[13.5px] font-extrabold text-[var(--text-primary)]">
                                {sanitizeTitle(t.title)}
                              </p>
                              <p className="m-0 mt-1 truncate text-[12px] text-[var(--text-muted)]">
                                {t.artists?.name}
                              </p>
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </section>

              {/* Nauji albumai — vertikali kortelė su kvadratiniu cover'iu
                  (atitinka artist page'o AlbumCard pattern'ą). Cover'is
                  ~140px aiškiai didesnis nei track row'o 38px thumb'as. */}
              <section>
                <SectionHead label="Nauji albumai" href="/muzika?tab=albums" />
                {(() => {
                  const isLT = (x: any) => {
                    const c = x.artists?.country
                    return !c || c === 'Lietuva' || c === 'LT' || c === 'Lithuania'
                  }
                  return [
                    { lane: 'lt' as const, items: albums.filter(isLT) },
                    { lane: 'world' as const, items: albums.filter(a => !isLT(a)) },
                  ]
                })().map(({ lane, items }, laneIdx) => (
                  <div key={lane} className={laneIdx === 0 ? 'mb-3' : ''}>
                    <div className="hp-scroll flex items-stretch gap-3 pb-0.5">
                      <RowDivider icon={lane} />
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
                        const artistSlug = a.artists?.slug || (a as any).artist_slug
                        const aSlug = (a as any).slug || quickSlugify(sanitizeTitle(a.title))
                        const href = artistSlug ? `/albumai/${artistSlug}-${aSlug}-${a.id}` : `/albumai/${aSlug}-${a.id}`
                        return (
                          <Link
                            key={a.id}
                            href={href}
                            className="group block shrink-0 no-underline"
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
                                const rd = (a as any).release_date as string | null
                                const releaseD = rd ? new Date(rd) : null
                                const validRD = releaseD && !isNaN(releaseD.getTime())
                                const diff = validRD ? Math.ceil((releaseD!.getTime() - Date.now()) / 86400000) : null
                                const isUpcoming = (a as any).is_upcoming === true || (diff !== null && diff > 0)
                                const hasContent = !!(a.cover_image_url)
                                let label: string | null = null
                                let highlight = false
                                if (isUpcoming && diff !== null && diff > 0 && diff <= 60) {
                                  label = diff === 1 ? 'Rytoj' : `Po ${diff} d.`
                                  highlight = diff <= 14
                                } else if (isUpcoming && (diff === null || diff > 60) && hasContent) {
                                  label = 'Greitai'
                                  highlight = true
                                } else if (validRD && diff !== null && diff <= 0) {
                                  label = `${MONTHS_LT[releaseD!.getMonth()]}. ${releaseD!.getDate()}, ${releaseD!.getFullYear()}`
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
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </section>
          {/* ── Renginiai LT + Užsienio: 2 lanes su badge'ais 'NAUJIENA' / 'GREITAI' ── */}
          <section>
            <SectionHead label="Renginiai" href="/renginiai" />
            {(() => {
              // LT cities heuristic — visa kita laikoma "užsienis"
              const LT_CITIES = new Set(['Vilnius','Kaunas','Klaipėda','Klaipeda','Šiauliai','Siauliai','Panevėžys','Panevezys','Alytus','Marijampolė','Marijampole','Mažeikiai','Mazeikiai','Jonava','Utena','Kėdainiai','Kedainiai','Tauragė','Taurage','Telšiai','Telsiai','Visaginas','Plungė','Plunge','Druskininkai','Palanga','Anykščiai','Anyksciai','Trakai','Birštonas','Birstonas','Ukmergė','Ukmerge','Kretinga','Šilutė','Silute','Radviliškis','Radviliskis','Rokiškis','Rokiskis','Elektrėnai','Elektrenai','Šalčininkai','Salcininkai','Pakruojis','Lentvaris'])
              const isLT = (ev: any) => {
                const c = ev.venues?.city || (ev as any).city || ''
                return c ? LT_CITIES.has(c) : true // be city — laikom LT
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
                      <div className="hp-scroll flex items-stretch gap-3 pb-1">
                        <RowDivider icon={lane} />
                        {filtEvt.length === 0 ? Array(4).fill(null).map((_, i) => (
                          <div
                            key={i}
                            className="flex shrink-0 items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-2"
                            style={{ height: 110 }}
                          >
                            <Skel w={94} h={94} r={9} />
                            <div className="flex-1" style={{ width: 200 }}>
                              <Skel w="80%" h={11} />
                              <div className="mt-1.5"><Skel w="55%" h={9} /></div>
                              <div className="mt-2"><Skel w="35%" h={8} /></div>
                            </div>
                          </div>
                        )) : items.length === 0 ? (
                          <div className="flex h-[110px] shrink-0 items-center px-3 text-[12px] text-[var(--text-faint)]">
                            {lane === 'lt' ? 'Lietuvoje renginių nėra' : 'Užsienio renginių nėra'}
                          </div>
                        ) : items.slice(0, 14).map(ev => {
                          const dateRaw = (ev as any).start_date || ev.event_date
                          const d = dateRaw ? new Date(dateRaw) : null
                          const validDate = d && !isNaN(d.getTime())
                          const diffDays = validDate ? Math.ceil((d!.getTime() - Date.now()) / 86400000) : null
                          const isClose = diffDays !== null && diffDays >= 0 && diffDays <= 3
                          const isUpcoming = diffDays !== null && diffDays >= 0 && diffDays <= 7
                          const created = ev.created_at ? new Date(ev.created_at) : null
                          const ageDays = created ? (Date.now() - created.getTime()) / 86400000 : 999
                          const isNew = ageDays <= 7
                          const countdown = diffDays === null || diffDays < 0 ? null : diffDays === 0 ? 'Šiandien' : diffDays === 1 ? 'Rytoj' : `Po ${diffDays}d.`
                          const imgSrc = ev.image_small_url || ev.cover_image_url || null
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
                              className="hp-card group flex shrink-0 items-stretch gap-0 overflow-hidden p-0 no-underline"
                              style={{ height: 110 }}
                            >
                              {/* Image — height-driven, natural aspect ratio */}
                              <div className="relative h-full shrink-0 bg-[var(--cover-placeholder)]">
                                {imgSrc ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={proxyImg(imgSrc)}
                                    alt={artistText}
                                    loading="lazy"
                                    className="h-full w-auto max-w-[200px] object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                                    style={{ display: 'block' }}
                                  />
                                ) : (
                                  <div className="flex h-full items-center justify-center px-6 text-2xl text-[var(--text-faint)]">🎵</div>
                                )}
                                {validDate && (
                                  <div className="absolute left-1.5 top-1.5 rounded-md bg-black/72 px-1.5 py-1 backdrop-blur-sm">
                                    <div className="font-['Outfit',sans-serif] text-[13px] font-extrabold leading-none text-white">{d!.getDate()}</div>
                                    <div className="mt-0.5 text-[8px] font-bold uppercase leading-none tracking-[0.06em] text-white/85">{MONTHS_LT[d!.getMonth()]}</div>
                                  </div>
                                )}
                              </div>
                              {/* Info */}
                              <div className="flex min-w-0 flex-col justify-between px-3 py-2.5" style={{ width: 220 }}>
                                <div className="min-w-0">
                                  <div className="mb-1 flex flex-wrap items-center gap-1">
                                    {isNew && (
                                      <span className="rounded bg-[var(--accent-green)]/15 px-1.5 py-0.5 font-['Outfit',sans-serif] text-[8.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--accent-green)]">NAUJIENA</span>
                                    )}
                                    {isUpcoming && (
                                      <span className="rounded bg-[var(--accent-orange)]/15 px-1.5 py-0.5 font-['Outfit',sans-serif] text-[8.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--accent-orange)]">GREITAI</span>
                                    )}
                                  </div>
                                  {validDate && (
                                    <p className="m-0 mb-1 truncate font-['Outfit',sans-serif] text-[12px] font-extrabold uppercase tracking-[0.04em] text-[var(--accent-orange)]">
                                      {d!.getDate()} {MONTHS_FULL_LT[d!.getMonth()]} {d!.getFullYear()} m.
                                    </p>
                                  )}
                                  <p className="m-0 line-clamp-2 font-['Outfit',sans-serif] text-[13px] font-extrabold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">
                                    {artistText}
                                  </p>
                                  {venueLabel && (
                                    <p className="m-0 mt-1 truncate text-[11px] text-[var(--text-muted)]">
                                      {venueLabel}
                                    </p>
                                  )}
                                </div>
                                {countdown && (
                                  <span className={`mt-1 inline-flex w-fit rounded-md px-1.5 py-0.5 font-['Outfit',sans-serif] text-[10px] font-extrabold ${
                                    isClose
                                      ? 'bg-[var(--accent-orange)] text-white'
                                      : 'bg-[var(--bg-active)] text-[var(--text-muted)]'
                                  }`}>
                                    {countdown}
                                  </span>
                                )}
                              </div>
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </>
              )
            })()}
          </section>



          {/* ── BENDRUOMENĖ — naujausios diskusijos + main chat + vartotojų įrašai ── */}
          <section>
            <SectionHead label="Bendruomenė" href="/bendruomene" cta="Daugiau →" />
            <div className="hp-triple" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, alignItems: 'stretch' }}>
              <CommunityDiscussionsCard />
              <CommunityChatCard />
              <CommunityUserPostsCard />
            </div>
          </section>

          {/* ── PRAMOGOS — Dienos daina + Boombox intro + Music Manager placeholder ── */}
          <section>
            <SectionHead label="Pramogos" href="/pramogos" cta="Daugiau →" />
            <div className="hp-triple" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, alignItems: 'stretch' }}>
              <PramogosDienosDainaCard />
              <PramogosBoomboxIntroCard />
              <PramogosManagerPlaceholderCard />
            </div>
          </section>

          {/* ── ISTORIJA — sukaktys, jubiliejai, gimtadieniai ── */}
          <section>
            <SectionHead label="Istorija" href="/istorija" cta="Daugiau →" />
            <IstorijaSection />
          </section>

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
      </div>
    </>
  )
}
