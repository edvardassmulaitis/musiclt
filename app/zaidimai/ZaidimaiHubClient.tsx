'use client'

// app/zaidimai/ZaidimaiHubClient.tsx
//
// Master landing — RAMUS IR AIŠKUS (Edvardo feedback: „be spalvų chaoso"):
//   * pilno ekrano langas be svetainės header/footer (ZaidimoLangas)
//   * vienas akcentas — svetainės oranžinė; visa kita neutralu
//   * 1. Dienos iššūkis (hero CTA) → 2. žaidimų sąrašas → 3. lyderiai
// Jokių ilgų tekstų — viena eilutė apie taisykles apačioje.

import Link from 'next/link'
import ZaidimoLangas from '@/components/zaidimai/ZaidimoLangas'
import type { LeaderRow, DailyTopRow } from './page'

type Props = {
  isAuthenticated: boolean
  username: string | null
  me: { totalXp: number; streak: number }
  leaders: LeaderRow[]
  dailyTop: DailyTopRow[]
  fantasyTeam: string | null
  today: {
    dailyPlayed: boolean
    quizRunsLeft: number
    vaizdasRunsLeft: number
    duelVotesLeft: number
    duelPool: number
  }
}

const GAMES = (today: Props['today'], fantasyTeam: string | null) => [
  {
    href: '/zaidimai/dainu-kvizas',
    icon: '🎧',
    title: 'Atspėk dainą',
    desc: 'Klausai ištraukos — renkiesi iš 4 variantų',
    meta: today.quizRunsLeft > 0 ? `${today.quizRunsLeft} žaid. su taškais` : 'treniruotė',
    active: today.quizRunsLeft > 0,
  },
  {
    href: '/zaidimai/atspek-is-vaizdo',
    icon: '💿',
    title: 'Atspėk iš vaizdo',
    desc: 'Populiaraus albumo viršelis ryškėja — atpažink jį',
    meta: today.vaizdasRunsLeft > 0 ? `${today.vaizdasRunsLeft} žaid. su taškais` : 'treniruotė',
    active: today.vaizdasRunsLeft > 0,
  },
  {
    href: '/zaidimai/dvikovos',
    icon: '⚔️',
    title: 'Dainų dvikovos',
    desc: 'Balsuok ir lygink save su bendruomene',
    meta: today.duelVotesLeft > 0 ? `${today.duelVotesLeft} balsai su taškais` : 'be taškų',
    active: today.duelVotesLeft > 0,
  },
  {
    href: '/zaidimai/vadybininkas',
    icon: '💼',
    title: 'Muzikos vadybininkas',
    desc: 'Sudaryk komandą iš realių atlikėjų — taškai už tikrus jų rezultatus',
    meta: fantasyTeam || 'sudaryk komandą',
    active: true,
  },
]

export default function ZaidimaiHubClient({ isAuthenticated, username, me, leaders, dailyTop, fantasyTeam, today }: Props) {
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

      {/* 1. DIENOS IŠŠŪKIS — hero */}
      <Link href="/zaidimai/dienos" className={`zh-daily${today.dailyPlayed ? ' done' : ''}`}>
        <div className="zh-daily-left">
          <span className="zh-daily-badge">DIENOS IŠŠŪKIS</span>
          <span className="zh-daily-title">Tas pats visiems — kas surinks daugiau?</span>
          <span className="zh-daily-sub">
            {today.dailyPlayed ? 'Kvizas įveiktas ✓ — pasitikrink likusias užduotis' : '5 dainos · dvikova · verdiktas — dvigubi taškai'}
          </span>
        </div>
        <span className="zh-daily-cta">{today.dailyPlayed ? '✓' : 'Žaisti'}</span>
      </Link>

      {/* 2. Žaidimai */}
      <h2 className="zh-h2">Visi žaidimai</h2>
      <div className="zh-rows">
        {GAMES(today, fantasyTeam).map(g => (
          <Link key={g.href} href={g.href} className="zh-row">
            <span className="zh-row-icon">{g.icon}</span>
            <span className="zh-row-main">
              <span className="zh-row-title">{g.title}</span>
              <span className="zh-row-desc">{g.desc}</span>
            </span>
            <span className={`zh-row-meta${g.active ? ' on' : ''}`}>{g.meta}</span>
            <svg className="zh-row-go" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </Link>
        ))}
      </div>

      {!isAuthenticated && (
        <div className="zh-cta">
          <Link href="/auth/prisijungti">Prisijunk</Link> — gausi <b>+50% taškų</b> ir vardą lyderių lentelėje.
        </div>
      )}

      {/* 3. Lyderiai */}
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

      <p className="zh-foot">Taškai — tik už žaidimus. Limitai atsinaujina kas dieną, serija auga žaidžiant kasdien.</p>
    </ZaidimoLangas>
  )
}

const css = `
.zh-chip {
  font-size: 13px; font-weight: 800; padding: 6px 12px; border-radius: 999px;
  background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.22); color: var(--text-primary);
}

.zh-daily {
  display: flex; align-items: center; gap: 14px; text-decoration: none;
  padding: 18px 18px; border-radius: 14px; margin-bottom: 24px;
  background: var(--bg-surface);
  border: 1px solid rgba(140,160,190,0.25);
  border-left: 3px solid var(--accent-orange);
}
.zh-daily.done { border-left-color: var(--accent-green); }
.zh-daily-left { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.zh-daily-badge { font-size: 11px; font-weight: 900; letter-spacing: 0.09em; color: var(--accent-orange); }
.zh-daily.done .zh-daily-badge { color: var(--accent-green); }
.zh-daily-title { font-size: 19px; font-weight: 900; color: var(--text-primary); line-height: 1.2; letter-spacing: -0.01em; }
.zh-daily-sub { font-size: 12.5px; color: var(--text-secondary); }
.zh-daily-cta {
  margin-left: auto; flex-shrink: 0; font-size: 14px; font-weight: 900; color: #fff;
  background: var(--accent-orange); border-radius: 999px; padding: 11px 22px;
}
.zh-daily.done .zh-daily-cta { background: var(--accent-green); padding: 11px 16px; }

.zh-h2 { font-size: 15px; font-weight: 900; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 10px; }

.zh-rows { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
.zh-row {
  display: flex; align-items: center; gap: 13px; text-decoration: none;
  padding: 14px 15px; border-radius: 13px;
  background: var(--bg-surface);
  border: 1px solid rgba(140,160,190,0.18);
  transition: border-color .13s ease;
}
.zh-row:hover { border-color: var(--accent-orange); }
.zh-row-icon { font-size: 22px; flex-shrink: 0; width: 28px; text-align: center; }
.zh-row-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.zh-row-title { font-size: 15.5px; font-weight: 800; color: var(--text-primary); }
.zh-row-desc { font-size: 12px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.zh-row-meta { margin-left: auto; flex-shrink: 0; font-size: 11.5px; font-weight: 700; color: var(--text-muted); text-align: right; max-width: 110px; }
.zh-row-meta.on { color: var(--accent-orange); }
.zh-row-go { flex-shrink: 0; color: var(--text-muted); }
@media (max-width: 480px) { .zh-row-desc { white-space: normal; } }

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

.zh-foot { font-size: 12px; color: var(--text-muted); margin: 4px 0 0; text-align: center; }
`
