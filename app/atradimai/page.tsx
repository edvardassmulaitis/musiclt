'use client'

// app/atradimai/page.tsx
//
// „Atradimai" — tankus, turinio-first bendruomenės hub'as. Tikslas: kuo daugiau
// info iškart matoma (be tab'ų slėpimo), lengva atrasti narių turinį, ir aktyviai
// skatinama kelti recenzijas / topus / kūrybą / vertimus.
//
// Struktūra:
//   • Plona antraštė (be bulky hero) + neseniai aktyvūs + N narių aktyvūs
//   • „Pasidalink" juosta — 4 CTA (recenzija / topas / kūryba / vertimas)
//   • Dienos dainos veiksmo banneris
//   • Horizontalūs row'ai pagal tipą: Narių topai · Recenzijos · Kūryba · Vertimai
//     · Straipsniai · Diskusijos (tušti row'ai virsta kvietimu rašyti, ne tuščiu)
//   • Rail: Kas vyksta · Pažink narius · Nauji nariai · Pokalbių dėžutė · Boombox
//
// Duomenys (viskas jau egzistuoja):
//   /api/blog/feed?type=…           → narių įrašai pagal tipą
//   /api/diskusijos/recent          → naujausios diskusijos
//   /api/dienos-daina/nominations   → šiandienos daina
//   /api/atradimai/active-members   → aktyviausi + nauji nariai
//   <ActivityWidget/> <ShoutboxWidget/> → gyvas pulsas / chatas

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import { ShoutboxWidget } from '@/components/ShoutboxWidget'
import { ActivityWidget } from '@/components/ActivityWidget'

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

function Avatar({ src, name, size = 32 }: { src?: string | null; name?: string | null; size?: number }) {
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
type BlogPost = {
  id: number; slug: string; title: string; summary: string | null; cover_image_url: string | null
  post_type: string; rating: number | null; like_count: number | null; comment_count: number | null; published_at: string | null
  blogs?: { slug: string | null; title: string | null; profiles?: { id: string; full_name: string | null; username: string | null; avatar_url: string | null } | null } | null
}
type Member = { user_id: string; username: string | null; name: string | null; avatar: string | null; total: number; last_active: string; headline: string }
type NewMember = { username: string; name: string | null; avatar: string | null; created_at: string }
type Diskusija = { id: number; slug: string; title: string; author_name: string | null; author_avatar: string | null; comment_count: number; created_at: string; latest_comment?: { author: string; excerpt: string } | null }

function blogHref(p: BlogPost) {
  const s = p.blogs?.slug || p.blogs?.profiles?.username
  return s ? `/blogas/${s}/${p.slug}` : '/blogas'
}

// ───────────────────────── Slim header ─────────────────────────
function SlimHeader({ members, totalActive }: { members: Member[]; totalActive: number }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="m-0 font-['Outfit',sans-serif] text-[26px] font-black tracking-[-0.02em] text-[var(--text-primary)] sm:text-[30px]">Atradimai</h1>
        <p className="m-0 mt-0.5 text-[13px] text-[var(--text-muted)]">Kas naujo pas kitus narius — įrašai, topai, recenzijos, kūryba</p>
      </div>
      {members.length > 0 && (
        <div className="flex items-center gap-2.5 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] py-1.5 pl-2.5 pr-3.5">
          <div className="flex -space-x-2">
            {members.slice(0, 5).map(m => (
              <Link key={m.user_id} href={m.username ? `/@${m.username}` : '#'} className="rounded-full ring-2 ring-[var(--bg-surface)] transition-transform hover:z-10 hover:-translate-y-0.5">
                <Avatar src={m.avatar} name={m.name} size={24} />
              </Link>
            ))}
          </div>
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--text-secondary)]">
            <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#10b981] opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#10b981]" /></span>
            {totalActive} aktyvūs šią savaitę
          </span>
        </div>
      )}
    </div>
  )
}

// ───────────────────────── Pasidalink (encourage posting) ─────────────────────────
const CONTRIB = [
  { type: 'review', label: 'Parašyk recenziją', icon: '★', rgb: '239,68,68' },
  { type: 'topas', label: 'Sudaryk topą', icon: '🏆', rgb: '245,158,11' },
  { type: 'creation', label: 'Įkelk kūrybą', icon: '✎', rgb: '236,72,153' },
  { type: 'translation', label: 'Pridėk vertimą', icon: '↔', rgb: '16,185,129' },
]
function ContributeStrip() {
  return (
    <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {CONTRIB.map(c => (
        <Link key={c.type} href={`/blogas/rasyti?type=${c.type}`}
          className="group flex items-center gap-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2.5 no-underline transition-all hover:-translate-y-0.5"
          style={{ ['--c' as any]: `rgb(${c.rgb})` }}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[15px] font-black" style={{ background: `rgba(${c.rgb},0.14)`, color: `rgb(${c.rgb})` }}>{c.icon}</span>
          <span className="min-w-0">
            <span className="block truncate font-['Outfit',sans-serif] text-[12.5px] font-extrabold text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{c.label}</span>
            <span className="block text-[10.5px] text-[var(--text-faint)]">Pasidalink su bendruomene</span>
          </span>
        </Link>
      ))}
    </div>
  )
}

// ───────────────────────── Dienos daina banner ─────────────────────────
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
    <Link href="/dienos-daina" className="group mb-7 flex items-center gap-3.5 rounded-2xl border border-[var(--border-default)] p-3 no-underline transition-all hover:-translate-y-0.5 hover:border-[rgba(249,115,22,0.5)] sm:p-3.5"
      style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.12), rgba(249,115,22,0.03))' }}>
      <div className="relative h-[56px] w-[56px] shrink-0 overflow-hidden rounded-xl bg-[var(--cover-placeholder)] sm:h-[62px] sm:w-[62px]">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyImg(cover)} alt="" className="h-full w-full object-cover" />
        ) : <div className="flex h-full w-full items-center justify-center text-xl">🎵</div>}
      </div>
      <div className="min-w-0 flex-1">
        <span className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--accent-orange)]">Dienos daina · balsuok</span>
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

// ───────────────────────── Horizontal row primitives ─────────────────────────
function RowHead({ title, accent, allHref, addType }: { title: string; accent: string; allHref: string; addType?: string }) {
  return (
    <div className="mb-2.5 flex items-end justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span style={{ width: 4, height: 18, borderRadius: 3, background: accent }} />
        <h2 className="m-0 font-['Outfit',sans-serif] text-[17px] font-extrabold tracking-[-0.01em] text-[var(--text-primary)] sm:text-[18px]">{title}</h2>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {addType && <Link href={`/blogas/rasyti?type=${addType}`} className="font-['Outfit',sans-serif] text-[12px] font-bold text-[var(--text-muted)] no-underline transition-colors hover:text-[var(--accent-orange)]">+ Rašyti</Link>}
        <Link href={allHref} className="font-['Outfit',sans-serif] text-[12px] font-bold text-[var(--accent-orange)] no-underline transition-opacity hover:opacity-70">Visi →</Link>
      </div>
    </div>
  )
}

const SCROLL = 'flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x'

function PostCard({ p }: { p: BlogPost }) {
  const author = p.blogs?.profiles
  const isReview = p.post_type === 'review'
  return (
    <Link href={blogHref(p)} className="group block w-[160px] shrink-0 snap-start no-underline sm:w-[172px]">
      <div className="relative aspect-square overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--cover-placeholder)]">
        {p.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyImg(p.cover_image_url)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" />
        ) : <div className="flex h-full w-full items-center justify-center text-2xl text-[var(--text-faint)]">🎵</div>}
        {isReview && p.rating != null && (
          <span className="absolute left-1.5 top-1.5 flex items-center gap-0.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-black text-amber-300">★ {p.rating}</span>
        )}
      </div>
      <p className="m-0 mt-2 line-clamp-2 font-['Outfit',sans-serif] text-[12.5px] font-extrabold leading-snug text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{sani(p.title) || '(be pavadinimo)'}</p>
      <div className="mt-1.5 flex items-center gap-1.5">
        <Avatar src={author?.avatar_url} name={author?.full_name || author?.username} size={16} />
        <span className="min-w-0 flex-1 truncate text-[10.5px] text-[var(--text-muted)]">{author?.full_name || author?.username || 'Narys'}</span>
        {(p.like_count ?? 0) > 0 && <span className="shrink-0 text-[10.5px] text-[var(--text-faint)]">♥ {p.like_count}</span>}
      </div>
    </Link>
  )
}

function InviteCard({ label, type }: { label: string; type: string }) {
  return (
    <Link href={`/blogas/rasyti?type=${type}`} className="group flex w-[160px] shrink-0 snap-start flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-default)] p-4 text-center no-underline transition-colors hover:border-[var(--accent-orange)] sm:w-[172px]" style={{ aspectRatio: '1' }}>
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-active)] text-[18px] font-black text-[var(--accent-orange)] transition-transform group-hover:scale-110">+</span>
      <span className="mt-2 font-['Outfit',sans-serif] text-[12.5px] font-extrabold text-[var(--text-primary)]">Būk pirmas</span>
      <span className="mt-0.5 text-[11px] text-[var(--text-muted)]">{label}</span>
    </Link>
  )
}

function BlogRow({ title, type, accent, inviteLabel }: { title: string; type: string; accent: string; inviteLabel: string }) {
  const [posts, setPosts] = useState<BlogPost[] | null>(null)
  useEffect(() => {
    let a = true
    fetch(`/api/blog/feed?type=${type}&limit=14`).then(r => r.json()).then(d => { if (a) setPosts(d.posts || []) }).catch(() => { if (a) setPosts([]) })
    return () => { a = false }
  }, [type])
  return (
    <section className="mb-7">
      <RowHead title={title} accent={accent} allHref={`/blogas?type=${type}`} addType={type} />
      {posts === null ? (
        <div className={SCROLL}>{Array(6).fill(null).map((_, i) => (
          <div key={i} className="w-[160px] shrink-0 sm:w-[172px]"><div className="hp-skel aspect-square rounded-xl" /><div className="hp-skel mt-2 h-3 w-4/5 rounded" /></div>
        ))}</div>
      ) : posts.length === 0 ? (
        <div className={SCROLL}>
          <InviteCard label={inviteLabel} type={type} />
          <div className="flex max-w-[280px] items-center text-[12.5px] leading-snug text-[var(--text-muted)]">Šios skilties dar niekas neužpildė — tavo įrašas čia būtų pirmas.</div>
        </div>
      ) : (
        <div className={SCROLL}>
          {posts.map(p => <PostCard key={p.id} p={p} />)}
          <InviteCard label={inviteLabel} type={type} />
        </div>
      )}
    </section>
  )
}

// ───────────────────────── Diskusijos row ─────────────────────────
function DiskusijosRow() {
  const [items, setItems] = useState<Diskusija[] | null>(null)
  useEffect(() => {
    let a = true
    fetch('/api/diskusijos/recent?limit=10').then(r => r.json()).then(d => { if (a) setItems(d.items || []) }).catch(() => { if (a) setItems([]) })
    return () => { a = false }
  }, [])
  return (
    <section className="mb-7">
      <RowHead title="Diskusijos" accent="#8b5cf6" allHref="/diskusijos" />
      {items === null ? (
        <div className={SCROLL}>{Array(4).fill(null).map((_, i) => <div key={i} className="hp-skel h-[92px] w-[260px] shrink-0 rounded-xl" />)}</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-default)] p-5 text-center text-[12.5px] text-[var(--text-muted)]">Diskusijų dar nėra. <Link href="/diskusijos" className="font-bold text-[var(--accent-orange)] no-underline">Pradėk pirmas →</Link></div>
      ) : (
        <div className={SCROLL}>
          {items.map(d => (
            <Link key={d.id} href={`/diskusijos/${d.slug}`} className="group block w-[260px] shrink-0 snap-start rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 no-underline transition-colors hover:border-[rgba(139,92,246,0.5)]">
              <p className="m-0 line-clamp-1 font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{d.title}</p>
              {d.latest_comment ? (
                <p className="m-0 mt-1 line-clamp-2 text-[11.5px] leading-snug text-[var(--text-muted)]"><span className="font-bold text-[var(--text-secondary)]">{d.latest_comment.author}:</span> {d.latest_comment.excerpt}</p>
              ) : <p className="m-0 mt-1 text-[11px] text-[var(--text-muted)]">{d.author_name || 'Anonimas'}</p>}
              <p className="m-0 mt-1.5 text-[10.5px] text-[var(--text-faint)]">{d.comment_count} ats. · {timeAgo(d.created_at)}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

// ───────────────────────── Rail blocks ─────────────────────────
function RailHead({ title, href, hrefLabel }: { title: string; href?: string; hrefLabel?: string }) {
  return (
    <div className="mb-2.5 flex items-center justify-between">
      <h3 className="m-0 font-['Outfit',sans-serif] text-[14px] font-extrabold text-[var(--text-primary)]">{title}</h3>
      {href && <Link href={href} className="text-[11.5px] font-bold text-[var(--accent-orange)] no-underline hover:opacity-70">{hrefLabel || 'Visi →'}</Link>}
    </div>
  )
}

function PazinkNarius({ members, loading }: { members: Member[]; loading: boolean }) {
  return (
    <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3.5">
      <RailHead title="Pažink narius" href="/vartotojai" />
      <p className="m-0 mb-2 text-[11.5px] text-[var(--text-muted)]">Aktyviausi šią savaitę</p>
      {loading ? (
        <div className="flex flex-col gap-2">{Array(5).fill(null).map((_, i) => <div key={i} className="hp-skel h-9 rounded-lg" />)}</div>
      ) : members.length === 0 ? <p className="m-0 py-2 text-center text-[12px] text-[var(--text-muted)]">Šią savaitę dar tylu.</p> : (
        <div className="flex flex-col">
          {members.slice(0, 6).map((m, i) => (
            <Link key={m.user_id} href={m.username ? `/@${m.username}` : '#'} className="group flex items-center gap-2.5 rounded-lg px-1 py-1.5 no-underline transition-colors hover:bg-[var(--bg-hover)]">
              <span className="w-3.5 shrink-0 text-center text-[11px] font-black text-[var(--text-faint)]">{i + 1}</span>
              <Avatar src={m.avatar} name={m.name} size={32} />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="m-0 truncate text-[12.5px] font-extrabold text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{m.name}</p>
                <p className="m-0 truncate text-[11px] text-[var(--text-muted)]">{m.headline}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function NaujiNariai({ list, loading }: { list: NewMember[]; loading: boolean }) {
  if (!loading && list.length === 0) return null
  return (
    <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3.5">
      <RailHead title="Nauji nariai" href="/vartotojai" hrefLabel="Pasveikink →" />
      {loading ? (
        <div className="flex flex-wrap gap-2">{Array(6).fill(null).map((_, i) => <div key={i} className="hp-skel h-8 w-8 rounded-full" />)}</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {list.slice(0, 5).map(m => (
            <Link key={m.username} href={`/@${m.username}`} className="group flex items-center gap-2.5 rounded-lg px-1 py-1 no-underline transition-colors hover:bg-[var(--bg-hover)]">
              <Avatar src={m.avatar} name={m.name} size={30} />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="m-0 truncate text-[12.5px] font-extrabold text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{m.name}</p>
                <p className="m-0 truncate text-[10.5px] text-[var(--text-faint)]">prisijungė {timeAgo(m.created_at)}</p>
              </div>
              <span className="shrink-0 rounded-full bg-[rgba(16,185,129,0.14)] px-2 py-0.5 text-[10px] font-extrabold text-[#10b981]">naujas</span>
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
      <Link href="/boombox" className="group block no-underline">
        <span className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--accent-orange)]">Žaidimas</span>
        <p className="m-0 mt-0.5 font-['Outfit',sans-serif] text-[18px] font-black text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">Boombox</p>
        <p className="m-0 mt-1 text-[12px] leading-snug text-[var(--text-muted)]">Atrask atlikėjus swipe stiliumi — muzikinis Tinder'is.</p>
        <span className="mt-2.5 inline-flex rounded-full bg-[var(--accent-orange)] px-3.5 py-1.5 text-[12px] font-extrabold text-white transition-transform group-hover:translate-x-0.5">Žaisk →</span>
      </Link>
    </div>
  )
}

// ───────────────────────── Page ─────────────────────────
export default function AtradimaiPage() {
  const [members, setMembers] = useState<Member[] | null>(null)
  const [newMembers, setNewMembers] = useState<NewMember[]>([])
  const [totalActive, setTotalActive] = useState(0)
  useEffect(() => {
    let a = true
    fetch('/api/atradimai/active-members?days=7&limit=8').then(r => r.json()).then(d => {
      if (!a) return
      setMembers(d.members || []); setNewMembers(d.new_members || []); setTotalActive(d.total_active || 0)
    }).catch(() => { if (a) setMembers([]) })
    return () => { a = false }
  }, [])
  const memList = members || []

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 sm:py-8">
      <SlimHeader members={memList} totalActive={totalActive} />
      <ContributeStrip />

      <div className="grid grid-cols-1 gap-x-7 lg:grid-cols-[1fr_320px]">
        {/* MAIN */}
        <div className="min-w-0">
          <DienosDainaBanner />
          <BlogRow title="Narių topai" type="topas" accent="#f59e0b" inviteLabel="Sudaryk topą" />
          <BlogRow title="Recenzijos" type="review" accent="#ef4444" inviteLabel="Parašyk recenziją" />
          <BlogRow title="Kūryba" type="creation" accent="#ec4899" inviteLabel="Įkelk kūrybą" />
          <BlogRow title="Vertimai" type="translation" accent="#10b981" inviteLabel="Pridėk vertimą" />
          <BlogRow title="Straipsniai" type="article" accent="#a855f7" inviteLabel="Parašyk straipsnį" />
          <DiskusijosRow />
        </div>

        {/* RAIL */}
        <aside className="flex flex-col gap-4">
          <div>
            <RailHead title="Kas vyksta" href="/pokalbiai" hrefLabel="Daugiau →" />
            <div style={{ height: 360 }}><ActivityWidget /></div>
          </div>
          <PazinkNarius members={memList} loading={members === null} />
          <NaujiNariai list={newMembers} loading={members === null} />
          <div>
            <RailHead title="Pokalbių dėžutė" href="/pokalbiai" hrefLabel="Atidaryti →" />
            <div style={{ height: 360 }}><ShoutboxWidget /></div>
          </div>
          <BoomboxCard />
        </aside>
      </div>
    </div>
  )
}
