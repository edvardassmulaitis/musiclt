'use client'

// app/zaidimai/ZaidimaiHubClient.tsx
//
// Žaidimų DASHBOARD — 3 kortelės per visą ekraną, be scroll'o:
//   1. Dienos iššūkis (CTA + checklist)
//   2. Muzikos lyga (naujiems — kabliukas; esamiems — savaičių grafikas + rangas)
//   3. Tavo statistika (serija, taškai, šiandienos vieta + top)

import Link from 'next/link'
import { useEffect, useState } from 'react'
import ZaidimoLangas from '@/components/zaidimai/ZaidimoLangas'
import type { DailyStep, DailyTopRow, FantasyInfo } from './page'

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
  fantasy: FantasyInfo
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

export default function ZaidimaiHubClient({ isAuthenticated, streak, totalXp, daily, todayTop, fantasy }: Props) {
  const [liko, setLiko] = useState('')
  useEffect(() => {
    if (!daily.allDone) return
    setLiko(ikiRytojaus())
    const t = setInterval(() => setLiko(ikiRytojaus()), 60000)
    return () => clearInterval(t)
  }, [daily.allDone])

  const ctaLabel = daily.doneCount === 0 ? 'Pradėti' : daily.allDone ? 'Peržiūrėti' : `Tęsti · ${daily.doneCount}/${daily.total}`

  // Lygos grafiko taškų max (normavimui)
  const flMax = fantasy && fantasy.weeks.length ? Math.max(1, ...fantasy.weeks.map(w => w.points)) : 1

  return (
    <ZaidimoLangas title="Žaidimai" backHref="/" maxWidth={560}>
      <style>{css}</style>

      {/* ── 1. Dienos iššūkis ── */}
      <div className={`dh-box dh-daily${daily.allDone ? ' done' : ''}`}>
        <div className="dh-head">
          <h1 className="dh-title">{daily.allDone ? 'Iššūkis įveiktas' : 'Dienos iššūkis'}</h1>
          {daily.rank && <span className="dh-badge">#{daily.rank.rank} iš {daily.rank.total}</span>}
        </div>
        <ul className="dh-check">
          {daily.steps.map(s => (
            <li key={s.key} className={s.done ? 'done' : ''}>
              <span className="dh-tick">{s.done ? '✓' : ''}</span>{s.label}
            </li>
          ))}
        </ul>
        <Link href="/zaidimai/dienos" className="dh-cta orange">
          {ctaLabel}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </Link>
        {daily.allDone && liko && <p className="dh-timer">Naujas iššūkis po {liko}</p>}
      </div>

      {/* ── 2. Muzikos lyga ── */}
      <div className="dh-box dh-liga">
        <div className="dh-head">
          <h2 className="dh-title sm">🎵 Muzikos lyga</h2>
          {fantasy?.rank && <span className="dh-badge blue">#{fantasy.rank} iš {fantasy.totalTeams}</span>}
        </div>

        {fantasy ? (
          <>
            <div className="dh-liga-team">{fantasy.name} · <b>{fantasy.seasonPoints}</b> tšk. iš viso</div>
            {fantasy.weeks.length >= 2 ? (
              <div className="dh-spark">
                {fantasy.weeks.map((w, i) => (
                  <div key={w.week} className="dh-spark-col" title={`${w.week}: ${w.points} tšk.`}>
                    <i style={{ height: `${Math.max(6, (w.points / flMax) * 100)}%` }} className={i === fantasy.weeks.length - 1 ? 'now' : ''} />
                    <span>{w.week.slice(5)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="dh-liga-hint">Pirmieji taškai — jau šį pirmadienį. Užsuk stebėti, kaip sekasi komandai.</p>
            )}
            <Link href="/zaidimai/vadybininkas" className="dh-cta blue">Valdyti komandą
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </Link>
          </>
        ) : (
          <>
            <p className="dh-liga-hint">Sudaryk komandą iš realių atlikėjų — LT ir pasaulio. Jie renka taškus pagal <b>tikrus rezultatus</b>: topus, YouTube augimą, naujas dainas. Kas savaitę — nauja kova dėl lygos viršūnės.</p>
            <Link href="/zaidimai/vadybininkas" className="dh-cta blue">Sukurti komandą
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </Link>
          </>
        )}
      </div>

      {/* ── 3. Tavo statistika + šiandienos top ── */}
      <div className="dh-box dh-stats">
        <div className="dh-head"><h2 className="dh-title sm">Tavo statistika</h2></div>
        <div className="dh-stat-row">
          <div className="dh-stat"><span className="dh-stat-num">{streak}</span><span className="dh-stat-lbl">🔥 dienų serija</span></div>
          <div className="dh-stat"><span className="dh-stat-num">{totalXp.toLocaleString('lt-LT')}</span><span className="dh-stat-lbl">⚡ iš viso taškų</span></div>
        </div>
        <div className="dh-mini-head">Šiandienos top</div>
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

      {!isAuthenticated && (
        <div className="dh-login">
          <Link href="/auth/prisijungti">Prisijunk</Link> — išsaugok progresą ir gauk +50% taškų.
        </div>
      )}
    </ZaidimoLangas>
  )
}

const css = `
.dh-box { border-radius: 16px; padding: 15px 17px; margin-bottom: 10px; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.22); }
.dh-daily { border-top: 3px solid var(--accent-orange); }
.dh-daily.done { border-top-color: var(--accent-green); }
.dh-liga { border-top: 3px solid var(--accent-blue); background: color-mix(in srgb, var(--accent-blue) 6%, var(--bg-surface)); }
.dh-stats { border-top: 3px solid rgba(140,160,190,0.5); }

.dh-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 11px; }
.dh-title { font-size: 21px; font-weight: 900; letter-spacing: -0.02em; color: var(--text-primary); margin: 0; }
.dh-title.sm { font-size: 17px; }
.dh-badge { font-size: 12px; font-weight: 800; color: var(--text-secondary); background: color-mix(in srgb, var(--text-primary) 7%, transparent); border-radius: 999px; padding: 3px 10px; }
.dh-badge.blue { color: var(--accent-blue); background: color-mix(in srgb, var(--accent-blue) 14%, transparent); }

.dh-check { list-style: none; margin: 0 0 13px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.dh-check li { display: flex; align-items: center; gap: 10px; font-size: 14.5px; font-weight: 600; color: var(--text-secondary); }
.dh-check li.done { color: var(--text-primary); }
.dh-tick { width: 21px; height: 21px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 900; color: #fff; background: color-mix(in srgb, var(--text-primary) 10%, transparent); }
.dh-check li.done .dh-tick { background: var(--accent-green); }

.dh-cta { display: flex; align-items: center; justify-content: center; gap: 4px; text-decoration: none; font-size: 16px; font-weight: 900; color: #fff; border-radius: 12px; padding: 12px; }
.dh-cta.orange { background: var(--accent-orange); }
.dh-cta.blue { background: var(--accent-blue); }
.dh-daily.done .dh-cta.orange { background: var(--bg-surface); color: var(--text-primary); border: 1px solid rgba(140,160,190,0.3); }
.dh-timer { font-size: 12px; color: var(--text-muted); text-align: center; margin: 9px 0 0; }

.dh-liga-team { font-size: 13.5px; color: var(--text-secondary); margin-bottom: 10px; }
.dh-liga-team b { color: var(--text-primary); }
.dh-liga-hint { font-size: 13px; color: var(--text-secondary); line-height: 1.5; margin: 0 0 12px; }
.dh-liga-hint b { color: var(--text-primary); }
.dh-spark { display: flex; align-items: flex-end; gap: 5px; height: 60px; margin-bottom: 12px; }
.dh-spark-col { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 3px; }
.dh-spark-col i { width: 100%; max-width: 26px; border-radius: 3px 3px 0 0; background: color-mix(in srgb, var(--accent-blue) 45%, transparent); display: block; }
.dh-spark-col i.now { background: var(--accent-blue); }
.dh-spark-col span { font-size: 9px; color: var(--text-muted); }

.dh-stat-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
.dh-stat { display: flex; flex-direction: column; gap: 2px; }
.dh-stat-num { font-size: 24px; font-weight: 900; color: var(--text-primary); line-height: 1; }
.dh-stat-lbl { font-size: 11.5px; font-weight: 700; color: var(--text-muted); }
.dh-mini-head { font-size: 11px; font-weight: 900; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 7px; }
.dh-empty { font-size: 12px; color: var(--text-muted); }
.dh-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.dh-li { display: flex; align-items: center; gap: 9px; font-size: 13.5px; }
.dh-pos { width: 19px; height: 19px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 10.5px; flex-shrink: 0; background: color-mix(in srgb, var(--text-primary) 8%, transparent); color: var(--text-secondary); }
.dh-pos.p1 { background: var(--accent-orange); color: #fff; }
.dh-name { font-weight: 700; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dh-score { margin-left: auto; font-weight: 800; color: var(--text-primary); font-size: 12px; }

.dh-login { font-size: 12.5px; color: var(--text-secondary); text-align: center; margin-top: 10px; }
.dh-login a { color: var(--accent-orange); font-weight: 800; text-decoration: none; }
`
