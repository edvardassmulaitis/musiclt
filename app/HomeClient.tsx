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
// PERF 2026-07-16: kortelėms naudojam proxyImgResized (weserv &w= + webp) —
// anksčiau visos nuotraukos ėjo ORIGINALAUS dydžio (1500–3000px dekodavimas į
// ~200px plotelį = scroll jank). Plotis parenkamas ~2× kortelės CSS pločio.
import { proxyImg, proxyImgResized } from '@/lib/img-proxy'
import { sanitizeRichHtml } from '@/lib/sanitize-html'
import { deviceFpSync } from '@/lib/device-fp'
import { HomeTrackModal } from '@/components/HomeTrackModal'
import AlbumInfoModal from '@/components/AlbumInfoModal'
import { HomeListModal } from '@/components/HomeListModal'
import { HomeListContent } from '@/components/HomeListContent'
import Scroller from '@/components/ui/Scroller'
import BendruomeneSection from '@/components/home/BendruomeneSection'
import { DienosDainaHero } from '@/components/DienosDainaHero'

/* ────────────────────────────── Types ────────────────────────────── */
type Track = { id: number; slug: string; title: string; cover_url: string | null; created_at: string; artists: { id: number; slug: string; name: string; cover_image_url?: string | null } | null }
type Album = { id: number; slug: string; title: string; year: number | null; cover_image_url: string | null; created_at: string; artists: { id: number; slug: string; name: string; cover_image_url?: string | null } | null }
type Artist = { id: number; slug: string; name: string; cover_image_url: string | null }
type EventArtist = { artists?: { id: number; name: string; slug: string; cover_image_url?: string | null; country?: string | null } | null; artist_id?: number; sort_order?: number; is_headliner?: boolean }
type Event = { id: number; slug: string; title: string; event_date?: string; start_date?: string; end_date?: string; venue_custom?: string | null; venue_name?: string | null; venue_id?: number | null; image_small_url?: string | null; cover_image_url?: string | null; image_url?: string | null; city?: string | null; address?: string | null; created_at?: string; is_festival?: boolean; ticket_url?: string | null; price_from?: number | null; venues?: { name: string; city: string } | null; event_artists?: EventArtist[] | null }
type NewsItem = { id: number; slug: string; title: string; image_small_url: string | null; image_title_url?: string | null; published_at: string; type: string | null; excerpt?: string | null; songs?: { youtube_url?: string | null; title?: string | null; artist_name?: string | null; cover_url?: string | null }[]; artist: { name: string; slug: string; cover_image_url?: string | null } | null }
type TopEntry = { pos: number; track_id: number; title: string; artist: string; cover_url: string | null; artist_image: string | null; trend: string; prevPos?: number | null; wks?: number; slug?: string; artist_slug?: string; videoId?: string | null }
type Discussion = { id: number; slug: string; title: string; author_name: string | null; comment_count: number; created_at: string; tags: string[] }
// Dienos daina tipai — sekcija ekstrahuota į components/DienosDainaSection.tsx,
// bet DienosDainaWidget (šoninis mini-widget) vis dar naudoja Nomination.
type Proposer = { username: string | null; full_name: string | null; avatar_url: string | null }
type Nomination = { id: number; votes: number; weighted_votes: number; comment?: string | null; user_id?: string | null; tracks: { id: number; title: string; cover_url: string | null; slug?: string | null; video_url?: string | null; artists: { name: string; slug?: string | null; cover_image_url?: string | null } | null } | null; proposer?: Proposer | null; voters?: Proposer[]; anon_votes?: number; own?: boolean }
type HeroSlide = {
  type: string; chip: string; chipBg: string; title: string; subtitle: string
  subtitleShort?: string  // kompaktiška meta mobile kortelei (be venue/metų)
  href: string; bgImg?: string | null; videoId?: string | null
  songTitle?: string | null; songArtist?: string | null; songCover?: string | null
  artist?: { name: string; slug: string; image?: string | null } | null
  chartTops?: TopEntry[]
  // ── Reader v3 papildomi laukai ──
  newsId?: number | null            // pilno body lazy-fetch'ui (/api/news/[id])
  blogId?: string | null            // bendruomenės įrašo pilno body lazy-fetch'ui (/api/blog/posts/[id])
  body?: string | null              // jau turimas pilnas/preview HTML (be fetch'o)
  excerpt?: string | null           // ilgesnis preview tekstas (verta/discovery/recording)
  metaLine?: string | null          // vieta · data / trukmė ir pan.
  ctaLabel?: string | null          // pirminis veiksmas: „Skaityti" / „Žiūrėti" / „Žemėlapis"
  ticketUrl?: string | null         // renginiams — „Pirkti bilietą"
  authorName?: string | null        // user content — autorius
  authorAvatar?: string | null
  likeable?: boolean                // ar rodyti ♥ (news kol kas)
  fresh24?: boolean                 // pridėtas/paskelbtas DB per pask. 24h → žalias taškas
  songs?: { videoId: string; title: string; artist?: string | null }[]  // news su KELIOM dainom → mini-playlist
  lineup?: { name: string; slug: string; image?: string | null }[]      // event — pilnas lineup (avatarai + nuorodos)
}

/* ────────────────────────────── Helpers ────────────────────────────── */
const MONTHS_LT = ['Sau', 'Vas', 'Kov', 'Bal', 'Geg', 'Bir', 'Lie', 'Rgp', 'Rgs', 'Spa', 'Lap', 'Gru']
const MONTHS_FULL_LT = ['sausio', 'vasario', 'kovo', 'balandžio', 'gegužės', 'birželio', 'liepos', 'rugpjūčio', 'rugsėjo', 'spalio', 'lapkričio', 'gruodžio']

function sanitizeTitle(raw: string): string {
  return raw.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Ar įrašas pateko į DB / paskelbtas per paskutines 24h. Naudojama „naujumo"
 *  žaliam taškui (hero, naujos dainos/albumai, greitai pasirodys, renginiai).
 *  Skaičiuojama KLIENTE render metu — todėl tikslu net jei snapshot'as pasenęs
 *  (created_at yra absoliuti data). */
const FRESH_DOT_MS = 24 * 60 * 60 * 1000
function isFresh24(input: string | null | undefined): boolean {
  if (!input) return false
  const t = Date.parse(input)
  if (isNaN(t)) return false
  const age = Date.now() - t
  return age >= 0 && age < FRESH_DOT_MS
}

/** Žalias „nauja per 24h" taškas — fiksuojamas viršutiniame dešiniame kampe.
 *  Tas pats vizualinis modelis kaip mobiliojo hero „neperžiūrėta" taškas, tik
 *  žalias ir pagal DB amžių (ne per-naudotojo seen). Dėklas turi būti
 *  position:relative. */
function FreshDot({ right = 8, top = 8 }: { right?: number; top?: number }) {
  // Vizualas = radaro „blip" taškas (RadarSweepMini): grynas žalias su švelniu
  // švytėjimu (be balto rėmelio) + lengvas pulsavimas. Stilius .hp-freshdot
  // pagrindiniame <style> bloke.
  return (
    <span
      aria-label="Nauja"
      title="Pridėta per pastarąsias 24 val."
      className="hp-freshdot"
      style={{ position: 'absolute', top, right, zIndex: 4, pointerEvents: 'none' }}
    />
  )
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
  // Badge kontekstas (cover'io kampas) — trumpa forma be „Prieš", kad badge'as
  // neišsitemptų ant siaurų mobile kortelių (2026-07 UX auditas).
  if (diffDays < 7) return `${diffDays} d.`
  if (diffDays < 30) return `${Math.round(diffDays / 7)} sav.`
  const months = Math.floor(diffDays / 30)
  if (months < 12) return `${months} mėn.`
  return `${Math.floor(diffDays / 365)} m.`
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

/* Šalies vėliava iš atlikėjo `country` lauko (LT pavadinimai). Nežinomai
 * šaliai grąžina null — vėliava tiesiog nerodoma. 2026-06-26. */
const COUNTRY_FLAG: Record<string, string> = {
  'Lietuva': '🇱🇹', 'LT': '🇱🇹', 'Lithuania': '🇱🇹',
  'Latvija': '🇱🇻', 'Estija': '🇪🇪', 'Lenkija': '🇵🇱', 'Rusija': '🇷🇺', 'Ukraina': '🇺🇦', 'Baltarusija': '🇧🇾',
  'Vokietija': '🇩🇪', 'Prancūzija': '🇫🇷', 'Ispanija': '🇪🇸', 'Italija': '🇮🇹', 'Portugalija': '🇵🇹',
  'Švedija': '🇸🇪', 'Norvegija': '🇳🇴', 'Danija': '🇩🇰', 'Suomija': '🇫🇮', 'Islandija': '🇮🇸',
  'Nyderlandai': '🇳🇱', 'Belgija': '🇧🇪', 'Austrija': '🇦🇹', 'Šveicarija': '🇨🇭', 'Čekija': '🇨🇿',
  'Vengrija': '🇭🇺', 'Airija': '🇮🇪', 'Graikija': '🇬🇷', 'Kroatija': '🇭🇷', 'Slovėnija': '🇸🇮',
  'Anglija': '🇬🇧', 'Jungtinė Karalystė': '🇬🇧', 'UK': '🇬🇧', 'United Kingdom': '🇬🇧',
  'JAV': '🇺🇸', 'USA': '🇺🇸', 'United States': '🇺🇸', 'Jungtinės Amerikos Valstijos': '🇺🇸',
  'Kanada': '🇨🇦', 'Australija': '🇦🇺', 'Naujoji Zelandija': '🇳🇿', 'Brazilija': '🇧🇷', 'Meksika': '🇲🇽',
  'Japonija': '🇯🇵', 'Pietų Korėja': '🇰🇷', 'Kinija': '🇨🇳',
}
function countryFlag(c?: string | null): string | null {
  if (!c) return null
  return COUNTRY_FLAG[c.trim()] || null
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
  if (imgSrc) return <img src={proxyImgResized(imgSrc, 128)} alt={alt} loading="lazy" decoding="async" style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', flexShrink: 0, display: 'block' }} />
  return (
    <div style={{ width: size, height: size, borderRadius: radius, flexShrink: 0, background: `linear-gradient(135deg, hsl(${h},38%,16%), hsl(${(h + 40) % 360},28%,10%))`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: `hsl(${h},45%,45%)`, fontSize: size * 0.38, fontWeight: 800, fontFamily: 'Outfit, sans-serif' }}>
      {alt[0]?.toUpperCase() || '?'}
    </div>
  )
}

function TrendIcon({ t }: { t: string }) {
  if (t === 'up') return <span className="text-[12px] font-black text-[var(--accent-green)]">▲</span>
  if (t === 'down') return <span className="text-[12px] font-black text-[var(--accent-red)]">▼</span>
  if (t === 'new') return <span className="rounded-[3px] bg-[var(--accent-yellow)]/15 px-[5px] py-px text-[12px] font-extrabold tracking-[0.04em] text-[var(--accent-yellow)]">N</span>
  return <span className="text-[12px] text-[var(--text-faint)]">–</span>
}

function Skel({ w, h, r = 6 }: { w: number | string; h: number; r?: number }) {
  return <div className="hp-skel" style={{ width: w, height: h, borderRadius: r, flexShrink: 0 }} />
}

/** Equalizer skeleton kortelė — „muzikinis" placeholder'is (toks pat vibe kaip
 *  /atrasti hero `.atr-eq`). Cover'io vietoje pulsuoja oranžinis equalizer'is,
 *  apačioje — dvi tekstos linijos (title/artist). Naudojama „Naujos dainos /
 *  Nauji albumai" sekcijų loading state'e vietoj plokščių pilkų blokų. */
function EqSkel({ w, h, r = 12 }: { w: number; h: number; r?: number }) {
  return (
    <div className="shrink-0" style={{ width: w }}>
      <div className="hp-eq-card" style={{ width: w, height: h, borderRadius: r }}>
        <span className="hp-eq" aria-hidden="true"><span /><span /><span /><span /><span /></span>
      </div>
      <div className="mt-2"><Skel w="80%" h={12} /></div>
      <div className="mt-1"><Skel w="60%" h={10} /></div>
    </div>
  )
}

/** Užkrovimo klaidos kortelė su „Bandyti dar kartą" mygtuku. Rodoma kai
 *  /api/home/latest fetch'as galutinai fail'ino (po retry) — kad vartotojas
 *  nematytų amžinų skeletonų ir galėtų perpaleisti rankiniu būdu. */
function LoadErrorCard({ onRetry, height = 112 }: { onRetry: () => void; height?: number }) {
  // ── Auto-self-heal („kad neliktų užstrigęs ant rankinio mygtuko") ──
  // Kai ši kortelė parodoma (sekcija fail'ino), AUTOMATIŠKAI perbandom po kelių
  // sekundžių — vartotojui nebereikia spausti. Jei perbandymas vėl fail'ina,
  // sumonteruojamas naujas šios kortelės instancas → vėl perbando → savaiminis
  // atsistatymas, kol /api/home/latest atsako (serveris jau pataisytas, atsako).
  // SĄMONINGAI įdėta šitame mažame leaf komponente, kad paralelinės sesijos,
  // perrašydamos didžiąją HomeClient render logiką, NEnuplautų self-heal'o
  // (taip jau nutiko 2026-06-21 — žr. HOMEPAGE_LATEST_LOADING_HANDOFF.md).
  useEffect(() => {
    const t = setTimeout(() => { onRetry() }, 3500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div
      className="flex shrink-0 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] px-5"
      style={{ height, minWidth: 220 }}
    >
      <span
        aria-hidden
        style={{
          width: 18, height: 18, borderRadius: '50%',
          border: '2px solid var(--border-default)', borderTopColor: 'var(--accent-orange)',
          display: 'inline-block', animation: 'mz-spin 0.8s linear infinite',
        }}
      />
      <span className="text-[14px] text-[var(--text-muted)]">Atnaujinama…</span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-full bg-[var(--accent-orange)] px-3.5 py-1 font-['Outfit',sans-serif] text-[14px] font-bold text-white transition-opacity hover:opacity-85"
      >
        Bandyti dar kartą
      </button>
      <style>{'@keyframes mz-spin{to{transform:rotate(360deg)}}'}</style>
    </div>
  )
}

/** Tailwind versija SH'o — naudojam naujose sekcijose, kad font/letter-spacing
 *  atitiktų artist page'o tipografiją (`font-['Outfit',sans-serif]` +
 *  `tracking-[-0.01em]` + truputį didesnis font-size 18px). */
function SectionHead({ label, href, cta = 'Daugiau →', onMore }: { label: React.ReactNode; href?: string; cta?: string; onMore?: () => void }) {
  const ctaCls = "font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--accent-orange)] no-underline transition-opacity hover:opacity-70"
  return (
    <div className="mb-3.5 flex items-center justify-between">
      <h2 className="m-0 font-['Outfit',sans-serif] text-[20px] font-extrabold tracking-[-0.01em] text-[var(--text-primary)] sm:text-[20px]">{label}</h2>
      {onMore ? (
        <button type="button" onClick={onMore} className={ctaCls}>{cta}</button>
      ) : href ? (
        <Link href={href} className={ctaCls}>{cta}</Link>
      ) : null}
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
          <p className="m-0 mb-0.5 text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Šiandien pirmauja</p>
          <h3 className="m-0 truncate font-['Outfit',sans-serif] text-[16px] font-extrabold leading-tight text-[var(--text-primary)]">
            {sanitizeTitle(w?.tracks?.title || 'Dar nėra')}
          </h3>
          <p className="m-0 text-[14px] text-[var(--text-muted)]">{w?.tracks?.artists?.name || ''}</p>
        </div>
        <Link
          href="/dienos-daina"
          className="shrink-0 rounded-[20px] bg-[var(--accent-orange)] px-3.5 py-[7px] text-[16px] font-extrabold text-white no-underline shadow-[0_3px_14px_rgba(249,115,22,0.35)] transition-transform hover:-translate-y-px"
        >
          Balsuoti
        </Link>
      </div>
      <div>
        <div className="flex items-center justify-between px-4 pb-1.5 pt-2">
          <span className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-faint)]">Rytdienos kandidatai</span>
          <Link href="/dienos-daina" className="text-[12px] font-bold text-[var(--accent-link)] no-underline">+ Siūlyti</Link>
        </div>
        {noms.length === 0 ? (
          <div className="px-4 py-3.5 text-center text-[14px] text-[var(--text-muted)]">Kol kas nėra nominacijų</div>
        ) : noms.slice(0, 5).map((n, i) => (
          <div
            key={n.id}
            className="flex items-center gap-2 border-t border-[var(--border-subtle)] px-4 py-1.5 transition-colors hover:bg-[var(--bg-hover)]"
          >
            <span className="w-3.5 shrink-0 text-center text-[12px] font-extrabold text-[var(--text-faint)]">{i + 1}</span>
            <Cover src={n.tracks?.cover_url} alt={n.tracks?.title || '?'} size={26} radius={6} />
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-[14px] font-bold text-[var(--text-primary)]">{sanitizeTitle(n.tracks?.title || '')}</p>
              <p className="m-0 text-[12px] text-[var(--text-muted)]">{n.tracks?.artists?.name}</p>
            </div>
            <button
              onClick={() => voted === null && setVoted(i)}
              disabled={voted !== null}
              className={`shrink-0 rounded-[10px] border px-2 py-[3px] text-[12px] font-bold transition-all ${
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
      href="/zaidimai/dienos-issukis"
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
        DIENOS IŠŠŪKIS
      </div>
      <div className="mb-3 text-[14px] text-[var(--text-secondary)]">
        Atspėk 5 dainas ir atlik dienos užduotis — apie 3 min.
      </div>

      {state.loading ? null : state.hasContent ? (
        <div className="flex items-center gap-2 text-[14px] text-[var(--text-muted)]">
          {state.completedToday > 0 && (
            <span className="text-[var(--accent-green)]">✓ {state.completedToday}/3</span>
          )}
          {state.streak > 0 && (
            <span className="text-[var(--accent-orange)]">🔥 {state.streak} d.</span>
          )}
          <span className="ml-auto font-semibold text-[var(--accent-orange)]">Pradėti →</span>
        </div>
      ) : (
        <div className="text-[14px] text-[var(--text-faint)]">Kvizas laukia — žaisk dabar</div>
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
            <p className="m-0 font-['Outfit',sans-serif] text-[16px] font-extrabold text-[var(--text-primary)]">Žmonių zona — netrukus</p>
            <p className="m-0 mt-1 text-[14px] text-[var(--text-muted)]">
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
                <span className={`rounded px-1.5 py-0.5 font-['Outfit',sans-serif] text-[12px] font-extrabold uppercase tracking-[0.06em] ${
                  it.type === 'blog'
                    ? 'bg-[var(--accent-orange)]/15 text-[var(--accent-orange)]'
                    : 'bg-[var(--accent-link)]/15 text-[var(--accent-link)]'
                }`}>{it.badge}</span>
              )}
              <span className="ml-auto text-[12px] text-[var(--text-faint)]">{timeAgo(it.created_at)}</span>
            </div>
            <p className="m-0 line-clamp-2 font-['Outfit',sans-serif] text-[16px] font-extrabold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">
              {it.title}
            </p>
            {it.excerpt && (
              <p className="m-0 mt-1.5 line-clamp-2 text-[14px] text-[var(--text-muted)]">
                {it.excerpt}
              </p>
            )}
            <p className="m-0 mt-auto pt-2 truncate text-[14px] text-[var(--text-secondary)]">
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
              <span key={t} className="rounded bg-[var(--bg-active)] px-1.5 py-0.5 text-[12px] font-extrabold text-[var(--accent-link)]">{t}</span>
            ))}
            <span className="ml-auto text-[12px] text-[var(--text-faint)]">{timeAgo(d.created_at)}</span>
          </div>
          <p className="m-0 mb-1.5 line-clamp-2 font-['Outfit',sans-serif] text-[14px] font-bold leading-snug text-[var(--text-primary)]">{d.title}</p>
          <p className="m-0 text-[12px] text-[var(--text-muted)]">{d.author_name} · {d.comment_count} atsak.</p>
        </Link>
      ))}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════
                         REELS OVERLAY COMPONENT
   ════════════════════════════════════════════════════════════════════ */

const REELS_DURATION = 13000
/* Auto-advance trukmė pagal slide tipą: ilgas skaitomas turinys gauna daugiau,
 * trumpos vizualinės kortelės — mažiau. Interaktyvios (chart/daily) auto
 * neturi iš viso (žr. `interactive`). */
function slideDuration(s: HeroSlide): number {
  if (s.type === 'news' || s.type === 'blog') return 18000
  if (s.type === 'daily_winner' || s.type === 'event' || s.type === 'verta' || s.type === 'discovery' || s.type === 'recording' || s.type === 'promo' || s.type === 'custom') return 9000
  return REELS_DURATION
}
/* Unikalus slide raktas „peržiūrėta" žymėjimui. Anksčiau buvo vien href —
 * `daily` ir `daily_winner` abu turi /dienos-daina, tad peržiūrėjus vieną
 * pasižymėdavo abu. */
const slideKey = (s: HeroSlide) => `${s.type}::${s.href}`

/** Pilno news straipsnio body cache — modulio lygyje, kad keičiant slide'us
 *  nereiktų perkrauti to paties straipsnio iš naujo. */
const newsBodyCache = new Map<number, string>()
const blogPostCache = new Map<string, any>()

/** Legacy blog turinio valymas reader'iui: nukerpa scraper'io „mėgstamų" lentelės
 *  šlamštą gale, pašalina klaidingus </img>, santykinius music.lt kelius → absoliučius. */
function cleanBlogHtml(html?: string | null): string {
  let s = String(html || '')
  s = s.replace(/<table[\s\S]*$/i, '')                 // legacy favorite_a lentelė + šlamštas gale
  s = s.replace(/<\/img>/gi, '')                         // klaidingi uždarymo tag'ai
  s = s.replace(/(src|href)="(?!https?:|\/\/|\/|#|data:|mailto:|javascript:)/gi, '$1="https://www.music.lt/')
  return s.trim()
}

/** YouTube IFrame Player API loader — modulio lygio, script'as injektuojamas
 *  VIENĄ kartą, visi kvietėjai gauna tą patį promise. Reikalingas „vieno tap'o"
 *  grojimui: iš anksto sukurtas cued grotuvas + playVideo() SINCHRONIŠKAI
 *  paspaudimo handler'yje išlaiko user activation (iOS Safari įsk.). */
/** Pozicijos pokyčio ženkliukas topo eilutėje: ▲n pakilo / ▼n nukrito / = ta
 *  pati vieta / N — naujokas. Duomenys iš /api/top/entries (prev_position, is_new). */
function TrendBadge({ prev, pos, isNew }: { prev?: number | null; pos: number; isNew?: boolean }) {
  if (isNew) return <i className="rdr-trend new">N</i>
  if (typeof prev !== 'number' || prev === pos) return <i className="rdr-trend same">=</i>
  return prev > pos
    ? <i className="rdr-trend up">▲{prev - pos}</i>
    : <i className="rdr-trend down">▼{pos - prev}</i>
}

/** Inline topas reader'yje — visas sąrašas, balsavimas KAIP regular topo psl.
 *  („+" mygtukas, daug kartų iki 10/daina, votes_per_track), grojimas per
 *  „Muzika" embed sekciją žemiau (onPlay). */
function ChartVoteList({ topType, accent, onPlay }: { topType: 'lt_top30' | 'top40'; accent: string; onPlay: (videoId: string, meta?: { title?: string | null; artist?: string | null; cover?: string | null }) => void }) {
  const WEEKLY = 10
  const [entries, setEntries] = useState<any[]>([])
  const [weekId, setWeekId] = useState<number | null>(null)
  const [counts, setCounts] = useState<Record<number, number>>({})
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let c = false
    setLoading(true)
    fetch(`/api/top/entries?type=${topType}`)
      .then(r => r.json())
      .then(d => {
        if (c) return
        setWeekId(d.week?.id ?? null)
        setEntries((d.entries || []).map((e: any, i: number) => ({
          pos: e.position ?? (i + 1),
          track_id: e.track_id,
          title: sanitizeTitle(e.tracks?.title || ''),
          artist: e.tracks?.artists?.name || '',
          cover: e.tracks?.cover_url || e.tracks?.artists?.cover_image_url || null,
          videoId: extractYouTubeId(e.tracks?.video_url || null),
          prev: typeof e.prev_position === 'number' ? e.prev_position : null,
          isNew: !!e.is_new,
        })))
        if (d.week?.id) fetch(`/api/top/vote?week_id=${d.week.id}`).then(r => r.json()).then(v => { if (!c) setCounts(v.votes_per_track || {}) }).catch(() => {})
      })
      .catch(() => {})
      .finally(() => { if (!c) setLoading(false) })
    return () => { c = true }
  }, [topType])

  const vote = async (track_id: number) => {
    if (!weekId || busy) return
    if ((counts[track_id] || 0) >= WEEKLY) return
    setBusy(true)
    setCounts(p => ({ ...p, [track_id]: (p[track_id] || 0) + 1 }))
    try {
      const r = await fetch('/api/top/vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ track_id, week_id: weekId, vote_type: 'like', fingerprint: deviceFpSync() }) })
      if (r.status === 401) { setCounts(p => ({ ...p, [track_id]: Math.max(0, (p[track_id] || 0) - 1) })); window.location.href = '/auth/signin'; return }
      if (!r.ok) setCounts(p => ({ ...p, [track_id]: Math.max(0, (p[track_id] || 0) - 1) }))
    } catch { setCounts(p => ({ ...p, [track_id]: Math.max(0, (p[track_id] || 0) - 1) })) } finally { setBusy(false) }
  }

  if (loading) return <div className="rdr-load"><span /><span /><span /></div>
  return (
    <div className="rdr-cvl">
      <div className="rdr-cvl-head">Balsuok už mėgstamas</div>
      {entries.map(e => {
        const n = counts[e.track_id] || 0
        const maxed = n >= WEEKLY
        return (
          <div key={e.track_id} className="rdr-chart-row">
            <span className="rdr-chart-pos">{e.pos}<TrendBadge prev={e.prev} pos={e.pos} isNew={e.isNew} /></span>
            <button className="rdr-cvl-cover" onClick={() => e.videoId && onPlay(e.videoId, { title: e.title, artist: e.artist, cover: e.cover })} disabled={!e.videoId} aria-label="Groti">
              {e.cover ? <img src={proxyImgResized(e.cover, 96)} alt="" loading="lazy" decoding="async" /> : <span className="rdr-chart-ph" />}
              {e.videoId && <span className="rdr-cvl-play"><svg width="13" height="13" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg></span>}
            </button>
            <span className="rdr-chart-info"><b>{e.title}</b><i>{e.artist}</i></span>
            <button className={`rdr-cvl-vote${n > 0 ? ' voted' : ''}`} disabled={maxed} onClick={() => vote(e.track_id)}
              aria-label="Balsuoti" title={maxed ? 'Pasiektas maks. balsų' : 'Spausk tiek kartų, kiek nori'}>
              {n > 0
                ? <span className="rdr-cvl-mine">{n}</span>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>}
            </button>
          </div>
        )
      })}
    </div>
  )
}

/** Šiandienos dienos dainos kandidatai — balsavimas (1×/daina) + popbar
 *  (lyderis VISADA max) + siūlymas. Grojimas per „Muzika" embed sekciją žemiau. */
function DailyCandidates({ onPlay }: { onPlay: (videoId: string, meta?: { title?: string | null; artist?: string | null; cover?: string | null }) => void }) {
  const [noms, setNoms] = useState<any[]>([])
  const [voted, setVoted] = useState<Set<number>>(new Set())
  const [voting, setVoting] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let on = true
    fetch('/api/dienos-daina/nominations').then(r => r.json()).then(d => { if (on) { setNoms(d.nominations || []); setLoading(false) } }).catch(() => { if (on) setLoading(false) })
    fetch('/api/dienos-daina/votes').then(r => r.json()).then(d => { if (on) setVoted(new Set<number>(d.voted_nomination_ids || [])) }).catch(() => {})
    return () => { on = false }
  }, [])

  const vote = async (id: number) => {
    if (voted.has(id) || voting !== null) return
    setVoting(id)
    setVoted(p => { const n = new Set(p); n.add(id); return n })
    setNoms(p => p.map(n => n.id === id ? { ...n, votes: (n.votes || 0) + 1, weighted_votes: (n.weighted_votes || 0) + 1 } : n))
    try {
      const r = await fetch('/api/dienos-daina/votes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nomination_id: id, fingerprint: deviceFpSync() }) })
      if (r.status === 401) { window.location.href = '/auth/signin'; return }
    } catch {} finally { setVoting(null) }
  }

  if (loading) return <div className="rdr-load"><span /><span /><span /></div>
  const sorted = [...noms].filter(n => n.tracks).sort((a, b) => (b.weighted_votes || b.votes || 0) - (a.weighted_votes || a.votes || 0))
  if (!sorted.length) return null
  const maxV = Math.max(1, ...sorted.map(n => n.weighted_votes || n.votes || 0))
  const imgOf = (t: any) => { const v = extractYouTubeId(t?.video_url || null); return t?.cover_url || (v ? `https://img.youtube.com/vi/${v}/hqdefault.jpg` : null) || t?.artists?.cover_image_url || null }
  return (
    <div className="rdr-dc">
      {sorted.map((n, idx) => {
        const t = n.tracks
        const vid = extractYouTubeId(t?.video_url || null)
        const did = voted.has(n.id)
        const lvl = idx === 0 ? 5 : Math.max(1, Math.round(((n.weighted_votes || n.votes || 0) / maxV) * 5))
        const img = imgOf(t)
        return (
          <div key={n.id} className={`rdr-dc-row${idx === 0 ? ' lead' : ''}`}>
            <span className="rdr-dc-rank">{idx + 1}</span>
            <button className="rdr-cvl-cover" onClick={() => vid && onPlay(vid, { title: sanitizeTitle(t.title || ''), artist: t.artists?.name || null, cover: img })} disabled={!vid} aria-label="Groti">
              {img ? <img src={proxyImgResized(img, 96)} alt="" loading="lazy" decoding="async" /> : <span className="rdr-chart-ph" />}
              {vid && <span className="rdr-cvl-play"><svg width="13" height="13" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg></span>}
            </button>
            <div className="rdr-dc-info">
              <b>{sanitizeTitle(t.title || '')}</b>
              <i>{t.artists?.name || ''}</i>
              <span className="rdr-dc-bar">{Array.from({ length: 5 }).map((_, i) => <span key={i} className={i < lvl ? 'on' : ''} />)}</span>
            </div>
            <button className={`rdr-dc-vote${did ? ' on' : ''}`} disabled={did || voting === n.id} onClick={() => vote(n.id)} aria-label="Balsuoti">
              {did
                ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>}
            </button>
          </div>
        )
      })}
    </div>
  )
}

/** Viena istorija reader'yje. Pati valdo savo VERTIKALŲ scroll'ą (pauzina
 *  auto-advance kai nuscrollinta žemyn — „skaitymo režimas"), news pilno body
 *  lazy-fetch'ą, ♥ ir apatinę veiksmų juostą. Muzika — STANDARTINIAI YouTube
 *  embed'ai „Muzika" sekcijoje po tekstu (jokio custom grotuvo). */
function ReaderSlide({ slide, active, seen, dk, scrollTopSignal, onScrolledChange, onPlayingChange, onClose, onChartVote, onDailyVote, onNavLink }: {
  slide: HeroSlide
  active: boolean
  seen: boolean
  dk: boolean
  scrollTopSignal: number
  onScrolledChange: (scrolled: boolean) => void
  onPlayingChange: (playing: boolean) => void
  onClose: () => void
  onChartVote?: (slide: HeroSlide) => void
  onDailyVote?: (slide: HeroSlide) => void
  onNavLink: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const embedsRef = useRef<HTMLDivElement>(null)
  // Vienintelis grojimo state'as: iš topo/kandidatų eilutės paprašytas video —
  // jo embed'as „Muzika" sekcijoje perkraunamas su autoplay=1.
  const [reqVideoId, setReqVideoId] = useState<string | null>(null)
  const [body, setBody] = useState<string | null>(
    slide.body || (slide.newsId ? newsBodyCache.get(slide.newsId) || null : null)
  )
  const [bodyLoading, setBodyLoading] = useState(false)
  const [blogTopas, setBlogTopas] = useState<any[] | null>(null)
  const [blogIntro, setBlogIntro] = useState<string | null>(null)
  const [blogOutro, setBlogOutro] = useState<string | null>(null)

  const isChart = slide.type === 'chart_lt' || slide.type === 'chart_world'
  const isDaily = slide.type === 'daily'
  const isNews = slide.type === 'news'
  const isRecording = slide.type === 'recording'
  const isBlog = slide.type === 'blog'

  /* Neaktyvi kortelė — grįžtam į viršų ir nuimam autoplay užklausą. Embed'ai
   * mount'inami tik aktyvioj kortelėj (žr. „Muzika" sekciją), tad sunkūs
   * iframe'ai patys išsivalo keičiant istoriją. */
  useEffect(() => {
    if (!active) {
      setReqVideoId(null)
      if (scrollRef.current) scrollRef.current.scrollTop = 0
    }
  }, [active])

  /* „Į viršų" rodyklė (reels) — tėvas didina signalą, aktyvi kortelė nuslenka į
   *  viršų ir auto-slide vėl pradeda eiti (scrolled → false). */
  useEffect(() => {
    if (active && scrollTopSignal > 0) scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [scrollTopSignal]) // eslint-disable-line

  /* Pilno news body lazy-fetch. */
  useEffect(() => {
    if (!active || !slide.newsId || body || bodyLoading) return
    setBodyLoading(true)
    fetch(`/api/news/${slide.newsId}`)
      .then(r => r.json())
      .then(d => {
        const html: string = d?.body || d?.news?.body || ''
        if (html) { newsBodyCache.set(slide.newsId!, html); setBody(html) }
      })
      .catch(() => {})
      .finally(() => setBodyLoading(false))
  }, [active, slide.newsId]) // eslint-disable-line

  /* Bendruomenės įrašo (blog) pilno turinio lazy-fetch. Topas → struktūruotas
   *  sąrašas (kaip įrašo psl.), kiti → išvalytas content HTML. */
  useEffect(() => {
    if (!active || !slide.blogId) return
    if (body || blogTopas) return
    const apply = (d: any) => {
      if (d?.post_type === 'topas' && Array.isArray(d.list_items) && d.list_items.length) {
        setBlogTopas(d.list_items)
        setBlogIntro(d.topas_meta?.intro ? cleanBlogHtml(d.topas_meta.intro) : null)
        setBlogOutro(d.topas_meta?.outro ? cleanBlogHtml(d.topas_meta.outro) : null)
      } else if (d?.content) {
        setBody(cleanBlogHtml(d.content))
      }
    }
    const cached = blogPostCache.get(slide.blogId)
    if (cached) { apply(cached); return }
    setBodyLoading(true)
    fetch(`/api/blog/posts/${slide.blogId}`)
      .then(r => r.json())
      .then(d => { if (d && !d.error) { blogPostCache.set(slide.blogId!, d); apply(d) } })
      .catch(() => {})
      .finally(() => setBodyLoading(false))
  }, [active, slide.blogId]) // eslint-disable-line

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const top = el.scrollTop
    onScrolledChange(top > 4)
  }

  /* Grojimas iš topo/kandidatų eilutės (▶) — atitinkamas embed'as „Muzika"
   *  sekcijoje perkraunamas su autoplay=1 ir nuscrollinama iki jo. Jokio custom
   *  grotuvo — standartinis YouTube embed'as (iOS gali dar paprašyti YT tap'o —
   *  sąmoningai priimtina dėl paprastumo). */
  const play = (vid?: string, _meta?: { title?: string | null; artist?: string | null; cover?: string | null }) => {
    const id = vid || slide.videoId
    if (!id) return
    setReqVideoId(id)
    requestAnimationFrame(() => embedsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }

  const place = slide.metaLine || (isChart ? '' : slide.subtitle) || ''
  // Trumpo turinio kortelės (be body teksto) — aukštesnis posteris, kad kortelė
  // neatrodytų pustuštė (daily_winner/event/verta/discovery/recording).
  const tallPoster = !body && !bodyLoading && !isChart && !isDaily && !isNews && !isBlog

  /* „Muzika" sekcijos embed'ai (max 3): slide.songs arba vienas slide.videoId.
   * Jei iš sąrašo paprašytas video nėra tarp jų — įterpiam pirmu. Antraštė
   * rodoma TIK kai yra tikras dainos pavadinimas (ne tuščias/generinis „Daina"). */
  const realTitle = (t?: string | null): string | null => {
    const s = (t || '').trim()
    return s && s.toLowerCase() !== 'daina' ? s : null
  }
  const embeds: { videoId: string; title: string | null; artist?: string | null }[] = []
  if (slide.songs && slide.songs.length) {
    for (const s of slide.songs.slice(0, 3)) embeds.push({ videoId: s.videoId, title: realTitle(s.title), artist: s.artist || null })
  } else if (slide.videoId) {
    embeds.push({ videoId: slide.videoId, title: realTitle(slide.songTitle), artist: slide.songArtist || null })
  }
  if (reqVideoId && !embeds.some(e => e.videoId === reqVideoId)) {
    embeds.unshift({ videoId: reqVideoId, title: null })
    if (embeds.length > 3) embeds.length = 3
  }

  return (
    <div ref={scrollRef} className="rdr-slide" onScroll={onScroll}>
      {/* ── Viršuje VISADA tik statinė nuotrauka (blur-fill posteris). Muzika —
          standartiniai YouTube embed'ai „Muzika" sekcijoje po tekstu. ── */}
      {slide.bgImg ? (
        <div className={`rdr-media${tallPoster ? ' rdr-media-tall' : ''}`}>
          <span className="rdr-poster-bg" style={{ backgroundImage: `url(${proxyImgResized(slide.bgImg, 64)})` }} />
          <img className="rdr-poster-img" src={proxyImgResized(slide.bgImg, 1080)} alt="" draggable={false} decoding="async" />
          <div className="rdr-media-fade" />
        </div>
      ) : null}

      {/* ── Tekstinė dalis ── */}
      <div className="rdr-content">
        <div className="rdr-head">
          <span className="rdr-chip" style={{ background: seen ? (dk ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)') : slide.chipBg, color: seen && !dk ? 'var(--text-primary)' : '#fff' }}>{slide.chip}</span>
          {place && <span className="rdr-date">{place}</span>}
        </div>
        {isRecording
          ? <Link href={slide.href} onClick={onNavLink} className="rdr-title rdr-title-link">{slide.title}</Link>
          : <h2 className="rdr-title">{slide.title}</h2>}

        {isChart ? (
          active ? (
            <ChartVoteList
              topType={slide.type === 'chart_lt' ? 'lt_top30' : 'top40'}
              accent="var(--accent-orange)"
              onPlay={play}
            />
          ) : slide.chartTops && slide.chartTops.length > 0 ? (
            <div className="rdr-chart">
              {slide.chartTops.map(t => (
                <div key={t.pos} className="rdr-chart-row">
                  <span className="rdr-chart-pos">{t.pos}<TrendBadge prev={t.prevPos} pos={t.pos} isNew={t.trend === 'new'} /></span>
                  {t.cover_url || t.artist_image
                    ? <img src={proxyImgResized(t.cover_url || t.artist_image!, 96)} alt="" loading="lazy" decoding="async" />
                    : <span className="rdr-chart-ph" />}
                  <span className="rdr-chart-info"><b>{t.title}</b><i>{t.artist}</i></span>
                </div>
              ))}
            </div>
          ) : null
        ) : isDaily ? (
          active ? <DailyCandidates onPlay={play} /> : (slide.excerpt ? <p className="rdr-excerpt">{slide.excerpt}</p> : null)
        ) : (isBlog && blogTopas && blogTopas.length) ? (
          <div className="rdr-toplist-wrap">
            {blogIntro && <div className="rdr-html" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(blogIntro) }} />}
            <div className="rdr-toplist">
              {blogTopas.map((it: any, idx: number) => (
                <div key={idx} className="rdr-top-item">
                  <span className="rdr-top-rank">{it.rank ?? idx + 1}</span>
                  {it.image_url
                    ? <img className="rdr-top-cover" src={proxyImgResized(it.image_url, 96)} alt="" loading="lazy" decoding="async" />
                    : <span className="rdr-top-cover rdr-top-ph" />}
                  <div className="rdr-top-info">
                    <p className="rdr-top-title">{it.title}{it.artist ? <span className="rdr-top-artist"> — {it.artist}</span> : null}</p>
                    {it.comment && <p className="rdr-top-comment">{it.comment}</p>}
                  </div>
                </div>
              ))}
            </div>
            {blogOutro && <div className="rdr-html rdr-outro" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(blogOutro) }} />}
          </div>
        ) : body ? (
          <div className="rdr-html" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(body) }} />
        ) : bodyLoading ? (
          <div className="rdr-load"><span /><span /><span /></div>
        ) : (slide.excerpt || slide.subtitle) ? (
          <p className="rdr-excerpt">{slide.excerpt || slide.subtitle}</p>
        ) : null}

        {/* ── „Muzika" — standartiniai YouTube embed'ai (16/9). Grojimą paleidžia
            pats YouTube mygtukas iframe'e (vienas tap'as visur, jokio custom
            grotuvo). Mount'inam tik aktyvioj kortelėj (perf — sunkūs iframe'ai).
            Iš topo/kandidatų eilutės paprašytas video (reqVideoId) gauna autoplay=1. ── */}
        {active && embeds.length > 0 && (
          <div className="rdr-embeds" ref={embedsRef}>
            <span className="rdr-embeds-head">🎵 Muzika</span>
            {embeds.map(e => (
              <div key={e.videoId} className="rdr-embed">
                {e.title && (
                  <p className="rdr-embed-cap">{e.title}{e.artist ? ` · ${e.artist}` : ''}</p>
                )}
                <div className="rdr-embed-frame">
                  <iframe
                    src={`https://www.youtube.com/embed/${e.videoId}?playsinline=1&rel=0${reqVideoId === e.videoId ? '&autoplay=1' : ''}`}
                    loading="lazy"
                    allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                    allowFullScreen
                    title={e.title || 'YouTube grotuvas'}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {slide.authorName && <p className="rdr-author">— {slide.authorName}</p>}

        {/* Vieningas kortelės pabaigos blokas — kontekstas (atlikėjas/lineup)
            ir veiksmai (CTA + Bilietai) VIENODU stiliumi visiems tipams. */}
        <CardFooter slide={slide} onNavLink={onNavLink} />
      </div>
    </div>
  )
}

/** Vieningas kortelės pabaigos blokas (footer) — VIENODAS visiems slide tipams,
 *  PASKUTINIS kortelės elementas (scrollinasi su turiniu, po jo tik nedidelis
 *  tarpas). Eilutė 1 (TIK jei yra konteksto): atlikėjo avataras+vardas ARBA
 *  renginio lineup'as; be konteksto — jokios tuščios eilutės/skirtuko.
 *  Eilutė 2: pilno pločio solid CTA (+ „Bilietai" outlined, jei yra ticketUrl). */
function CardFooter({ slide, onNavLink }: {
  slide: HeroSlide
  onNavLink: () => void
}) {
  const isNews = slide.type === 'news'
  const isChart = slide.type === 'chart_lt' || slide.type === 'chart_world'
  const showLineup = !!(slide.lineup && slide.lineup.length)
  const showArtist = !showLineup && !!slide.artist && slide.type !== 'event' && !isChart && slide.type !== 'daily'
  const hasCtx = showLineup || showArtist
  // Vieninga CTA etikečių logika — tipas → aiškus veiksmas, fallback ctaLabel.
  const ctaLabel = isNews ? 'Pilna versija ir komentarai'
    : isChart ? 'Visas topas'
    : slide.type === 'daily' || slide.type === 'daily_winner' ? 'Dienos daina'
    : slide.type === 'event' ? 'Apie renginį'
    : slide.type === 'verta' ? 'Apie kelionę'
    : slide.ctaLabel || 'Skaityti'
  return (
    <div className="rdr-foot" onClick={(e) => e.stopPropagation()}>
      {hasCtx && (
        <>
          <div className="rdr-foot-ctx">
            {showLineup ? (
              <div className="rdr-foot-lineup">
                {slide.lineup!.map(a => (
                  <Link key={a.slug} href={`/atlikejai/${a.slug}`} onClick={onNavLink} className="rdr-lineup-item">
                    {a.image
                      ? <img src={proxyImgResized(a.image, 96)} alt="" loading="lazy" decoding="async" />
                      : <span className="rdr-lineup-ph">{a.name[0]}</span>}
                    <span>{a.name}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <Link href={`/atlikejai/${slide.artist!.slug}`} onClick={onNavLink} className="rdr-foot-artist">
                {slide.artist!.image
                  ? <img src={proxyImgResized(slide.artist!.image, 96)} alt="" loading="lazy" decoding="async" />
                  : <span className="rdr-foot-ph">{slide.artist!.name[0]}</span>}
                <span>{slide.artist!.name}</span>
              </Link>
            )}
          </div>
          <div className="rdr-foot-div" />
        </>
      )}
      <div className="rdr-foot-actions">
        <Link href={slide.href} onClick={onNavLink} className="rdr-foot-cta">
          {ctaLabel}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
        </Link>
        {slide.ticketUrl && (
          <a href={slide.ticketUrl} target="_blank" rel="noopener noreferrer" className="rdr-foot-ticket">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v3a2 2 0 0 1 0 4v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a2 2 0 0 1 0-4V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z" /></svg>
            Bilietai
          </a>
        )}
      </div>
    </div>
  )
}

function ReelsOverlay({ slides, initialIdx, seenSlides, onSeen, onClose, onChartVote, onDailyVote, dk }: {
  slides: HeroSlide[]
  initialIdx: number
  seenSlides: Set<string>
  onSeen: (href: string) => void
  onClose: () => void
  /** Chart slide'ams — atveria voting sheet'ą (reels lieka fone). */
  onChartVote?: (slide: HeroSlide) => void
  /** Dienos dainos slide'ui — atveria balsavimo/siūlymo sheet'ą. */
  onDailyVote?: (slide: HeroSlide) => void
  dk: boolean
}) {
  const [idx, setIdx] = useState(initialIdx)
  const [scrolled, setScrolled] = useState(false)   // aktyvi kortelė nuscrollinta žemyn
  const [playing, setPlaying] = useState(false)      // legacy: grojimas nebe sekamas (standartiniai YT embed'ai) — lieka false
  const [scrollTopReq, setScrollTopReq] = useState(0) // „į viršų" rodyklės signalas aktyviai kortelei

  // PERF PERDARYMAS (2026-07-03): progresas ir braukimas — per ref'us + tiesioginį
  // DOM stilių, BE React state. Anksčiau setProgress kas RAF kadrą (~60fps)
  // re-renderindavo VISĄ overlay su visomis kortelėmis → strigo, pamesdavo
  // tap'us/klavišus. Dabar React re-renderina TIK keičiantis idx/scrolled/playing.
  const startRef = useRef<number>(0)
  const rafRef = useRef<any>(null)
  const barFillRef = useRef<HTMLDivElement | null>(null)   // aktyvios juostelės fill
  const trackRef = useRef<HTMLDivElement | null>(null)     // slide track (drag transform)
  const touchStartX = useRef<number>(0)
  const touchStartY = useRef<number>(0)
  const gestureDir = useRef<'h' | 'v' | null>(null)
  const ignoreGesture = useRef<boolean>(false)  // tap'ai ant mygtukų/nuorodų/grotuvo NEturi tapti braukimu
  const draggingRef = useRef(false)

  const slide = slides[idx]
  // Interaktyvios kortelės (topai, dienos daina) — auto-advance IŠ VISO neveikia
  // (kad nepradingtų bebalsuojant/beklausant). Kitur — stoja skaitant/grojant.
  const interactive = !!slide && (slide.type === 'chart_lt' || slide.type === 'chart_world' || slide.type === 'daily')
  const autoOff = interactive || scrolled || playing
  // Braukimas į šoną veikia VISADA (ir skaitant) — pagal gesto kryptį (h vs v).

  const goTo = useCallback((n: number) => {
    if (n < 0) return
    if (n >= slides.length) { onClose(); return }
    setIdx(n)
  }, [slides.length, onClose])

  // Ref'ai stabiliems handler'iams (klaviatūra/RAF nesikabina iš naujo kas idx).
  const idxRef = useRef(idx); idxRef.current = idx
  const goToRef = useRef(goTo); goToRef.current = goTo
  const autoOffRef = useRef(autoOff); autoOffRef.current = autoOff

  const stopProgress = useCallback(() => { cancelAnimationFrame(rafRef.current) }, [])
  const startProgress = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    startRef.current = Date.now()
    const dur = slides[idxRef.current] ? slideDuration(slides[idxRef.current]) : REELS_DURATION
    const tick = () => {
      const p = Math.min((Date.now() - startRef.current) / dur, 1)
      if (barFillRef.current) barFillRef.current.style.width = `${p * 100}%`
      if (p >= 1) { if (!autoOffRef.current) goToRef.current(idxRef.current + 1); return }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [slides]) // eslint-disable-line

  /* Slide pasikeitė — reset; pažymim seen išeinant. */
  useEffect(() => {
    if (!slide) return
    setScrolled(false)
    setPlaying(false)
    if (barFillRef.current) barFillRef.current.style.width = '0%'
    startProgress()
    return () => { stopProgress(); onSeen(slideKey(slide)) }
  }, [idx]) // eslint-disable-line

  /* Pauzė kai skaitoma/grojama. */
  useEffect(() => {
    if (autoOff) stopProgress(); else startProgress()
  }, [autoOff]) // eslint-disable-line

  /* Klaviatūra (desktop) — VIENAS stabilus listener'is (per ref'us). Anksčiau
   * re-subscribindavo kas idx ir per re-render audrą pamesdavo paspaudimus. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') goToRef.current(idxRef.current + 1)
      else if (e.key === 'ArrowLeft') goToRef.current(idxRef.current - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /* Touch — horizontalus braukimas keičia istoriją; vertikalus = native scroll.
   * Drag poslinkis piešiamas TIESIOGIAI ant track'o (be state → be re-render'ų). */
  const setTrackX = (extraPx: number) => {
    const el = trackRef.current
    if (!el) return
    const w = typeof window !== 'undefined' ? window.innerWidth : 400
    el.style.transition = 'none'
    el.style.transform = `translateX(calc(${-idxRef.current * 100}% + ${(extraPx / w) * 100}%))`
  }
  const resetTrackX = () => {
    const el = trackRef.current
    if (!el) return
    el.style.transition = 'transform .32s cubic-bezier(.4,0,.2,1)'
    el.style.transform = `translateX(${-idxRef.current * 100}%)`
  }
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.target as HTMLElement
    ignoreGesture.current = !!(t && t.closest && t.closest('button, a, iframe, input, textarea, .rdr-foot'))
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    gestureDir.current = null
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (ignoreGesture.current) return
    const dx = e.touches[0].clientX - touchStartX.current
    const dy = e.touches[0].clientY - touchStartY.current
    if (gestureDir.current === null && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) {
      gestureDir.current = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v'
      if (gestureDir.current === 'h') { draggingRef.current = true; stopProgress() }
    }
    if (gestureDir.current === 'h') {
      e.preventDefault()
      setTrackX(dx)
    }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (ignoreGesture.current) { ignoreGesture.current = false; return }
    if (gestureDir.current === 'h') {
      const dx = e.changedTouches[0].clientX - touchStartX.current
      draggingRef.current = false
      if (Math.abs(dx) > 55) { resetTrackX(); goTo(dx < 0 ? idx + 1 : idx - 1) }
      else { resetTrackX(); if (!autoOff) startProgress() }
    }
    gestureDir.current = null
  }

  const translateX = -idx * 100

  return (
    <div className={`hp-reels${dk ? '' : ' light'}`}>
      {/* Progreso juostelės — aktyvios fill'as varomas per ref (RAF), be state. */}
      <div className="rdr-bars">
        {slides.map((s, i) => {
          const isSeen = seenSlides.has(slideKey(s))
          const isPast = i < idx
          const isCurrent = i === idx
          const barColor = isCurrent ? 'var(--accent-orange)' : isPast ? (isSeen ? 'rgba(255,255,255,0.7)' : 'var(--accent-orange)') : 'rgba(255,255,255,0.0)'
          return (
            <div key={i} className="rdr-bar">
              <div ref={isCurrent ? barFillRef : undefined} style={{ height: '100%', borderRadius: 2, background: barColor, width: isPast ? '100%' : '0%' }} />
            </div>
          )
        })}
      </div>

      {scrolled && (
        <button className="rdr-uptop" aria-label="Į viršų" onClick={() => setScrollTopReq(n => n + 1)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
        </button>
      )}

      <button onClick={onClose} className="rdr-close" aria-label="Uždaryti">✕</button>

      {idx > 0 && <button className="rdr-nav rdr-nav-l" onClick={() => goTo(idx - 1)} aria-label="Atgal">‹</button>}
      <button className="rdr-nav rdr-nav-r" onClick={() => goTo(idx + 1)} aria-label="Toliau">›</button>

      <div
        ref={trackRef}
        className="hp-reels-track"
        style={{ transform: `translateX(${translateX}%)`, transition: 'transform .32s cubic-bezier(.4,0,.2,1)' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {slides.map((s, i) => (
          <div key={`${s.type}-${s.href}-${i}`} className="hp-reels-slide">
            {/* PERF: mount'inam tik aktyvią kortelę ±1 (kaimynai preload'ui).
                Anksčiau visos ~25 kortelės kartu — sunkus atidarymas. */}
            {Math.abs(i - idx) <= 1 ? (
              <ReaderSlide
                slide={s}
                active={i === idx}
                seen={seenSlides.has(slideKey(s))}
                dk={dk}
                scrollTopSignal={i === idx ? scrollTopReq : 0}
                onScrolledChange={(sc) => { if (i === idx) setScrolled(sc) }}
                onPlayingChange={(pl) => { if (i === idx) setPlaying(pl) }}
                onClose={onClose}
                onChartVote={onChartVote}
                onDailyVote={onDailyVote}
                onNavLink={onClose}
              />
            ) : null}
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
  const tabPad = compact ? 'py-[7px] text-[14px]' : 'py-[9px] text-[14px]'
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
  const titleSize = compact ? 'text-[14px]' : 'text-[14px]'
  const metaSize = compact ? 'text-[12px]' : 'text-[14px]'
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
      className={`mt-2.5 flex items-center justify-center rounded-[10px] bg-[var(--accent-orange)] p-2.5 font-['Outfit',sans-serif] text-[16px] font-extrabold text-white no-underline shadow-[0_2px_12px_rgba(249,115,22,0.3)] transition-all hover:-translate-y-px hover:shadow-[0_4px_18px_rgba(249,115,22,0.45)] ${className}`}
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
        <span className="font-['Outfit',sans-serif] text-[16px] font-extrabold text-[var(--text-primary)]">Diskusijos</span>
        <Link href="/diskusijos" className="text-[14px] font-bold text-[var(--accent-link)] no-underline">Visos →</Link>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? Array(4).fill(null).map((_, i) => (
          <div key={i} className="border-b border-[var(--border-subtle)] px-4 py-2.5">
            <Skel w="80%" h={11} /><div className="mt-2"><Skel w="95%" h={9} /></div>
          </div>
        )) : discs.length === 0 ? (
          <div className="px-4 py-6 text-center text-[14px] text-[var(--text-muted)]">Diskusijų dar nėra</div>
        ) : discs.map((d, i) => {
          const lc = d.latest_comment
          const hue = strHue(lc?.author || d.author_name || '?')
          return (
            <Link key={d.id} href={`/diskusijos/${d.slug}`} className="block border-b border-[var(--border-subtle)] px-4 py-2.5 no-underline transition-colors hover:bg-[var(--bg-hover)]" style={{ borderBottomWidth: i === discs.length - 1 ? 0 : 1 }}>
              <p className="m-0 line-clamp-1 font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">{d.title}</p>
              {lc ? (
                <div className="mt-1 flex items-start gap-1.5">
                  {lc.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proxyImgResized(lc.avatar, 64)} alt="" loading="lazy" decoding="async" className="mt-px h-[15px] w-[15px] shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="mt-px flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold" style={{ background: `hsl(${hue},32%,20%)`, color: `hsl(${hue},48%,60%)` }}>{(lc.author || '?').charAt(0).toUpperCase()}</span>
                  )}
                  <p className="m-0 line-clamp-2 text-[14px] leading-snug text-[var(--text-muted)]">
                    <span className="font-bold text-[var(--text-secondary)]">{lc.author}:</span> {lc.excerpt}
                  </p>
                </div>
              ) : (
                <p className="m-0 mt-0.5 text-[12px] text-[var(--text-muted)]">{d.author_name || 'Anonimas'} · {d.comment_count} ats. · {timeAgo(d.created_at)}</p>
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
        <span className="font-['Outfit',sans-serif] text-[16px] font-extrabold text-[var(--text-primary)]">Pokalbiai</span>
        <Link href="/pokalbiai" className="text-[14px] font-bold text-[var(--accent-link)] no-underline">Atidaryti →</Link>
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
        <span className="font-['Outfit',sans-serif] text-[16px] font-extrabold text-[var(--text-primary)]">Vartotojų įrašai</span>
        <Link href="/blogai" className="text-[14px] font-bold text-[var(--accent-link)] no-underline">Visi →</Link>
      </div>
      <div className="flex-1">
        {loading ? Array(3).fill(null).map((_, i) => (
          <div key={i} className="border-b border-[var(--border-subtle)] px-4 py-2.5">
            <Skel w="35%" h={9} /><div className="mt-1.5"><Skel w="85%" h={11} /></div>
          </div>
        )) : posts.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="m-0 text-[14px] font-bold text-[var(--text-secondary)]">Pirmas autorius — tu?</p>
            <p className="m-0 mt-1 text-[14px] text-[var(--text-muted)]">Blogai, vertimai, kūryba — dalinkis su bendruomene.</p>
            <Link href="/blogai/naujas" className="mt-2 inline-flex rounded-md bg-[var(--accent-orange)] px-3 py-1.5 text-[14px] font-bold text-white no-underline">Pradėti</Link>
          </div>
        ) : posts.map((p, i) => (
          <Link key={p.id} href={p.href} className="block border-b border-[var(--border-subtle)] px-4 py-2.5 no-underline transition-colors hover:bg-[var(--bg-hover)]" style={{ borderBottomWidth: i === posts.length - 1 ? 0 : 1 }}>
            <div className="mb-0.5 flex items-center gap-1.5">
              <span className={`rounded px-1.5 py-px font-['Outfit',sans-serif] text-[12px] font-extrabold uppercase tracking-[0.06em] ${
                p.type === 'blog' ? 'bg-[var(--accent-orange)]/15 text-[var(--accent-orange)]' : 'bg-[var(--accent-link)]/15 text-[var(--accent-link)]'
              }`}>{p.badge}</span>
              <span className="text-[12px] text-[var(--text-faint)]">{timeAgo(p.created_at)}</span>
            </div>
            <p className="m-0 line-clamp-2 font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-primary)]">{p.title}</p>
            <p className="m-0 mt-0.5 truncate text-[12px] text-[var(--text-muted)]">{p.meta}</p>
          </Link>
        ))}
      </div>
    </div>
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
    return <img src={proxyImgResized(cover, 128)} alt="" loading="lazy" decoding="async" className="shrink-0 object-cover" style={{ width: size, height: size, borderRadius: radius, filter: gray ? 'grayscale(1)' : undefined }} />
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
            <img src={proxyImgResized(g.cover, 96)} alt="" loading="lazy" decoding="async" className="shrink-0 rounded-full object-cover" style={{ width: avatar, height: avatar }} />
          ) : (
            <span className="flex shrink-0 items-center justify-center rounded-full font-['Outfit',sans-serif] font-extrabold" style={{ width: avatar, height: avatar, fontSize: avatar * 0.42, background: `hsl(${strHue(g.name)},32%,24%)`, color: `hsl(${strHue(g.name)},48%,62%)` }}>{(g.name || '?').charAt(0).toUpperCase()}</span>
          )}
          <span className="min-w-0 truncate text-[14px] font-semibold text-[var(--text-secondary)]">{g.name}</span>
        </span>
      ))}
      {extra > 0 && <span className="text-[12px] font-bold text-[var(--text-faint)]" style={{ paddingLeft: avatar + 6 }}>+{extra} grupė(s)</span>}
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
        <p className="m-0 font-['Outfit',sans-serif] text-[16px] font-extrabold text-[var(--text-primary)]">Šiandien istorijos kalendoriuje tylu</p>
        <p className="m-0 mt-1 text-[14px] text-[var(--text-muted)]">Nepamiršk — kiekvieną dieną čia atsiras gimtadieniai, jubiliejai ir sukaktys.</p>
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
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span style={{ width: 3, height: 16, borderRadius: 2, background: accent }} />
                  <h3 className="m-0 font-['Outfit',sans-serif] text-[16px] font-extrabold tracking-[-0.01em] text-[var(--text-primary)]">{cfg.label}</h3>
                  <span className="text-[14px] font-bold text-[var(--text-faint)]">{list.length}</span>
                </div>
                <button type="button" onClick={() => setOpenCat(t)} aria-label={`Daugiau: ${cfg.label}`} className="font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--accent-orange)] transition-opacity hover:opacity-70">Daugiau →</button>
              </div>
              <Scroller className="min-w-0" gap={12} ariaLabel={cfg.label}>
                  {list.slice(0, 14).map(it => {
                    // Badge: albumams — albumo amžius (sukaktis); gimtadieniams —
                    // kiek sukako GYVAM (miręs → „gimimo metinės" rodom tekste, ne
                    // ant badge'o); mirties metinėms — metai.
                    const badge = it.type === 'album_anniversary'
                      ? (it.age ? `${it.age} m.` : null)
                      : it.type === 'birthday'
                        ? (it.age ? (it.deceased ? `${it.age} gimimo metinės` : `${it.age} m.`) : null)
                        : (it.year ? `${it.year} m.` : null)
                    // Jubiliejus — apvali albumo sukaktis (5, 10, 15, 20 ... metai):
                    // badge tampa oranžinis + kortelė šiek tiek išsiskiria.
                    const ageNum = it.age || 0
                    const isJubilee = it.type === 'album_anniversary' && ageNum >= 10 && ageNum % 10 === 0
                    // Miręs atlikėjas → grayscale nuotrauka. Edvardo prašymu 2026-06-01.
                    const gray = it.type === 'death_anniversary' || it.deceased
                    // Cover + badge — bendra abiem (button album'ui / Link kitiems).
                    const coverBlock = (
                      <div className={`relative aspect-square overflow-hidden rounded-xl bg-[var(--cover-placeholder)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-[rgba(249,115,22,0.5)] group-hover:shadow-[0_14px_32px_rgba(249,115,22,0.18)] ${isJubilee ? 'border-2 border-[var(--accent-orange)] shadow-[0_4px_18px_rgba(249,115,22,0.35)]' : 'border border-[var(--border-default)] shadow-[0_4px_12px_rgba(0,0,0,0.25)]'}`}>
                        {it.cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={proxyImgResized(it.cover, 480)} alt={it.title} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" style={{ filter: gray ? 'grayscale(1)' : 'saturate(1.05) contrast(1.02)' }} />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center font-['Outfit',sans-serif] font-extrabold" style={{ fontSize: 46, background: gray ? 'hsl(0,0%,18%)' : `hsl(${strHue(it.title)},32%,20%)`, color: gray ? 'hsl(0,0%,55%)' : `hsl(${strHue(it.title)},48%,58%)` }}>
                            {(it.title || '?').charAt(0).toUpperCase()}
                          </div>
                        )}
                        {badge && (
                          <span className={`absolute bottom-1.5 right-1.5 rounded px-1.5 py-0.5 font-['Outfit',sans-serif] text-[12px] font-bold text-white backdrop-blur-sm ${isJubilee ? 'bg-[var(--accent-orange)] shadow-[0_2px_8px_rgba(249,115,22,0.5)]' : 'bg-black/70'}`}>{badge}</span>
                        )}
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgba(249,115,22,0.12)] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                      </div>
                    )
                    // Tekstinė dalis po cover'iu (skiriasi pagal tipą).
                    const textBlock = (
                      <div className="mt-2 px-0.5">
                        <p className={`m-0 font-['Outfit',sans-serif] text-[16px] font-extrabold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)] ${it.type === 'album_anniversary' ? 'truncate' : 'line-clamp-2'}`}>{it.title}</p>
                        {it.type === 'album_anniversary' && it.artist && (
                          <p className="m-0 mt-1 truncate text-[14px] text-[var(--text-muted)]">{it.artist}</p>
                        )}
                        {it.type === 'birthday' && <IstGroupChips groups={it.groups} avatar={20} />}
                        {it.type === 'death_anniversary' && it.subtitle && (
                          <p className="m-0 mt-1 truncate text-[14px] text-[var(--text-muted)]">{it.subtitle}</p>
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
                </Scroller>
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
                    <img src={proxyImgResized(it.cover, 480)} alt={it.title} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" />
                  ) : <div className="flex h-full w-full items-center justify-center text-2xl text-[var(--text-faint)]">💿</div>}
                  {it.age ? <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 font-['Outfit',sans-serif] text-[12px] font-bold text-white backdrop-blur-sm">{it.age} m.</span> : null}
                </div>
                <div className="mt-2 px-0.5">
                  {(it.pop ?? 0) > 0 && <span className="mb-1 flex"><IstPopBar level={it.pop} /></span>}
                  <p className="m-0 truncate font-['Outfit',sans-serif] text-[16px] font-extrabold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">{it.title}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="m-0 min-w-0 flex-1 truncate text-[14px] text-[var(--text-muted)]">{it.artist}</p>
                    {(it.likeCount ?? 0) > 0 && (
                      <span className="flex shrink-0 items-center gap-0.5 text-[12px] font-bold text-[var(--text-muted)]"><span className="text-[var(--accent-orange)]">♥</span>{it.likeCount}</span>
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
                  <p className="m-0 line-clamp-1 font-['Outfit',sans-serif] text-[16px] font-extrabold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">{it.title}</p>
                  {it.type === 'death_anniversary' && it.subtitle && (
                    <p className="m-0 mt-0.5 line-clamp-1 text-[14px] text-[var(--text-muted)]">{it.subtitle}</p>
                  )}
                  {it.type === 'birthday' && <IstGroupChips groups={it.groups} avatar={24} />}
                  {/* Amžiaus/„gimimo metinės" badge'as (ne tekstas) — Edvardo
                      prašymu 2026-06-02. */}
                  {it.type === 'birthday' && it.age && (
                    <span className="mt-1.5 inline-block rounded-full bg-[var(--bg-active)] px-2 py-0.5 text-[12px] font-bold text-[var(--text-faint)]">{it.deceased ? `${it.age} gimimo metinės` : `${it.age} m.`}</span>
                  )}
                  {it.type === 'death_anniversary' && it.year && (
                    <span className="mt-1.5 inline-block rounded-full bg-[var(--bg-active)] px-2 py-0.5 text-[12px] font-bold text-[var(--text-faint)]">{it.year} m.</span>
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

/* Hero v2 karuselė su rodyklėmis (hover) + oranžiniais taškais — tas pats
   patternas kaip /bendruomene „DĖMESIO CENTRE" FeaturedSlider.
   (redeploy trigger 2026-06-17) */
function HeroV2Slider({ slides, dk }: { slides: HeroSlide[]; dk: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [activeIdx, setActiveIdx] = useState(0)
  // Rodyklių matomumas: pradžioje slepiam „atgal", gale — „pirmyn".
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const update = () => {
      const card = el.querySelector('.hp-hero-slot') as HTMLElement | null
      if (card) setActiveIdx(Math.round(el.scrollLeft / (card.offsetWidth + 16)))
      const max = el.scrollWidth - el.clientWidth - 2
      setAtStart(el.scrollLeft <= 2)
      setAtEnd(el.scrollLeft >= max)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    if (ro) ro.observe(el)
    return () => { el.removeEventListener('scroll', update); window.removeEventListener('resize', update); ro?.disconnect() }
  }, [slides])
  const many = slides.length > 1
  const stepEl = () => trackRef.current?.querySelector('.hp-hero-slot') as HTMLElement | null
  const scrollTo = (i: number) => {
    const el = trackRef.current, card = stepEl()
    if (!el || !card) return
    el.scrollTo({ left: i * (card.offsetWidth + 16), behavior: 'smooth' })
  }
  const scrollByDir = (dir: -1 | 1) => {
    const el = trackRef.current
    if (!el) return
    const card = stepEl()
    const step = card ? card.offsetWidth + 16 : el.clientWidth * 0.9
    el.scrollBy({ left: dir * step, behavior: 'smooth' })
  }
  return (
    <section className="hp-hero-v2">
      <style>{`
        @media(pointer:fine){.hp-hero-arrow{opacity:0;transition:opacity .2s}}
        .hp-hero-wrap:hover .hp-hero-arrow{opacity:1}
      `}</style>
      <div className="mx-auto max-w-[1360px] px-5 pt-5">
        <div className="hp-hero-wrap relative">
          <div ref={trackRef} className="hp-scroll hp-hero-track flex items-stretch gap-4 pb-1 snap-x snap-mandatory">
            {slides.map((slide) => (
              <div key={`${slide.type}-${slide.href}`} className="hp-hero-slot shrink-0 snap-start">
                <HeroV2Card slide={slide} dk={dk} />
              </div>
            ))}
            {/* Paskutinė kortelė — „Daugiau naujienų" → /naujienos.
                Be hover -translate (hp-scroll overflow-y:auto nukirpdavo viršutinį
                dashed borderį); tik border spalvos kaita. Vienas tekstas. */}
            <div className="hp-hero-slot shrink-0 snap-start">
              <Link href="/naujienos"
                className="group relative flex aspect-[16/9] h-full w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] no-underline transition-colors hover:border-[var(--accent-orange)]">
                <span className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border-strong)] text-[var(--text-muted)] transition-colors group-hover:border-[var(--accent-orange)] group-hover:text-[var(--accent-orange)]">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                </span>
                <span className="font-['Outfit',sans-serif] text-[16px] font-extrabold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">Daugiau naujienų</span>
              </Link>
            </div>
          </div>
          {many && !atStart && (
            <button type="button" aria-label="Ankstesnis" onClick={() => scrollByDir(-1)}
              className="hp-hero-arrow absolute top-1/2 z-[4] flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-[rgba(255,255,255,0.2)] bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
              style={{ left: -6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
          )}
          {many && !atEnd && (
            <button type="button" aria-label="Kitas" onClick={() => scrollByDir(1)}
              className="hp-hero-arrow absolute top-1/2 z-[4] flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-[rgba(255,255,255,0.2)] bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
              style={{ right: -6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          )}
        </div>
        {many && (
          <div className="mt-2 flex justify-center">
            {slides.map((s, i) => (
              <button key={`hdot-${s.type}-${s.href}`} type="button" aria-label={`Slaidas ${i + 1}`}
                onClick={() => scrollTo(i)}
                className="group cursor-pointer border-0 bg-transparent transition-all"
                style={{ padding: '8px 4px' }}>
                <span className="block rounded-full transition-all"
                  style={{ width: i === activeIdx ? 22 : 11, height: 4, background: i === activeIdx ? 'var(--accent-orange)' : 'var(--border-strong)' }} />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function HeroV2Card({ slide, dk }: { slide: HeroSlide; dk: boolean }) {
  if (slide.type === 'chart_lt' || slide.type === 'chart_world') {
    return <HeroChartCard slide={slide} />
  }
  // Regular slide (news/event/promo)
  return (
    <Link
      href={slide.href}
      className="group relative block aspect-[16/9] overflow-hidden rounded-2xl border border-[var(--border-default)] no-underline shadow-[var(--hero-card-shadow)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--hero-card-shadow-hover)]"
      style={{ background: 'linear-gradient(135deg,#141b28 0%,#0a0e17 100%)' }}
    >
      {/* Nuotrauka užpildo VISĄ kortelę (object-cover) + apatinis scrim antraštei.
          Anksčiau foto „hug'indavo" dešinę su mask-fade kairėj + ambient blur —
          bet kairysis faded kraštas atrodydavo kaip juoda tuštuma, kai kortelė iš
          dalies matoma karuselėje (Edvardo „keistas tamsus elementas"). Full-cover:
          jokių tuščių kraštų, jokio balto→tamsu šuolio. Portretiniai/kvadratiniai
          cover'iai apkerpami į 16:9 (object-position viršus) — OK mažai hero kortelei.
          (loading=lazy sąmoningai NEnaudojam — above-the-fold horizontaliam track'ui
          native lazy neveikdavo, vizualai likdavo pilki; tik decoding=async.) */}
      {/* Vidinis overflow-hidden wrapper — kad hover -translate (transform) NEnutrauktų
          border-radius clip'o (Chrome/Safari bug: transformuotas tėvas → apvalūs kampai
          virsta kvadratiniais absoliučiai pozicionuotam vaikui). */}
      <div className="absolute inset-0 overflow-hidden rounded-2xl">
        {slide.bgImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxyImgResized(slide.bgImg, 1280)}
            alt=""
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: 'center 25%' }}
          />
        ) : (
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg,#141b28 0%,#0a0e17 100%)' }} />
        )}
      </div>
      {/* Badge — viršuj kairėj (kaip /bendruomene feed KindBadge).
          Paprastoms „NAUJIENA" NErodom (jų daugiausia, badge tik kartotųsi);
          paliekam tik prominentiniams tipams (Recenzija, Interviu, Reportažas,
          Renginys, promo ir t.t.). */}
      {slide.chip !== 'NAUJIENA' && (
        <span
          className="absolute left-3 top-3 z-[2] inline-flex rounded-md px-2 py-0.5 font-['Outfit',sans-serif] text-[12px] font-bold uppercase tracking-[0.03em] text-white"
          style={{ background: slide.chipBg }}
        >
          {slide.chip}
        </span>
      )}
      {/* Žalias „nauja per 24h" taškas (DB amžius) — viršuj dešinėj. */}
      {slide.fresh24 && <FreshDot right={12} top={12} />}
      {/* Bottom gradient for text readability */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-end p-5">
        <h3 className="m-0 max-w-[460px] font-['Outfit',sans-serif] text-[28px] font-black leading-[1.08] tracking-tight text-white transition-opacity group-hover:opacity-90">
          {slide.title}
        </h3>
        {/* Renginiams po pavadinimu — miestas · data (naujienoms subtitle slepiam). */}
        {slide.type === 'event' && slide.subtitle && (
          <p className="m-0 mt-2 flex items-center gap-1.5 font-['Outfit',sans-serif] text-[14px] font-semibold text-white/85">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>
            {slide.subtitle}
          </p>
        )}
        {/* Dienos dainos laimėtojui — atlikėjas + „Vakar laimėjo" žyma po pavadinimu. */}
        {slide.type === 'daily_winner' && (
          <div className="m-0 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            {slide.artist?.name && (
              <span className="font-['Outfit',sans-serif] text-[16px] font-bold leading-none text-white/90">{slide.artist.name}</span>
            )}
            <span className="inline-flex items-center gap-1 rounded-[6px] bg-white/15 px-2 py-[3px] font-['Outfit',sans-serif] text-[12px] font-bold uppercase tracking-[0.06em] text-amber-300">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM5 9a2 2 0 0 1-2-2V5h4M19 9a2 2 0 0 0 2-2V5h-4"/></svg>
              Vakar laimėjo
            </span>
          </div>
        )}
      </div>
    </Link>
  )
}

function HeroChartCard({ slide }: { slide: HeroSlide }) {
  const isLT = slide.type === 'chart_lt'
  const tops = slide.chartTops || []
  const accent = isLT ? 'var(--accent-orange)' : '#3b82f6'
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
          src={proxyImgResized(c, 480)}
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
      className="group relative block aspect-[16/9] overflow-hidden rounded-2xl border border-[var(--border-default)] no-underline shadow-[var(--hero-card-shadow)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--hero-card-shadow-hover)]"
      style={{
        background: isLT
          ? `radial-gradient(ellipse at top left, ${accentSoft}, rgba(10,14,26,0.98) 60%), linear-gradient(135deg, #1a1426 0%, #0a0e1a 100%)`
          : `radial-gradient(ellipse at top left, ${accentSoft}, rgba(8,13,20,0.98) 60%), linear-gradient(135deg, #14182a 0%, #080d14 100%)`,
      }}
    >
      {/* ── LEFT side: chip + value stat + CTA (38% width) ──
          pt-3: chip viršus sulygiuotas su news badge (top-3=12px), kad visi
          hero badge'ai būtų vienodame aukštyje. */}
      <div
        className="relative z-[1] flex h-full flex-col justify-between p-6 pt-3"
        style={{ width: '38%' }}
      >
        {/* Top: TOP chip — vienoda badge forma kaip news kortelėse (KindBadge):
            rounded-[7px], be ikonos/šešėlio, kad visi hero badge'ai atrodytų vienodai. */}
        <span
          className="inline-flex w-fit items-center rounded-md px-2 py-0.5 font-['Outfit',sans-serif] text-[12px] font-bold uppercase tracking-[0.03em] text-white"
          style={{ background: accent, alignSelf: 'flex-start' }}
        >
          {isLT ? 'LT TOP 30' : 'TOP 40'}
        </span>

        {/* Middle: bulleted list — kiekvienas atlikėjas savo eilutėje su
            truncation'u, kad ilgi pavadinimai nelįstų ant dešinės mosaic'o.
            Renderiamas TIK kai yra naujų pretendentų — kitaip kortelė lieka
            švari su mosaic'u dešinėje + chip + Balsuok kairėje. */}
        {valueNames.length > 0 && (
          <div className="flex flex-col gap-1.5" style={{ minWidth: 0 }}>
            <p className="m-0 text-[14px] font-semibold uppercase tracking-[0.14em] text-white/55">
              {valueLead}
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {valueNames.slice(0, 4).map((n, i) => (
                <li
                  key={i}
                  style={{
                    fontFamily: 'Outfit,sans-serif',
                    fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.78)',
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
            fontSize: 14, fontWeight: 700, letterSpacing: '0.02em',
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
        body: JSON.stringify({ track_id: trackId, week_id: weekId, vote_type: 'like', fingerprint: deviceFpSync() }),
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
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: accent, fontFamily: 'Outfit,sans-serif' }}>
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
          <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>
            Balsų liko: <span style={{ color: accent, fontWeight: 900 }}>{votesRemaining}</span>
          </span>
          <Link
            href={topType === 'lt_top30' ? '/top30' : '/top40'}
            style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', textDecoration: 'none', fontWeight: 700 }}
          >
            Visas puslapis →
          </Link>
        </div>

        {voteErr && (
          <div style={{ margin: '0 18px 8px', padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.4)', color: '#fecaca', fontSize: 14, fontWeight: 600 }}>
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
                    <div style={{ fontSize: 12, fontWeight: 700, color: trend === 'up' ? '#22c55e' : trend === 'down' ? '#ef4444' : accent, marginTop: 2, lineHeight: 1 }}>
                      {trend === 'up' ? '▲' : trend === 'down' ? '▼' : 'NEW'}
                    </div>
                  )}
                </div>
                {/* Cover */}
                <div style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.05)' }}>
                  {c && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proxyImgResized(c, 96)} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  )}
                </div>
                {/* Title + artist */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#fff', fontFamily: 'Outfit,sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.005em' }}>{e.title}</p>
                  <p style={{ margin: '1px 0 0', fontSize: 14, color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.artist}</p>
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
                    fontFamily: 'Outfit,sans-serif', fontSize: 14, fontWeight: 800,
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
            <p style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Topas dar tuščias.</p>
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
  const accent = slide.type === 'chart_lt' ? 'var(--accent-orange)' : '#3b82f6'
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
        <img src={proxyImgResized(c, 320)} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
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
              margin: 0, fontSize: 14, fontWeight: 900, color: '#fff',
              fontFamily: 'Outfit,sans-serif',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              letterSpacing: '-0.01em', textShadow: '0 1px 4px rgba(0,0,0,0.95)',
              lineHeight: 1.15,
            }}>{t.title}</p>
            <p style={{
              margin: '1px 0 0', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)',
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
            margin: 0, fontSize: 12, fontWeight: 800, color: '#fff',
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
        background: '#000', cursor: 'pointer', padding: 0, width: 156, height: 236,
        scrollSnapAlign: 'start',
        transition: 'border-color 0.15s, transform 0.15s',
        boxShadow: 'var(--hero-card-shadow)',
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
        <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 12, fontWeight: 700, color: '#fff', background: accent, fontFamily: 'Outfit,sans-serif', letterSpacing: '0.03em', textTransform: 'uppercase', boxShadow: '0 2px 10px rgba(0,0,0,0.4)' }}>
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
          fontFamily: 'Outfit,sans-serif', fontSize: 14, fontWeight: 900,
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

// SSR seed'as iš server component'o (app/page.tsx). Forma = /api/home/latest
// payload'as (mapTrackForHome/mapAlbumForHome output'as). Kai paduotas — „Naujos
// dainos / Nauji albumai" sekcijos atvaizduojamos iškart SSR HTML'e (be client
// fetch'o, be retry kabėjimo, be tuščio cache rizikos).
export type InitialLatest = {
  tracks: { lt: any[]; world: any[]; totalLt: number; totalWorld: number }
  albums: { lt: any[]; world: any[]; totalLt: number; totalWorld: number }
  upcoming: any[]
  upcomingTotal: number
}

// SSR hero seed'as — page.tsx paima hero endpoint'us server-side ir perduoda
// čia, kad hero būtų PIRMAME HTML'e (be laukimo, kol client-side fetch'ai
// atsakys po hydration'o). Client'as vis tiek atsinaujina (šviežiausi duomenys).
// Raw endpoint'ų shape'ai — identiški tiems, kuriuos setter'iai gauna client'e.
export type InitialHero = {
  news?: any[]
  heroEvents?: any[]
  heroPosts?: any[]
  dailyWinners?: any[]
  ltTop?: any[]        // /api/top/entries d.entries (dar neparse'inta)
  worldTop?: any[]
  ltTopDate?: string
  worldTopDate?: string
} | null

export default function HomeClient({ initialLatest, initialHero }: { initialLatest?: InitialLatest; initialHero?: InitialHero }) {
  // Ar SSR hero seed'as turi REALAUS turinio (kad hero būtų rodomas iškart).
  const heroSeeded = !!(initialHero && ((initialHero.news?.length || 0) + (initialHero.heroEvents?.length || 0) + (initialHero.heroPosts?.length || 0) + (initialHero.dailyWinners?.length || 0)) > 0)
  const { dk } = useSite()
  const seeded = !!initialLatest

  const [chartTab, setChartTab] = useState<'lt' | 'world'>('lt')

  /* ── Reels state ── */
  const [reelsOpen, setReelsOpen] = useState(false)
  const [reelsIdx, setReelsIdx] = useState(0)

  /* ── Chart bottom sheet state (mobile + naudojama bet kur) ── */
  const [chartSheet, setChartSheet] = useState<{ topType: 'lt_top30' | 'top40'; title: string; accent: string } | null>(null)
  const [dailySheetOpen, setDailySheetOpen] = useState(false)

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
  // Topo „atsinaujinimo data" (savaitės created_at/week_start) — naudojama
  // hero feed'o rikiavimui: naujesnės naujienos nei topas → topas krenta žemyn.
  const [ltTopDate, setLtTopDate] = useState<string>('')
  const [worldTopDate, setWorldTopDate] = useState<string>('')
  const [tracks, setTracks] = useState<Track[]>(initialLatest ? [...initialLatest.tracks.lt, ...initialLatest.tracks.world] : [])
  // Naujų dainų/albumų užkrovimo būsena. 'loading' → equalizer skeletonai;
  // 'error' → retry kortelė (nebe „amžini" pilki skeletonai); 'ok' → turinys
  // arba „netrukus" tuščiam lane'ui. Atskiriam realią tuštumą nuo fetch klaidos.
  // SSR seed'as → iškart 'ok' (turinys jau HTML'e).
  const [tracksStatus, setTracksStatus] = useState<'loading' | 'ok' | 'error'>(initialLatest ? 'ok' : 'loading')
  // bump'inam, kad retry mygtukas perpaleistų /api/home/latest fetch'ą.
  const [latestReload, setLatestReload] = useState(0)
  const [albums, setAlbums] = useState<Album[]>(initialLatest ? [...initialLatest.albums.lt, ...initialLatest.albums.world] : [])
  // „Greitai pasirodys" — bendras (LT + INTL) sąrašas, dar neišleistų albumų
  // (is_upcoming=true arba release_date ateityje). Vienas lane'as, sortinta
  // pagal artimiausią datą ASC.
  const [upcomingAlbums, setUpcomingAlbums] = useState<Album[]>(initialLatest ? (initialLatest.upcoming as any[]) : [])
  // Total counts iš DB (po dedupe, prieš slice). Rodom „+N" badge'uose, kad
  // user'is matytų realų DB count'ą, ne tik 10 UI items.
  const [totals, setTotals] = useState<{ tracksLt: number; tracksWorld: number; albumsLt: number; albumsWorld: number; upcoming: number }>(initialLatest
    ? { tracksLt: initialLatest.tracks.totalLt, tracksWorld: initialLatest.tracks.totalWorld, albumsLt: initialLatest.albums.totalLt, albumsWorld: initialLatest.albums.totalWorld, upcoming: initialLatest.upcomingTotal }
    : { tracksLt: 0, tracksWorld: 0, albumsLt: 0, albumsWorld: 0, upcoming: 0 })
  const [artists, setArtists] = useState<Artist[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [news, setNews] = useState<NewsItem[]>((initialHero?.news as any) ?? [])
  // Admine pažymėti homepage hero: vartotojų įrašai + renginiai.
  const [heroPosts, setHeroPosts] = useState<{ id: string; title: string; href: string; cover: string | null; chip: string; chipBg: string; published_at: string | null; author: string | null; excerpt?: string | null; videoId?: string | null; songTitle?: string | null; songArtist?: string | null }[]>((initialHero?.heroPosts as any) ?? [])
  const [heroEvents, setHeroEvents] = useState<Event[]>((initialHero?.heroEvents as any) ?? [])
  // Reader v3 papildomi feed šaltiniai
  const [dailyWinners, setDailyWinners] = useState<any[]>(initialHero?.dailyWinners ?? [])
  const [dailyNomsCount, setDailyNomsCount] = useState<number>(0)
  // Admin feed override'ai (paslėpti/prisegti/eiliškumas) + laisvi įrašai
  const [feedOverrides, setFeedOverrides] = useState<{ item_key: string; hidden: boolean; pinned: boolean; sort_order: number | null }[]>([])
  const [feedCustom, setFeedCustom] = useState<any[]>([])
  // Kandidatų sistema: pending/rejected raktai (type::href) — praslepiami feed'e.
  const [feedBlocked, setFeedBlocked] = useState<Set<string>>(new Set())
  const [discoveries, setDiscoveries] = useState<any[]>([])
  const [recordings, setRecordings] = useState<any[]>([])
  const [vertaConcerts, setVertaConcerts] = useState<{ concerts: any[]; destinations: any[] }>({ concerts: [], destinations: [] })
  // SSR seed'as → pageReady iškart true (overlay neblokuoja jau HTML'e esančio
  // turinio), overlay iš viso nerodomas. Be seed'o — senas elgesys (overlay kol
  // hero+tops paruošti).
  const [pageReady, setPageReady] = useState(seeded)
  // overlayVisible — kontroliuoja kada pageReady overlay pašalinamas iš DOM.
  // pageReady true → CSS .overlay-fade-out 320ms fade → po 350ms unmount.
  const [overlayVisible, setOverlayVisible] = useState(!seeded)
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
  // 2026-06-14: `tracks` IŠIMTAS iš overlay gate'o. Anksčiau visa homepage
  // kabėjo po fullscreen equalizer overlay'umi kol /api/home/latest atsakys —
  // jei jis lėtas/fail'ino, vartotojas matydavo tik loaderį (arba 7s wait).
  // Dabar overlay nukrenta vos hero+tops paruošti, o „Naujos dainos / Nauji
  // albumai" sekcijos užsipildo savo equalizer skeletonais in-place.
  const readyBits = useRef({ hero: false, tops: false })
  const tryReady = useRef(() => {
    const { hero, tops } = readyBits.current
    if (hero && tops) {
      // Anksčiau: setTimeout(..., Math.max(0, 600 - elapsed)) — 600ms
      // artificial minimum delay (sukėlė "ilgokai kraunasi" jausmą net
      // kai duomenys atvažiavo per 200ms). Dabar be delay'aus.
      setPageReady(true)
    }
  })
  const filtEvt = events.filter(e => !(e as any).hide_from_homepage)
  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>([])
  // PERF 2026-07-16: heroIdx rotacijos timeris (kas 8s setState → viso medžio
  // re-render) pašalintas — senojo kinematinio hero likutis: `hero` kintamasis
  // niekur nebebuvo naudojamas (desktop — HeroV2Slider scroll'inis, mobile —
  // feed strip + reels su savo indeksu). Kartu išimtas kito slide'o Image()
  // preload'as, sukdavęs paveikslų parsisiuntimą/dekodavimą amžinu ratu.
  // „Hero settle" — kol async šaltiniai (news/topai/events/...) trūkčioja po
  // vieną, hero turinys persirikiuoja → flicker (matosi sąrašo galo įrašai,
  // tada priekiniai). Todėl hero laikom permatomą kol turinys NUSISTOVI (be
  // pakeitimų ~280ms), tada gražiai fade-in. heroMax garantuoja pasirodymą net
  // jei duomenys vis trūkčioja.
  // Hero atskleidžiamas TIK kai VISI jo duomenų šaltiniai atsako (fetch effect
  // Promise.all) — turinys pilnas, stabilus, vienodas kiekvienam reload, be
  // persirikiavimo. Iki tol — permatomas (vietos aukštis rezervuotas).
  // SSR seed'as → hero rodomas IŠ KARTO (turinys jau HTML'e); be seed'o —
  // atskleidžiamas po core fetch'ų (žr. žemiau).
  const [heroReady, setHeroReady] = useState(heroSeeded)

  /* ── Naujos dainos + albumai loader (retry + degraded handling) ──
     /api/home/latest dabar grąžina `degraded: true` kai DB užklausa fail'ino
     arba abi sekcijos tuščios (galima problema, ne reali tuštuma). Retry'inam
     iki 2 kartų su backoff'u; jei vis tiek degraded/klaida → tracksStatus
     = 'error' → UI rodo „Bandyti dar kartą" kortelę vietoj amžinų skeletonų. */
  const loadLatest = useCallback(async () => {
    setTracksStatus('loading')
    const attempt = async (signal: AbortSignal, fresh: boolean) => {
      // Normaliai naudojam browser/CDN cache (greita repeat-visit). Retry'inant
      // (fresh=true) priverstinai aplenkiam cache, kad negautume to paties bad
      // atsakymo. Degraded atsakymai šiaip jau nešasi `no-store` → browser jų
      // necache'ina, bet `fresh` papildomai apsaugo SWR stale atvejus.
      const r = await fetch('/api/home/latest', { signal, cache: fresh ? 'reload' : 'default' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    }
    const maxTries = 3
    for (let i = 0; i < maxTries; i++) {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 8000)
      try {
        const d = await attempt(ctrl.signal, i > 0)
        clearTimeout(timer)
        const tLt = (d.tracks?.lt || []) as any[]
        const tWorld = (d.tracks?.world || []) as any[]
        const aLt = (d.albums?.lt || []) as any[]
        const aWorld = (d.albums?.world || []) as any[]
        // Server flag'as: degraded → traktuojam kaip nesėkmę ir retry'inam
        // (paskutiniame bandyme paliekam ką gavom, kad bent dalinis turinys
        // matytųsi, bet pažymim 'error' jei VISIŠKAI tuščia).
        if (d.degraded && i < maxTries - 1) {
          await new Promise(res => setTimeout(res, 600 * (i + 1)))
          continue
        }
        setTracks([...tLt, ...tWorld])
        setAlbums([...aLt, ...aWorld])
        setUpcomingAlbums((d.upcoming || []) as any[])
        setTotals({
          tracksLt: d.tracks?.totalLt || 0,
          tracksWorld: d.tracks?.totalWorld || 0,
          albumsLt: d.albums?.totalLt || 0,
          albumsWorld: d.albums?.totalWorld || 0,
          upcoming: d.upcomingTotal || 0,
        })
        const totalItems = tLt.length + tWorld.length + aLt.length + aWorld.length
        setTracksStatus(totalItems === 0 && d.degraded ? 'error' : 'ok')
        return
      } catch {
        clearTimeout(timer)
        if (i < maxTries - 1) {
          await new Promise(res => setTimeout(res, 600 * (i + 1)))
          continue
        }
        setTracksStatus('error')
      }
    }
  }, [])

  // Seed'as iš SSR → praleidžiam pradinį fetch'ą (turinys jau yra). Retry mygtukas
  // (latestReload bump) ar ne-seeded mount'as vis tiek iškviečia loadLatest.
  const latestDidInit = useRef(false)
  useEffect(() => {
    if (!latestDidInit.current) {
      latestDidInit.current = true
      if (seeded) return
    }
    loadLatest()
  }, [loadLatest, latestReload, seeded])

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

  const [newsSongs, setNewsSongs] = useState<Record<number, { youtube_url: string; title: string | null; artist_name: string | null }[]>>({})

  const parseTop = (entries: any[]): TopEntry[] => entries.slice(0, 7).map(e => {
    const prev = e.prev_position; const cur = e.position
    const trend = e.is_new ? 'new' : !prev ? 'same' : cur < prev ? 'up' : cur > prev ? 'down' : 'same'
    return { pos: e.position, track_id: e.track_id, title: sanitizeTitle(e.tracks?.title || ''), artist: e.tracks?.artists?.name || '', cover_url: e.tracks?.cover_url || null, artist_image: e.tracks?.artists?.cover_image_url || null, trend, prevPos: typeof prev === 'number' ? prev : null, wks: e.weeks_in_top, slug: e.tracks?.slug, artist_slug: e.tracks?.artists?.slug, videoId: extractYouTubeId(e.tracks?.video_url || null) }
  })

  useEffect(() => {
    // Homepage fetch'ai paraleliai. Po 2026-05-28 optimizacijos:
    //   - /api/home/latest grąžina tracks + albums vienu round-trip'u, su
    //     server-side LT/World lane split, per-artist dedupe (tracks),
    //     90d window. Cache'inamas su tag'u (home:tracks-latest, home:albums-latest).
    //   - /api/news apriboja į 30 d. ir 12 įrašų (anksčiau 30 modern + 30 legacy).
    //   - /api/artists fetch'as PAŠALINTAS — "Atrask atlikėjus" UI yra po
    //     `{false &&` toggle'u (kol kas paslėpta). Brangus reverse'as DB nieko.
    // VISI hero duomenų fetch'ai. Surenkam jų Promise'us → kai VISI atsako,
    // atskleidžiam hero (pilnas, stabilus). maxT — saugiklis jei kas pakimba.
    // PERF: hero atsiskleidžia, kai paruošti tik HERO-ESMINIAI duomenys
    // (`core`) — nebelaukiam lėčiausio iš 12 fetch'ų. Žemesnes sekcijas
    // (renginių afiša, atradimai, įrašai, verta kelionės, feed override'ai)
    // maitina `rest` — jie tęsiasi fone su savo krovimo būsenom.
    const core: Promise<any>[] = []
    const rest: Promise<any>[] = []
    core.push(fetch('/api/top/entries?type=lt_top30').then(r => r.json()).then(d => { setLtTop(parseTop(d.entries || [])); setLtTopDate(d.week?.created_at || d.week?.week_start || ''); readyBits.current.tops = true; tryReady.current() }).catch(() => { readyBits.current.tops = true; tryReady.current() }))
    core.push(fetch('/api/top/entries?type=top40').then(r => r.json()).then(d => { setWorldTop(parseTop(d.entries || [])); setWorldTopDate(d.week?.created_at || d.week?.week_start || '') }).catch(() => {}))
    core.push(fetch('/api/events?home_hero=1&limit=8').then(r => r.json()).then(d => setHeroEvents(d.events || [])).catch(() => {}))
    core.push(fetch('/api/blog/home-hero').then(r => r.json()).then(d => setHeroPosts(d.posts || [])).catch(() => {}))
    core.push(fetch('/api/dienos-daina/winners?limit=7').then(r => r.json()).then(d => setDailyWinners(d.winners || [])).catch(() => {}))
    core.push(fetch('/api/dienos-daina/nominations').then(r => r.json()).then(d => setDailyNomsCount((d.nominations || []).filter((n: any) => n.tracks).length)).catch(() => {}))
    core.push(fetch('/api/news?limit=12&include=songs&since_days=7')
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
      .catch(() => {}))
    // feed/overrides valdo hero prisegtų slide'ų tvarką — paruošiam PRIEŠ reveal.
    core.push(fetch('/api/feed/overrides').then(r => r.json()).then(d => { setFeedOverrides(d.overrides || []); setFeedCustom(d.custom || []); setFeedBlocked(new Set((d.blocked || []) as string[])) }).catch(() => {}))
    rest.push(fetch('/api/events?limit=60&homepage=1').then(r => r.json()).then(d => setEvents(d.events || [])).catch(() => {}))
    rest.push(fetch('/api/muzikos-atradimai?featured=1&limit=6').then(r => r.json()).then(d => setDiscoveries(d.items || [])).catch(() => {}))
    rest.push(fetch('/api/koncertu-irasai?limit=6').then(r => r.json()).then(d => setRecordings(d.recordings || [])).catch(() => {}))
    rest.push(fetch('/api/verta-keliones').then(r => r.json()).then(d => setVertaConcerts({ concerts: d.concerts || [], destinations: d.destinations || [] })).catch(() => {}))
    void Promise.all(rest)
    // +80ms — kad build effect spėtų perkurti heroSlides su PASKUTINIU duomeniu
    // prieš atskleidžiant.
    Promise.all(core).then(() => setTimeout(() => setHeroReady(true), 80))
    const heroMaxT = setTimeout(() => setHeroReady(true), 5000)
    return () => clearTimeout(heroMaxT)
  }, [])

  /* ── Hero slides ──
     Topai (LT TOP 30 / TOP 40) NEBE visada pirmi: kiekvienas hero slide gauna
     „sortMs" datą (topas → savaitės atsinaujinimo data; naujiena → published_at)
     ir news+topai surikiuojami pagal šviežumą (naujausi pirmi). Taip naujiena,
     naujesnė nei topo atsinaujinimas, atsiduria PRIEŠ topą. Renginiai lieka
     gale (jie ateities datų — nerikiuojam su feed'u). */
  useEffect(() => {
    const slides: HeroSlide[] = []
    const dated: { sortMs: number; slide: HeroSlide }[] = []
    const ms = (s: string | null | undefined) => { const t = s ? new Date(s).getTime() : NaN; return isNaN(t) ? 0 : t }

    // Topo „main visual" = #1 dainos YouTube embed (ne atlikėjo nuotrauka):
    // bgImg = YT thumbnail, videoId = #1 daina (groja paspaudus play).
    const ytThumb = (vid?: string | null) => vid ? `https://img.youtube.com/vi/${vid}/hqdefault.jpg` : null
    if (ltTop.length > 0) {
      dated.push({ sortMs: ms(ltTopDate), slide: {
        type: 'chart_lt', chip: 'LT TOP 30', chipBg: '#ea580c',
        title: 'LT TOP 30',
        subtitle: ltTop.slice(0, 3).map(t => `${t.pos}. ${t.title}`).join(' · '),
        href: '/top30',
        videoId: ltTop[0]?.videoId || null,
        bgImg: ytThumb(ltTop[0]?.videoId) || ltTop[0]?.cover_url || ltTop[0]?.artist_image || null,
        songTitle: ltTop[0]?.title || null,
        songArtist: ltTop[0]?.artist || null,
        songCover: ltTop[0]?.cover_url || ltTop[0]?.artist_image || null,
        chartTops: ltTop.slice(0, 5),
      } as any })
    }
    if (worldTop.length > 0) {
      dated.push({ sortMs: ms(worldTopDate), slide: {
        type: 'chart_world', chip: 'TOP 40', chipBg: '#1d4ed8',
        title: 'TOP 40',
        subtitle: worldTop.slice(0, 3).map(t => `${t.pos}. ${t.title}`).join(' · '),
        href: '/top40',
        videoId: worldTop[0]?.videoId || null,
        bgImg: ytThumb(worldTop[0]?.videoId) || worldTop[0]?.cover_url || worldTop[0]?.artist_image || null,
        songTitle: worldTop[0]?.title || null,
        songArtist: worldTop[0]?.artist || null,
        songCover: worldTop[0]?.cover_url || worldTop[0]?.artist_image || null,
        chartTops: worldTop.slice(0, 5),
      } as any })
    }
    const dateLT = (s: string | null | undefined) => {
      const d = s ? new Date(s) : null
      return d && !isNaN(d.getTime()) ? `${d.getFullYear()} m. ${MONTHS_FULL_LT[d.getMonth()]} ${d.getDate()} d.` : ''
    }
    // TIPO RIBA: max 8 naujienos (anksčiau 30 — naujienos uždominuodavo feed'ą).
    news.slice(0, 8).forEach(n => {
      const typeLT = n.type === 'review' ? 'Recenzija' : n.type === 'interview' ? 'Interviu' : n.type === 'report' ? 'Reportažas' : 'Naujiena'
      const songs = newsSongs[n.id] || []
      const song = songs.find((s: any) => s.youtube_url)
      // VISOS straipsnio dainos (ne tik pirma) → mini-playlist reader'yje.
      const songList = songs
        .map((s: any) => ({
          videoId: extractYouTubeId(s.youtube_url || null),
          title: sanitizeTitle(s.title || '') || s.artist_name || 'Daina',
          artist: s.artist_name || null,
        }))
        .filter((s: any): s is { videoId: string; title: string; artist: string | null } => !!s.videoId)
      dated.push({ sortMs: ms(n.published_at), slide: {
        type: 'news', chip: typeLT.toUpperCase(), chipBg: '#1d4ed8',
        title: sanitizeTitle(n.title),
        subtitle: n.excerpt ? smartTruncate(n.excerpt, 180) : '',
        excerpt: n.excerpt || '',
        metaLine: dateLT(n.published_at),
        newsId: n.id,
        likeable: true,
        fresh24: isFresh24(n.published_at),
        ctaLabel: 'Skaityti straipsnį',
        bgImg: n.image_title_url || n.image_small_url,
        href: `/news/${n.slug}`,
        videoId: extractYouTubeId(song?.youtube_url || null),
        songs: songList.length ? songList : undefined,
        songTitle: song?.title || null,
        songArtist: song?.artist_name || n.artist?.name || null,
        songCover: null,
        artist: n.artist ? { name: n.artist.name, slug: n.artist.slug, image: n.artist.cover_image_url || null } : null,
      } })
    })
    // Admine pažymėti vartotojų įrašai (home_hero) — įsiterpia į feed'ą tarp
    // naujienų pagal publikavimo datą (badge pagal įrašo tipą).
    // ŠVIEŽUMAS: admin prisegti hero įrašai auto-pasensta po 14 d. (anksčiau
    // kabodavo mėnesiais, pvz. vasario topas liepą). TIPO RIBA: max 4.
    heroPosts
      .filter(p => {
        if (!p.published_at) return true
        const d = new Date(p.published_at)
        return isNaN(d.getTime()) || (Date.now() - d.getTime()) < 14 * 86400000
      })
      .slice(0, 4)
      .forEach(p => {
      dated.push({ sortMs: ms(p.published_at), slide: {
        type: 'blog', chip: (p.chip || 'Įrašas').toUpperCase(), chipBg: p.chipBg || '#94a3b8',
        title: sanitizeTitle(p.title),
        subtitle: '',
        excerpt: p.excerpt || '',
        metaLine: [p.author, dateLT(p.published_at)].filter(Boolean).join(' · '),
        authorName: p.author || null,
        ctaLabel: 'Skaityti',
        fresh24: isFresh24(p.published_at),
        bgImg: p.cover,
        href: p.href,
        blogId: p.id || null,
        videoId: p.videoId || null,
        songTitle: p.songTitle || null,
        songArtist: p.songArtist || null,
        artist: null,
      } })
    })
    // Naujausi pirmi (topai įsiterpia pagal savo atsinaujinimo datą)
    dated.sort((a, b) => b.sortMs - a.sortMs)
    for (const x of dated) slides.push(x.slide)

    // ── Nauji tipai (reader v3) ──
    // Radaro atradimai — „dėmesio centre".
    discoveries.slice(0, 2).forEach((d: any) => {
      const dvid = d.embed_id ? (d.embed_type === 'youtube' ? d.embed_id : extractYouTubeId(d.embed_id)) : null
      const who = d.author?.full_name || d.author?.username || ''
      slides.push({
        type: 'discovery', chip: 'DĖMESIO CENTRE', chipBg: '#7c3aed',
        title: d.artist_name || d.track_name || 'Muzikos atradimas',
        subtitle: d.body ? smartTruncate(d.body, 160) : '',
        excerpt: d.body || '',
        metaLine: [who, d.track_name].filter(Boolean).join(' · '),
        bgImg: d.artist_cover || null,
        href: d.artist_slug ? `/atlikejai/${d.artist_slug}` : '/muzikos-atradimai',
        videoId: dvid,
        songTitle: d.track_name || null,
        songArtist: d.artist_name || null,
        artist: null,
        ctaLabel: d.artist_slug ? 'Atlikėjo profilis' : 'Atradimai',
      })
    })
    // Koncertų įrašai — gyvai.
    recordings.slice(0, 2).forEach((r: any) => {
      const rt = r.recording_type === 'full' ? 'Pilnas koncertas' : r.recording_type === 'session' ? 'Gyvas pasirodymas' : 'Koncerto įrašas'
      const place = [r.venue, r.city].filter(Boolean).join(', ')
      slides.push({
        type: 'recording', chip: rt.toUpperCase(), chipBg: '#be185d',
        title: sanitizeTitle(r.title || r.artist_name || 'Koncertas'),
        subtitle: '',
        // YouTube angliškas description NErodomas — tik išparsinta info (tipas, vieta, metai).
        excerpt: '',
        metaLine: [rt, place, r.recorded_year].filter(Boolean).join(' · '),
        bgImg: r.thumbnail_url || (r.youtube_id ? `https://img.youtube.com/vi/${r.youtube_id}/hqdefault.jpg` : null),
        href: `/koncertu-irasai/${r.slug}`,
        videoId: r.youtube_id || null,
        songTitle: r.title || null,
        songArtist: r.artist_name || null,
        artist: r.artist_name ? { name: r.artist_name, slug: r.artist_slug || '', image: null } : null,
        ctaLabel: 'Žiūrėti įrašą',
      })
    })
    // Dienos daina — DU atskiri postai (įsiterpia giliau į feed'ą):
    //   1) „Šiandienos dienos daina" — gyvi kandidatai (balsavimas + siūlymas), DailyCandidates pats kraunasi.
    //   2) „Vakar laimėjo" — naujausias laimėtojas (rodymas + grojimas).
    const dailySlides: HeroSlide[] = []
    // Šiandienos kandidatai feede TIK kai jų pakanka (≥5) — kitaip atrodo tuščia.
    if (dailyNomsCount >= 5) {
      dailySlides.push({
        type: 'daily', chip: 'DIENOS DAINA', chipBg: '#f59e0b',
        title: 'Šiandienos dienos daina',
        subtitle: '',
        metaLine: 'Balsuok už mėgstamą kandidatą',
        href: '/dienos-daina',
        ctaLabel: 'Daugiau',
      })
    }
    if (dailyWinners.length > 0) {
      const w = dailyWinners[0]  // naujausias laimėtojas
      const tr = w?.tracks
      // ŠVIEŽUMAS: laimėtojas rodomas TIK jei jo data per pask. 2 paras — kitaip
      // feed'e kabodavo pasenusios „Vakar laimėjo" dainos (pastebėta 2026-07-03).
      const wDate = w?.date ? new Date(w.date) : null
      const ageDays = wDate && !isNaN(wDate.getTime()) ? (Date.now() - wDate.getTime()) / 86400000 : Infinity
      const isYesterday = ageDays < 1.5
      if (tr && ageDays <= 2.5) {
        // Sąžiningas tekstas: „Vakar laimėjo" tik kai tikrai vakar; kitaip — reali data.
        const wonLabel = isYesterday
          ? 'Vakar laimėjo'
          : (wDate ? `${MONTHS_FULL_LT[wDate.getMonth()][0].toUpperCase()}${MONTHS_FULL_LT[wDate.getMonth()].slice(1)} ${wDate.getDate()} d. laimėjo` : 'Laimėjo')
        dailySlides.push({
          type: 'daily_winner', chip: 'DIENOS DAINA', chipBg: '#f59e0b',
          title: sanitizeTitle(tr.title || ''),
          subtitle: '',
          excerpt: w.winning_comment || '',
          metaLine: [wonLabel, tr.artists?.name, w.proposer ? `siūlė ${w.proposer.full_name || w.proposer.username}` : ''].filter(Boolean).join(' · '),
          bgImg: extractYouTubeId(tr.video_url || null) ? `https://img.youtube.com/vi/${extractYouTubeId(tr.video_url || null)}/hqdefault.jpg` : (tr.cover_url || tr.artists?.cover_image_url || null),
          href: '/dienos-daina',
          videoId: extractYouTubeId(tr.video_url || null),
          songTitle: tr.title || null,
          songArtist: tr.artists?.name || null,
          artist: tr.artists ? { name: tr.artists.name, slug: tr.artists.slug || '', image: tr.artists.cover_image_url || null } : null,
          // CTA — nuoroda į /dienos-daina (grojimas nebe „vietoje", o per embed'ą kortelėj).
          ctaLabel: 'Dienos daina',
        })
      }
    }
    // Įterpiam dienos dainas giliau į feed'ą (po ~3 įrašų).
    slides.splice(Math.min(3, slides.length), 0, ...dailySlides)
    // Verti kelionės koncertai (užsienyje). ŠVIEŽUMAS + TIPO RIBA: tik ateities
    // datos ir max 1 kortelė (anksčiau 2 + pasenusios datos — perdominuodavo).
    ;(vertaConcerts.concerts || [])
      .filter((c: any) => {
        if (!c.date) return true
        const d = new Date(c.date)
        return isNaN(d.getTime()) || d.getTime() > Date.now() - 86400000
      })
      // VIZUALO FILTRAS (2026-07-16): kaip ir renginiams — be nuotraukos į hero
      // nepatenka (anksčiau verta tipas šio filtro neturėjo ir pro jį praslysdavo
      // tuščios kortelės, pvz. Lollapalooza Berlin).
      .filter((c: any) => !!c.image)
      .slice(0, 1)
      .forEach((c: any) => {
      const dest = (vertaConcerts.destinations || []).find((x: any) => x.key === c.destKey)
      const cd = c.date ? new Date(c.date) : null
      const ds = cd && !isNaN(cd.getTime()) ? `${cd.getFullYear()} m. ${MONTHS_FULL_LT[cd.getMonth()]} ${cd.getDate()} d.` : ''
      const where = dest ? [dest.city, dest.country].filter(Boolean).join(', ') : ''
      // Kelionės kontekstas iš krypties (dest): skrydis (oro uostas, vežėjas,
      // kaina „nuo") arba kelionė automobiliu (valandos, iš kur).
      const travel = dest
        ? (dest.reach === 'flight'
            ? ['Skrydis' + (dest.fromAirport ? ` iš ${dest.fromAirport}` : ''), dest.carrier || '', dest.priceFrom ? `nuo ${dest.priceFrom} €` : ''].filter(Boolean).join(', ')
            : (dest.driveHours ? `~${dest.driveHours} val. automobiliu${dest.driveFrom ? ` iš ${dest.driveFrom}` : ''}` : ''))
        : ''
      slides.push({
        type: 'verta', chip: 'VERTA KELIONĖS', chipBg: '#0891b2',
        title: c.isFestival ? (c.festivalName || c.artist) : c.artist,
        subtitle: [where, ds].filter(Boolean).join(' · '),
        excerpt: c.why || '',   // „kodėl verta" — PILNAS tekstas
        metaLine: [where, ds, travel].filter(Boolean).join(' · '),
        bgImg: c.image || null,
        // STABILUS raktas: slug vietoj UUID (UUID keičiasi perkūrus renginį →
        // admin'o hide override'ai tapdavo našlaičiais). Fallback id — seed'ui.
        href: `/verta-keliones#vk-${c.slug || c.id}`,
        ticketUrl: c.ticketUrl || null,
        artist: null,
        ctaLabel: 'Apie kelionę',
      })
    })

    // Renginiai: admine pažymėti (home_hero) pirmi, likusią vietą užpildo
    // naujausi renginiai automatiškai (dedup pagal id, max 4).
    const evSeen = new Set<number>()
    const evList: Event[] = []
    for (const ev of heroEvents) { if (!evSeen.has(ev.id)) { evSeen.add(ev.id); evList.push(ev) } }
    // TIPO RIBA: max 3 renginiai (kad afiša neuždominuotų feed'o).
    for (const ev of events) { if (evList.length >= 3) break; if (!evSeen.has(ev.id)) { evSeen.add(ev.id); evList.push(ev) } }
    evList.forEach(ev => {
      // Renginys be vizualo NEPATENKA (rebuild2) į feed'ą (kad nebūtų tuščių tamsių kortelių).
      const evImg = ev.image_small_url || ev.cover_image_url || null
      if (!evImg) return
      const dateRaw = (ev as any).start_date || ev.event_date
      const d = dateRaw ? new Date(dateRaw) : null
      const dateStr = d && !isNaN(d.getTime()) ? `${d.getFullYear()} m. ${MONTHS_FULL_LT[d.getMonth()]} ${d.getDate()} d.` : ''
      const city = ev.city || ev.venues?.city || ''
      const artistList = (ev.event_artists || [])
        .filter(ea => ea.artists?.name)
        .map(ea => ea.artists!.name)
      // Festivaliams rodom festivalio pavadinimą (rebuild2) (NE atlikėjų sąrašą); kitiems —
      // atlikėjai (arba renginio title kaip fallback).
      const artistText = ev.is_festival
        ? sanitizeTitle(ev.title)
        : artistList.length > 0
          ? artistList.slice(0, 3).join(', ') + (artistList.length > 3 ? ` +${artistList.length - 3}` : '')
          : sanitizeTitle(ev.title)
      const firstArtist = (ev.event_artists || []).find(ea => ea.artists?.cover_image_url)
      // Vietos pavadinimas (venue) — pilnesnė metaLine: vieta · miestas · data.
      const venueName = ev.venues?.name || ev.venue_name || ev.venue_custom || ''
      const evMeta = [venueName, city, dateStr].filter(Boolean).join(' · ')
      // Trumpa meta mobile hero kortelei (156px): tik miestas + data be metų
      // (šių metų renginiams) — kad netilptų į 2 eilutes (2026-07 UX auditas).
      const dateShort = d && !isNaN(d.getTime())
        ? (d.getFullYear() === new Date().getFullYear()
            ? `${MONTHS_FULL_LT[d.getMonth()]} ${d.getDate()} d.`
            : `${d.getFullYear()} ${MONTHS_FULL_LT[d.getMonth()]} ${d.getDate()} d.`)
        : ''
      const evMetaShort = [city, dateShort].filter(Boolean).join(' · ')
      // Aprašymas PILNAS (be trumpinimo) — reader'yje vietos užtenka.
      const evDesc = (ev as any).description ? sanitizeTitle((ev as any).description) : ''
      // Pilnas lineup'as (max 6) — avatarų eilutė su nuorodom į atlikėjų puslapius.
      const lineup = (ev.event_artists || [])
        .filter(ea => ea.artists?.name && ea.artists?.slug)
        .slice(0, 6)
        .map(ea => ({ name: ea.artists!.name, slug: ea.artists!.slug, image: ea.artists!.cover_image_url || null }))
      slides.push({
        type: 'event', chip: 'RENGINYS', chipBg: '#047857',
        title: artistText,  // ARTISTS as primary text (atlikėjas nerodomas dar kartą žemiau)
        subtitle: evMeta,  // vieta · miestas · data
        subtitleShort: evMetaShort,  // miestas · data (mobile kortelė)
        metaLine: evMeta,
        excerpt: evDesc,
        lineup: lineup.length ? lineup : undefined,
        ticketUrl: ev.ticket_url || null,
        ctaLabel: 'Apie renginį',
        fresh24: isFresh24(ev.created_at),
        bgImg: evImg,
        href: `/renginiai/${ev.slug}`,
        artist: firstArtist?.artists ? { name: firstArtist.artists.name, slug: firstArtist.artists.slug, image: firstArtist.artists.cover_image_url || null } : null,
      })
    })
    if (!slides.length) slides.push({
      type: 'promo', chip: '🇱🇹 LIETUVIŠKA MUZIKA', chipBg: 'var(--accent-orange)',
      title: 'music.lt',
      subtitle: 'Visi Lietuvos atlikėjai vienoje vietoje',
      href: '/atlikejai',
    })

    // ── Admin feed override'ai: paslėpti / prisegti / rankinis eiliškumas + laisvi įrašai ──
    const feedKey = (s: HeroSlide) => `${s.type}::${s.href}`
    const ovMap = new Map(feedOverrides.map(o => [o.item_key, o]))
    const items: { slide: HeroSlide; i: number; ord: number | null; pinned: boolean }[] = []
    slides.forEach((s, i) => {
      const o = ovMap.get(feedKey(s))
      if (o?.hidden) return
      // Kandidatų sistema: laukiantys/atmesti auto-įrašai nepatenka į feed'ą.
      if (feedBlocked.has(feedKey(s))) return
      // Rankinė tvarka nugali, BET nauji auto-įrašai (be override'o) iškyla į priekį.
      const ord = (o && typeof o.sort_order === 'number') ? o.sort_order : null
      items.push({ slide: s, i, ord, pinned: !!o?.pinned })
    })
    feedCustom.filter(c => !c.hidden).forEach((c, ci) => {
      items.push({
        slide: {
          type: 'custom', chip: (c.chip || 'ĮRAŠAS').toUpperCase(), chipBg: c.chip_bg || '#6366f1',
          title: sanitizeTitle(c.title || ''), subtitle: c.subtitle || '', excerpt: c.subtitle || '',
          href: c.href, bgImg: c.image_url || null, videoId: extractYouTubeId(c.video_url || null),
          ctaLabel: 'Atidaryti',
        },
        i: 10000 + ci,
        ord: typeof c.sort_order === 'number' ? c.sort_order : -1,
        pinned: false,
      })
    })
    // 3 pakopos: 0=prisegti (📌 viršuje), 1=nauji/be override'o (pagal šviežumą →
    // į priekį), 2=išsaugota rankinė tvarka (apačioje). /admin/feed atitinka.
    const feedTier = (x: { ord: number | null; pinned: boolean }) => x.pinned ? 0 : (x.ord != null ? 2 : 1)
    items.sort((a, b) => {
      const ta = feedTier(a), tb = feedTier(b)
      if (ta !== tb) return ta - tb
      if (ta === 1) return a.i - b.i
      return ((a.ord ?? -1) - (b.ord ?? -1)) || (a.i - b.i)
    })
    const finalSlides = items.map(x => x.slide)

    // ANTI-DOMINAVIMAS: ne daugiau 2 to paties tipo iš eilės (pvz. naujienų ar
    // renginių blokai išsklaidomi) — nekeičiant bendro eiliškumo daugiau nei būtina.
    for (let i = 2; i < finalSlides.length; i++) {
      if (finalSlides[i].type === finalSlides[i - 1].type && finalSlides[i].type === finalSlides[i - 2].type) {
        const j = finalSlides.findIndex((s, k) => k > i && s.type !== finalSlides[i].type)
        if (j === -1) break
        const [moved] = finalSlides.splice(j, 1)
        finalSlides.splice(i, 0, moved)
      }
    }

    setHeroSlides(finalSlides.length ? finalSlides : slides)
    readyBits.current.hero = true
    tryReady.current()
  }, [news, events, newsSongs, ltTop, worldTop, ltTopDate, worldTopDate, heroPosts, heroEvents, discoveries, recordings, dailyWinners, dailyNomsCount, vertaConcerts, feedOverrides, feedCustom, feedBlocked])

  /* ── "seen" tracking ── */
  const [seenSlides, setSeenSlides] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('reels_seen') || '[]') as string[]) }
    catch { return new Set() }
  })

  const chartData = chartTab === 'lt' ? ltTop : worldTop

  return (
    <>
      <style>{`
        .hp{font-family:'DM Sans',sans-serif;background:var(--bg-body);min-height:100vh}
        @keyframes hp-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        @keyframes hp-img-in{from{opacity:0;transform:scale(1.04)}to{opacity:1;transform:scale(1)}}
        @keyframes hp-pulse{0%,100%{opacity:.05}50%{opacity:.08}}
        .hp-skel{background:var(--homepage-skeleton-bg);animation:hp-pulse 1.8s ease-in-out infinite}
        .hp-freshdot{width:10px;height:10px;border-radius:50%;background:var(--accent-green);box-shadow:0 0 6px 1.5px rgba(34,197,94,0.85);animation:hp-blip 2.4s ease-in-out infinite}
        @keyframes hp-blip{0%,100%{box-shadow:0 0 4px 1px rgba(34,197,94,0.5);transform:scale(.9)}50%{box-shadow:0 0 9px 2.5px rgba(34,197,94,1);transform:scale(1)}}
        /* overflow-y:hidden — kad overflow-x:auto neišvirstų į implicit
           overflow-y:auto (kelių px vertikalus overflow „pagauna" wheel
           scroll'ą virš juostos ir stabdo puslapio slinkimą). */
        .hp-scroll{overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-webkit-overflow-scrolling:touch;scroll-behavior:smooth}
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
        .hp-pill{cursor:pointer;padding:5px 13px;border-radius:18px;font-size:12px;font-weight:700;border:1px solid var(--border-default);color:var(--text-muted);background:transparent;transition:all .15s;white-space:nowrap;font-family:'DM Sans',sans-serif}
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

        /* ── Reels reader v3 — horizontal istorijos, vertikalus skaitymas.
           z-index VIRŠ site header'io — overlay dengia visą ekraną (fullscreen). ── */
        .hp-reels{position:fixed;inset:0;z-index:9999;background:#101319;overflow:hidden}
        .hp-reels-track{height:100%;display:flex;flex-direction:row;will-change:transform}
        .hp-reels-slide{height:100dvh;width:100vw;flex-shrink:0;position:relative;overflow:hidden;background:#101319}

        /* Vertikaliai scrollinama istorija */
        .rdr-slide{height:100%;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;touch-action:pan-y;scrollbar-width:none}
        .rdr-slide::-webkit-scrollbar{display:none}

        /* Media viršuje — VISADA tik statinė nuotrauka (contain + blur fonas) */
        .rdr-media{position:relative;width:100%;aspect-ratio:16/10;max-height:60vh;background:#0a0a0a;overflow:hidden}
        .rdr-media-fade{position:absolute;left:0;right:0;bottom:0;height:42%;background:linear-gradient(to top,#000,transparent);pointer-events:none;z-index:1}
        /* Trumpo turinio kortelės — aukštesnis posteris */
        .rdr-media-tall{aspect-ratio:4/5;max-height:60vh}
        .rdr-poster-bg{position:absolute;inset:0;background-size:cover;background-position:center;filter:blur(26px) brightness(0.55);transform:scale(1.18)}
        .rdr-poster-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:1}
        /* Antraštės galvutė: badge + data vienoj eilutėj (kompaktiška) */
        .rdr-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}
        .rdr-date{font-size:14px;font-weight:600;color:rgba(255,255,255,0.62);font-family:'Outfit',sans-serif}

        /* ── Šviesi tema (light mode) — reels neturi būti juodas ── */
        .hp-reels.light,.hp-reels.light .hp-reels-slide,.hp-reels.light .rdr-slide{background:var(--bg-body)}
        .hp-reels.light .rdr-title,.hp-reels.light .rdr-title-link{color:var(--text-primary)}
        .hp-reels.light .rdr-date{color:var(--text-muted)}
        .hp-reels.light .rdr-excerpt,.hp-reels.light .rdr-html{color:var(--text-secondary)}
        .hp-reels.light .rdr-html h2,.hp-reels.light .rdr-html h3{color:var(--text-primary)}
        .hp-reels.light .rdr-html a{color:var(--accent-link)}
        .hp-reels.light .rdr-author{color:var(--text-muted)}
        .hp-reels.light .rdr-media-fade{display:none}
        .hp-reels.light .rdr-embeds-head{color:var(--text-muted)}
        .hp-reels.light .rdr-embed-cap{color:var(--text-muted)}
        .hp-reels.light .rdr-foot{background:var(--bg-elevated);border-color:var(--border-default)}
        .hp-reels.light .rdr-foot-artist span{color:var(--text-primary)}
        .hp-reels.light .rdr-foot-div{background:var(--border-default)}
        .hp-reels.light .rdr-foot-ticket{border-color:var(--border-default);color:var(--text-primary)}
        .hp-reels.light .rdr-uptop{background:var(--bg-elevated);border-color:var(--border-default);color:var(--text-primary)}
        .hp-reels.light .rdr-chart-info b,.hp-reels.light .rdr-top-title{color:var(--text-primary)}
        .hp-reels.light .rdr-toplist .rdr-top-comment,.hp-reels.light .rdr-chart-info i,.hp-reels.light .rdr-top-artist{color:var(--text-muted)}

        /* Turinys — footer'is yra PASKUTINIS elementas; apačioje tik nedidelis
           tarpas + safe-area, kad kortelė baigtųsi švariai (be tuščio scroll'o). */
        .rdr-content{padding:16px 20px calc(16px + env(safe-area-inset-bottom))}
        .rdr-chip{display:inline-block;padding:3px 10px;border-radius:14px;font-size:12px;font-weight:700;color:#fff;font-family:'Outfit',sans-serif;letter-spacing:0.03em;text-transform:uppercase}
        .rdr-title{font-family:'Outfit',sans-serif;font-size:25px;font-weight:900;color:#eef1f6;line-height:1.16;letter-spacing:-0.02em;margin:0 0 8px;display:block}
        a.rdr-title-link{text-decoration:none}
        a.rdr-title-link:active{opacity:0.7}
        .rdr-meta{font-size:14px;font-weight:600;color:rgba(255,255,255,0.64);margin:0 0 12px}
        .rdr-excerpt{font-size:16px;line-height:1.62;color:rgba(255,255,255,0.88);margin:0}
        /* Lineup „pill'ės" — naudojamos footer'io konteksto eilutėje */
        .rdr-lineup-item{display:inline-flex;align-items:center;gap:7px;padding:4px 12px 4px 4px;border-radius:999px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.10);text-decoration:none;flex-shrink:0}
        .rdr-lineup-item img,.rdr-lineup-ph{width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0;background:var(--accent-orange);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:12px;text-transform:uppercase}
        .rdr-lineup-item span:last-child{font-size:14px;font-weight:700;color:#eef1f6;white-space:nowrap}
        .hp-reels.light .rdr-lineup-item{background:var(--bg-hover);border-color:var(--border-default)}
        .hp-reels.light .rdr-lineup-item span:last-child{color:var(--text-primary)}
        .rdr-html{font-size:16px;line-height:1.66;color:rgba(255,255,255,0.88)}
        .rdr-html p{margin:0 0 14px}
        .rdr-html a{color:#fb923c;text-decoration:underline}
        .rdr-html .news-source{display:none}
        .rdr-html h2,.rdr-html h3{font-family:'Outfit',sans-serif;color:#eef1f6;font-size:20px;margin:20px 0 8px;line-height:1.2}
        .rdr-html img{max-width:100%;height:auto;border-radius:12px;margin:12px 0;display:block}
        .rdr-html iframe{max-width:100%;border-radius:12px;margin:12px 0}
        .rdr-html ul,.rdr-html ol{padding-left:20px;margin:0 0 14px}
        .rdr-html blockquote{border-left:3px solid var(--accent-orange);padding-left:14px;margin:0 0 14px;color:rgba(255,255,255,0.7);font-style:italic}
        .rdr-toplist-wrap .rdr-html{margin-bottom:14px}
        .rdr-toplist{display:flex;flex-direction:column;gap:15px;margin:4px 0}
        .rdr-top-item{display:flex;gap:11px;align-items:flex-start}
        .rdr-top-rank{flex-shrink:0;width:26px;height:26px;border-radius:8px;background:rgba(249,115,22,0.22);color:#fb923c;font-family:'Outfit',sans-serif;font-weight:900;font-size:14px;display:flex;align-items:center;justify-content:center;margin-top:1px}
        .rdr-top-cover{flex-shrink:0;width:56px;height:56px;border-radius:10px;object-fit:cover;display:block}
        .rdr-top-ph{background:rgba(255,255,255,0.08)}
        .rdr-top-info{min-width:0;flex:1}
        .rdr-top-title{margin:0;font-family:'Outfit',sans-serif;font-weight:800;font-size:16px;color:#eef1f6;line-height:1.25}
        .rdr-top-artist{font-weight:600;color:rgba(255,255,255,0.72)}
        .rdr-top-comment{margin:5px 0 0;font-size:14px;line-height:1.5;color:rgba(255,255,255,0.8)}
        .rdr-outro{margin-top:20px}
        .rdr-outro a{display:flex;align-items:center;gap:9px;color:#fff;text-decoration:none;margin:0 0 9px;font-size:14px}
        .rdr-outro .bp-enrich-thumb{width:38px;height:38px;border-radius:8px;object-fit:cover;margin:0;flex-shrink:0}
        .rdr-author{font-size:14px;font-weight:700;color:rgba(255,255,255,0.72);margin:14px 0 0}
        .rdr-load{display:flex;flex-direction:column;gap:10px;margin-top:4px}
        .rdr-load span{height:13px;border-radius:6px;background:linear-gradient(90deg,rgba(255,255,255,0.06),rgba(255,255,255,0.13),rgba(255,255,255,0.06));background-size:200% 100%;animation:rdr-sk 1.2s infinite}
        .rdr-load span:nth-child(1){width:100%}.rdr-load span:nth-child(2){width:92%}.rdr-load span:nth-child(3){width:68%}
        @keyframes rdr-sk{0%{background-position:200% 0}100%{background-position:-200% 0}}

        /* Chart sąrašas */
        .rdr-chart{display:flex;flex-direction:column;gap:8px;margin:4px 0 16px}
        .rdr-chart-row{display:flex;align-items:center;gap:10px}
        .rdr-chart-pos{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;width:22px;text-align:center;font-family:'Outfit',sans-serif;font-weight:900;font-size:16px;color:var(--accent-orange);flex-shrink:0;line-height:1}
        /* Pozicijos pokytis: ▲n / ▼n / = / N (naujokas) */
        .rdr-trend{font-style:normal;font-size:12px;font-weight:800;letter-spacing:0;line-height:1}
        .rdr-trend.up{color:#22c55e}
        .rdr-trend.down{color:#ef4444}
        .rdr-trend.same{color:rgba(255,255,255,0.35)}
        .rdr-trend.new{color:#fb923c}
        .hp-reels.light .rdr-trend.same{color:var(--text-muted)}
        .rdr-chart-row img,.rdr-chart-ph{width:42px;height:42px;border-radius:8px;object-fit:cover;flex-shrink:0;background:#1a1a1a}
        .rdr-chart-info{display:flex;flex-direction:column;min-width:0;flex:1}
        .rdr-chart-info b{font-size:14px;font-weight:700;color:#eef1f6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .rdr-chart-info i{font-size:12px;font-style:normal;color:rgba(255,255,255,0.64);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

        /* Inline topas (balsavimas + grojimas) */
        .rdr-cvl{display:flex;flex-direction:column;gap:9px;margin:4px 0 12px}
        .rdr-cvl-head{font-family:'Outfit',sans-serif;font-size:12px;font-weight:800;letter-spacing:0.04em;color:rgba(255,255,255,0.55);text-transform:uppercase}
        .rdr-cvl-cover{position:relative;width:42px;height:42px;border-radius:8px;overflow:hidden;flex-shrink:0;border:none;padding:0;background:#1a1a1a;cursor:pointer}
        .rdr-cvl-cover img{width:100%;height:100%;object-fit:cover;display:block}
        .rdr-cvl-cover:disabled{cursor:default}
        .rdr-cvl-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.32)}
        .rdr-cvl-vote{display:flex;align-items:center;justify-content:center;flex-shrink:0;width:38px;height:38px;border-radius:50%;border:1.5px solid var(--accent-orange);background:transparent;color:var(--accent-orange);font-family:'Outfit',sans-serif;cursor:pointer;transition:transform .12s,background .15s}
        .rdr-cvl-vote.voted{background:var(--accent-orange);color:#fff}
        .rdr-cvl-vote:disabled{opacity:0.5}
        .rdr-cvl-vote:active:not(:disabled){transform:scale(0.9)}
        .rdr-cvl-mine{font-size:16px;font-weight:900}

        /* ── „Muzika" sekcija — standartiniai YouTube embed'ai po tekstu (16/9,
           užapvalinti). Grojimą paleidžia pats YouTube — jokio custom UI.
           Antraštė tik kai yra TIKRAS dainos pavadinimas. ── */
        .rdr-embeds{display:flex;flex-direction:column;gap:10px;margin:20px 0 0}
        .rdr-embeds-head{font-family:'Outfit',sans-serif;font-size:12px;font-weight:700;letter-spacing:0.08em;color:rgba(255,255,255,0.6);text-transform:uppercase}
        .rdr-embed-cap{margin:0 0 5px;font-size:14px;font-weight:600;color:rgba(255,255,255,0.74);line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .rdr-embed-frame{position:relative;width:100%;aspect-ratio:16/9;border-radius:14px;overflow:hidden;background:#000}
        .rdr-embed-frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block}

        /* Dienos dainos kandidatai */
        .rdr-dc{display:flex;flex-direction:column;gap:9px;margin:4px 0 12px}
        .rdr-dc-row{display:flex;align-items:center;gap:10px;padding:7px;border-radius:12px;background:rgba(255,255,255,0.04)}
        .rdr-dc-row.lead{background:rgba(245,158,11,0.13);border:1px solid rgba(245,158,11,0.3)}
        .rdr-dc-rank{width:18px;text-align:center;font-family:'Outfit',sans-serif;font-weight:900;font-size:14px;color:#f59e0b;flex-shrink:0}
        .rdr-dc-info{display:flex;flex-direction:column;min-width:0;flex:1;gap:3px}
        .rdr-dc-info b{font-size:14px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .rdr-dc-info i{font-size:12px;font-style:normal;color:rgba(255,255,255,0.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .rdr-dc-bar{display:flex;gap:3px;margin-top:1px}
        .rdr-dc-bar span{width:13px;height:3px;border-radius:2px;background:rgba(255,255,255,0.18)}
        .rdr-dc-bar span.on{background:#f59e0b}
        .rdr-dc-vote{width:40px;height:40px;flex-shrink:0;border-radius:11px;background:rgba(245,158,11,0.14);border:1px solid rgba(245,158,11,0.32);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .12s}
        .rdr-dc-vote:disabled{cursor:default}
        .rdr-dc-vote.on{background:rgba(245,158,11,0.06)}
        .rdr-dc-vote:active:not(:disabled){transform:scale(0.92)}
        .rdr-dc-suggest{display:block;text-align:center;margin-top:4px;padding:12px;border-radius:12px;background:#f59e0b;color:#fff;font-family:'Outfit',sans-serif;font-size:14px;font-weight:800;text-decoration:none}
        .rdr-dc-empty{display:flex;flex-direction:column;gap:12px;padding:8px 0}
        .rdr-dc-empty p{font-size:16px;font-weight:600;color:rgba(255,255,255,0.85);margin:0}

        /* ── Vieningas kortelės pabaigos blokas (footer) — vienas konteineris:
           konteksto eilutė (atlikėjas/lineup + ♥), skirtukas, veiksmų eilutė
           (pilno pločio CTA + „Bilietai"). Scrollinasi su turiniu. ── */
        .rdr-foot{margin:20px 0 0;border-radius:18px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.10);overflow:hidden}
        .rdr-foot-ctx{display:flex;align-items:center;gap:10px;min-height:44px;padding:6px 10px}
        .rdr-foot-artist{display:inline-flex;align-items:center;gap:8px;text-decoration:none;min-width:0;flex:1}
        .rdr-foot-artist img,.rdr-foot-ph{width:30px;height:30px;border-radius:50%;object-fit:cover;flex-shrink:0;background:var(--accent-orange);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px;text-transform:uppercase}
        .rdr-foot-artist span{font-size:14px;font-weight:700;color:#eef1f6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .rdr-foot-lineup{display:flex;align-items:center;gap:6px;overflow-x:auto;scrollbar-width:none;min-width:0;flex:1}
        .rdr-foot-lineup::-webkit-scrollbar{display:none}
        .rdr-foot-div{height:1px;background:rgba(255,255,255,0.08)}
        .rdr-foot-actions{display:flex;gap:8px;padding:10px}
        .rdr-foot-cta{flex:1;display:flex;align-items:center;justify-content:center;gap:7px;height:48px;border-radius:12px;background:var(--accent-orange);color:#fff;font-family:'Outfit',sans-serif;font-size:16px;font-weight:800;letter-spacing:-0.01em;text-decoration:none;min-width:0}
        .rdr-foot-cta:active{opacity:0.85}
        .rdr-foot-ticket{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;height:48px;border-radius:12px;background:transparent;border:1px solid rgba(255,255,255,0.25);color:#fff;font-family:'Outfit',sans-serif;font-size:14px;font-weight:800;text-decoration:none;min-width:0}

        /* Progreso juostelės + kontrolės */
        .rdr-bars{position:fixed;top:12px;left:14px;right:54px;z-index:312;display:flex;gap:4px;align-items:center;pointer-events:none}
        .rdr-bar{flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,0.22);overflow:hidden}
        .rdr-close{position:fixed;top:9px;right:14px;z-index:312;width:36px;height:36px;border-radius:50%;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.2);color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)}
        .rdr-uptop{position:fixed;top:22px;left:50%;transform:translateX(-50%);z-index:312;display:flex;align-items:center;justify-content:center;width:34px;height:34px;padding:0;color:#fff;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.2);border-radius:50%;cursor:pointer;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
        .rdr-uptop:active{transform:translateX(-50%) scale(0.9)}
        .rdr-nav{position:fixed;top:50%;transform:translateY(-50%);z-index:308;width:40px;height:40px;border-radius:50%;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.15);color:#fff;font-size:24px;line-height:1;cursor:pointer;display:none;align-items:center;justify-content:center;backdrop-filter:blur(6px)}
        .rdr-nav-l{left:12px}.rdr-nav-r{right:12px}
        @media(min-width:900px){.rdr-nav{display:flex}.rdr-media,.rdr-content{max-width:560px;margin-left:auto;margin-right:auto}}

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
          .hp-hero-excerpt{font-size:14px!important;margin-bottom:12px!important;-webkit-line-clamp:2!important;display:-webkit-box!important;-webkit-box-orient:vertical!important;overflow:hidden!important;max-height:42px}
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
          .hp-hero-title{font-size:20px!important;-webkit-line-clamp:2}
          .hp-hero-title{font-size:20px!important}
          .hp-hero-excerpt{-webkit-line-clamp:2}
        }

        @media(max-width:900px){
          .hp-triple{grid-template-columns:1fr!important}
          .hp-ne{grid-template-columns:1fr!important}
        }
        @media(max-width:768px){
          .hp-cnt{padding:22px 14px!important;gap:30px!important}
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
        {/* Hero loaderis — kol VISI hero šaltiniai dar kraunasi (heroReady=false).
            Stilius kaip /bendruomene: pulsuojančios 16:9 kortelės + ekvalaizeris.
            Tik desktop (.hp-hero-v2 paslėptas ≤768px; mobile rodo feed strip). */}
        {pageReady && !heroReady && (
          <section className="hp-hero-v2" aria-hidden>
            <style>{`
              @keyframes hpSkelPulse{0%,100%{opacity:1}50%{opacity:.5}}
              @keyframes hpEqBar{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}
              .hp-skel-card{background:var(--bg-surface);border:1px solid var(--border-default);animation:hpSkelPulse 1.8s ease-in-out infinite;display:flex;align-items:center;justify-content:center}
              .hp-eq{display:flex;align-items:flex-end;gap:4px;height:28px}
              .hp-eq span{width:4px;border-radius:2px;background:var(--accent-orange);opacity:.55;animation:hpEqBar 1s ease-in-out infinite;transform-origin:bottom}
              .hp-eq span:nth-child(1){height:28px;animation-delay:0s}
              .hp-eq span:nth-child(2){height:16px;animation-delay:.15s}
              .hp-eq span:nth-child(3){height:24px;animation-delay:.3s}
              .hp-eq span:nth-child(4){height:12px;animation-delay:.45s}
              .hp-eq span:nth-child(5){height:20px;animation-delay:.6s}
            `}</style>
            <div className="mx-auto max-w-[1360px] px-5 pt-5">
              <div className="flex items-stretch gap-4 pb-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="hp-hero-slot shrink-0">
                    <div className="hp-skel-card h-full w-full rounded-2xl" style={{ aspectRatio: '16/9' }}>
                      <div className="hp-eq"><span /><span /><span /><span /><span /></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
        {pageReady && heroReady && heroSlides.length > 0 && (
          <div style={{ animation: 'hpHeroReveal 0.5s cubic-bezier(0.22,1,0.36,1) both' }}>
            <style>{'@keyframes hpHeroReveal{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}'}</style>
            <HeroV2Slider slides={heroSlides} dk={dk} />
          </div>
        )}


        {/* ═══════════════════════ BELOW-HERO CONTENT ═══════════════════════ */}
        <div style={{ opacity: pageReady ? 1 : 0, transition: 'opacity 0.3s ease', pointerEvents: pageReady ? 'auto' : 'none' }}>

        {/* Mobile hero loaderis — kol heroReady=false (tik mobile; .hp-feed-strip
            paslėptas desktop). Stilius kaip /bendruomene (hp-skel-card+hp-eq;
            CSS iš desktop skeleton <style>, kuris DOM'e kol !heroReady). */}
        {pageReady && !heroReady && (
          <div className="hp-feed-strip" style={{ padding: '14px 16px 0' }} aria-hidden>
            <div style={{ display: 'flex', gap: 12, overflowX: 'hidden', height: 240, alignItems: 'stretch' }}>
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="hp-skel-card" style={{ flexShrink: 0, width: 156, height: 236, borderRadius: 16 }}>
                  <div className="hp-eq"><span /><span /><span /><span /><span /></div>
                </div>
              ))}
            </div>
          </div>
        )}
        {heroReady && heroSlides.length > 0 && (
          <div className="hp-feed-strip" style={{ padding: '14px 16px 0' }}>
            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', scrollbarWidth: 'none', height: 240, alignItems: 'stretch', scrollSnapType: 'x mandatory' }}>
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
                const isSeen = seenSlides.has(slideKey(slide))
                // Renginiams title JAU yra atlikėjas — nerodom dar kartą po juo.
                const artistName = slide.type === 'event' ? null : (slide.artist?.name || null)
                // Nerodom atlikėjo po pavadinimu, jei jis JAU yra pavadinime
                // (dažnas dubliavimas) — taupom vietą, kad pavadinimas tilptų.
                const showArtist = !!artistName && !slide.title.toLowerCase().includes(artistName.toLowerCase())
                // showExcerpt — naujienoms NEBE rodom subtitle (excerpt'as).
                // Card'as paprastesnis: chip + title (+ artist'as jei yra).
                // Eventams paliekam subtitle (data/vieta) — jis kontekstinis.
                const showExcerpt = slide.type === 'event' && slide.subtitle && slide.subtitle.length > 5
                return (
                  <button key={`${slide.type}-${slide.href}`} onClick={() => { setReelsIdx(i); setReelsOpen(true) }}
                    style={{ flexShrink: 0, position: 'relative', borderRadius: 16, overflow: 'hidden',
                      // Vienas akcentas vienu metu: „nauja per 24h" → ŽALIAS rėmelis
                      // (+ žalias taškas); kitaip neperžiūrėta → oranžinis; peržiūrėta
                      // → blankus. Taip nesimaišo oranžinis su žaliu (Edvardas).
                      border: slide.fresh24 ? '2px solid var(--accent-green)' : isSeen ? '2px solid rgba(255,255,255,0.10)' : '2px solid var(--accent-orange)',
                      background: '#000', cursor: 'pointer', padding: 0, width: 156, height: 236,
                      scrollSnapAlign: 'start',
                      transition: 'opacity .15s, border-color .15s, transform .15s',
                      boxShadow: 'var(--hero-card-shadow)',
                    }}
                  >
                    {slide.bgImg
                      // 2026-07-16: be loading="lazy" — mobile hero juosta irgi
                      // above-the-fold + horizontaliai slenkanti, tas pats
                      // intersection-observer bug'as kaip desktop hero (žr.
                      // HeroV2Card komentarą aukščiau).
                      ? <img src={proxyImgResized(slide.bgImg, 480)} alt="" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#0a1428,#162040)' }} />
                    }
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.55) 35%, rgba(0,0,0,0.10) 60%, rgba(0,0,0,0) 75%)' }} />
                    {/* Bottom: title + excerpt + artist */}
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10px 12px 12px', textAlign: 'left' }}>
                      <p style={{ fontSize: 14, fontWeight: 800, color: '#fff', margin: 0, lineHeight: 1.2, fontFamily: 'Outfit,sans-serif', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.01em' } as any}>{slide.title}</p>
                      {showExcerpt && (
                        <p style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.82)', margin: '5px 0 0', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis' } as any}>{slide.subtitleShort || slide.subtitle}</p>
                      )}
                      {showArtist && (
                        <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.78)', margin: '4px 0 0', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{artistName}</p>
                      )}
                    </div>
                    {/* Top: chip badge — „NAUJIENA" nerodom (kartotųsi), tik prominentiniai */}
                    {slide.chip !== 'NAUJIENA' && (
                      <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', alignItems: 'center', gap: 4, zIndex: 2 }}>
                        <span style={{ padding: '3px 7px', borderRadius: 6, fontSize: 12, fontWeight: 700, color: '#fff', background: slide.chipBg, fontFamily: 'Outfit,sans-serif', letterSpacing: '0.025em', textTransform: 'uppercase', backdropFilter: 'blur(4px)' }}>
                          {slide.chip}
                        </span>
                      </div>
                    )}
                    {/* Vienas taškas viršuj-dešinėj: „nauja per 24h" → žalias;
                        kitaip neperžiūrėta → oranžinis. Niekada abu kartu (kad
                        nesikluvintų su rėmeliu). */}
                    {slide.fresh24 ? (
                      <span className="hp-freshdot" style={{ position: 'absolute', top: 10, right: 10, zIndex: 3 }} />
                    ) : !isSeen ? (
                      <div style={{ position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-orange)', boxShadow: '0 0 0 2px #000', zIndex: 2 }} />
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Mobile chart pašalintas — chart'ai integruoti į hero v2. */}

        {/* ═══════════════════════ REELS OVERLAY — horizontal Stories ═══════════════════════ */}
        {reelsOpen && typeof document !== 'undefined' && createPortal((
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
              accent: s.type === 'chart_lt' ? 'var(--accent-orange)' : '#3b82f6',
            })}
            onDailyVote={() => setDailySheetOpen(true)}
            dk={dk}
          />
        ), document.body)}

        {/* ═══════════════════════ CHART BOTTOM SHEET ═══════════════════════ */}
        <ChartBottomSheet
          open={chartSheet != null}
          onClose={() => setChartSheet(null)}
          topType={chartSheet?.topType || 'lt_top30'}
          title={chartSheet?.title || 'TOPAS'}
          accent={chartSheet?.accent || 'var(--accent-orange)'}
        />

        {/* ═══════════════ DIENOS DAINA — balsavimas + siūlymas (sheet) ═══════════════ */}
        {dailySheetOpen && typeof document !== 'undefined' && createPortal((
          <div
            onClick={() => setDailySheetOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', background: 'var(--bg-body)', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: '14px 14px 28px', position: 'relative' }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                <span style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border-strong)' }} />
              </div>
              <button onClick={() => setDailySheetOpen(false)} aria-label="Uždaryti"
                style={{ position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-hover)', border: 'none', color: 'var(--text-primary)', fontSize: 14, cursor: 'pointer', zIndex: 2 }}>✕</button>
              <DienosDainaHero fullPage />
            </div>
          </div>
        ), document.body)}

        {/* ═══════════════════════ MAIN CONTENT ═══════════════════════ */}
        <div className="hp-cnt" style={{ maxWidth: 1360, margin: '0 auto', padding: '42px 20px', display: 'flex', flexDirection: 'column', gap: 44 }}>

          {/* ── Muzika full-width: Naujos dainos + Nauji albumai ── */}

              {/* Naujos dainos — kompaktiškas horizontal row,
                  thumb + title + artist. Tylesnė vizualinė akcentuotė nei
                  albumai (jie turi didesnius cover'ius). */}
              <section>
                <SectionHead label="Naujos dainos" />
                {(() => {
                  const isLT = (x: any) => { const c = x.artists?.country; return !c || c === 'Lietuva' || c === 'LT' || c === 'Lithuania' }
                  const ltT = tracks.filter(t => sanitizeTitle(t.title) && isLT(t))
                  const wT = tracks.filter(t => sanitizeTitle(t.title) && !isLT(t))
                  const boxes = [
                    { lane: 'lt' as const, label: 'Lietuva', items: ltT },
                    { lane: 'world' as const, label: 'Pasaulis', items: wT },
                  ]
                  const songCard = (t: any) => {
                    const v = extractYouTubeId(t.video_url)
                    const ytThumb = v ? `https://img.youtube.com/vi/${v}/mqdefault.jpg` : null
                    const imgSrc = t.cover_url || t.albums_list?.[0]?.cover_image_url || ytThumb || t.artists?.cover_image_url || null
                    const rd = t.video_uploaded_at || t.release_date
                    const rel = formatRelativeDateLT(rd)
                    const dDiff = rd ? Math.floor((Date.now() - new Date(rd).getTime()) / 86400000) : null
                    const highlight = dDiff !== null && dDiff >= 0 && dDiff <= 14
                    return (
                      <button key={t.id} type="button" onClick={() => setOpenTrack(t)} className="group block w-[160px] shrink-0 no-underline text-left p-0 bg-transparent border-0 cursor-pointer lg:w-auto">
                        <div className="relative aspect-video overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--cover-placeholder)] shadow-[0_3px_10px_rgba(0,0,0,0.18)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-[rgba(249,115,22,0.5)]">
                          {imgSrc ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={proxyImgResized(imgSrc, 480)} alt={sanitizeTitle(t.title)} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" />
                          ) : (<div className="flex h-full w-full items-center justify-center text-xl text-[var(--text-faint)]">🎵</div>)}
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-orange)] shadow-[0_4px_16px_rgba(249,115,22,0.5)]"><svg width="13" height="13" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg></span></div>
                          {rel && (<span className={`absolute bottom-1.5 right-1.5 rounded px-1.5 py-0.5 font-['Outfit',sans-serif] text-[12px] font-bold backdrop-blur-sm ${highlight ? 'bg-[var(--accent-orange)] text-white' : 'bg-black/70 text-white'}`}>{rel}</span>)}
                          {isFresh24(t.created_at) && <FreshDot />}
                        </div>
                        <p className="m-0 mt-1.5 line-clamp-2 font-['Outfit',sans-serif] text-[14px] font-bold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)] lg:truncate lg:text-[16px] lg:font-extrabold">{sanitizeTitle(t.title)}</p>
                        <p className="m-0 truncate text-[14px] text-[var(--text-muted)]">{t.artists?.name}</p>
                      </button>
                    )
                  }
                  return (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      {boxes.map(box => (
                        <div key={box.lane} className={`rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 border-t-[3px] ${box.lane === 'lt' ? 'border-t-[var(--accent-orange)]' : 'border-t-[var(--accent-blue)]'}`}>
                          <div className="mb-3 flex items-center justify-between">
                            <span className="font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-primary)]">{box.label}</span>
                            <button type="button" onClick={() => setListModal(`tracks-${box.lane}`)} className={`font-['Outfit',sans-serif] text-[14px] font-bold transition-opacity hover:opacity-70 ${box.lane === 'lt' ? 'text-[var(--accent-orange)]' : 'text-[var(--accent-blue)]'}`}>Daugiau →</button>
                          </div>
                          <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:grid lg:gap-3 lg:overflow-visible lg:pb-0 lg:grid-cols-3">
                            {tracksStatus === 'loading' && tracks.length === 0 ? Array(6).fill(null).map((_, i) => (<div key={i} className="hp-skel aspect-video w-[160px] shrink-0 rounded-lg lg:w-auto" />)) : box.items.length === 0 ? (<div className="col-span-2 py-6 text-center text-[14px] text-[var(--text-faint)]">{box.lane === 'lt' ? 'Lietuviškų dainų netrukus' : 'Užsienio dainų netrukus'}</div>) : box.items.slice(0, 6).map(songCard)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </section>

              {/* Nauji albumai — vertikali kortelė su kvadratiniu cover'iu
                  (atitinka artist page'o AlbumCard pattern'ą). Cover'is
                  ~140px aiškiai didesnis nei track row'o 38px thumb'as. */}
              <section>
                <SectionHead label="Nauji albumai" />
                {(() => {
                  const isLT = (x: any) => { const c = x.artists?.country; return !c || c === 'Lietuva' || c === 'LT' || c === 'Lithuania' }
                  const boxes = [
                    { lane: 'lt' as const, label: 'Lietuva', items: albums.filter(isLT) },
                    { lane: 'world' as const, label: 'Pasaulis', items: albums.filter(a => !isLT(a)) },
                  ]
                  const albCard = (a: any) => {
                    const rd = a.release_date as string | null
                    const releaseD = rd ? new Date(rd) : null
                    const validRD = releaseD && !isNaN(releaseD.getTime())
                    const diff = validRD ? Math.ceil((releaseD!.getTime() - Date.now()) / 86400000) : null
                    const isUpcoming = a.is_upcoming === true || (diff !== null && diff > 0)
                    const hasContent = !!a.cover_image_url
                    let label: string | null = null; let highlight = false
                    if (isUpcoming) { const f = formatFutureDateLT(rd); if (f.label) { label = f.label; highlight = f.highlight } else if (hasContent) { label = 'Greitai'; highlight = true } }
                    else if (validRD) { const rel = formatRelativeDateLT(rd); label = rel || String(a.year || ''); if (diff !== null && diff <= -2 && diff >= -30) highlight = true }
                    else if (a.year) { label = String(a.year) }
                    return (
                      <button key={a.id} type="button" onClick={() => { setOpenAlbumId(a.id); setOpenAlbumPreview({ title: sanitizeTitle(a.title), cover_image_url: a.cover_image_url || a.artists?.cover_image_url || null, year: a.year || null }) }} className="group block w-[120px] shrink-0 no-underline text-left p-0 bg-transparent border-0 cursor-pointer lg:w-auto">
                        <div className="relative aspect-square overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--cover-placeholder)] shadow-[0_3px_10px_rgba(0,0,0,0.18)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-[rgba(249,115,22,0.5)]">
                          {a.cover_image_url || a.artists?.cover_image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={proxyImgResized(a.cover_image_url || a.artists?.cover_image_url || '', 480)} alt={sanitizeTitle(a.title)} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" />
                          ) : (<div className="flex h-full w-full items-center justify-center text-xl text-[var(--text-faint)]">💿</div>)}
                          {label && (<span className={`absolute bottom-1 right-1 rounded px-1.5 py-0.5 font-['Outfit',sans-serif] text-[12px] font-bold backdrop-blur-sm ${highlight ? 'bg-[var(--accent-orange)] text-white' : 'bg-black/70 text-white'}`}>{label}</span>)}
                          {isFresh24(a.created_at) && <FreshDot />}
                        </div>
                        <p className="m-0 mt-1.5 line-clamp-2 font-['Outfit',sans-serif] text-[14px] font-bold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)] lg:truncate lg:text-[16px] lg:font-extrabold">{sanitizeTitle(a.title)}</p>
                        <p className="m-0 truncate text-[12px] text-[var(--text-muted)]">{a.artists?.name}</p>
                      </button>
                    )
                  }
                  return (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      {boxes.map(box => (
                        <div key={box.lane} className={`rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 border-t-[3px] ${box.lane === 'lt' ? 'border-t-[var(--accent-orange)]' : 'border-t-[var(--accent-blue)]'}`}>
                          <div className="mb-3 flex items-center justify-between">
                            <span className="font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-primary)]">{box.label}</span>
                            <button type="button" onClick={() => setListModal(`albums-${box.lane}`)} className={`font-['Outfit',sans-serif] text-[14px] font-bold transition-opacity hover:opacity-70 ${box.lane === 'lt' ? 'text-[var(--accent-orange)]' : 'text-[var(--accent-blue)]'}`}>Daugiau →</button>
                          </div>
                          <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:grid lg:gap-3 lg:overflow-visible lg:pb-0 lg:grid-cols-3">
                            {tracksStatus === 'loading' && albums.length === 0 ? Array(6).fill(null).map((_, i) => (<div key={i} className="hp-skel aspect-square w-[120px] shrink-0 rounded-lg lg:w-auto" />)) : box.items.length === 0 ? (<div className="col-span-3 py-6 text-center text-[14px] text-[var(--text-faint)]">{box.lane === 'lt' ? 'Lietuviškų albumų netrukus' : 'Užsienio albumų netrukus'}</div>) : box.items.slice(0, 6).map(albCard)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </section>

              {/* ── Greitai pasirodys — albumai dar neišleisti (bendras
                  LT + INTL sąrašas, sortuotas pagal artimiausią datą ASC).
                  Tas pats kortelės stilius kaip „Nauji albumai" — kvadratiniai
                  cover'iai 156px, badge'as su data/„Greitai". ── */}
              {upcomingAlbums.length > 0 && (
                <section>
                  <SectionHead label="Greitai pasirodys" onMore={() => setListModal('upcoming')} />
                  <Scroller className="min-w-0" gap={12} ariaLabel="Greitai pasirodys">
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
                                src={proxyImgResized(a.cover_image_url || a.artists?.cover_image_url || '', 480)}
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
                              <span className={`absolute bottom-1.5 right-1.5 rounded px-1.5 py-0.5 font-['Outfit',sans-serif] text-[12px] font-bold backdrop-blur-sm ${
                                highlight ? 'bg-[var(--accent-orange)] text-white' : 'bg-black/70 text-white'
                              }`}>
                                {label}
                              </span>
                            )}
                            {isFresh24((a as any).created_at) && <FreshDot />}
                          </div>
                          <div className="mt-2 px-0.5">
                            <p className="m-0 line-clamp-2 font-['Outfit',sans-serif] text-[14px] font-bold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)] lg:truncate lg:text-[16px] lg:font-extrabold">
                              {sanitizeTitle(a.title)}
                            </p>
                            <p className="m-0 mt-1 truncate text-[14px] text-[var(--text-muted)]">
                              {a.artists?.name}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </Scroller>
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
            {/* ── Renginiai — afiša v6: vienoda kortelė = vizualas viršuje (BE
                tamsinimo) + šviesi parašo juosta apačioje. Festivalio collage:
                headlineris per visą plotį viršuj + 2 mažesni po juo. Data badge
                visada baltas. Populiarumo threshold (headliner score≥10, festivaliai/
                featured praeina). Užsienis = TIK verified (kaip /verta-keliones). 2026-06-26. */}
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="m-0 font-['Outfit',sans-serif] text-[20px] font-extrabold tracking-[-0.01em] text-[var(--text-primary)]">Koncertai</h2>
                <Link href="/koncertai" className="font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--accent-orange)] no-underline transition-opacity hover:opacity-70">Daugiau →</Link>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:grid lg:grid-cols-5 lg:gap-4 lg:overflow-x-visible lg:pb-0">
                {filtEvt.length === 0 ? Array(10).fill(null).map((_, i) => (
                  <div key={i} className="hp-skel aspect-[3/4] w-[188px] shrink-0 rounded-xl lg:w-auto" />
                )) : (() => {
                  const cardCls = "group relative flex aspect-[3/4] w-[188px] shrink-0 flex-col overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--cover-placeholder)] no-underline shadow-[0_5px_14px_rgba(0,0,0,0.16)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgba(249,115,22,0.5)] hover:shadow-[0_14px_30px_rgba(249,115,22,0.18)] lg:w-auto"
                  const capCls = "border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-2"
                  const isAbroad = (e: any) => !!e.is_abroad
                  const scoreOf = (e: any) => Math.max(0, ...(e.event_artists || []).map((ea: any) => { const a = Array.isArray(ea.artists) ? ea.artists[0] : ea.artists; return a?.score || 0 }))
                  const all = [...filtEvt].sort((x, y) => new Date(((x as any).start_date || x.event_date || 0) as any).getTime() - new Date(((y as any).start_date || y.event_date || 0) as any).getTime())
                  const foreign = vertaConcerts.concerts || []
                  const main = all.filter(e => !isAbroad(e) && (e.is_festival || (e as any).is_featured || scoreOf(e) >= 10) && (!!e.cover_image_url || (e.event_artists || []).some((ea: any) => { const a = Array.isArray(ea.artists) ? ea.artists[0] : ea.artists; return !!a?.cover_image_url }))).slice(0, foreign.length ? 9 : 10)
                  const photoOf = (e: any) => { const ea = (e.event_artists || []).map((x: any) => Array.isArray(x.artists) ? x.artists[0] : x.artists).filter(Boolean); return ea.find((a: any) => a?.cover_image_url)?.cover_image_url || e.cover_image_url || null }
                  const cards: React.ReactNode[] = main.map(ev => {
                    const dateRaw = (ev as any).start_date || ev.event_date
                    const d = dateRaw ? new Date(dateRaw) : null
                    const dayNum = d && !isNaN(d.getTime()) ? d.getDate() : null
                    const monthLbl = d && !isNaN(d.getTime()) ? MONTHS_LT[d.getMonth()] : null
                    const eas = (ev.event_artists || [])
                      .map(ea => { const a = Array.isArray(ea.artists) ? ea.artists[0] : ea.artists; return a ? { ...a, is_headliner: ea.is_headliner, sort_order: ea.sort_order } : null })
                      .filter(Boolean) as { name: string; country?: string | null; cover_image_url?: string | null; is_headliner?: boolean; sort_order?: number }[]
                    const ranked = [...eas].sort((p, q) => (q.is_headliner ? 1 : 0) - (p.is_headliner ? 1 : 0) || ((p.sort_order ?? 99) - (q.sort_order ?? 99)))
                    const photos = ranked.filter(a => a.cover_image_url)
                    const adminCover = ev.cover_image_url
                    const useCollage = !adminCover && photos.length >= 2
                    const singleImg = adminCover || photos[0]?.cover_image_url || null
                    const flag = countryFlag(ranked.find(a => a.country)?.country)
                    const city = ev.city || ev.venues?.city || ''
                    const artistList = eas.filter(a => a.name).map(a => a.name)
                    const title = ev.is_festival
                      ? sanitizeTitle(ev.title)
                      : artistList.length > 0
                        ? artistList.slice(0, 2).join(', ') + (artistList.length > 2 ? ` +${artistList.length - 2}` : '')
                        : sanitizeTitle(ev.title)
                    const smalls = photos.slice(1, 3)
                    return (
                      <Link key={ev.id} href={`/renginiai/${ev.slug}`} className={cardCls}>
                        <div className="relative flex-1 overflow-hidden">
                          {useCollage ? (
                            <div className="grid h-full w-full grid-cols-2 grid-rows-[3fr_2fr] gap-px">
                              <div className="col-span-2 bg-cover bg-top" style={{ backgroundImage: `url(${proxyImgResized(photos[0].cover_image_url!, 480)})` }} />
                              {smalls.map((a, idx) => (
                                <div key={idx} className={`bg-cover bg-top ${smalls.length === 1 ? 'col-span-2' : ''}`} style={{ backgroundImage: `url(${proxyImgResized(a.cover_image_url!, 320)})` }}>
                                </div>
                              ))}
                            </div>
                          ) : singleImg ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={proxyImgResized(singleImg, 64)} alt="" aria-hidden loading="lazy" decoding="async" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-xl" />
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={proxyImgResized(singleImg, 640)} alt={title} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-contain transition-transform duration-500 group-hover:scale-[1.03]" />
                            </>
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-2xl text-[var(--text-faint)]">🎵</div>
                          )}
                          {dayNum && (
                            <span className="absolute left-2 top-2 flex flex-col items-center rounded-lg bg-white px-2 py-1 leading-none shadow-[0_3px_10px_rgba(0,0,0,0.3)]">
                              <b className="font-['Outfit',sans-serif] text-[16px] font-black text-[#10203a]">{dayNum}</b>
                              <i className="mt-0.5 not-italic text-[12px] font-extrabold uppercase tracking-[0.04em] text-[var(--accent-orange)]">{monthLbl}</i>
                            </span>
                          )}
                        </div>
                        {isFresh24(ev.created_at) && <FreshDot right={8} top={8} />}
                        <div className={capCls}>
                          {city && <p className="m-0 truncate font-['Outfit',sans-serif] text-[12px] font-bold uppercase tracking-[0.05em] text-[var(--text-muted)]">{city}</p>}
                          <h3 className="m-0 mt-0.5 flex items-start gap-1 font-['Outfit',sans-serif] text-[14px] font-black leading-tight text-[var(--text-primary)]">
                            {flag && <span className="shrink-0 text-[14px] leading-tight">{flag}</span>}
                            <span className="line-clamp-2">{title}</span>
                          </h3>
                        </div>
                      </Link>
                    )
                  })
                  if (foreign.length) {
                    const fImgs = foreign.map((c: any) => c.image).filter(Boolean).slice(0, 6) as string[]
                    cards.push(
                      <Link key="abroad" href="/verta-keliones" className={cardCls}>
                        <div className="relative flex-1 overflow-hidden bg-[#15203a]">
                          <div className="grid h-full w-full grid-cols-3 grid-rows-2 gap-px">
                            {fImgs.map((src, i) => (
                              <div key={i} className="bg-cover bg-top" style={{ backgroundImage: `url(${proxyImgResized(src, 320)})` }} />
                            ))}
                          </div>
                        </div>
                        <div className={capCls}>
                          <p className="m-0 font-['Outfit',sans-serif] text-[12px] font-bold uppercase tracking-[0.05em] text-[var(--text-muted)]">Užsienis</p>
                          <h3 className="m-0 mt-0.5 font-['Outfit',sans-serif] text-[14px] font-black leading-tight text-[var(--text-primary)]">Koncertai, verti kelionės</h3>
                          <p className="m-0 mt-1 font-['Outfit',sans-serif] text-[12px] font-bold text-[var(--accent-orange)]">Daugiau →</p>
                        </div>
                      </Link>
                    )
                  }
                  return cards
                })()}
              </div>
            </div>
          </section>
          </LazySection>

          {/* ── BENDRUOMENĖ — pinned DD + blog + diskusijos + narių koncertų
              foto/video „Iš koncertų" (priekyje) 2026-06-08 ── */}
          <LazySection rootMargin="400px" minHeight={260}>
            <BendruomeneSection />
          </LazySection>

          {/* ── ISTORIJA — sukaktys, jubiliejai, gimtadieniai ── */}
          <LazySection rootMargin="400px" minHeight={180}>
          <section>
            <SectionHead label="Istorija" />
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
                    <p className="m-0 truncate font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-secondary)] transition-colors group-hover:text-[var(--accent-orange)]">
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
                <h3 style={{ fontFamily: 'Outfit,sans-serif', fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 4px' }}>Atlikėjams</h3>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0, lineHeight: 1.55, maxWidth: 480 }}>Sukurk arba perimk savo profilį Music.lt platformoje. Skelk naujienas, renginius ir naują muziką tiesiai savo gerbėjams — nemokamai.</p>
              </div>
              <Link href="/atlikejai" className="hp-ctabtn"
                style={{ flexShrink: 0, background: 'var(--accent-orange)', color: '#fff', fontWeight: 800, fontSize: 14, padding: '10px 24px', borderRadius: 20, textDecoration: 'none', boxShadow: '0 4px 16px rgba(249,115,22,.3)', whiteSpace: 'nowrap', fontFamily: 'Outfit,sans-serif', display: 'inline-flex', alignItems: 'center', transition: 'transform .15s, box-shadow .15s' }}
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
                        <img src={proxyImgResized(n.image_title_url || n.image_small_url || '', 480)} alt={n.title} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-2xl text-[var(--text-faint)]">📰</div>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col justify-center px-3 py-2.5">
                      <p className="m-0 line-clamp-3 font-['Outfit',sans-serif] text-[16px] font-extrabold leading-snug text-[var(--text-primary)]">{sanitizeTitle(n.title)}</p>
                      {n.artist?.name && <p className="m-0 mt-1 truncate text-[14px] text-[var(--text-muted)]">{n.artist.name}</p>}
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
