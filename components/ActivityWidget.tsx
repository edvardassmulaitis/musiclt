'use client'

// components/ActivityWidget.tsx
//
// „Kas vyksta svetainėje" — gyvas įvykių srautas (kas ką sukūrė, palaikino,
// pakomentavo, pasiūlė). Backend: /api/live/activity (activity_events lentelė).
// Header'io ikona atveria pilną modalą su daugiau įvykių.

import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'

type Ev = {
  id: string; event_type: string; actor_name: string | null; actor_avatar: string | null
  entity_type: string | null; entity_title: string | null; entity_url: string | null
  entity_image?: string | null; created_at: string; metadata?: any
}

function timeAgoShort(d: string): string {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'ką tik'
  if (m < 60) return `${m} min.`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} val.`
  return `${Math.floor(h / 24)} d.`
}
function strHue(s: string) { let h = 0; for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h }

// VISI viešų event'ų tipai turi turėti aiškų veiksmažodį — kitaip krenta į
// „atnaujino" fallback'ą (būtent tai kliento pranešta klaida: „atnaujino dainą
// X / atnaujino <atlikėjas>"). Tipai atitinka lib/activity-logger.ts.
const VERB: Record<string, string> = {
  nomination: 'pasiūlė dienos dainą',
  daily_nomination: 'pasiūlė dienos dainą',
  vote: 'balsavo už',
  daily_vote: 'balsavo už dienos dainą',
  top_vote: 'balsavo', // chart'as (LT TOP 30 / TOP 40) pridedamas atskirai Row'e
  voting_vote: 'balsavo už',
  like: 'pamėgo',
  track_like: 'pamėgo dainą',
  album_like: 'pamėgo albumą',
  artist_like: 'pamėgo atlikėją',
  comment: 'pakomentavo',
  blog: 'parašė įrašą',
  blog_post: 'parašė įrašą',
  discussion: 'pradėjo diskusiją',
  thread_created: 'sukūrė temą',
  review: 'parašė recenziją',
  follow: 'pradėjo sekti',
}
function verbFor(t: string): string { return VERB[t] || 'atnaujino' }

function Row({ e, inModal = false }: { e: Ev; inModal?: boolean }) {
  const name = e.actor_name || 'Vartotojas'
  const verb = verbFor(e.event_type)
  // top_vote — rodom konkretų topą („LT TOP 30" / „TOP 40") su nuoroda į jį,
  // o NE dainos pavadinimą. Anksčiau buvo „balsavo topų balsavime už <daina>"
  // su nuoroda į /top40 — beprasmiška. 2026-05-31.
  const isTopVote = e.event_type === 'top_vote'
  const topIsLt = e.metadata?.top_type === 'lt_top30'
  const topLabel = topIsLt ? 'LT TOP 30' : 'TOP 40'
  const topUrl = topIsLt ? '/top30' : '/top40'
  // Modale daugiau vietos — didesnis avatar'as + didesnė entity mini nuotrauka.
  const av = inModal ? 'h-8 w-8' : 'h-7 w-7'
  const thumb = inModal ? 'h-11 w-11 rounded-lg' : 'h-8 w-8 rounded-md'
  return (
    <div className={`flex items-start gap-2.5 px-3.5 ${inModal ? 'py-2.5' : 'py-2'}`}>
      {e.actor_avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={proxyImg(e.actor_avatar)} alt="" className={`mt-0.5 ${av} shrink-0 rounded-full object-cover`} />
      ) : (
        <div className={`mt-0.5 flex ${av} shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold`} style={{ background: `hsl(${strHue(name)},32%,20%)`, color: `hsl(${strHue(name)},48%,58%)` }}>{name.charAt(0).toUpperCase()}</div>
      )}
      <div className="min-w-0 flex-1">
        <p className={`m-0 leading-snug text-[var(--text-secondary)] ${inModal ? 'text-[12.5px]' : 'text-[12px]'}`}>
          <span className="font-extrabold text-[var(--text-primary)]">{name}</span> {verb}
          {isTopVote ? (
            <> <Link href={topUrl} className="font-bold text-[var(--accent-link)] no-underline hover:underline">{topLabel}</Link></>
          ) : e.entity_title ? (
            e.entity_url
              ? <> <Link href={e.entity_url} className="font-bold text-[var(--accent-link)] no-underline hover:underline">{e.entity_title}</Link></>
              : <> <span className="font-bold text-[var(--text-primary)]">{e.entity_title}</span></>
          ) : null}
        </p>
        <p className="m-0 mt-0.5 text-[9.5px] text-[var(--text-faint)]">{timeAgoShort(e.created_at)}</p>
      </div>
      {e.entity_image && !isTopVote && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={proxyImg(e.entity_image)} alt="" className={`${thumb} shrink-0 object-cover`} />
      )}
    </div>
  )
}

// Sutraukia kartotinius balsavimo įrašus į vieną: TOP balsavimas (top_vote)
// loginamas už KIEKVIENĄ dainą, dienos daina (daily_vote) — taip pat (multi-vote).
// Feed'e turi būti tik VIENAS „balsavo TOP 40" / „balsavo už dienos dainą" įrašas
// per žmogų (naujausias). Edvardo prašymu 2026-06-01.
function dedupeVotes(events: Ev[]): Ev[] {
  const seen = new Set<string>()
  const out: Ev[] = []
  for (const e of events) {
    let key: string | null = null
    if (e.event_type === 'top_vote') key = `top:${e.actor_name || ''}:${e.metadata?.top_type || ''}`
    else if (e.event_type === 'daily_vote') key = `daily:${e.actor_name || ''}`
    if (key) {
      if (seen.has(key)) continue
      seen.add(key)
    }
    out.push(e)
  }
  return out
}

export function useActivity(pollMs = 20000) {
  const [events, setEvents] = useState<Ev[]>([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/live/activity?limit=60', { cache: 'no-store' }).then(res => res.json())
      setEvents(dedupeVotes(r.events || []))
    } catch {}
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load(); const iv = setInterval(load, pollMs); return () => clearInterval(iv) }, [load, pollMs])
  return { events, loading }
}

export function ActivityModal({ events, onClose }: { events: Ev[]; onClose: () => void }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div className="flex w-full max-w-[520px] flex-col overflow-hidden rounded-t-2xl bg-[var(--bg-surface)] shadow-[0_24px_60px_-10px_rgba(0,0,0,0.5)] sm:mx-4 sm:rounded-2xl" style={{ height: 'min(80vh, 640px)' }}>
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
          <span className="font-['Outfit',sans-serif] text-[14px] font-extrabold text-[var(--text-primary)]">Kas vyksta</span>
          <button onClick={onClose} aria-label="Uždaryti" className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-active)] text-[var(--text-secondary)]">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {events.length === 0 ? <div className="px-3 py-8 text-center text-[12px] text-[var(--text-muted)]">Dar nėra aktyvumo.</div> : events.map(e => <Row key={e.id} e={e} inModal />)}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ───────────────────────── horizontalios eilės kortelė (/atrasti) ─────────────────────────
// Tas pats „Kas vyksta" srautas, bet horizontalia kortele — vientisas stilius su
// kitomis /atrasti eilėmis. h=86px (= ScrollRow/StickyMoreButton aukštis).
export function ActivityCard({ e }: { e: Ev }) {
  const name = e.actor_name || 'Vartotojas'
  const verb = verbFor(e.event_type)
  const isTopVote = e.event_type === 'top_vote'
  const topIsLt = e.metadata?.top_type === 'lt_top30'
  const topLabel = topIsLt ? 'LT TOP 30' : 'TOP 40'
  const href = isTopVote ? (topIsLt ? '/top30' : '/top40') : (e.entity_url || null)
  const entityTitle = isTopVote ? topLabel : e.entity_title
  const img = !isTopVote ? e.entity_image : null
  // Siauresnė + aukštesnė kortelė (kad ant mobile matytųsi pirmas + dalis antros).
  const cls = 'group flex w-[210px] shrink-0 snap-start flex-col rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 no-underline transition-all hover:-translate-y-0.5 hover:border-[rgba(34,197,94,0.5)] hover:shadow-[0_14px_32px_rgba(0,0,0,0.22)]'
  const body = (
    <>
      <div className="flex items-start gap-2">
        {e.actor_avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyImg(e.actor_avatar)} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold" style={{ background: `hsl(${strHue(name)},32%,20%)`, color: `hsl(${strHue(name)},48%,58%)` }}>{name.charAt(0).toUpperCase()}</span>
        )}
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-[11.5px] font-bold text-[var(--text-secondary)]">{name}</p>
          <p className="m-0 text-[10px] text-[var(--text-faint)]">{timeAgoShort(e.created_at)}</p>
        </div>
        {img && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyImg(img)} alt="" loading="lazy" className="h-7 w-7 shrink-0 rounded-md object-cover" />
        )}
      </div>
      <p className="m-0 mt-2 line-clamp-3 text-[12.5px] leading-snug text-[var(--text-muted)]">
        {verb}{entityTitle ? <> <span className="font-extrabold text-[var(--text-primary)] transition-colors group-hover:text-[#22c55e]">{entityTitle}</span></> : null}
      </p>
    </>
  )
  return href
    ? <Link href={href} className={cls} style={{ height: 116 }}>{body}</Link>
    : <div className={cls} style={{ height: 116 }}>{body}</div>
}

export function ActivityWidget() {
  const { events, loading } = useActivity()
  const [modalOpen, setModalOpen] = useState(false)
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-3.5 py-2.5">
        <span className="flex items-center gap-2 font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--text-primary)]">
          <span className="relative flex h-2 w-2 shrink-0" aria-hidden title="Gyvas srautas">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22c55e] opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#22c55e]" />
          </span>
          Kas vyksta
        </span>
        <button onClick={() => setModalOpen(true)} aria-label="Atverti visą aktyvumą" title="Atverti visą aktyvumą" className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent-orange)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="14" y2="17" /></svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1" style={{ minHeight: 0 }}>
        {loading ? (
          <div className="px-3 py-6 text-center text-[11px] text-[var(--text-faint)]">Kraunama…</div>
        ) : events.length === 0 ? (
          <div className="px-3 py-6 text-center text-[11px] text-[var(--text-muted)]">Dar nėra aktyvumo.</div>
        ) : events.slice(0, 20).map(e => <Row key={e.id} e={e} />)}
      </div>
      {modalOpen && <ActivityModal events={events} onClose={() => setModalOpen(false)} />}
    </div>
  )
}
