'use client'

// components/DienosDainaHero.tsx
//
// „Dienos daina" hero — VIENAS bendras komponentas /atrasti hub'ui IR
// /dienos-daina puslapiui (2026-06-14 ekstrahuota iš app/atrasti/page.tsx,
// kad nebūtų dviejų skirtingų to paties dalyko versijų).
//
// fullPage prop:
//   - false (/atrasti): fiksuoto aukščio 540px kortelė, vidinis scroll, „Vakar
//     laimėjo" rodo tik laimėtoją (vietos taupymas hub'e).
//   - true (/dienos-daina): kortelė auga natūraliai — VISI šiandienos kandidatai
//     matomi be scroll'o, o „Vakar" sekcija rodo PILNAI: laimėtoją + visus tos
//     dienos dalyvius ta pačia eilučių stilistika.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { proxyImg } from '@/lib/img-proxy'
import { HomeListModal } from '@/components/HomeListModal'
import { HomeTrackModal } from '@/components/HomeTrackModal'
import { DainaSuggestModal } from '@/components/DienosDainaSection'

// ───────────────────────── private helpers (self-contained) ─────────────────────────
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
  // Originalus username (be priverstinės didžiosios raidės).
  return (a?.username || a?.full_name || 'narys').trim() || 'narys'
}
function Ic({ d, size = 14, filled = false }: { d: string; size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d={d} />
    </svg>
  )
}
const I = {
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.9 8.8-8.9a5.5 5.5 0 0 0 0-7.8z',
  play: 'M8 5v14l11-7z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
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
  return (
    <span className="flex items-center gap-[3px]" aria-label={`Balsų lygis ${level}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={`h-[3px] rounded-[2px] ${i < level ? 'bg-[var(--accent-orange)]' : onDark ? 'bg-[var(--border-default)]' : 'bg-[var(--border-default)]'}`} style={{ width: w }} />
      ))}
    </span>
  )
}
function ytHQ(url: string | null): string | null {
  if (!url) return null
  return url.replace(/\/(mq|hq|sd)default\.jpg/, '/maxresdefault.jpg')
}
function trackImg(t: TrackLite | null): string | null {
  if (!t) return null
  const yt = extractYouTubeId(t.video_url)
  return ytHQ(t.cover_url) || (yt ? `https://img.youtube.com/vi/${yt}/maxresdefault.jpg` : null) || t.artists?.cover_image_url || null
}
function ytFallback(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget
  if (img.src.includes('/maxresdefault.')) img.src = img.src.replace('/maxresdefault.', '/hqdefault.')
}
function ptsWord(v: number): string {
  if (v === 1) return 'taškas'
  const lastTwo = v % 100; const last = v % 10
  if (last >= 2 && last <= 9 && !(lastTwo >= 11 && lastTwo <= 19)) return 'taškai'
  return 'taškų'
}
// „Vakar laimėjo" tik kai laimėtojo data tikrai vakar; kitaip nemeluojam —
// laimėtojas grąžinamas naujausias, bet jis gali būti senesnis (kai praeitą
// dieną nebuvo dalyvių / laimėtojo). 2026-06-17.
function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const LT_MONTHS = ['sausio', 'vasario', 'kovo', 'balandžio', 'gegužės', 'birželio', 'liepos', 'rugpjūčio', 'rugsėjo', 'spalio', 'lapkričio', 'gruodžio']
function formatLtDate(date: string): string {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return date
  return `${LT_MONTHS[parseInt(m[2]) - 1]} ${parseInt(m[3])} d.`
}
function winnerDayLabel(date?: string | null): string {
  if (!date) return 'Paskutinė laimėjusi'
  const today = new Date()
  const yest = new Date(today); yest.setDate(today.getDate() - 1)
  if (date === ymdLocal(today)) return 'Šiandien laimėjo'
  if (date === ymdLocal(yest)) return 'Vakar laimėjo'
  // Senesnis laimėtojas (vakar nebuvo dalyvių) — rodom tikslią datą, kad neklaidintų.
  return `Laimėjo ${formatLtDate(date)}`
}

// ───────────────────────── types ─────────────────────────
type Proposer = { username: string | null; full_name: string | null; avatar_url: string | null }
type TrackLite = { id: number; title: string; cover_url: string | null; slug?: string | null; video_url?: string | null; artists: { name: string; slug?: string | null; cover_image_url?: string | null } | null }
type Nomination = { id: number; votes: number; weighted_votes: number; comment?: string | null; tracks: TrackLite | null; proposer?: Proposer | null; own?: boolean }
type DainaWinner = { id: number; date: string; total_votes: number; weighted_votes: number; winning_comment?: string | null; proposer?: Proposer | null; tracks: TrackLite | null }

// ───────────────────────── Countdown ─────────────────────────
function Countdown() {
  const [txt, setTxt] = useState('')
  useEffect(() => {
    const tick = () => {
      const n = new Date(); const m = new Date(n); m.setHours(24, 0, 0, 0)
      const totalSec = Math.max(0, Math.floor((m.getTime() - n.getTime()) / 1000))
      const h = Math.floor(totalSec / 3600)
      const min = Math.floor((totalSec % 3600) / 60)
      const sec = totalSec % 60
      if (h >= 1) setTxt(min > 0 ? `~${h} val. ${min} min.` : `~${h} val.`)
      else setTxt(`${min}:${String(sec).padStart(2, '0')}`)
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [])
  return <b className="font-bold text-[var(--accent-orange)]" style={{ fontVariantNumeric: 'tabular-nums' }}>{txt}</b>
}

// ───────────────────────── Winners (history) modal ─────────────────────────
function WinnersModal({ onClose, onOpenTrack }: { onClose: () => void; onOpenTrack: (t: any) => void }) {
  const PAGE = 50
  const [list, setList] = useState<DainaWinner[] | null>(null)
  const [offset, setOffset] = useState(0)
  const [done, setDone] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const fetchPage = useCallback((off: number) => {
    return fetch(`/api/dienos-daina/winners?limit=${PAGE}&offset=${off}`).then(r => r.json())
  }, [])

  useEffect(() => {
    let on = true
    fetchPage(0).then(d => {
      if (!on) return
      const w = (d.winners || []) as DainaWinner[]
      setList(w)
      setOffset(w.length)
      if (w.length < PAGE) setDone(true)
    }).catch(() => { if (on) setList([]) })
    return () => { on = false }
  }, [fetchPage])

  const loadMore = useCallback(() => {
    if (loadingMore || done) return
    setLoadingMore(true)
    fetchPage(offset).then(d => {
      const w = (d.winners || []) as DainaWinner[]
      setList(prev => [...(prev || []), ...w])
      setOffset(prev => prev + w.length)
      if (w.length < PAGE) setDone(true)
    }).catch(() => {}).finally(() => setLoadingMore(false))
  }, [offset, loadingMore, done, fetchPage])

  return (
    <HomeListModal open onClose={onClose} title="Laimėjusios dainos" subtitle="Dienos dainų istorija">
      {list === null ? (
        <div className="py-8 text-center text-[14px] text-[var(--text-muted)]">Kraunama…</div>
      ) : list.length === 0 ? (
        <div className="py-8 text-center text-[14px] text-[var(--text-muted)]">Istorijos dar nėra.</div>
      ) : (
        <>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {list.filter(w => w.tracks).map(w => {
            const t = w.tracks!
            const img = trackImg(t)
            const meta = w.proposer ? `siūlė ${uname(w.proposer)}` : (w.total_votes > 1 ? `${w.total_votes} narių pasirinko` : null)
            return (
              <button key={w.id} type="button" onClick={() => { onClose(); onOpenTrack({ id: t.id, title: t.title, slug: t.slug, cover_url: t.cover_url, video_url: t.video_url, artists: t.artists }) }}
                className="hp-card group flex items-center gap-3 p-3 text-left">
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={proxyImg(img)} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                ) : <div className="h-12 w-12 shrink-0 rounded-lg" style={{ background: `hsl(${hue(t.title)},30%,18%)` }} />}
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate font-['Outfit',sans-serif] text-[16px] font-extrabold text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{sani(t.title)}</p>
                  <p className="m-0 truncate text-[14px] text-[var(--text-muted)]">{t.artists?.name}</p>
                  <p className="m-0 mt-0.5 text-[12px] text-[var(--text-faint)]">{w.date}{meta ? ` · ${meta}` : ''}</p>
                </div>
              </button>
            )
          })}
        </div>
        {!done && (
          <div className="mt-4 flex justify-center">
            <button type="button" onClick={loadMore} disabled={loadingMore}
              className="hp-card px-5 py-2 text-[14px] font-bold text-[var(--text-secondary)] disabled:opacity-50">
              {loadingMore ? 'Kraunama…' : 'Rodyti daugiau'}
            </button>
          </div>
        )}
        </>
      )}
    </HomeListModal>
  )
}
// ───────────────────────── HERO ─────────────────────────
export function DienosDainaHero({ fullPage = false }: { fullPage?: boolean }) {
  const [noms, setNoms] = useState<Nomination[]>([])
  const [winner, setWinner] = useState<DainaWinner | null>(null)
  const [ydayNoms, setYdayNoms] = useState<Nomination[]>([])
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
  useEffect(() => {
    if (!winner?.date) return
    let on = true
    fetch(`/api/dienos-daina/nominations?date=${winner.date}`).then(r => r.json()).then(d => { if (on) setYdayNoms(d.nominations || []) }).catch(() => {})
    return () => { on = false }
  }, [winner?.date])

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

  const winnerTrackId = winner?.tracks?.id
  const ydaySorted = useMemo(() => [...ydayNoms].filter(n => n.tracks && n.tracks.id !== winnerTrackId).sort((a, b) => (b.weighted_votes || b.votes || 0) - (a.weighted_votes || a.votes || 0)), [ydayNoms, winnerTrackId])
  const ydayMax = Math.max(1, winner?.weighted_votes || winner?.total_votes || 0, ...ydaySorted.map(n => n.weighted_votes || n.votes || 0))

  const leaderImg = leader ? trackImg(leader.tracks) : null

  if (loading) {
    return (
      <>
        <style>{`
          @keyframes atr-skel-pulse{0%,100%{opacity:1}50%{opacity:.45}}
          .atr-skel-card{background:var(--bg-surface);border:1px solid var(--border-default);animation:atr-skel-pulse 2s ease-in-out infinite;display:flex;align-items:center;justify-content:center}
          @keyframes eq-bar{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}
          .atr-eq{display:flex;align-items:end;gap:3px;height:20px}
          .atr-eq span{width:3px;border-radius:2px;background:var(--accent-orange);opacity:.45;animation:eq-bar 1s ease-in-out infinite;transform-origin:bottom}
          .atr-eq span:nth-child(1){height:20px;animation-delay:0s}
          .atr-eq span:nth-child(2){height:14px;animation-delay:.15s}
          .atr-eq span:nth-child(3){height:18px;animation-delay:.3s}
          .atr-eq span:nth-child(4){height:10px;animation-delay:.45s}
          .atr-eq span:nth-child(5){height:16px;animation-delay:.6s}
        `}</style>
        <div className={`atr-skel-card rounded-[20px] ${fullPage ? 'h-[460px]' : 'h-[420px] lg:h-[540px]'}`}><div className="atr-eq"><span /><span /><span /><span /><span /></div></div>
      </>
    )
  }

  // Šiandienos kandidatų eilutė (su balsavimu).
  const CandRow = ({ n }: { n: Nomination }) => {
    const t = n.tracks!
    const img = trackImg(t)
    const votes = n.weighted_votes || n.votes || 0
    const level = votes > 0 ? Math.max(1, Math.round((votes / maxVotes) * 5)) : 0
    const voted = votedIds.has(n.id)
    return (
      <div className="flex items-center gap-2.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-2.5 py-2 transition-colors hover:bg-[var(--card-hover)]">
        {n.proposer && (
          <span className="flex shrink-0 items-center" title={uname(n.proposer)}>
            <Avatar src={n.proposer.avatar_url} name={uname(n.proposer)} size={22} />
          </span>
        )}
        <button type="button" onClick={() => openTrack(t)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 border-0 bg-transparent p-0 text-left">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proxyImg(img)} alt="" loading="lazy" className="h-[34px] w-[34px] shrink-0 rounded-[7px] object-cover" />
          ) : <div className="h-[34px] w-[34px] shrink-0 rounded-[7px]" style={{ background: `hsl(${hue(t.title)},30%,18%)` }} />}
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-bold text-[var(--text-primary)]">{sani(t.title)}</span>
            <span className="block truncate text-[14px] text-[var(--text-muted)]">{t.artists?.name}</span>
            {level > 0 && <div className="mt-1"><PopBar level={level} w={9} onDark /></div>}
          </div>
        </button>
        {n.comment && <span className="hidden shrink-0 truncate text-[14px] italic text-[var(--text-muted)] sm:block sm:max-w-[140px]">{n.comment}</span>}
        {n.own ? (
          <span className="shrink-0 rounded-lg border border-dashed border-[var(--border-strong)] px-2.5 py-1 font-['Outfit',sans-serif] text-[12px] font-bold text-[var(--text-muted)]">Tavo</span>
        ) : (
          <button type="button" onClick={() => handleVote(n.id)} disabled={voted || voting !== null}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-['Outfit',sans-serif] text-[16px] font-extrabold transition-colors ${
              voted ? 'border-[rgba(249,115,22,0.5)] bg-[rgba(249,115,22,0.16)] text-[var(--accent-orange)]' : 'border-[var(--border-strong)] text-[var(--text-secondary)] hover:border-[var(--accent-orange)] hover:text-[var(--accent-orange)]'
            }`}>
            <Ic d={I.heart} size={11} filled={voted} /> {voting === n.id ? '…' : voted ? 'Balsuota' : 'Balsuok'}
          </button>
        )}
      </div>
    )
  }

  // Vakar dienos dalyvio eilutė (be balsavimo — diena baigta; rodom taškus).
  const PastRow = ({ n, rank }: { n: Nomination; rank: number }) => {
    const t = n.tracks!
    const img = trackImg(t)
    const votes = n.weighted_votes || n.votes || 0
    const level = votes > 0 ? Math.max(1, Math.round((votes / ydayMax) * 5)) : 0
    return (
      <button type="button" onClick={() => openTrack(t)} className="flex w-full items-center gap-2.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--card-hover)]">
        <span className="w-4 shrink-0 text-center font-['Outfit',sans-serif] text-[14px] font-black text-[var(--text-faint)]">{rank}</span>
        {n.proposer && (
          <span className="flex shrink-0 items-center" title={uname(n.proposer)}>
            <Avatar src={n.proposer.avatar_url} name={uname(n.proposer)} size={22} />
          </span>
        )}
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyImg(img)} alt="" loading="lazy" className="h-[34px] w-[34px] shrink-0 rounded-[7px] object-cover" />
        ) : <div className="h-[34px] w-[34px] shrink-0 rounded-[7px]" style={{ background: `hsl(${hue(t.title)},30%,18%)` }} />}
        <div className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-bold text-[var(--text-primary)]">{sani(t.title)}</span>
          <span className="block truncate text-[14px] text-[var(--text-muted)]">{t.artists?.name}</span>
          {level > 0 && <div className="mt-1"><PopBar level={level} w={9} onDark /></div>}
        </div>
        <span className="shrink-0 text-[14px] font-bold text-[var(--text-muted)]">{votes} {ptsWord(votes)}</span>
      </button>
    )
  }

  // Container aukštis: hub'e fiksuotas (540px su vidiniu scroll'u), puslapyje auga.
  const containerH = fullPage ? '' : 'lg:h-[540px]'
  // Kandidatų sąrašas: hub'e scroll'inamas/flex-1; puslapyje natūralus aukštis (visi matomi).
  const candListCls = fullPage
    ? 'flex flex-col gap-[5px]'
    : 'flex min-h-0 flex-1 flex-col gap-[5px] overflow-y-auto pr-0.5 lg:pr-1.5 [&::-webkit-scrollbar-thumb]:rounded-[3px] [&::-webkit-scrollbar-thumb]:bg-[var(--card-hover)] [&::-webkit-scrollbar]:w-[6px]'
  const candSectionCls = fullPage
    ? 'relative flex flex-col border-t border-[var(--border-default)] px-4 pb-3 pt-3 sm:px-5'
    : 'relative flex min-h-0 flex-1 flex-col border-t border-[var(--border-default)] px-4 pb-2 pt-3 sm:px-5 lg:pb-1'

  return (
    <div id="dienos-daina" className={`relative flex flex-col overflow-hidden rounded-[20px] border border-[var(--border-default)] ${containerH}`} style={{ background: 'var(--bg-surface)', animation: 'atr-fade-in .4s ease-out both' }}>
      {/* self-contained animacijos/skeleton stiliai (kad veiktų ir už /atrasti ribų) */}
      <style>{`
        @keyframes atr-fade-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @keyframes atr-skel-pulse{0%,100%{opacity:1}50%{opacity:.45}}
        .atr-skel-card{background:var(--bg-surface);border:1px solid var(--border-default);animation:atr-skel-pulse 2s ease-in-out infinite;display:flex;align-items:center;justify-content:center}
        @keyframes eq-bar{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}
        .atr-eq{display:flex;align-items:end;gap:3px;height:20px}
        .atr-eq span{width:3px;border-radius:2px;background:var(--accent-orange);opacity:.45;animation:eq-bar 1s ease-in-out infinite;transform-origin:bottom}
        .atr-eq span:nth-child(1){height:20px;animation-delay:0s}
        .atr-eq span:nth-child(2){height:14px;animation-delay:.15s}
        .atr-eq span:nth-child(3){height:18px;animation-delay:.3s}
        .atr-eq span:nth-child(4){height:10px;animation-delay:.45s}
        .atr-eq span:nth-child(5){height:16px;animation-delay:.6s}
      `}</style>
      {/* fonas iš lyderio cover */}
      <div className="absolute inset-0">
        {leaderImg && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyImg(leaderImg)} alt="" onError={ytFallback} className="h-full w-full object-cover opacity-30" style={{ filter: 'blur(40px) saturate(1.3)', transform: 'scale(1.3)' }} />
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(100deg, color-mix(in srgb, var(--bg-surface) 95%, transparent) 0%, color-mix(in srgb, var(--bg-surface) 80%, transparent) 60%, rgba(249,115,22,0.12) 100%)' }} />
      </div>

      {/* lyderis */}
      <div className="relative px-5 pb-4 pt-3 sm:px-6 sm:pt-5">
        {leader ? (
          <>
            {/* „DIENOS DAINA" + countdown — visada VIRŠ #1 vizualo (#1) */}
            <div className="flex items-center gap-2 font-['Outfit',sans-serif] text-[12px] font-extrabold uppercase tracking-[0.16em] text-[var(--accent-orange)]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent-orange)]" /> Dienos daina
              <span className="ml-auto flex items-center gap-1.5 text-[12px] font-bold normal-case tracking-normal text-[var(--text-muted)]"><Ic d={I.clock} size={11} /> liko <Countdown /></span>
            </div>
            <div className="mt-3 flex items-center gap-4 sm:gap-5">
              <button type="button" onClick={() => openTrack(leader.tracks!)} className="group relative shrink-0 cursor-pointer border-0 bg-transparent p-0">
                <div className="relative h-[96px] w-[96px] overflow-hidden rounded-[14px] shadow-[0_18px_50px_rgba(0,0,0,0.55)] sm:h-[140px] sm:w-[140px]">
                  {leaderImg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proxyImg(leaderImg)} alt="" onError={ytFallback} className="h-full w-full object-cover" />
                  ) : <div className="h-full w-full" style={{ background: `hsl(${hue(leader.tracks!.title)},30%,18%)` }} />}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-orange)] text-white shadow-[0_8px_24px_rgba(249,115,22,0.5)]"><Ic d={I.play} size={18} filled /></span>
                  </div>
                </div>
                <span className="absolute -left-2 -top-2 rounded-[9px] bg-[var(--accent-orange)] px-2 py-1 font-['Outfit',sans-serif] text-[14px] font-black text-white shadow-[0_6px_16px_rgba(249,115,22,0.45)]">#1</span>
              </button>
              <div className="min-w-0 flex-1">
                <h2 className="m-0 line-clamp-2 font-['Outfit',sans-serif] text-[20px] font-black leading-[1.1] tracking-[-0.02em] text-[var(--text-primary)] sm:text-[28px]">{sani(leader.tracks!.title)}</h2>
                <p className="m-0 mt-0.5 line-clamp-1 text-[14px] font-semibold text-[var(--text-secondary)] sm:text-[14px]">{leader.tracks!.artists?.name}</p>
                {leader.comment && <p className="m-0 mt-2 line-clamp-2 text-[14px] italic leading-snug text-[var(--text-secondary)]">„{leader.comment}"</p>}
                {leader.proposer && (
                  <div className="mt-2 flex items-center gap-2 text-[14px] text-[var(--text-muted)]">
                    <Avatar src={leader.proposer.avatar_url} name={uname(leader.proposer)} size={20} />
                    <b className="font-semibold text-[var(--text-primary)]">{uname(leader.proposer)}</b>
                  </div>
                )}
                <div className="mt-3 flex items-center gap-3">
                  <PopBar level={Math.max(1, Math.round(((leader.weighted_votes || leader.votes || 0) / maxVotes) * 5))} onDark />
                  {!leader.own && (
                    <button type="button" onClick={() => handleVote(leader.id)} disabled={votedIds.has(leader.id) || voting !== null}
                      className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 font-['Outfit',sans-serif] text-[16px] font-extrabold transition-colors ${
                        votedIds.has(leader.id) ? 'border-[rgba(249,115,22,0.5)] bg-[rgba(249,115,22,0.16)] text-[var(--accent-orange)]' : 'border-[var(--border-strong)] text-[var(--text-secondary)] hover:border-[var(--accent-orange)] hover:text-[var(--accent-orange)]'
                      }`}>
                      <Ic d={I.heart} size={12} filled={votedIds.has(leader.id)} /> {voting === leader.id ? '…' : votedIds.has(leader.id) ? 'Balsuota' : 'Balsuok'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex w-full flex-col items-start gap-3.5 py-4 sm:py-5">
            <div className="flex w-full items-center gap-2 font-['Outfit',sans-serif] text-[12px] font-extrabold uppercase tracking-[0.16em] text-[var(--accent-orange)]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent-orange)]" /> Dienos daina
              <span className="ml-auto flex items-center gap-1.5 text-[12px] font-bold normal-case tracking-normal text-[var(--text-muted)]"><Ic d={I.clock} size={11} /> liko <Countdown /></span>
            </div>
            <p className="m-0 text-[16px] font-bold leading-snug text-[var(--text-primary)]">Šiandien dar nėra pasiūlymų — tavo daina gali būti pirma.</p>
            <button type="button" onClick={() => setSuggestOpen(true)} className="mt-1 cursor-pointer rounded-xl border-0 bg-[var(--accent-orange)] px-5 py-2.5 font-['Outfit',sans-serif] text-[16px] font-extrabold text-white shadow-[0_6px_20px_rgba(249,115,22,0.35)]">+ Pasiūlyti dainą</button>
          </div>
        )}
      </div>

      {/* šiandienos kandidatai */}
      {(rest.length > 0 || (leader && !alreadyNominated)) && (
        <div className={candSectionCls}>
          <div className="mb-2 flex shrink-0 items-center justify-between px-1">
            <span className="font-['Outfit',sans-serif] text-[12px] font-extrabold uppercase tracking-[0.14em] text-[var(--text-muted)]">Siūlomos dainos</span>
            <div className="flex items-center gap-3">
              {voteErr && <span className="text-[14px] font-bold text-[#f87171]">{voteErr}</span>}
              {!alreadyNominated && (
                <button type="button" onClick={() => setSuggestOpen(true)} className="cursor-pointer border-0 bg-transparent p-0 font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--accent-orange)] transition-opacity hover:opacity-70">+ Pasiūlyk savo dainą</button>
              )}
            </div>
          </div>
          <div className={candListCls}>
            {rest.map(n => <CandRow key={n.id} n={n} />)}
            {rest.length === 0 && <p className="m-0 px-1 py-2 text-[14px] text-[var(--text-muted)]">Kol kas vienintelis kandidatas — pasiūlyk alternatyvą!</p>}
          </div>
        </div>
      )}

      {/* vakar laimėjo + (fullPage) visi tos dienos dalyviai */}
      {winner?.tracks && (
        <div className="relative shrink-0 border-t border-[var(--border-default)] px-4 pb-3 pt-3 sm:px-5">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="font-['Outfit',sans-serif] text-[12px] font-extrabold uppercase tracking-[0.14em] text-[var(--text-faint)]">{winnerDayLabel(winner.date)}{fullPage && ydaySorted.length > 0 ? ' · visi dalyviai' : ''}</span>
            <button type="button" onClick={() => setWinnersOpen(true)} className="shrink-0 cursor-pointer border-0 bg-transparent p-0 font-['Outfit',sans-serif] text-[14px] font-bold text-[#fbbf24] transition-opacity hover:opacity-70">Visos →</button>
          </div>
          <div className="flex flex-col gap-[5px]">
            {/* laimėtojas */}
            <button type="button" onClick={() => openTrack(winner.tracks!)} className="flex items-center gap-2.5 rounded-[10px] border border-[rgba(251,191,36,0.18)] bg-[rgba(251,191,36,0.06)] px-2.5 py-2 text-left transition-colors hover:bg-[rgba(251,191,36,0.12)]">
              {fullPage && <span className="w-4 shrink-0 text-center font-['Outfit',sans-serif] text-[14px] font-black text-[#fbbf24]">1</span>}
              {winner.proposer && (
                <span className="flex shrink-0 items-center" title={uname(winner.proposer)}>
                  <Avatar src={winner.proposer.avatar_url} name={uname(winner.proposer)} size={22} />
                </span>
              )}
              {trackImg(winner.tracks) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={proxyImg(trackImg(winner.tracks)!)} alt="" loading="lazy" className="h-[34px] w-[34px] shrink-0 rounded-[7px] object-cover" />
              ) : <div className="h-[34px] w-[34px] shrink-0 rounded-[7px]" style={{ background: `hsl(${hue(winner.tracks.title)},30%,18%)` }} />}
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-baseline gap-1.5">
                  <span className="truncate text-[14px] font-bold text-[var(--text-primary)]">{sani(winner.tracks.title)}</span>
                  <span className="truncate text-[14px] text-[var(--text-secondary)]">{winner.tracks.artists?.name}</span>
                </div>
                <div className="mt-1"><PopBar level={5} w={9} onDark /></div>
              </div>
              <span className="shrink-0 rounded-full bg-[rgba(251,191,36,0.16)] px-2 py-0.5 text-[12px] font-extrabold uppercase tracking-wide text-[#fbbf24]">Laimėjo</span>
            </button>
            {/* visi kiti tos dienos dalyviai (tik fullPage) */}
            {fullPage && ydaySorted.map((n, i) => <PastRow key={n.id} n={n} rank={i + 2} />)}
          </div>
        </div>
      )}

      {suggestOpen && <DainaSuggestModal onClose={() => setSuggestOpen(false)} onDone={load} />}
      {winnersOpen && <WinnersModal onClose={() => setWinnersOpen(false)} onOpenTrack={setTrack} />}
      {track && <HomeTrackModal track={track} onClose={() => setTrack(null)} />}
    </div>
  )
}

export default DienosDainaHero
