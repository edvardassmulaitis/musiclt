'use client'

// app/zaidimai/ZaidimaiHubClient.tsx
//
// Žaidimų zonos hub'as: žaidimų kortelės + taškų balansas + lyderių lentelė.

import Link from 'next/link'
import type { LeaderRow } from './page'

type Props = {
  isAuthenticated: boolean
  username: string | null
  me: { totalXp: number; streak: number }
  leaders: LeaderRow[]
  todayBest: { score: number; correct: number | null; rounds: number | null } | null
  duelCount: number
}

const I = {
  quiz: <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
  duel: <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6"/><path d="M16 16h4v4"/><path d="M9.5 17.5 21 6V3h-3L6.5 14.5"/><path d="m5 19 6-6"/><path d="M8 16H4v4"/></svg>,
  manager: <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7h-3a2 2 0 0 1-2-2V2"/><path d="M9 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7l5 5v9a2 2 0 0 1-2 2Z"/><path d="M3 8v12a2 2 0 0 0 2 2h12"/><path d="m12 10 2 2 4-4"/></svg>,
  daily: <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="12" rx="2"/><circle cx="8" cy="14" r="2"/><circle cx="16" cy="14" r="2"/><path d="M7 8V5a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v3"/></svg>,
  bolt: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  trophy: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>,
}

function GameTile({ href, accent, icon, title, desc, meta, big }: {
  href: string; accent: string; icon: React.ReactNode; title: string; desc: string; meta?: string; big?: boolean
}) {
  return (
    <Link href={href} className={`zh-tile${big ? ' zh-tile-big' : ''}`} style={{ ['--acc' as any]: accent }}>
      <span className="zh-tile-icon">{icon}</span>
      <span className="zh-tile-title">{title}</span>
      <span className="zh-tile-desc">{desc}</span>
      {meta && <span className="zh-tile-meta">{meta}</span>}
      <span className="zh-tile-go">Žaisti →</span>
    </Link>
  )
}

export default function ZaidimaiHubClient({ isAuthenticated, username, me, leaders, todayBest, duelCount }: Props) {
  return (
    <div className="zh-root">
      <style>{css}</style>

      {/* Hero */}
      <div className="zh-hero">
        <div className="zh-hero-icon">{I.bolt}</div>
        <div>
          <h1 className="zh-h1">Žaidimai</h1>
          <p className="zh-sub">Atspėk dainą, balsuok dvikovose, tapk vadybininku — ir rink taškus.</p>
        </div>
        <div className="zh-me">
          <span className="zh-me-xp">⚡ {me.totalXp.toLocaleString('lt-LT')} tšk.</span>
          {me.streak > 1 && <span className="zh-me-streak">🔥 {me.streak} d. serija</span>}
        </div>
      </div>

      {!isAuthenticated && (
        <div className="zh-cta">
          Žaisti gali visi, bet <Link href="/auth/prisijungti">prisijungę nariai</Link> gauna <b>+50% taškų</b> ir vietą lyderių lentelėje.
        </div>
      )}

      {/* Žaidimų kortelės */}
      <div className="zh-grid">
        <GameTile
          big
          href="/zaidimai/dainu-kvizas"
          accent="#f59e0b"
          icon={I.quiz}
          title="Atspėk dainą"
          desc="Groja ištrauka — 4 variantai ir 15 sekundžių. 10 raundų, greitis = taškai."
          meta={todayBest ? `Šiandienos rekordas: ${todayBest.score} tšk.` : 'Būk pirmas šiandien!'}
        />
        <GameTile
          href="/zaidimai/dvikovos"
          accent="#6366f1"
          icon={I.duel}
          title="Dainų dvikovos"
          desc="Dvi dainos — vienas balsas. Pamatyk, ką renkasi bendruomenė."
          meta={duelCount > 0 ? `${duelCount} dvikovų laukia` : undefined}
        />
        <GameTile
          href="/zaidimai/vadybininkas"
          accent="#10b981"
          icon={I.manager}
          title="Muzikos vadybininkas"
          desc="Pasamdyk 3 realius LT atlikėjus už biudžetą ir išgyvenk metus muzikos versle."
        />
        <GameTile
          href="/boombox"
          accent="#f97316"
          icon={I.daily}
          title="Boombox — dienos misijos"
          desc="Kasdienis ritualas: dienos dvikova, verdiktas ir drops'ai. Serija auga kasdien."
        />
      </div>

      {/* Lyderiai */}
      <div className="zh-board">
        <div className="zh-board-head">
          <span style={{ color: '#f59e0b' }}>{I.trophy}</span>
          <h2 className="zh-h2">Lyderių lentelė</h2>
          <span className="zh-board-note">visų laikų taškai</span>
        </div>
        {leaders.length === 0 ? (
          <div className="zh-board-empty">Dar tuščia — sužaisk pirmas ir įsirašyk į istoriją.</div>
        ) : (
          <ol className="zh-board-list">
            {leaders.map((l, i) => (
              <li key={i} className={`zh-board-row${!l.isAnon && username && l.name === username ? ' zh-board-me' : ''}`}>
                <span className={`zh-board-rank r${i + 1}`}>{i + 1}</span>
                <span className="zh-board-name">{l.name}{l.isAnon ? '' : ''}</span>
                {l.streak > 1 && <span className="zh-board-streak">🔥{l.streak}</span>}
                <span className="zh-board-xp">{l.totalXp.toLocaleString('lt-LT')} tšk.</span>
              </li>
            ))}
          </ol>
        )}
        <p className="zh-board-foot">
          Taškai skiriami tik už žaidimus — ne už įrašus ar komentarus. Kasdien žaisk, augink seriją.
        </p>
      </div>
    </div>
  )
}

const css = `
.zh-root { max-width: 1100px; margin: 0 auto; padding: 32px 20px 90px; }

.zh-hero { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
.zh-hero-icon {
  width: 54px; height: 54px; border-radius: 16px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; color: #fff;
  background: linear-gradient(135deg, #6366f1 0%, #f59e0b 100%);
  box-shadow: 0 14px 36px rgba(99,102,241,0.35), inset 0 1px 0 rgba(255,255,255,0.25);
}
.zh-h1 { font-size: 30px; font-weight: 900; letter-spacing: -0.02em; color: var(--text-primary); margin: 0; line-height: 1.05; }
.zh-sub { font-size: 14px; color: var(--text-secondary); margin: 4px 0 0; }
.zh-me { margin-left: auto; display: flex; gap: 8px; flex-wrap: wrap; }
.zh-me-xp, .zh-me-streak {
  font-size: 14px; font-weight: 800; padding: 8px 14px; border-radius: 999px;
  background: var(--bg-surface); border: 1px solid var(--border-color, rgba(140,160,190,0.18));
  color: var(--text-primary);
}

.zh-cta {
  font-size: 14px; color: var(--text-secondary); background: var(--bg-surface);
  border: 1px dashed rgba(99,102,241,0.45); border-radius: 14px; padding: 12px 16px; margin-bottom: 20px;
}
.zh-cta a { color: #818cf8; font-weight: 700; text-decoration: none; }
.zh-cta b { color: var(--text-primary); }

.zh-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-bottom: 34px; }
@media (max-width: 640px) { .zh-grid { grid-template-columns: 1fr; } }

.zh-tile {
  position: relative; display: flex; flex-direction: column; gap: 6px;
  padding: 22px 20px 18px; border-radius: 18px; text-decoration: none;
  background: linear-gradient(160deg, color-mix(in srgb, var(--acc) 14%, var(--bg-surface)) 0%, var(--bg-surface) 55%);
  border: 1px solid color-mix(in srgb, var(--acc) 35%, transparent);
  transition: transform .18s ease, box-shadow .18s ease;
}
.zh-tile:hover { transform: translateY(-3px); box-shadow: 0 16px 40px color-mix(in srgb, var(--acc) 28%, transparent); }
.zh-tile-big { grid-column: span 2; }
@media (max-width: 640px) { .zh-tile-big { grid-column: span 1; } }
.zh-tile-icon {
  width: 46px; height: 46px; border-radius: 13px; display: flex; align-items: center; justify-content: center;
  background: var(--acc); color: #fff; margin-bottom: 6px;
  box-shadow: 0 10px 24px color-mix(in srgb, var(--acc) 45%, transparent);
}
.zh-tile-title { font-size: 20px; font-weight: 900; color: var(--text-primary); letter-spacing: -0.01em; }
.zh-tile-desc { font-size: 14px; color: var(--text-secondary); line-height: 1.45; max-width: 520px; }
.zh-tile-meta { font-size: 12px; font-weight: 700; color: var(--acc); margin-top: 2px; }
.zh-tile-go {
  position: absolute; right: 18px; bottom: 16px; font-size: 14px; font-weight: 800; color: var(--acc);
  opacity: 0; transform: translateX(-6px); transition: all .18s ease;
}
.zh-tile:hover .zh-tile-go { opacity: 1; transform: translateX(0); }

.zh-board { background: var(--bg-surface); border: 1px solid var(--border-color, rgba(140,160,190,0.18)); border-radius: 18px; padding: 20px; }
.zh-board-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.zh-h2 { font-size: 20px; font-weight: 900; color: var(--text-primary); margin: 0; }
.zh-board-note { font-size: 12px; color: var(--text-muted); margin-left: auto; }
.zh-board-empty { font-size: 14px; color: var(--text-muted); padding: 10px 0 4px; }
.zh-board-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.zh-board-row {
  display: flex; align-items: center; gap: 12px; padding: 9px 10px; border-radius: 10px; font-size: 14px;
}
.zh-board-row:nth-child(odd) { background: color-mix(in srgb, var(--text-primary) 4%, transparent); }
.zh-board-me { outline: 1px solid rgba(99,102,241,0.5); }
.zh-board-rank {
  width: 26px; height: 26px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
  font-weight: 900; font-size: 12px; background: color-mix(in srgb, var(--text-primary) 8%, transparent); color: var(--text-secondary);
  flex-shrink: 0;
}
.zh-board-rank.r1 { background: #f59e0b; color: #1a1206; }
.zh-board-rank.r2 { background: #94a3b8; color: #10151d; }
.zh-board-rank.r3 { background: #b45309; color: #fff; }
.zh-board-name { font-weight: 700; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.zh-board-streak { font-size: 12px; color: var(--text-secondary); }
.zh-board-xp { margin-left: auto; font-weight: 800; color: var(--text-primary); white-space: nowrap; }
.zh-board-foot { font-size: 12px; color: var(--text-muted); margin: 14px 0 0; }
`
