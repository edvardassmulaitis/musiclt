'use client'

// components/DienosDainaArchive.tsx
//
// „Dienos daina" — visų laikų laimėtojų ARCHYVAS (/dienos-daina puslapio apačia).
// Paginuotas (Rodyti daugiau), su filtru pagal metus ir paieška pagal dainą/atlikėją.
// Kiekviena diena išskleidžiama: laimėtojas, komentaras, kas siūlė, ir VISI tos
// dienos dalyviai su taškais / komentarais / balsuotojais (kur duomenys yra).
// Duomenys: /api/dienos-daina/archive (sąrašas) + /api/dienos-daina/nominations?date= (dalyviai).
// 2026-06-23.

import { useState, useEffect, useCallback, useRef } from 'react'
import { proxyImg } from '@/lib/img-proxy'
import { HomeTrackModal } from '@/components/HomeTrackModal'

// ───────── helpers ─────────
function sani(s?: string | null) {
  return (s || '').replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim()
}
function hue(s: string) { let h = 0; for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h }
// mqdefault (NE maxresdefault!): maxres dažnai grąžina pilką placeholder'į su
// HTTP 200 → onError nesuveikia → „nėra embed'o". mqdefault visada realus.
const YT_RE = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/v\/)([\w-]{11})/
function ytThumb(url?: string | null): string | null {
  if (!url) return null
  const m = url.match(YT_RE)
  return m ? `https://img.youtube.com/vi/${m[1]}/mqdefault.jpg` : null
}
function trackImg(t: TrackLite | null): string | null {
  if (!t) return null
  return ytThumb(t.video_url) || (t.cover_url ?? null) || t.artists?.cover_image_url || null
}
function uname(a?: { username?: string | null; full_name?: string | null } | null): string {
  return a?.username || a?.full_name || 'narys'
}
function ptsWord(v: number): string {
  if (v === 1) return 'taškas'
  const lastTwo = v % 100; const last = v % 10
  if (last >= 2 && last <= 9 && !(lastTwo >= 11 && lastTwo <= 19)) return 'taškai'
  return 'taškų'
}
function fmtDate(d: string): string {
  try {
    return new Date(`${d}T12:00:00`).toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch { return d }
}

function Avatar({ src, name, size = 22 }: { src?: string | null; name?: string | null; size?: number }) {
  const nm = name || 'Narys'
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={proxyImg(src)} alt="" width={size} height={size} loading="lazy" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  }
  return (
    <div className="flex shrink-0 items-center justify-center rounded-full font-extrabold"
      style={{ width: size, height: size, fontSize: size * 0.42, background: `hsl(${hue(nm)},32%,32%)`, color: '#fff' }}>
      {nm.charAt(0).toUpperCase()}
    </div>
  )
}

// ───────── types ─────────
type TrackLite = { id: number; title: string; cover_url?: string | null; slug?: string | null; video_url?: string | null; artists: { id?: number; name: string; slug?: string | null; cover_image_url?: string | null } | null }
type Proposer = { username: string | null; full_name: string | null; avatar_url: string | null }
type Winner = { id: number; date: string; track_id: number; total_votes: number; weighted_votes: number; winning_comment?: string | null; proposer?: Proposer | null; nom_count?: number; tracks: TrackLite | null }
type Participant = { id: number; comment?: string | null; points: number; likes?: number; voters?: Proposer[]; anon_votes?: number; proposer?: Proposer | null; is_winner?: boolean; tracks: TrackLite | null }

const PAGE = 24

export default function DienosDainaArchive() {
  const [winners, setWinners] = useState<Winner[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [years, setYears] = useState<string[]>([])
  const [year, setYear] = useState<string>('')
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [parts, setParts] = useState<Record<string, Participant[] | 'loading'>>({})
  const [track, setTrack] = useState<any | null>(null)
  const reqId = useRef(0)

  // debounce paieška
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 350)
    return () => clearTimeout(t)
  }, [qInput])

  const fetchPage = useCallback((offset: number, withMeta: boolean) => {
    const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) })
    if (year) params.set('year', year)
    if (q.length >= 2) params.set('q', q)
    if (withMeta) params.set('meta', '1')
    return fetch(`/api/dienos-daina/archive?${params}`).then(r => r.json())
  }, [year, q])

  // pirmas + filtrų pasikeitimas → reset
  useEffect(() => {
    const id = ++reqId.current
    setLoading(true); setExpanded(null)
    fetchPage(0, years.length === 0).then((d) => {
      if (id !== reqId.current) return
      setWinners(d.winners || [])
      setTotal(d.total || 0)
      setHasMore(!!d.has_more)
      if (d.years) setYears(d.years)
      setLoading(false)
    }).catch(() => { if (id === reqId.current) setLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, q])

  const loadMore = useCallback(() => {
    if (loadingMore) return
    setLoadingMore(true)
    fetchPage(winners.length, false).then((d) => {
      setWinners(prev => [...prev, ...(d.winners || [])])
      setHasMore(!!d.has_more)
      setLoadingMore(false)
    }).catch(() => setLoadingMore(false))
  }, [winners.length, loadingMore, fetchPage])

  const toggle = useCallback((w: Winner) => {
    setExpanded(prev => prev === w.date ? null : w.date)
    if (expanded !== w.date && (w.nom_count || 0) > 0 && !parts[w.date]) {
      setParts(prev => ({ ...prev, [w.date]: 'loading' }))
      fetch(`/api/dienos-daina/day?date=${w.date}`).then(r => r.json())
        .then(d => setParts(prev => ({ ...prev, [w.date]: (d.participants || []).filter((n: any) => n.tracks) })))
        .catch(() => setParts(prev => ({ ...prev, [w.date]: [] })))
    }
  }, [expanded, parts])

  const openTrack = (t: TrackLite | null) => { if (t) setTrack({ id: t.id, title: t.title, slug: t.slug ?? null, cover_url: t.cover_url ?? null, video_url: t.video_url ?? null, artists: t.artists }) }

  const Thumb = ({ t, size = 46, onClick }: { t: TrackLite | null; size?: number; onClick?: (e: React.MouseEvent) => void }) => {
    const img = t ? trackImg(t) : null
    const inner = img ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={proxyImg(img)} alt="" loading="lazy" className="h-full w-full object-cover" />
    ) : <div className="flex h-full w-full items-center justify-center" style={{ background: `hsl(${hue(t?.title || '')},30%,28%)` }} />
    return (
      <button type="button" onClick={onClick} aria-label="Atidaryti dainą"
        className="group/th relative shrink-0 cursor-pointer overflow-hidden rounded-[8px] border-0 bg-transparent p-0" style={{ width: size, height: size }}>
        {inner}
        <span className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover/th:opacity-100">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
        </span>
      </button>
    )
  }

  return (
    <section className="mt-9">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="m-0 font-['Outfit',sans-serif] text-[20px] font-extrabold tracking-[-0.01em] text-[var(--text-primary)]">Visų laikų archyvas</h2>
          <p className="m-0 mt-0.5 text-[14px] text-[var(--text-muted)]">Kiekvienos dienos laimėtojas — spustelėk dieną dalyviams ir komentarams pamatyti.</p>
        </div>
        {total > 0 && <span className="text-[14px] font-semibold text-[var(--text-muted)]">{total.toLocaleString('lt-LT')} dienų</span>}
      </div>

      {/* filtrai */}
      <div className="mb-4 flex flex-col gap-2.5">
        <div className="relative">
          <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <input value={qInput} onChange={e => setQInput(e.target.value)} placeholder="Ieškoti dainos ar atlikėjo…"
            className="w-full rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-surface)] py-2 pl-9 pr-3 text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-orange)]" />
        </div>
        {years.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
            <Chip active={year === ''} onClick={() => setYear('')}>Visi</Chip>
            {years.map(y => <Chip key={y} active={year === y} onClick={() => setYear(year === y ? '' : y)}>{y}</Chip>)}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[68px] animate-pulse rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]" style={{ opacity: 1 - i * 0.12 }} />
          ))}
        </div>
      ) : winners.length === 0 ? (
        <div className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-10 text-center text-[14px] text-[var(--text-muted)]">
          {q || year ? 'Pagal filtrą nieko nerasta.' : 'Archyvas tuščias.'}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {winners.filter(w => w.tracks).map(w => {
            const t = w.tracks!
            const isOpen = expanded === w.date
            const pts = w.weighted_votes || w.total_votes || 0
            const nc = w.nom_count || 0
            const p = parts[w.date]
            return (
              <div key={w.id} className={`overflow-hidden rounded-[12px] border bg-[var(--bg-surface)] transition-colors ${isOpen ? 'border-[var(--accent-orange)]' : 'border-[var(--border-subtle)] hover:border-[var(--border-default)]'}`}>
                {/* eilutės antraštė */}
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <Thumb t={t} size={46} onClick={(e) => { e.stopPropagation(); openTrack(t) }} />
                  <button type="button" onClick={() => toggle(w)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-['Outfit',sans-serif] text-[14px] font-extrabold text-[var(--text-primary)]">{sani(t.title)}</span>
                      </div>
                      <span className="block truncate text-[14px] text-[var(--text-muted)]">{t.artists?.name}</span>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[14px] text-[var(--text-faint,var(--text-muted))]">
                        <span>{fmtDate(w.date)}</span>
                        {w.proposer && <span>· siūlė <b className="font-semibold text-[var(--text-muted)]">{uname(w.proposer)}</b></span>}
                        {pts > 0 && <span>· {pts} {ptsWord(pts)}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {nc > 1 && <span className="hidden rounded-full bg-[var(--bg-elevated,rgba(127,127,127,0.12))] px-2 py-0.5 text-[12px] font-bold text-[var(--text-muted)] sm:inline">{nc} dalyviai</span>}
                      <svg className={`text-[var(--text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                    </div>
                  </button>
                </div>

                {/* išskleista */}
                {isOpen && (
                  <div className="border-t border-[var(--border-subtle)] px-3 py-3">
                    {w.winning_comment && (
                      <p className="m-0 mb-3 rounded-[10px] bg-[var(--bg-elevated,rgba(127,127,127,0.08))] px-3 py-2 text-[14px] italic leading-relaxed text-[var(--text-secondary,var(--text-muted))]">„{sani(w.winning_comment)}"</p>
                    )}
                    {nc === 0 ? (
                      <p className="m-0 text-[14px] text-[var(--text-muted)]">Archyvinė diena — atskirų dalyvių duomenų neišliko.</p>
                    ) : p === 'loading' || p === undefined ? (
                      <p className="m-0 text-[14px] text-[var(--text-muted)]">Kraunama…</p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <span className="mb-0.5 font-['Outfit',sans-serif] text-[12px] font-extrabold uppercase tracking-[0.13em] text-[var(--text-muted)]">Tos dienos dalyviai</span>
                        {p.map((n, i) => {
                          const nt = n.tracks!
                          const isWinner = !!n.is_winner
                          const np = n.points || 0
                          const isLikes = n.likes !== undefined
                          const voterNames = (n.voters || []).map(uname)
                          return (
                            <div key={n.id} className={`flex items-center gap-2.5 rounded-[9px] border px-2.5 py-2 ${isWinner ? 'border-[rgba(251,191,36,0.45)] bg-[rgba(251,191,36,0.08)]' : 'border-[var(--border-subtle)] bg-[var(--bg-primary)]'}`}>
                              <span className="w-4 shrink-0 text-center font-['Outfit',sans-serif] text-[14px] font-black text-[var(--text-muted)]">{i + 1}</span>
                              {n.proposer && <span title={uname(n.proposer)} className="flex shrink-0"><Avatar src={n.proposer.avatar_url} name={uname(n.proposer)} size={22} /></span>}
                              <Thumb t={nt} size={34} onClick={(e) => { e.stopPropagation(); openTrack(nt) }} />
                              <button type="button" onClick={() => openTrack(nt)} className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left">
                                <span className="block truncate text-[14px] font-bold text-[var(--text-primary)]">{sani(nt.title)}</span>
                                <span className="block truncate text-[14px] text-[var(--text-muted)]">{nt.artists?.name}{n.proposer ? ` · ${uname(n.proposer)}` : ''}</span>
                                {n.comment && <span className="mt-0.5 block truncate text-[14px] italic text-[var(--text-muted)]">„{sani(n.comment)}"</span>}
                                {voterNames.length > 0 && <span className="mt-0.5 block truncate text-[12px] text-[var(--text-faint,var(--text-muted))]">balsavo: {voterNames.join(', ')}{n.anon_votes ? `, +${n.anon_votes}` : ''}</span>}
                              </button>
                              <span className="flex shrink-0 items-center gap-1.5">
                                {isWinner && <span className="rounded-full bg-[rgba(251,191,36,0.18)] px-2 py-0.5 text-[12px] font-extrabold uppercase tracking-wide text-[#d99e16]">Laimėjo</span>}
                                {np > 0 && (
                                  isLikes
                                    ? <span className="flex items-center gap-1 text-[14px] font-bold text-[var(--text-muted)]"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.9 8.8-8.9a5.5 5.5 0 0 0 0-7.8z" /></svg>{np}</span>
                                    : <span className="text-[14px] font-bold text-[var(--text-muted)]">{np} {ptsWord(np)}</span>
                                )}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {hasMore && (
            <button type="button" onClick={loadMore} disabled={loadingMore}
              className="mt-2 self-center rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-6 py-2.5 font-['Outfit',sans-serif] text-[14px] font-extrabold text-[var(--text-primary)] transition-colors hover:border-[var(--accent-orange)] hover:text-[var(--accent-orange)] disabled:opacity-50">
              {loadingMore ? 'Kraunama…' : 'Rodyti daugiau'}
            </button>
          )}
        </div>
      )}

      {track && <HomeTrackModal track={track} onClose={() => setTrack(null)} />}
    </section>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`shrink-0 cursor-pointer rounded-full border px-3.5 py-1.5 font-['Outfit',sans-serif] text-[14px] font-bold transition-colors ${
        active ? 'border-[var(--accent-orange)] bg-[var(--accent-orange)] text-white' : 'border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:border-[var(--accent-orange)] hover:text-[var(--text-primary)]'
      }`}>
      {children}
    </button>
  )
}
