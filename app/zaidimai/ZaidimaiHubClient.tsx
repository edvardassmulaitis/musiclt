'use client'

// app/zaidimai/ZaidimaiHubClient.tsx
//
// Žaidimų DASHBOARD — super paprastas, be scroll'o ant mobile:
//   1. viena didelė CTA į dienos iššūkį + checklist (kas atlikta)
//   2. dvi būsenos plytelės (serija, vieta / taškai)
//   3. kompaktiškas šiandienos scoreboard
//   4. muzikos vadybininkas — atskiras veiksmas
// Pavieniai greitieji žaidimai čia neberodomi (fokusas į kasdienį žaidimą).

import Link from 'next/link'
import { useEffect, useState } from 'react'
import ZaidimoLangas from '@/components/zaidimai/ZaidimoLangas'
import type { DailyStep, DailyTopRow } from './page'

type Props = {
  isAuthenticated: boolean
  streak: number
  totalXp: number
  daily: {
    steps: DailyStep[]
    doneCount: number
    total: number
    allDone: boolean
    rank: { score: number; rank: number; total: number } | null
  }
  todayTop: DailyTopRow[]
  fantasyTeam: string | null
}

/** Kiek liko iki naujo iššūkio (LT vidurnaktis). */
function ikiRytojaus(): string {
  const lt = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Vilnius' }))
  const next = new Date(lt)
  next.setHours(24, 0, 0, 0)
  const min = Math.max(1, Math.round((next.getTime() - lt.getTime()) / 60000))
  const h = Math.floor(min / 60)
  return h > 0 ? `${h} val. ${min % 60} min.` : `${min % 60} min.`
}

export default function ZaidimaiHubClient({ isAuthenticated, streak, totalXp, daily, todayTop, fantasyTeam }: Props) {
  const [liko, setLiko] = useState('')
  useEffect(() => {
    if (!daily.allDone) return
    setLiko(ikiRytojaus())
    const t = setInterval(() => setLiko(ikiRytojaus()), 60000)
    return () => clearInterval(t)
  }, [daily.allDone])

  const ctaLabel = daily.doneCount === 0 ? 'Pradėti' : daily.allDone ? 'Peržiūrėti' : `Tęsti · ${daily.doneCount}/${daily.total}`

  return (
    <ZaidimoLangas title="Žaidimai" backHref="/" maxWidth={560}>
      <style>{css}</style>

      {/* ── Dienos iššūkis — pagrindinis dėmesio centras ── */}
      <div className={`dh-daily${daily.allDone ? ' done' : ''}`}>
        <div className="dh-daily-head">
          <span className="dh-kick">{daily.allDone ? 'Šiandien įveikta' : 'Kasdienis iššūkis'}</span>
          {daily.rank && <span className="dh-rank-badge">#{daily.rank.rank} iš {daily.rank.total}</span>}
        </div>
        <h1 className="dh-title">Dienos iššūkis</h1>

        <ul className="dh-check">
          {daily.steps.map(s => (
            <li key={s.key} className={s.done ? 'done' : ''}>
              <span className="dh-tick">{s.done ? '✓' : ''}</span>
              {s.label}
            </li>
          ))}
        </ul>

        <Link href="/zaidimai/dienos" className="dh-cta">
          {ctaLabel}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </Link>
        {daily.allDone && liko && <p className="dh-timer">Naujas iššūkis po {liko}</p>}
      </div>

      {/* ── Būsenos ── */}
      <div className="dh-stats">
        <div className="dh-stat">
          <span className="dh-stat-num">{streak}</span>
          <span className="dh-stat-lbl">🔥 dienų serija</span>
        </div>
        <div className="dh-stat">
          <span className="dh-stat-num">{totalXp.toLocaleString('lt-LT')}</span>
          <span className="dh-stat-lbl">⚡ iš viso taškų</span>
        </div>
      </div>

      {/* ── Scoreboard ── */}
      <div className="dh-board">
        <div className="dh-board-head">
          <span>Šiandienos lyderiai</span>
        </div>
        {todayTop.length === 0 ? (
          <div className="dh-empty">Dar niekas nežaidė — būk pirmas!</div>
        ) : (
          <ol className="dh-list">
            {todayTop.slice(0, 3).map((r, i) => (
              <li key={i} className="dh-li">
                <span className={`dh-pos p${i + 1}`}>{i + 1}</span>
                <span className="dh-name">{r.name}</span>
                <span className="dh-score">{r.score}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* ── Vadybininkas — atskiras veiksmas ── */}
      <Link href="/zaidimai/vadybininkas" className="dh-manager">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
        <span className="dh-manager-main">
          <span className="dh-manager-title">Muzikos vadybininkas</span>
          <span className="dh-manager-sub">{fantasyTeam || 'Sudaryk savo komandą'}</span>
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
      </Link>

      {!isAuthenticated && (
        <div className="dh-login">
          <Link href="/auth/prisijungti">Prisijunk</Link> — išsaugok progresą ir gauk +50% taškų.
        </div>
      )}
    </ZaidimoLangas>
  )
}

const css = `
.dh-daily {
  border-radius: 16px; padding: 18px; margin-bottom: 12px;
  background: var(--bg-surface);
  border: 1px solid rgba(140,160,190,0.25);
  border-top: 3px solid var(--accent-orange);
}
.dh-daily.done { border-top-color: var(--accent-green); }
.dh-daily-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.dh-kick { font-size: 11px; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent-orange); }
.dh-daily.done .dh-kick { color: var(--accent-green); }
.dh-rank-badge { font-size: 12px; font-weight: 800; color: var(--text-secondary); background: color-mix(in srgb, var(--text-primary) 7%, transparent); border-radius: 999px; padding: 3px 10px; }
.dh-title { font-size: 24px; font-weight: 900; letter-spacing: -0.02em; color: var(--text-primary); margin: 4px 0 12px; }

.dh-check { list-style: none; margin: 0 0 14px; padding: 0; display: flex; flex-direction: column; gap: 7px; }
.dh-check li { display: flex; align-items: center; gap: 10px; font-size: 14.5px; font-weight: 600; color: var(--text-secondary); }
.dh-check li.done { color: var(--text-primary); }
.dh-tick {
  width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 900; color: #fff;
  background: color-mix(in srgb, var(--text-primary) 10%, transparent);
}
.dh-check li.done .dh-tick { background: var(--accent-green); }

.dh-cta {
  display: flex; align-items: center; justify-content: center; gap: 4px; text-decoration: none;
  font-size: 17px; font-weight: 900; color: #fff; background: var(--accent-orange);
  border-radius: 12px; padding: 14px;
}
.dh-daily.done .dh-cta { background: var(--bg-surface); color: var(--text-primary); border: 1px solid rgba(140,160,190,0.3); }
.dh-timer { font-size: 12px; color: var(--text-muted); text-align: center; margin: 10px 0 0; }

.dh-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
.dh-stat { background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.18); border-radius: 13px; padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; }
.dh-stat-num { font-size: 24px; font-weight: 900; color: var(--text-primary); line-height: 1; }
.dh-stat-lbl { font-size: 11.5px; font-weight: 700; color: var(--text-muted); }

.dh-board { background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.18); border-radius: 13px; padding: 12px 14px; margin-bottom: 12px; }
.dh-board-head { font-size: 12px; font-weight: 900; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
.dh-empty { font-size: 12.5px; color: var(--text-muted); }
.dh-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.dh-li { display: flex; align-items: center; gap: 10px; font-size: 14px; padding: 4px 2px; }
.dh-pos { width: 20px; height: 20px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 11px; flex-shrink: 0; background: color-mix(in srgb, var(--text-primary) 8%, transparent); color: var(--text-secondary); }
.dh-pos.p1 { background: var(--accent-orange); color: #fff; }
.dh-name { font-weight: 700; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dh-score { margin-left: auto; font-weight: 800; color: var(--text-primary); font-size: 13px; }

.dh-manager {
  display: flex; align-items: center; gap: 12px; text-decoration: none;
  background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.18); border-radius: 13px; padding: 14px 16px;
  transition: border-color .13s ease;
}
.dh-manager:hover { border-color: var(--accent-orange); }
.dh-manager > svg:first-child { color: var(--text-secondary); flex-shrink: 0; }
.dh-manager-main { display: flex; flex-direction: column; gap: 1px; margin-right: auto; min-width: 0; }
.dh-manager-title { font-size: 15.5px; font-weight: 800; color: var(--text-primary); }
.dh-manager-sub { font-size: 12px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dh-manager > svg:last-child { color: var(--text-muted); flex-shrink: 0; }

.dh-login { font-size: 12.5px; color: var(--text-secondary); text-align: center; margin-top: 12px; }
.dh-login a { color: var(--accent-orange); font-weight: 800; text-decoration: none; }
`
