'use client'

// app/zaidimai/ZaidimaiHubClient.tsx
//
// Master landing — MINIMALUS (Edvardo feedback: „per daug teksto, baisios
// emoji ikonos"): hero be paaiškinimų, žaidimų eilutės tik su pavadinimu,
// line-style SVG ikonos, viskas pilname ekrane be svetainės footer.

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import ZaidimoLangas from '@/components/zaidimai/ZaidimoLangas'
import type { LeaderRow, DailyTopRow } from './page'

type Props = {
  isAuthenticated: boolean
  username: string | null
  me: { totalXp: number; streak: number }
  leaders: LeaderRow[]
  dailyTop: DailyTopRow[]
  fantasyTeam: string | null
  dailyRank: { score: number; maxScore: number | null; rank: number; total: number } | null
  today: {
    dailyPlayed: boolean
    quizRunsLeft: number
    vaizdasRunsLeft: number
    sekundesRunsLeft: number
    metaiRunsLeft: number
    duelVotesLeft: number
    duelPool: number
  }
}

/** Kiek liko iki naujo iššūkio (LT vidurnakčio) — „po 3 val. 12 min." */
function ikiRytojaus(): string {
  const lt = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Vilnius' }))
  const next = new Date(lt)
  next.setHours(24, 0, 0, 0)
  const min = Math.max(1, Math.round((next.getTime() - lt.getTime()) / 60000))
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `po ${h} val. ${m} min.` : `po ${m} min.`
}

const ic = (paths: ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths}</svg>
)

const ICONS = {
  zap: ic(<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />),
  headphones: ic(<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H3v-7a9 9 0 0 1 18 0v7h-3a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" />),
  disc: ic(<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="2.5" /></>),
  timer: ic(<><line x1="10" x2="14" y1="2" y2="2" /><line x1="12" x2="15" y1="14" y2="11" /><circle cx="12" cy="14" r="8" /></>),
  calendar: ic(<><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></>),
  swords: ic(<><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" /><line x1="13" x2="19" y1="19" y2="13" /><line x1="16" x2="20" y1="16" y2="20" /><line x1="19" x2="21" y1="21" y2="19" /><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5" /><line x1="5" x2="9" y1="14" y2="18" /><line x1="7" x2="4" y1="17" y2="20" /><line x1="3" x2="5" y1="19" y2="21" /></>),
  briefcase: ic(<><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>),
}

export default function ZaidimaiHubClient({ isAuthenticated, username, me, leaders, dailyTop, fantasyTeam, dailyRank, today }: Props) {
  const [liko, setLiko] = useState('')
  useEffect(() => {
    if (!today.dailyPlayed) return
    setLiko(ikiRytojaus())
    const t = setInterval(() => setLiko(ikiRytojaus()), 60000)
    return () => clearInterval(t)
  }, [today.dailyPlayed])

  // Dienos iššūkio žingsniai (rodomi hero, kad būtų aišku, jog tai kelios užduotys)
  const zingsniai = ['5 dainos', 'Dvikova', 'Verdiktas', 'Vaizdas']

  // Būsena dešinėje: 'play' = dar gali gauti taškų, 'done' = šiandien atlikta,
  // 'none' = be dienos limito (vadybininkas).
  type Busena = 'play' | 'done' | 'none'
  const busena = (runsLeft: number): Busena => (runsLeft > 0 ? 'play' : 'done')
  const games: Array<{ href: string; icon: ReactNode; title: string; state: Busena }> = [
    { href: '/zaidimai/dainu-kvizas', icon: ICONS.headphones, title: 'Atspėk dainą', state: busena(today.quizRunsLeft) },
    { href: '/zaidimai/atspek-is-sekundes', icon: ICONS.timer, title: 'Atspėk iš sekundės', state: busena(today.sekundesRunsLeft) },
    { href: '/zaidimai/atspek-is-vaizdo', icon: ICONS.disc, title: 'Atspėk iš vaizdo', state: busena(today.vaizdasRunsLeft) },
    { href: '/zaidimai/kurie-metai', icon: ICONS.calendar, title: 'Kurie metai?', state: busena(today.metaiRunsLeft) },
    { href: '/zaidimai/dvikovos', icon: ICONS.swords, title: 'Dainų dvikovos', state: busena(today.duelVotesLeft) },
    { href: '/zaidimai/vadybininkas', icon: ICONS.briefcase, title: 'Muzikos vadybininkas', state: 'none' },
  ]

  const playIcon = (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
  )
  const doneIcon = (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
  )

  return (
    <ZaidimoLangas
      title="Žaidimai"
      backHref="/"
      maxWidth={680}
      right={
        <>
          <span className="zh-chip">⚡ {me.totalXp.toLocaleString('lt-LT')}</span>
          {me.streak > 1 && <span className="zh-chip">🔥 {me.streak} d.</span>}
        </>
      }
    >
      <style>{css}</style>

      {/* Dienos iššūkis — pagrindinis kelias, su žingsniais ir būsena */}
      <Link href="/zaidimai/dienos" className={`zh-daily${today.dailyPlayed ? ' done' : ''}`}>
        <div className="zh-daily-top">
          <span className="zh-daily-icon">{ICONS.zap}</span>
          <span className="zh-daily-title">Dienos iššūkis</span>
          <span className="zh-daily-cta">{today.dailyPlayed ? '✓ Įveikta' : 'Pradėti'}</span>
        </div>
        {today.dailyPlayed ? (
          <span className="zh-daily-state">
            {dailyRank
              ? <>{dailyRank.score} tšk. · esi <b>#{dailyRank.rank}</b> iš {dailyRank.total}{liko ? ` · naujas ${liko}` : ''}</>
              : (liko ? `naujas ${liko}` : 'grįžk rytoj')}
          </span>
        ) : (
          <div className="zh-steps">
            {zingsniai.map((z, i) => (
              <span key={z} className="zh-step">{i + 1}. {z}</span>
            ))}
          </div>
        )}
      </Link>

      <h2 className="zh-sec">Žaisk po vieną</h2>
      <div className="zh-rows">
        {games.map(g => (
          <Link key={g.href} href={g.href} className="zh-row">
            <span className="zh-row-icon">{g.icon}</span>
            <span className="zh-row-title">{g.title}</span>
            {g.state === 'play' && <span className="zh-state play" title="Šiandien dar gali gauti taškų">{playIcon}</span>}
            {g.state === 'done' && <span className="zh-state done" title="Šiandien taškai jau surinkti">{doneIcon}</span>}
            <svg className="zh-row-go" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          </Link>
        ))}
      </div>

      {!isAuthenticated && (
        <div className="zh-cta">
          <Link href="/auth/prisijungti">Prisijunk</Link> — gausi <b>+50% taškų</b> ir vardą lyderių lentelėje.
        </div>
      )}

      <div className="zh-boards">
        <div className="zh-board">
          <h3 className="zh-h3">Šiandienos iššūkis</h3>
          {dailyTop.length === 0 ? (
            <div className="zh-empty">Dar niekas nežaidė — būk pirmas!</div>
          ) : (
            <ol className="zh-list">
              {dailyTop.map((r, i) => (
                <li key={i} className="zh-li">
                  <span className={`zh-rank r${i + 1}`}>{i + 1}</span>
                  <span className="zh-name">{r.name}</span>
                  <span className="zh-val">{r.score} tšk.</span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="zh-board">
          <h3 className="zh-h3">Šios savaitės taškai</h3>
          {leaders.length === 0 ? (
            <div className="zh-empty">Lentelė laukia pirmųjų.</div>
          ) : (
            <ol className="zh-list">
              {leaders.slice(0, 5).map((l, i) => (
                <li key={i} className={`zh-li${!l.isAnon && username && l.name === username ? ' me' : ''}`}>
                  <span className={`zh-rank r${i + 1}`}>{i + 1}</span>
                  <span className="zh-name">{l.name}</span>
                  <span className="zh-val">{l.totalXp.toLocaleString('lt-LT')} tšk.</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </ZaidimoLangas>
  )
}

const css = `
.zh-chip {
  font-size: 13px; font-weight: 800; padding: 6px 12px; border-radius: 999px;
  background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.22); color: var(--text-primary);
}

.zh-daily {
  display: flex; flex-direction: column; gap: 12px; text-decoration: none;
  padding: 16px; border-radius: 14px; margin-bottom: 22px;
  background: var(--bg-surface);
  border: 1px solid rgba(140,160,190,0.25);
  border-left: 3px solid var(--accent-orange);
}
.zh-daily.done { border-left-color: var(--accent-green); }
.zh-daily-top { display: flex; align-items: center; gap: 11px; }
.zh-daily-icon { display: flex; color: var(--accent-orange); flex-shrink: 0; }
.zh-daily.done .zh-daily-icon { color: var(--accent-green); }
.zh-daily-title { font-size: 18px; font-weight: 900; color: var(--text-primary); letter-spacing: -0.01em; }
.zh-daily-state { font-size: 12.5px; color: var(--text-secondary); }
.zh-daily-state b { color: var(--text-primary); }
.zh-steps { display: flex; flex-wrap: wrap; gap: 6px; }
.zh-step { font-size: 11.5px; font-weight: 700; color: var(--text-secondary); background: color-mix(in srgb, var(--text-primary) 6%, transparent); border-radius: 7px; padding: 4px 9px; }
.zh-sec { font-size: 12px; font-weight: 900; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.07em; margin: 0 0 8px 2px; }
.zh-daily-cta {
  margin-left: auto; flex-shrink: 0; font-size: 14px; font-weight: 900; color: #fff;
  background: var(--accent-orange); border-radius: 999px; padding: 10px 22px;
}
.zh-daily.done .zh-daily-cta { background: var(--accent-green); }

.zh-rows { display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; }
.zh-row {
  display: flex; align-items: center; gap: 13px; text-decoration: none;
  padding: 15px 16px; border-radius: 13px;
  background: var(--bg-surface);
  border: 1px solid rgba(140,160,190,0.18);
  transition: border-color .13s ease;
}
.zh-row:hover { border-color: var(--accent-orange); }
.zh-row-icon { display: flex; color: var(--text-secondary); flex-shrink: 0; }
.zh-row-title { font-size: 16px; font-weight: 800; color: var(--text-primary); margin-right: auto; }
.zh-state { display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0; }
.zh-state.play { background: color-mix(in srgb, var(--accent-orange) 18%, transparent); color: var(--accent-orange); }
.zh-state.done { background: color-mix(in srgb, var(--accent-green) 18%, transparent); color: var(--accent-green); }
.zh-row-go { flex-shrink: 0; color: var(--text-muted); }

.zh-cta {
  font-size: 13.5px; color: var(--text-secondary); background: var(--bg-surface);
  border: 1px dashed rgba(140,160,190,0.35); border-radius: 12px; padding: 11px 15px; margin-bottom: 20px;
}
.zh-cta a { color: var(--accent-orange); font-weight: 800; text-decoration: none; }
.zh-cta b { color: var(--text-primary); }

.zh-boards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
@media (max-width: 560px) { .zh-boards { grid-template-columns: 1fr; } }
.zh-board { background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.18); border-radius: 13px; padding: 13px 14px; }
.zh-h3 { font-size: 13px; font-weight: 900; color: var(--text-primary); margin: 0 0 9px; }
.zh-empty { font-size: 12px; color: var(--text-muted); }
.zh-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.zh-li { display: flex; align-items: center; gap: 9px; font-size: 13.5px; padding: 5px 6px; border-radius: 8px; }
.zh-li.me { outline: 1px solid rgba(249,115,22,0.5); }
.zh-li:nth-child(odd) { background: color-mix(in srgb, var(--text-primary) 4%, transparent); }
.zh-rank {
  width: 22px; height: 22px; border-radius: 7px; display: flex; align-items: center; justify-content: center;
  font-weight: 900; font-size: 11px; background: color-mix(in srgb, var(--text-primary) 8%, transparent); color: var(--text-secondary); flex-shrink: 0;
}
.zh-rank.r1 { background: var(--accent-orange); color: #fff; }
.zh-name { font-weight: 700; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.zh-val { margin-left: auto; font-weight: 800; color: var(--text-primary); white-space: nowrap; font-size: 12px; }
`
