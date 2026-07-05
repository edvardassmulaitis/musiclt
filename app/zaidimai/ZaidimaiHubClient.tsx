'use client'

// app/zaidimai/ZaidimaiHubClient.tsx
//
// Master landing — MAKSIMALIAI PAPRASTA:
//   1. Dienos iššūkis (hero CTA, būsena aiški iš karto)
//   2. Šiandienos žaidimai — kortelės su likusiais dienos taškais
//   3. Lyderiai: šiandien + visų laikų
// Jokių ilgų tekstų — viena eilutė apie taisykles apačioje.

import Link from 'next/link'
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

export default function ZaidimaiHubClient({ isAuthenticated, username, me, leaders, dailyTop, fantasyTeam, today }: Props) {
  const potential =
    (today.dailyPlayed ? 0 : 250) +
    today.quizRunsLeft * 100 +
    today.vaizdasRunsLeft * 80 +
    today.duelVotesLeft * 15

  return (
    <div className="zh-root">
      <style>{css}</style>

      {/* Header */}
      <div className="zh-head">
        <h1 className="zh-h1">Žaidimai</h1>
        <div className="zh-me">
          <span className="zh-chip">⚡ {me.totalXp.toLocaleString('lt-LT')}</span>
          {me.streak > 1 && <span className="zh-chip">🔥 {me.streak} d.</span>}
        </div>
      </div>
      <p className="zh-sub">Kasdien nauji iššūkiai — žaisk, rink taškus, lenk kitus.</p>

      {/* 1. DIENOS IŠŠŪKIS — hero (wizard'as: kvizas + dienos misijos) */}
      <Link href="/zaidimai/dienos" className={`zh-daily${today.dailyPlayed ? ' done' : ''}`}>
        <div className="zh-daily-left">
          <span className="zh-daily-badge">⚡ DIENOS IŠŠŪKIS</span>
          <span className="zh-daily-title">Kasdienis ritualas — tas pats visiems</span>
          <span className="zh-daily-sub">
            {today.dailyPlayed ? 'Kvizas įveiktas ✓ — pasitikrink likusias misijas' : '🎧 Atspėk 5 dainas → ⚔️ dvikova → 🔥 verdiktas · ×2 taškai'}
          </span>
        </div>
        <span className="zh-daily-cta">{today.dailyPlayed ? '✓' : 'ŽAISTI'}</span>
      </Link>

      {/* 2. Šiandienos žaidimai */}
      <div className="zh-sec-head">
        <h2 className="zh-h2">Šiandienos žaidimai</h2>
        {potential > 0 && <span className="zh-potential">dar gali surinkti ~{potential} tšk.</span>}
      </div>

      <div className="zh-rows">
        <Link href="/zaidimai/dainu-kvizas" className="zh-row" style={{ ['--acc' as any]: '#f59e0b' }}>
          <span className="zh-row-emoji">🎧</span>
          <span className="zh-row-main">
            <span className="zh-row-title">Atspėk dainą</span>
            <span className="zh-row-desc">15 sek. · 4 variantai · bonusai už atspėjimus iš eilės</span>
          </span>
          <span className="zh-row-meta">{today.quizRunsLeft > 0 ? `${today.quizRunsLeft} ${today.quizRunsLeft === 1 ? 'kvizas' : 'kvizai'} su taškais` : 'tik treniruotė — be taškų'}</span>
          <span className="zh-row-go">→</span>
        </Link>

        <Link href="/zaidimai/atspek-is-vaizdo" className="zh-row" style={{ ['--acc' as any]: '#8b5cf6' }}>
          <span className="zh-row-emoji">🖼️</span>
          <span className="zh-row-main">
            <span className="zh-row-title">Atspėk iš vaizdo</span>
            <span className="zh-row-desc">Nuotrauka ryškėja — atpažink atlikėją kuo greičiau</span>
          </span>
          <span className="zh-row-meta">{today.vaizdasRunsLeft > 0 ? `${today.vaizdasRunsLeft} ${today.vaizdasRunsLeft === 1 ? 'žaidimas' : 'žaidimai'} su taškais` : 'tik treniruotė — be taškų'}</span>
          <span className="zh-row-go">→</span>
        </Link>

        <Link href="/zaidimai/dvikovos" className="zh-row" style={{ ['--acc' as any]: '#6366f1' }}>
          <span className="zh-row-emoji">⚔️</span>
          <span className="zh-row-main">
            <span className="zh-row-title">Dainų dvikovos</span>
            <span className="zh-row-desc">Balsuok ir lygink save su bendruomene</span>
          </span>
          <span className="zh-row-meta">{today.duelVotesLeft > 0 ? `balsų su taškais: ${today.duelVotesLeft}` : 'balsuok toliau — be taškų'}</span>
          <span className="zh-row-go">→</span>
        </Link>

        <Link href="/zaidimai/vadybininkas" className="zh-row" style={{ ['--acc' as any]: '#10b981' }}>
          <span className="zh-row-emoji">💼</span>
          <span className="zh-row-main">
            <span className="zh-row-title">Muzikos vadybininkas</span>
            <span className="zh-row-desc">Vadybininkų lyga: 5 realūs atlikėjai (LT ir pasaulio), taškai iš tikrų rezultatų</span>
          </span>
          <span className="zh-row-meta">{fantasyTeam ? `💼 ${fantasyTeam}` : 'sudaryk komandą'}</span>
          <span className="zh-row-go">→</span>
        </Link>
      </div>

      {!isAuthenticated && (
        <div className="zh-cta">
          <Link href="/auth/prisijungti">Prisijunk</Link> — gausi <b>+50% taškų</b> ir vardą lyderių lentelėje.
        </div>
      )}

      {/* 3. Lyderiai */}
      <div className="zh-boards">
        <div className="zh-board">
          <h3 className="zh-h3">⚡ Šiandienos iššūkis</h3>
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
          <h3 className="zh-h3">🏆 Visų laikų</h3>
          {leaders.length === 0 ? (
            <div className="zh-empty">Lentelė laukia pirmųjų.</div>
          ) : (
            <ol className="zh-list">
              {leaders.slice(0, 5).map((l, i) => (
                <li key={i} className={`zh-li${!l.isAnon && username && l.name === username ? ' me' : ''}`}>
                  <span className={`zh-rank r${i + 1}`}>{i + 1}</span>
                  <span className="zh-name">{l.name}</span>
                  {l.streak > 1 && <span className="zh-mini">🔥{l.streak}</span>}
                  <span className="zh-val">{l.totalXp.toLocaleString('lt-LT')}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <p className="zh-foot">Taškai — tik už žaidimus. Limitai atsinaujina kas dieną, serija auga žaidžiant kasdien.</p>
    </div>
  )
}

const css = `
.zh-root { max-width: 680px; margin: 0 auto; padding: 28px 18px 90px; }

.zh-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.zh-h1 { font-size: 30px; font-weight: 900; letter-spacing: -0.02em; color: var(--text-primary); margin: 0; }
.zh-me { display: flex; gap: 8px; }
.zh-chip {
  font-size: 14px; font-weight: 800; padding: 7px 13px; border-radius: 999px;
  background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.22); color: var(--text-primary);
}
.zh-sub { font-size: 14px; color: var(--text-secondary); margin: 6px 0 18px; }

.zh-daily {
  display: flex; align-items: center; gap: 14px; text-decoration: none;
  padding: 20px 20px; border-radius: 18px; margin-bottom: 26px;
  background: linear-gradient(135deg, rgba(236,72,153,0.24), rgba(99,102,241,0.2)), var(--bg-surface);
  border: 1px solid rgba(236,72,153,0.55);
  box-shadow: 0 14px 36px rgba(236,72,153,0.2);
  transition: transform .15s ease, box-shadow .15s ease;
}
.zh-daily:hover { transform: translateY(-2px); box-shadow: 0 20px 44px rgba(236,72,153,0.3); }
.zh-daily.done { border-color: rgba(16,185,129,0.5); box-shadow: none; background: linear-gradient(135deg, rgba(16,185,129,0.14), rgba(99,102,241,0.1)), var(--bg-surface); }
.zh-daily-left { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.zh-daily-badge { font-size: 12px; font-weight: 900; letter-spacing: 0.08em; color: #ec4899; }
.zh-daily.done .zh-daily-badge { color: #10b981; }
.zh-daily-title { font-size: 20px; font-weight: 900; color: var(--text-primary); line-height: 1.2; }
.zh-daily-sub { font-size: 12px; color: var(--text-secondary); }
.zh-daily-cta {
  margin-left: auto; flex-shrink: 0; font-size: 14px; font-weight: 900; color: #fff;
  background: linear-gradient(135deg, #ec4899, #8b5cf6); border-radius: 999px; padding: 12px 20px;
}
.zh-daily.done .zh-daily-cta { background: rgba(16,185,129,0.85); padding: 12px 16px; }

.zh-sec-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.zh-h2 { font-size: 20px; font-weight: 900; color: var(--text-primary); margin: 0; }
.zh-potential { font-size: 12px; font-weight: 800; color: #f59e0b; white-space: nowrap; }

.zh-rows { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
.zh-row {
  display: flex; align-items: center; gap: 13px; text-decoration: none;
  padding: 14px 16px; border-radius: 15px;
  background: linear-gradient(120deg, color-mix(in srgb, var(--acc) 10%, var(--bg-surface)) 0%, var(--bg-surface) 55%);
  border: 1px solid color-mix(in srgb, var(--acc) 30%, transparent);
  transition: transform .13s ease, border-color .13s ease;
}
.zh-row:hover { transform: translateX(3px); border-color: var(--acc); }
.zh-row-emoji { font-size: 24px; flex-shrink: 0; }
.zh-row-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.zh-row-title { font-size: 16px; font-weight: 900; color: var(--text-primary); }
.zh-row-desc { font-size: 12px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.zh-row-meta { margin-left: auto; flex-shrink: 0; font-size: 12px; font-weight: 800; color: var(--acc); text-align: right; }
.zh-row-go { flex-shrink: 0; font-size: 16px; font-weight: 900; color: var(--acc); }
@media (max-width: 480px) { .zh-row-desc { display: none; } }

.zh-cta {
  font-size: 14px; color: var(--text-secondary); background: var(--bg-surface);
  border: 1px dashed rgba(99,102,241,0.45); border-radius: 13px; padding: 11px 15px; margin-bottom: 22px;
}
.zh-cta a { color: #818cf8; font-weight: 800; text-decoration: none; }
.zh-cta b { color: var(--text-primary); }

.zh-boards { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
@media (max-width: 560px) { .zh-boards { grid-template-columns: 1fr; } }
.zh-board { background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.18); border-radius: 15px; padding: 14px 15px; }
.zh-h3 { font-size: 14px; font-weight: 900; color: var(--text-primary); margin: 0 0 10px; }
.zh-empty { font-size: 12px; color: var(--text-muted); }
.zh-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.zh-li { display: flex; align-items: center; gap: 9px; font-size: 14px; padding: 5px 6px; border-radius: 8px; }
.zh-li.me { outline: 1px solid rgba(99,102,241,0.5); }
.zh-li:nth-child(odd) { background: color-mix(in srgb, var(--text-primary) 4%, transparent); }
.zh-rank {
  width: 22px; height: 22px; border-radius: 7px; display: flex; align-items: center; justify-content: center;
  font-weight: 900; font-size: 11px; background: color-mix(in srgb, var(--text-primary) 8%, transparent); color: var(--text-secondary); flex-shrink: 0;
}
.zh-rank.r1 { background: #f59e0b; color: #1a1206; }
.zh-rank.r2 { background: #94a3b8; color: #10151d; }
.zh-rank.r3 { background: #b45309; color: #fff; }
.zh-name { font-weight: 700; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.zh-mini { font-size: 11px; color: var(--text-secondary); }
.zh-val { margin-left: auto; font-weight: 800; color: var(--text-primary); white-space: nowrap; font-size: 12px; }

.zh-foot { font-size: 12px; color: var(--text-muted); margin: 4px 0 0; text-align: center; }
`
