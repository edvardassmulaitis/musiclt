'use client'

// app/atradimai/page.tsx
//
// „Atradimai" — gyvas, žmonių-first bendruomenės srautas. Pakeitė ankstesnį
// funkcijų-katalogo variantą (6 vertikalios sekcijos, dubliavo homepage Pulsą).
// Tikslas: priežastis grįžti KASDIEN — „kas naujo pas kitus narius".
//
// Struktūra:
//   • Hero + „gyvai" juosta (aktyvūs nariai, avatarai)
//   • Dienos dainos veiksmo banneris (ne sekcija — vienas CTA)
//   • Pagrindinis SRAUTAS su tab'ais: turinys (Pulsas) + mikro-veiksmai (activity)
//   • Rail (desktop): Pažink narius · Pokalbių dėžutė · Boombox
//
// Duomenys (viskas jau egzistuoja):
//   /api/pulsas                  → blog/diskusijos/komentarai (turtingos kortelės)
//   /api/live/activity           → like/balsavimai/sekimai (lengvi veiksmai)
//   /api/atradimai/active-members→ savaitės aktyviausi nariai (Pažink narius)
//   /api/dienos-daina/nominations→ šiandienos daina
//   <ShoutboxWidget/>            → bendras gyvas chatas

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import { ShoutboxWidget } from '@/components/ShoutboxWidget'

// ───────────────────────── helpers ─────────────────────────
function timeAgo(d?: string | null) {
  if (!d) return ''
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'ką tik'
  if (m < 60) return `${m} min.`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} val.`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days} d.`
  return `${Math.floor(days / 7)} sav.`
}
function sani(s?: string | null) {
  return (s || '').replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim()
}
function hue(s: string) { let h = 0; for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h }

function Avatar({ src, name, size = 34 }: { src?: string | null; name?: string | null; size?: number }) {
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

// ───────────────────────── types ─────────────────────────
type PulsasItem = {
  id: string; type: 'blog' | 'discussion' | 'comment'; subtype?: string | null
  title: string; excerpt: string | null; href: string; cover: string | null
  author_name: string | null; author_slug: string | null; author_avatar: string | null
  created_at: string; meta?: string | null
}
type ActEvent = {
  id: string; event_type: string; actor_name: string | null; actor_avatar: string | null
  entity_type: string | null; entity_title: string | null; entity_url: string | null
  entity_image?: string | null; created_at: string; metadata?: any
}
type Member = { user_id: string; username: string | null; name: string | null; avatar: string | null; total: number; last_active: string; headline: string }

// Mikro-veiksmų tipai, kurių Pulsas NEPADENGIA (like/balsavimai/sekimai).
const ACTION_TYPES = new Set([
  'track_like', 'album_like', 'artist_like', 'like',
  'nomination', 'daily_nomination', 'daily_vote', 'vote', 'voting_vote', 'top_vote', 'follow',
])
const ACTION_VERB: Record<string, string> = {
  track_like: 'pamėgo dainą', album_like: 'pamėgo albumą', artist_like: 'pamėgo atlikėją', like: 'pamėgo',
  nomination: 'pasiūlė dienos dainą', daily_nomination: 'pasiūlė dienos dainą',
  daily_vote: 'balsavo už dienos dainą', vote: 'balsavo už', voting_vote: 'balsavo už',
  top_vote: 'balsavo', follow: 'pradėjo sekti',
}
function pulsasVerb(it: PulsasItem): string {
  if (it.type === 'discussion') return 'pradėjo diskusiją'
  if (it.type === 'comment') return 'pakomentavo'
  switch (it.subtype) {
    case 'review': return 'parašė recenziją'
    case 'creation': return 'pasidalino kūryba'
    case 'translation': return 'išvertė dainą'
    case 'topas': return 'sudarė topą'
    case 'event': return 'pridėjo renginį'
    default: return 'parašė įrašą'
  }
}
function pulsasChip(it: PulsasItem): { label: string; rgb: string } {
  if (it.type === 'discussion') return { label: 'Diskusija', rgb: '139,92,246' }
  if (it.type === 'comment') return { label: 'Komentaras', rgb: '6,182,212' }
  switch (it.subtype) {
    case 'review': return { label: 'Recenzija', rgb: '239,68,68' }
    case 'creation': return { label: 'Kūryba', rgb: '236,72,153' }
    case 'translation': return { label: 'Vertimas', rgb: '16,185,129' }
    case 'topas': return { label: 'Topas', rgb: '245,158,11' }
    default: return { label: 'Įrašas', rgb: '168,85,247' }
  }
}

// ─────────────── unified feed item ───────────────
type FeedItem =
  | { kind: 'content'; ts: number; data: PulsasItem }
  | { kind: 'action'; ts: number; data: ActEvent }

// ───────────────────────── Hero + live strip ─────────────────────────
function Hero({ members, activeCount }: { members: Member[]; activeCount: number }) {
  return (
    <div className="mb-6 overflow-hidden rounded-3xl border border-[var(--border-default)] p-6 sm:p-8"
      style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.15), rgba(139,92,246,0.12) 55%, rgba(6,182,212,0.10))' }}>
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#10b981] opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#10b981]" />
        </span>
        <span className="font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--accent-orange)]">Bendruomenė gyvai</span>
      </div>
      <h1 className="m-0 mt-2 font-['Outfit',sans-serif] text-[30px] font-black leading-[1.05] tracking-[-0.02em] text-[var(--text-primary)] sm:text-[40px]">Atradimai</h1>
      <p className="m-0 mt-2 max-w-[540px] text-[13.5px] leading-relaxed text-[var(--text-muted)] sm:text-[15px]">Kas naujo pas kitus narius — įrašai, diskusijos, balsavimai ir gyvas pokalbis vienoje vietoje. Užsuk kasdien.</p>
      {members.length > 0 && (
        <div className="mt-4 flex items-center gap-3">
          <div className="flex -space-x-2.5">
            {members.slice(0, 7).map(m => (
              <Link key={m.user_id} href={m.username ? `/@${m.username}` : '#'} className="rounded-full ring-2 ring-[var(--bg-surface)] transition-transform hover:z-10 hover:-translate-y-0.5">
                <Avatar src={m.avatar} name={m.name} size={30} />
              </Link>
            ))}
          </div>
          <span className="text-[12.5px] font-semibold text-[var(--text-secondary)]">
            {activeCount > 0 ? `${activeCount} narių aktyvūs šią savaitę` : 'Aktyvūs nariai'}
          </span>
        </div>
      )}
    </div>
  )
}

// ───────────────────────── Dienos daina banner (veiksmas) ─────────────────────────
function DienosDainaBanner() {
  const [noms, setNoms] = useState<any[] | null>(null)
  useEffect(() => {
    let a = true
    fetch('/api/dienos-daina/nominations').then(r => r.json()).then(d => { if (a) setNoms(d.nominations || []) }).catch(() => { if (a) setNoms([]) })
    return () => { a = false }
  }, [])
  const lead = noms?.find(n => n.tracks) || null
  const t = lead?.tracks
  const totalVotes = (noms || []).reduce((s, n) => s + (n.votes || 0), 0)
  const ytThumb = t?.video_url?.match?.(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/)?.[1]
  const cover = t?.cover_url || (ytThumb ? `https://img.youtube.com/vi/${ytThumb}/mqdefault.jpg` : null) || t?.artists?.cover_image_url || null
  return (
    <Link href="/dienos-daina" className="group mb-5 flex items-center gap-3.5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 no-underline transition-all hover:-translate-y-0.5 hover:border-[rgba(249,115,22,0.5)] sm:p-3.5">
      <div className="relative h-[58px] w-[58px] shrink-0 overflow-hidden rounded-xl bg-[var(--cover-placeholder)] sm:h-[64px] sm:w-[64px]">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyImg(cover)} alt="" className="h-full w-full object-cover" />
        ) : <div className="flex h-full w-full items-center justify-center text-xl">🎵</div>}
      </div>
      <div className="min-w-0 flex-1">
        <span className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--accent-orange)]">Dienos daina</span>
        {t ? (
          <>
            <p className="m-0 mt-0.5 truncate font-['Outfit',sans-serif] text-[15px] font-extrabold text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{sani(t.title)}</p>
            <p className="m-0 truncate text-[12px] text-[var(--text-muted)]">{t.artists?.name} · pirmauja{totalVotes > 0 ? ` · ${totalVotes} bals.` : ''}</p>
          </>
        ) : (
          <p className="m-0 mt-0.5 text-[13.5px] font-semibold text-[var(--text-secondary)]">Šiandien dar nepasiūlyta — būk pirmas</p>
        )}
      </div>
      <span className="hidden shrink-0 rounded-full bg-[var(--accent-orange)] px-4 py-2 text-[12.5px] font-extrabold text-white transition-transform group-hover:translate-x-0.5 sm:inline-block">Balsuoti →</span>
    </Link>
  )
}

// ───────────────────────── Feed cards ─────────────────────────
function ContentCard({ it }: { it: PulsasItem }) {
  const chip = pulsasChip(it)
  return (
    <article className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3.5 transition-colors hover:border-[rgba(148,163,184,0.35)]">
      <div className="flex items-center gap-2.5">
        <Link href={it.author_slug ? `/@${it.author_slug}` : '#'}><Avatar src={it.author_avatar} name={it.author_name} size={32} /></Link>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="m-0 text-[12.5px] text-[var(--text-secondary)]">
            {it.author_slug
              ? <Link href={`/@${it.author_slug}`} className="font-extrabold text-[var(--text-primary)] no-underline hover:text-[var(--accent-orange)]">{it.author_name || 'Narys'}</Link>
              : <span className="font-extrabold text-[var(--text-primary)]">{it.author_name || 'Narys'}</span>}
            {' '}{pulsasVerb(it)}
          </p>
          <p className="m-0 text-[10.5px] text-[var(--text-faint)]">{timeAgo(it.created_at)}</p>
        </div>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold" style={{ background: `rgba(${chip.rgb},0.14)`, color: `rgb(${chip.rgb})` }}>{chip.label}</span>
      </div>
      <Link href={it.href} className="group mt-2.5 flex items-stretch gap-3 no-underline">
        <div className="min-w-0 flex-1">
          <p className="m-0 line-clamp-2 font-['Outfit',sans-serif] text-[14.5px] font-extrabold leading-snug text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{sani(it.title) || '(be pavadinimo)'}</p>
          {it.excerpt && <p className="m-0 mt-1 line-clamp-2 text-[12.5px] leading-snug text-[var(--text-muted)]">{sani(it.excerpt)}</p>}
          {it.meta && <p className="m-0 mt-1 text-[11px] font-semibold text-[var(--text-faint)]">{it.meta}</p>}
        </div>
        {it.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyImg(it.cover)} alt="" loading="lazy" className="h-[74px] w-[74px] shrink-0 rounded-xl border border-[var(--border-subtle)] object-cover transition-transform group-hover:scale-[1.03] sm:h-[84px] sm:w-[84px]" />
        )}
      </Link>
    </article>
  )
}

function ActionRow({ e }: { e: ActEvent }) {
  const name = e.actor_name || 'Narys'
  const isTop = e.event_type === 'top_vote'
  const topIsLt = e.metadata?.top_type === 'lt_top30'
  const topLabel = topIsLt ? 'LT TOP 30' : 'TOP 40'
  const topUrl = topIsLt ? '/top30' : '/top40'
  return (
    <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
      <Avatar src={e.actor_avatar} name={name} size={30} />
      <p className="m-0 min-w-0 flex-1 text-[12.5px] leading-snug text-[var(--text-secondary)]">
        <span className="font-extrabold text-[var(--text-primary)]">{name}</span>{' '}{ACTION_VERB[e.event_type] || 'atnaujino'}
        {isTop ? <> <Link href={topUrl} className="font-bold text-[var(--accent-link)] no-underline hover:underline">{topLabel}</Link></>
          : e.entity_title ? (e.entity_url
            ? <> <Link href={e.entity_url} className="font-bold text-[var(--accent-link)] no-underline hover:underline">{e.entity_title}</Link></>
            : <> <span className="font-bold text-[var(--text-primary)]">{e.entity_title}</span></>) : null}
        <span className="ml-1.5 text-[10.5px] text-[var(--text-faint)]">· {timeAgo(e.created_at)}</span>
      </p>
      {e.entity_image && !isTop && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={proxyImg(e.entity_image)} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-md object-cover" />
      )}
    </div>
  )
}

const TABS = [
  { key: 'all', label: 'Viskas' },
  { key: 'irasai', label: 'Įrašai' },
  { key: 'diskusijos', label: 'Diskusijos' },
  { key: 'veiksmai', label: 'Veiksmai' },
] as const
type TabKey = typeof TABS[number]['key']

function Feed() {
  const [pulsas, setPulsas] = useState<PulsasItem[] | null>(null)
  const [acts, setActs] = useState<ActEvent[] | null>(null)
  const [tab, setTab] = useState<TabKey>('all')

  useEffect(() => {
    let a = true
    fetch('/api/pulsas?limit=40').then(r => r.json()).then(d => { if (a) setPulsas(d.items || []) }).catch(() => { if (a) setPulsas([]) })
    fetch('/api/live/activity?limit=60', { cache: 'no-store' }).then(r => r.json()).then(d => { if (a) setActs(d.events || []) }).catch(() => { if (a) setActs([]) })
    return () => { a = false }
  }, [])

  const merged = useMemo<FeedItem[]>(() => {
    const out: FeedItem[] = []
    for (const p of pulsas || []) out.push({ kind: 'content', ts: new Date(p.created_at).getTime(), data: p })
    // Iš activity imam TIK mikro-veiksmus (Pulsas jau dengia blog/diskusijas/komentarus),
    // ir dedup'inam pasikartojančius balsavimus per narį.
    const seen = new Set<string>()
    for (const e of acts || []) {
      if (!ACTION_TYPES.has(e.event_type)) continue
      let key: string | null = null
      if (e.event_type === 'top_vote') key = `top:${e.actor_name}:${e.metadata?.top_type || ''}`
      else if (e.event_type === 'daily_vote') key = `daily:${e.actor_name}`
      if (key) { if (seen.has(key)) continue; seen.add(key) }
      out.push({ kind: 'action', ts: new Date(e.created_at).getTime(), data: e })
    }
    return out.sort((x, y) => y.ts - x.ts)
  }, [pulsas, acts])

  const filtered = useMemo(() => {
    if (tab === 'all') return merged
    if (tab === 'veiksmai') return merged.filter(f => f.kind === 'action')
    if (tab === 'irasai') return merged.filter(f => f.kind === 'content' && (f.data as PulsasItem).type === 'blog')
    if (tab === 'diskusijos') return merged.filter(f => f.kind === 'content' && ((f.data as PulsasItem).type === 'discussion' || (f.data as PulsasItem).type === 'comment'))
    return merged
  }, [merged, tab])

  const loading = pulsas === null || acts === null

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`rounded-full px-3.5 py-1.5 font-['Outfit',sans-serif] text-[12.5px] font-bold transition-colors ${tab === t.key ? 'bg-[var(--accent-orange)] text-white' : 'border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--accent-orange)] hover:text-[var(--accent-orange)]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {Array(5).fill(null).map((_, i) => (
            <div key={i} className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3.5">
              <div className="flex items-center gap-2.5"><div className="hp-skel h-8 w-8 rounded-full" /><div className="hp-skel h-3 w-1/3 rounded" /></div>
              <div className="hp-skel mt-3 h-3.5 w-4/5 rounded" /><div className="hp-skel mt-2 h-3 w-3/5 rounded" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-default)] p-8 text-center text-[13px] text-[var(--text-muted)]">
          Šioje skiltyje dar tuščia. <Link href="/blogas/rasyti" className="font-bold text-[var(--accent-orange)] no-underline">Pradėk pirmas →</Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map(f => f.kind === 'content'
            ? <ContentCard key={`c-${(f.data as PulsasItem).id}`} it={f.data as PulsasItem} />
            : <ActionRow key={`a-${(f.data as ActEvent).id}`} e={f.data as ActEvent} />)}
        </div>
      )}
    </div>
  )
}

// ───────────────────────── Rail ─────────────────────────
function RailHead({ title, href, hrefLabel }: { title: string; href?: string; hrefLabel?: string }) {
  return (
    <div className="mb-2.5 flex items-center justify-between">
      <h3 className="m-0 font-['Outfit',sans-serif] text-[14px] font-extrabold text-[var(--text-primary)]">{title}</h3>
      {href && <Link href={href} className="text-[11.5px] font-bold text-[var(--accent-orange)] no-underline hover:opacity-70">{hrefLabel || 'Visi →'}</Link>}
    </div>
  )
}

function ActiveMembers({ members, loading }: { members: Member[]; loading: boolean }) {
  return (
    <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3.5">
      <RailHead title="Pažink narius" href="/vartotojai" hrefLabel="Visi →" />
      <p className="m-0 mb-2.5 text-[11.5px] text-[var(--text-muted)]">Aktyviausi šią savaitę</p>
      {loading ? (
        <div className="flex flex-col gap-2.5">{Array(5).fill(null).map((_, i) => (
          <div key={i} className="flex items-center gap-2.5"><div className="hp-skel h-9 w-9 rounded-full" /><div className="hp-skel h-3 w-2/3 rounded" /></div>
        ))}</div>
      ) : members.length === 0 ? (
        <p className="m-0 py-3 text-center text-[12px] text-[var(--text-muted)]">Šią savaitę dar tylu.</p>
      ) : (
        <div className="flex flex-col">
          {members.map((m, i) => (
            <Link key={m.user_id} href={m.username ? `/@${m.username}` : '#'} className="group flex items-center gap-2.5 rounded-lg px-1 py-1.5 no-underline transition-colors hover:bg-[var(--bg-hover)]">
              <span className="w-3.5 shrink-0 text-center text-[11px] font-black text-[var(--text-faint)]">{i + 1}</span>
              <Avatar src={m.avatar} name={m.name} size={34} />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="m-0 truncate text-[13px] font-extrabold text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{m.name}</p>
                <p className="m-0 truncate text-[11px] text-[var(--text-muted)]">{m.headline}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function BoomboxCard() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border-default)] p-4" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.16), rgba(168,85,247,0.10))' }}>
      <RailHead title="Pailsink ausis" />
      <Link href="/boombox" className="group block no-underline">
        <span className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--accent-orange)]">Žaidimas</span>
        <p className="m-0 mt-0.5 font-['Outfit',sans-serif] text-[19px] font-black text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">Boombox</p>
        <p className="m-0 mt-1 text-[12px] leading-snug text-[var(--text-muted)]">Atrask atlikėjus swipe stiliumi — muzikinis Tinder'is. Įvertink ir klausyk naujų dainų.</p>
        <span className="mt-2.5 inline-flex rounded-full bg-[var(--accent-orange)] px-3.5 py-1.5 text-[12px] font-extrabold text-white transition-transform group-hover:translate-x-0.5">Žaisk dabar →</span>
      </Link>
      <div className="mt-2.5 flex items-center gap-1.5 border-t border-[var(--border-subtle)] pt-2.5 text-[11px] text-[var(--text-faint)]">
        <span className="rounded-full bg-[var(--bg-active)] px-2 py-0.5 font-bold">Greitai</span>
        Kvizai ir „Atspėk dainą"
      </div>
    </div>
  )
}

// ───────────────────────── Page ─────────────────────────
export default function AtradimaiPage() {
  const [members, setMembers] = useState<Member[] | null>(null)
  const [totalActive, setTotalActive] = useState(0)
  useEffect(() => {
    let a = true
    fetch('/api/atradimai/active-members?days=7&limit=8').then(r => r.json()).then(d => { if (a) { setMembers(d.members || []); setTotalActive(d.total_active || 0) } }).catch(() => { if (a) setMembers([]) })
    return () => { a = false }
  }, [])
  const memList = members || []

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-7 sm:px-6 sm:py-9">
      <Hero members={memList} activeCount={totalActive} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_330px]">
        {/* MAIN */}
        <div className="min-w-0">
          <DienosDainaBanner />
          <Feed />
        </div>

        {/* RAIL */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <ActiveMembers members={memList} loading={members === null} />
          <div>
            <RailHead title="Pokalbių dėžutė" href="/pokalbiai" hrefLabel="Atidaryti →" />
            <div style={{ height: 420 }}><ShoutboxWidget /></div>
          </div>
          <BoomboxCard />
        </aside>
      </div>
    </div>
  )
}
