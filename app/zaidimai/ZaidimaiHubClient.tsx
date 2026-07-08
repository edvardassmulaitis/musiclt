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
import type { ReactNode } from 'react'
import ZaidimoLangas from '@/components/zaidimai/ZaidimoLangas'
import type { DailyStep, DailyTopRow } from './page'

const ic = (paths: ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths}</svg>
)
const ICONS = {
  headphones: ic(<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H3v-7a9 9 0 0 1 18 0v7h-3a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" />),
  timer: ic(<><line x1="10" x2="14" y1="2" y2="2" /><line x1="12" x2="15" y1="14" y2="11" /><circle cx="12" cy="14" r="8" /></>),
  disc: ic(<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="2.5" /></>),
  calendar: ic(<><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></>),
  swords: ic(<><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" /><line x1="13" x2="19" y1="19" y2="13" /><line x1="16" x2="20" y1="16" y2="20" /><line x1="19" x2="21" y1="21" y2="19" /><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5" /><line x1="5" x2="9" y1="14" y2="18" /><line x1="7" x2="4" y1="17" y2="20" /><line x1="3" x2="5" y1="19" y2="21" /></>),
}

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

  const games = [
    { href: '/zaidimai/dainu-kvizas', title: 'Atspėk dainą', icon: ICONS.headphones },
    { href: '/zaidimai/atspek-is-sekundes', title: 'Iš sekundės', icon: ICONS.timer },
    { href: '/zaidimai/atspek-is-vaizdo', title: 'Iš vaizdo', icon: ICONS.disc },
    { href: '/zaidimai/kurie-metai', title: 'Kurie metai?', icon: ICONS.calendar },
    { href: '/zaidimai/dvikovos', title: 'Dvikovos', icon: ICONS.swords },
  ]

  return (
    <ZaidimoLangas title="Žaidimai" backHref="/" maxWidth={560}>
      <style>{css}</style>

      {/* ── Dienos iššūkis — pagrindinis dėmesio centras ── */}
      <div className={`dh-daily${daily.allDone ? ' done' : ''}`}>
        <div className="dh-daily-head">
          <h1 className="dh-title">{daily.allDone ? 'Iššūkis įveiktas' : 'Dienos iššūkis'}</h1>
          {daily.rank && <span className="dh-rank-badge">#{daily.rank.rank} iš {daily.rank.total}</span>}
        </div>

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

      {/* ── Vadybininkas — antra pagal svarbą, mėlyna kortelė ── */}
      <Link href="/zaidimai/vadybininkas" className="dh-manager">
        <span className="dh-manager-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
        </span>
        <span className="dh-manager-main">
          <span className="dh-manager-title">Muzikos vadybininkas</span>
          <span className="dh-manager-sub">{fantasyTeam || 'Sudaryk savo komandą iš realių atlikėjų'}</span>
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
      </Link>

      {/* ── Šiandienos top + tavo būsena, šalia ── */}
      <div className="dh-two">
        <div className="dh-board">
          <div className="dh-board-head">Šiandienos top</div>
          {todayTop.length === 0 ? (
            <div className="dh-empty">Dar niekas nežaidė!</div>
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
        <div className="dh-board dh-me">
          <div className="dh-board-head">Tavo</div>
          <div className="dh-me-row"><span className="dh-me-num">{streak}</span><span className="dh-me-lbl">🔥 serija</span></div>
          <div className="dh-me-row"><span className="dh-me-num">{totalXp.toLocaleString('lt-LT')}</span><span className="dh-me-lbl">⚡ taškai</span></div>
        </div>
      </div>

      {/* ── Daugiau žaidimų — kompaktiškos plytelės ── */}
      <div className="dh-more">
        {games.map(g => (
          <Link key={g.href} href={g.href} className="dh-chip">
            <span className="dh-chip-ic">{g.icon}</span>
            <span className="dh-chip-t">{g.title}</span>
          </Link>
        ))}
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
.dh-daily {
  border-radius: 16px; padding: 16px 18px; margin-bottom: 10px;
  background: var(--bg-surface);
  border: 1px solid rgba(140,160,190,0.25);
  border-top: 3px solid var(--accent-orange);
}
.dh-daily.done { border-top-color: var(--accent-green); }
.dh-daily-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
.dh-rank-badge { font-size: 12px; font-weight: 800; color: var(--text-secondary); background: color-mix(in srgb, var(--text-primary) 7%, transparent); border-radius: 999px; padding: 3px 10px; }
.dh-title { font-size: 22px; font-weight: 900; letter-spacing: -0.02em; color: var(--text-primary); margin: 0; }

.dh-check { list-style: none; margin: 0 0 14px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.dh-check li { display: flex; align-items: center; gap: 10px; font-size: 14.5px; font-weight: 600; color: var(--text-secondary); }
.dh-check li.done { color: var(--text-primary); }
.dh-tick {
  width: 21px; height: 21px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 900; color: #fff;
  background: color-mix(in srgb, var(--text-primary) 10%, transparent);
}
.dh-check li.done .dh-tick { background: var(--accent-green); }

.dh-cta {
  display: flex; align-items: center; justify-content: center; gap: 4px; text-decoration: none;
  font-size: 17px; font-weight: 900; color: #fff; background: var(--accent-orange);
  border-radius: 12px; padding: 13px;
}
.dh-daily.done .dh-cta { background: var(--bg-surface); color: var(--text-primary); border: 1px solid rgba(140,160,190,0.3); }
.dh-timer { font-size: 12px; color: var(--text-muted); text-align: center; margin: 9px 0 0; }

/* Vadybininkas — mėlyna kortelė, panašus svoris kaip iššūkio */
.dh-manager {
  display: flex; align-items: center; gap: 12px; text-decoration: none;
  background: color-mix(in srgb, var(--accent-blue) 12%, var(--bg-surface));
  border: 1px solid color-mix(in srgb, var(--accent-blue) 40%, transparent);
  border-top: 3px solid var(--accent-blue);
  border-radius: 14px; padding: 15px 16px; margin-bottom: 10px;
}
.dh-manager-icon { display: flex; color: var(--accent-blue); flex-shrink: 0; }
.dh-manager-main { display: flex; flex-direction: column; gap: 1px; margin-right: auto; min-width: 0; }
.dh-manager-title { font-size: 16px; font-weight: 900; color: var(--text-primary); }
.dh-manager-sub { font-size: 12px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dh-manager > svg:last-child { color: var(--accent-blue); flex-shrink: 0; }

/* Top ir tavo stats — šalia, per pusę */
.dh-two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
.dh-board { background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.18); border-radius: 13px; padding: 12px 13px; }
.dh-board-head { font-size: 11px; font-weight: 900; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
.dh-empty { font-size: 12px; color: var(--text-muted); }
.dh-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.dh-li { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.dh-pos { width: 19px; height: 19px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 10.5px; flex-shrink: 0; background: color-mix(in srgb, var(--text-primary) 8%, transparent); color: var(--text-secondary); }
.dh-pos.p1 { background: var(--accent-orange); color: #fff; }
.dh-name { font-weight: 700; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dh-score { margin-left: auto; font-weight: 800; color: var(--text-primary); font-size: 12px; }
.dh-me-row { display: flex; align-items: baseline; gap: 6px; padding: 3px 0; }
.dh-me-num { font-size: 20px; font-weight: 900; color: var(--text-primary); line-height: 1; }
.dh-me-lbl { font-size: 11.5px; font-weight: 700; color: var(--text-muted); }

/* Daugiau žaidimų — kompaktiškos plytelės */
.dh-more { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 4px; }
.dh-chip {
  display: flex; align-items: center; gap: 7px; text-decoration: none;
  background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.18); border-radius: 999px; padding: 8px 13px;
  transition: border-color .13s ease;
}
.dh-chip:hover { border-color: var(--accent-orange); }
.dh-chip-ic { display: flex; color: var(--text-secondary); }
.dh-chip-t { font-size: 13px; font-weight: 700; color: var(--text-primary); }

.dh-login { font-size: 12.5px; color: var(--text-secondary); text-align: center; margin-top: 12px; }
.dh-login a { color: var(--accent-orange); font-weight: 800; text-decoration: none; }
`
