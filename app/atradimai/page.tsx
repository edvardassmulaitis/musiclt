'use client'

// app/atradimai/page.tsx
//
// „Atradimai" — bendruomenės + pramogų retention landing'as. Pakeitė
// /bendruomene + /pramogos. Sudėliota iš jau turimų komponentų / API:
//   1. Dienos daina      → /api/dienos-daina/nominations
//   2. Žaidimai (Boombox)→ /boombox, /zaidimai
//   3. Narių įrašai      → /api/blog/feed
//   4. Narių topai       → /api/blog/feed?type=topas
//   5. Diskusijos        → /api/diskusijos/recent
//   6. Pokalbių dėžutė   → <ShoutboxWidget/> + <ActivityWidget/>
//
// CSS variables tema (ne legacy dark) — atitinka likusią svetainę.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import { ShoutboxWidget } from '@/components/ShoutboxWidget'
import { ActivityWidget } from '@/components/ActivityWidget'

function timeAgo(d?: string | null) {
  if (!d) return ''
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'ką tik'
  if (m < 60) return `${m} min.`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} val.`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days} d.`
  return `prieš ${Math.floor(days / 7)} sav.`
}
function sani(s?: string | null) {
  return (s || '').replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim()
}
function ytId(url?: string | null) {
  if (!url) return null
  return url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/)?.[1] || null
}
function blogHref(p: any) {
  const slug = p?.blogs?.slug || p?.blogs?.profiles?.username
  return slug ? `/blogas/${slug}/${p.slug || p.id}` : '/blogas'
}
function authorName(p: any) {
  const pr = p?.blogs?.profiles
  return pr?.full_name || pr?.username || 'Autorius'
}

const ANCHORS = [
  { id: 'dienos-daina', label: 'Dienos daina' },
  { id: 'zaidimai', label: 'Žaidimai' },
  { id: 'nariu-irasai', label: 'Narių įrašai' },
  { id: 'nariu-topai', label: 'Narių topai' },
  { id: 'diskusijos', label: 'Diskusijos' },
  { id: 'pokalbiai', label: 'Pokalbių dėžutė' },
]

function SectionHead({ id, title, sub, href, hrefLabel = 'Visi →', accent = 'var(--accent-orange)' }: { id: string; title: string; sub?: string; href?: string; hrefLabel?: string; accent?: string }) {
  return (
    <div id={id} className="mb-3 flex items-end justify-between gap-3 scroll-mt-24">
      <div className="flex items-center gap-2.5">
        <span style={{ width: 4, height: 22, borderRadius: 3, background: accent }} />
        <div>
          <h2 className="m-0 font-['Outfit',sans-serif] text-[19px] font-extrabold tracking-[-0.01em] text-[var(--text-primary)] sm:text-[21px]">{title}</h2>
          {sub && <p className="m-0 mt-0.5 text-[12px] text-[var(--text-muted)]">{sub}</p>}
        </div>
      </div>
      {href && <Link href={href} className="shrink-0 font-['Outfit',sans-serif] text-[12px] font-bold text-[var(--accent-orange)] no-underline transition-opacity hover:opacity-70">{hrefLabel}</Link>}
    </div>
  )
}

function Cover({ src, alt, ratio = 'square' }: { src: string | null; alt: string; ratio?: 'square' | 'video' }) {
  return (
    <div className={`relative ${ratio === 'video' ? 'aspect-video' : 'aspect-square'} overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--cover-placeholder)]`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={proxyImg(src)} alt={alt} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-2xl text-[var(--text-faint)]">🎵</div>
      )}
    </div>
  )
}

// ── Dienos daina ──
function DienosDainaBlock() {
  const [noms, setNoms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let a = true
    fetch('/api/dienos-daina/nominations').then(r => r.json()).then(d => { if (a) { setNoms(d.nominations || []); setLoading(false) } }).catch(() => { if (a) setLoading(false) })
    return () => { a = false }
  }, [])
  const top = [...noms].filter(n => n.tracks).slice(0, 3)
  return (
    <section className="mb-12">
      <SectionHead id="dienos-daina" title="Dienos daina" sub="Bendruomenės siūloma ir balsuojama dienos daina" href="/dienos-daina" hrefLabel="Balsuoti →" accent="#f97316" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {loading ? Array(3).fill(null).map((_, i) => (
          <div key={i} className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
            <div className="hp-skel aspect-video rounded-lg" /><div className="hp-skel mt-2 h-3 w-4/5 rounded" />
          </div>
        )) : top.length === 0 ? (
          <div className="col-span-full rounded-xl border border-dashed border-[var(--border-default)] p-6 text-center text-[13px] text-[var(--text-muted)]">
            Šiandien dar nepasiūlyta dainų. <Link href="/dienos-daina" className="font-bold text-[var(--accent-orange)] no-underline">Pasiūlyk pirmas →</Link>
          </div>
        ) : top.map((n, i) => {
          const t = n.tracks
          const v = ytId(t.video_url)
          const img = t.cover_url || (v ? `https://img.youtube.com/vi/${v}/mqdefault.jpg` : null) || t.artists?.cover_image_url || null
          return (
            <Link key={n.id} href="/dienos-daina" className="group block rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 no-underline transition-all hover:-translate-y-0.5 hover:border-[rgba(249,115,22,0.5)]">
              <div className="relative">
                <Cover src={img} alt={sani(t.title)} ratio="video" />
                <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-orange)] text-[12px] font-black text-white">{i + 1}</span>
              </div>
              <p className="m-0 mt-2 truncate font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{sani(t.title)}</p>
              <p className="m-0 mt-0.5 truncate text-[11.5px] text-[var(--text-muted)]">{t.artists?.name}</p>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

// ── Žaidimai ──
function ZaidimaiBlock() {
  return (
    <section className="mb-12">
      <SectionHead id="zaidimai" title="Žaidimai" sub="Pramogos muzikos mėgėjams" href="/zaidimai" hrefLabel="Visi žaidimai →" accent="#6366f1" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Link href="/boombox" className="group relative col-span-1 overflow-hidden rounded-2xl border border-[var(--border-default)] p-5 no-underline transition-all hover:-translate-y-0.5 md:col-span-2" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(168,85,247,0.10))' }}>
          <span className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--accent-orange)]">Populiariausia</span>
          <h3 className="m-0 mt-1.5 font-['Outfit',sans-serif] text-[24px] font-black text-[var(--text-primary)]">Boombox</h3>
          <p className="m-0 mt-1 max-w-[420px] text-[13px] leading-relaxed text-[var(--text-muted)]">Atrask atlikėjus swipe stiliumi — kaip muzikinis Tinder'is. Įvertink, sutik ir klausyk naujų dainų.</p>
          <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-[var(--accent-orange)] px-4 py-2 text-[12.5px] font-extrabold text-white transition-transform group-hover:translate-x-0.5">Žaisk dabar →</span>
        </Link>
        <div className="flex flex-col gap-3">
          <div className="flex flex-1 flex-col justify-center rounded-2xl border border-dashed border-[var(--border-default)] p-4">
            <span className="font-['Outfit',sans-serif] text-[14px] font-extrabold text-[var(--text-primary)]">Atspėk dainą</span>
            <span className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">Greitai — muzikos viktorina</span>
            <span className="mt-2 w-fit rounded-full bg-[var(--bg-active)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-faint)]">Greitai</span>
          </div>
          <div className="flex flex-1 flex-col justify-center rounded-2xl border border-dashed border-[var(--border-default)] p-4">
            <span className="font-['Outfit',sans-serif] text-[14px] font-extrabold text-[var(--text-primary)]">Kvizai</span>
            <span className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">LT muzikos žinovams</span>
            <span className="mt-2 w-fit rounded-full bg-[var(--bg-active)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-faint)]">Greitai</span>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Narių įrašai / Narių topai (bendras blog kortelių grid) ──
function BlogGrid({ type }: { type?: string }) {
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let a = true
    const url = `/api/blog/feed?limit=6${type ? `&type=${type}` : ''}`
    fetch(url).then(r => r.json()).then(d => { if (a) { setPosts(d.posts || []); setLoading(false) } }).catch(() => { if (a) setLoading(false) })
    return () => { a = false }
  }, [type])
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array(6).fill(null).map((_, i) => (
          <div key={i}><div className="hp-skel aspect-square rounded-xl" /><div className="hp-skel mt-2 h-3 w-4/5 rounded" /></div>
        ))}
      </div>
    )
  }
  if (posts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border-default)] p-6 text-center text-[13px] text-[var(--text-muted)]">
        {type ? 'Narių topų dar nėra.' : 'Įrašų dar nėra.'} <Link href="/blogas/naujas" className="font-bold text-[var(--accent-orange)] no-underline">Sukurk pirmas →</Link>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {posts.map(p => (
        <Link key={p.id} href={blogHref(p)} className="group block no-underline">
          <Cover src={p.cover_image_url} alt={sani(p.title)} />
          <p className="m-0 mt-2 line-clamp-2 font-['Outfit',sans-serif] text-[12.5px] font-extrabold leading-snug text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{sani(p.title)}</p>
          <p className="m-0 mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{authorName(p)} · {timeAgo(p.published_at)}</p>
        </Link>
      ))}
    </div>
  )
}

// ── Diskusijos ──
function DiskusijosBlock() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let a = true
    fetch('/api/diskusijos/recent?limit=6').then(r => r.json()).then(d => { if (a) { setItems(d.items || []); setLoading(false) } }).catch(() => { if (a) setLoading(false) })
    return () => { a = false }
  }, [])
  return (
    <section className="mb-12">
      <SectionHead id="diskusijos" title="Diskusijos" sub="Naujausios temos su paskutiniu komentaru" href="/diskusijos" accent="#8b5cf6" />
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {loading ? Array(4).fill(null).map((_, i) => (
          <div key={i} className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3.5"><div className="hp-skel h-3 w-4/5 rounded" /><div className="hp-skel mt-2 h-2.5 w-full rounded" /></div>
        )) : items.length === 0 ? (
          <div className="col-span-full rounded-xl border border-dashed border-[var(--border-default)] p-6 text-center text-[13px] text-[var(--text-muted)]">Diskusijų dar nėra. <Link href="/diskusijos" className="font-bold text-[var(--accent-orange)] no-underline">Pradėk pirmas →</Link></div>
        ) : items.map(d => (
          <Link key={d.id} href={`/diskusijos/${d.slug}`} className="group block rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3.5 no-underline transition-colors hover:border-[rgba(139,92,246,0.5)]">
            <p className="m-0 line-clamp-1 font-['Outfit',sans-serif] text-[13.5px] font-extrabold text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{d.title}</p>
            {d.latest_comment ? (
              <p className="m-0 mt-1 line-clamp-2 text-[11.5px] leading-snug text-[var(--text-muted)]"><span className="font-bold text-[var(--text-secondary)]">{d.latest_comment.author}:</span> {d.latest_comment.excerpt}</p>
            ) : (
              <p className="m-0 mt-1 text-[11px] text-[var(--text-muted)]">{d.author_name || 'Anonimas'} · {d.comment_count} ats.</p>
            )}
          </Link>
        ))}
      </div>
    </section>
  )
}

export default function AtradimaiPage() {
  return (
    <div className="mx-auto max-w-[1180px] px-4 py-8 sm:px-6 sm:py-10">
      {/* Hero */}
      <div className="mb-10 overflow-hidden rounded-3xl border border-[var(--border-default)] p-7 sm:p-10" style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.16), rgba(139,92,246,0.12) 55%, rgba(6,182,212,0.10))' }}>
        <span className="font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--accent-orange)]">Bendruomenė gyvai</span>
        <h1 className="m-0 mt-2 font-['Outfit',sans-serif] text-[34px] font-black leading-[1.05] tracking-[-0.02em] text-[var(--text-primary)] sm:text-[44px]">Atradimai</h1>
        <p className="m-0 mt-3 max-w-[560px] text-[14px] leading-relaxed text-[var(--text-muted)] sm:text-[15px]">Dienos daina, žaidimai, narių įrašai ir topai, diskusijos bei gyvas pokalbis — viskas, kuo gyvena music.lt bendruomenė, vienoje vietoje.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {ANCHORS.map(a => (
            <a key={a.id} href={`#${a.id}`} className="rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)]/60 px-3.5 py-1.5 font-['Outfit',sans-serif] text-[12px] font-bold text-[var(--text-secondary)] no-underline backdrop-blur transition-colors hover:border-[var(--accent-orange)] hover:text-[var(--accent-orange)]">{a.label}</a>
          ))}
        </div>
      </div>

      <DienosDainaBlock />
      <ZaidimaiBlock />

      <section className="mb-12">
        <SectionHead id="nariu-irasai" title="Narių įrašai" sub="Recenzijos, kūryba, straipsniai" href="/blogas" accent="#a855f7" />
        <BlogGrid />
      </section>

      <section className="mb-12">
        <SectionHead id="nariu-topai" title="Narių topai" sub="Narių sudaryti top sąrašai" href="/blogas?type=topas" accent="#ef4444" />
        <BlogGrid type="topas" />
      </section>

      <DiskusijosBlock />

      {/* Pokalbių dėžutė + Kas vyksta */}
      <section className="mb-6">
        <SectionHead id="pokalbiai" title="Pokalbių dėžutė" sub="Bendras gyvas chatas ir bendruomenės aktyvumas" href="/pokalbiai" hrefLabel="Atidaryti →" accent="#06b6d4" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2" style={{ minHeight: 380 }}>
          <div style={{ height: 420 }}><ShoutboxWidget /></div>
          <div style={{ height: 420 }}><ActivityWidget /></div>
        </div>
      </section>
    </div>
  )
}
