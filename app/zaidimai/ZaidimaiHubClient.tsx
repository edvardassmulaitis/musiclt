'use client'

// app/zaidimai/ZaidimaiHubClient.tsx
//
// Žaidimų DASHBOARD — 4 tipų boxai, be blaškančių skaičių viršuje:
//   Žinios / Atradimai (viršuje) · Reakcija / Strategija (apačioje)
// Kiekvienas paspaudimas atidaro atitinkamą „wizardą" (pasirinkimo langą).
// Mobile — 2×2 be scroll; desktop — platesnis, per visą plotį.

import Link from 'next/link'
import { useState } from 'react'
import type { DailyStep, DailyTopRow, FantasyInfo, GilynInfo } from './page'

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
  gilyn: GilynInfo
}

type Wiz = null | 'zinios' | 'reakcija' | 'strategija' | 'atradimai' | 'stats'

const Chevron = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
)

export default function ZaidimaiHubClient({ isAuthenticated, streak, totalXp, daily, todayTop, fantasy, gilyn }: Props) {
  const [wiz, setWiz] = useState<Wiz>(null)

  const gilynLabel = gilyn?.status === 'done' ? 'Peržiūrėti kelią' : gilyn ? 'Tęsti kasimąsi' : 'Atidaryti dėžę'

  return (
    <div className="page-shell dg-shell">
      <style>{css}</style>

      <div className="dg-head">
        <h1>Žaidimai</h1>
        <button className="dg-stats" onClick={() => setWiz('stats')} aria-label="Statistika">
          <span>📊</span><span className="dg-stats-txt">Statistika</span>
        </button>
      </div>

      <div className="dg-grid">
        {/* Žinios */}
        <button className="dg-box b-zinios" onClick={() => setWiz('zinios')}>
          <div className="dg-ico">🧠</div>
          <div className="dg-ttl">Žinios{daily.allDone && <span className="dg-badge ok">✓ ĮVEIKTA</span>}</div>
          <div className="dg-desc">Kiek gerai pažįsti muziką? Dienos iššūkis ir kvizai.</div>
          <div className="dg-foot">
            <div className="dg-dots">
              {daily.steps.map((s, i) => <i key={i} className={s.done ? 'on' : ''} />)}
            </div>
            <span className="dg-stat">{daily.doneCount}/{daily.total}</span>
          </div>
          <span className="dg-go"><Chevron /></span>
        </button>

        {/* Atradimai — Gilyn */}
        <button className="dg-box b-atradimai" onClick={() => setWiz('atradimai')}>
          <div className="dg-ico">🗺️</div>
          <div className="dg-ttl">Atradimai</div>
          <div className="dg-desc">Gilyn — kasdienė plokštelių dėžė. Atrask naujų atlikėjų.</div>
          <div className="dg-foot">
            {gilyn?.status === 'done' ? <span className="dg-chip">✓ Kelias nueitas</span>
              : gilyn ? <span className="dg-chip">Tęsk kasimąsi</span>
                : <span className="dg-chip">💿 Atidaryk dėžę</span>}
          </div>
          <span className="dg-go"><Chevron /></span>
        </button>

        {/* Reakcija */}
        <button className="dg-box b-reakcija" onClick={() => setWiz('reakcija')}>
          <div className="dg-ico">⚡</div>
          <div className="dg-ttl">Reakcija</div>
          <div className="dg-desc">Greiti žaidimai su tikra muzika — spėk pagauti.</div>
          <div className="dg-foot"><span className="dg-chip">🎤 Koncertas</span><span className="dg-chip">🎯 Gaudyklė</span></div>
          <span className="dg-go"><Chevron /></span>
        </button>

        {/* Strategija */}
        <button className="dg-box b-strategija" onClick={() => setWiz('strategija')}>
          <div className="dg-ico">♟️</div>
          <div className="dg-ttl">Strategija</div>
          <div className="dg-desc">Ilgas žaidimas — valdyk komandą, kilk lygoje.</div>
          <div className="dg-foot">
            {fantasy?.rank ? <span className="dg-chip blue">Tavo komanda · #{fantasy.rank} iš {fantasy.totalTeams}</span>
              : <span className="dg-chip">Muzikos lyga · sudaryk komandą</span>}
          </div>
          <span className="dg-go"><Chevron /></span>
        </button>
      </div>

      {!isAuthenticated && (
        <div className="dg-login"><Link href="/auth/prisijungti">Prisijunk</Link> — išsaugok progresą ir gauk +50% taškų.</div>
      )}

      {/* ── Wizardai ── */}
      {wiz && (
        <div className="dg-wrap" onClick={() => setWiz(null)}>
          <div className="dg-card" onClick={e => e.stopPropagation()}>
            <button className="dg-close" onClick={() => setWiz(null)} aria-label="Uždaryti">✕</button>

            {wiz === 'zinios' && (
              <>
                <WizHead ico="🧠" title="Žinios" sub="Atpažink muziką — kasdien arba pavieniui" />
                <Link href="/zaidimai/dienos" className="dg-primary">
                  <div><b>Dienos iššūkis</b><span>Visas rinkinys · {daily.doneCount}/{daily.total} atlikta</span></div><Chevron />
                </Link>
                <div className="dg-or">arba pavieniui</div>
                <div className="dg-rows">
                  <WizRow href="/zaidimai/dainu-kvizas" ico="🎵" label="Atspėk dainą" note="audio kvizas" />
                  <WizRow href="/zaidimai/atspek-is-vaizdo" ico="🖼️" label="Atspėk iš vaizdo" note="viršelis ryškėja" />
                  <WizRow href="/zaidimai/atspek-is-sekundes" ico="⏱️" label="Atspėk iš sekundės" note="kuo trumpiau" />
                  <WizRow href="/zaidimai/kurie-metai" ico="📅" label="Kurie metai?" note="spėk metus" />
                  <WizRow href="/zaidimai/dvikovos" ico="⚔️" label="Dainų dvikovos" note="spėk daugumą" />
                </div>
              </>
            )}

            {wiz === 'atradimai' && (
              <>
                <WizHead ico="🧭" title="Atradimai" sub="Gilyn — kasdienė plokštelių dėžė" />
                <p className="dg-p">Kasdien — <b>20 plokštelių dėžė</b>, ta pati visiems. Laikyk vieną vinilą — dėžės gale jis taps durimis <b>gilyn</b> į muzikos pasaulį.</p>
                <Link href="/zaidimai/gilyn" className="dg-primary teal">
                  <div><b>{gilynLabel}</b><span>Atrask naujų atlikėjų ir dainų</span></div><Chevron />
                </Link>
              </>
            )}

            {wiz === 'reakcija' && (
              <>
                <WizHead ico="⚡" title="Reakcija" sub="Greiti žaidimai su tikra muzika" />
                <div className="dg-rows">
                  <WizRow href="/zaidimai/koncertas" ico="🎤" label="Dienos koncertas" note="dienos atlikėjo setas · gaudyk hype" big />
                  <WizRow href="/zaidimai/gaudykle" ico="🎯" label="Atlikėjų gaudyklė" note="gaudyk pasirinkto stiliaus atlikėjus" big />
                </div>
              </>
            )}

            {wiz === 'strategija' && (
              <>
                <WizHead ico="♟️" title="Strategija" sub="Muzikos lyga — fantasy komanda" />
                {fantasy ? (
                  <>
                    <div className="dg-team">Tavo komanda <b>{fantasy.name}</b> · {fantasy.seasonPoints} tšk.{fantasy.rank ? ` · #${fantasy.rank} iš ${fantasy.totalTeams}` : ''}</div>
                    <Link href="/zaidimai/vadybininkas" className="dg-primary blue"><div><b>Valdyti komandą</b><span>Perrink atlikėjus, stebėk taškus</span></div><Chevron /></Link>
                  </>
                ) : (
                  <>
                    <p className="dg-p">Sudaryk komandą iš realių atlikėjų — jie renka taškus pagal <b>tikrus rezultatus</b>: topus, YouTube augimą, naujas dainas. Kas savaitę — nauja kova dėl lygos viršūnės.</p>
                    <Link href="/zaidimai/vadybininkas" className="dg-primary blue"><div><b>Sukurti komandą</b><span>Užtruks porą minučių</span></div><Chevron /></Link>
                  </>
                )}
              </>
            )}

            {wiz === 'stats' && (
              <>
                <WizHead ico="📊" title="Tavo statistika" sub="Serija, taškai ir šiandienos top" />
                <div className="dg-stat2">
                  <div className="dg-s2"><b>{streak}</b><span>🔥 dienų serija</span></div>
                  <div className="dg-s2"><b>{totalXp.toLocaleString('lt-LT')}</b><span>⚡ iš viso taškų</span></div>
                </div>
                <div className="dg-or">šiandienos top</div>
                {todayTop.length === 0 ? (
                  <div className="dg-empty">Dar niekas nežaidė — būk pirmas!</div>
                ) : (
                  <ol className="dg-lb">
                    {todayTop.slice(0, 5).map((r, i) => (
                      <li key={i}><span className={`dg-pos p${i + 1}`}>{i + 1}</span><span className="dg-name">{r.name}</span><span className="dg-sc">{r.score}</span></li>
                    ))}
                  </ol>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function WizHead({ ico, title, sub }: { ico: string; title: string; sub: string }) {
  return (
    <div className="dg-wh">
      <div className="dg-wh-ico">{ico}</div>
      <div><div className="dg-wh-t">{title}</div><div className="dg-wh-s">{sub}</div></div>
    </div>
  )
}

function WizRow({ href, ico, label, note, big, badge }: { href: string; ico: string; label: string; note: string; big?: boolean; badge?: string }) {
  return (
    <Link href={href} className={'dg-row' + (big ? ' big' : '')}>
      <span className="dg-row-ico">{ico}</span>
      <span className="dg-row-m"><span className="dg-row-l">{label}{badge && <span className="dg-badge new">{badge}</span>}</span><span className="dg-row-n">{note}</span></span>
      <Chevron />
    </Link>
  )
}

const css = `
.dg-shell { display: flex; flex-direction: column; }
.dg-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 4px 0 14px; }
.dg-head h1 { font-size: 26px; font-weight: 900; letter-spacing: -0.02em; margin: 0; color: var(--text-primary); }
.dg-stats { display: inline-flex; align-items: center; gap: 7px; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.2); border-radius: 999px; padding: 6px 13px; color: var(--text-secondary); font-size: 12.5px; font-weight: 800; cursor: pointer; }
.dg-stats-txt { color: var(--text-secondary); }

.dg-grid { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 12px; min-height: calc(100dvh - 200px); }
.dg-box { position: relative; text-align: left; border: 1px solid rgba(140,160,190,0.16); border-radius: 18px; padding: 16px; display: flex; flex-direction: column; gap: 8px; cursor: pointer; color: var(--text-primary); overflow: hidden; }
.dg-box:active { transform: scale(0.985); }
.dg-ico { width: 42px; height: 42px; border-radius: 13px; display: flex; align-items: center; justify-content: center; font-size: 21px; }
.dg-ttl { font-size: 17px; font-weight: 900; letter-spacing: -0.01em; display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.dg-desc { font-size: 11.5px; color: var(--text-muted); line-height: 1.4; }
.dg-foot { margin-top: auto; display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.dg-go { position: absolute; top: 15px; right: 14px; color: var(--text-muted); opacity: 0.7; }
.dg-stat { font-size: 12px; font-weight: 900; color: var(--text-primary); }
.dg-dots { display: flex; gap: 4px; }
.dg-dots i { width: 15px; height: 5px; border-radius: 3px; background: rgba(255,255,255,0.13); }
.dg-dots i.on { background: var(--accent-orange); }
.dg-chip { font-size: 10.5px; font-weight: 800; color: #cbd5e1; background: rgba(255,255,255,0.06); border: 1px solid rgba(140,160,190,0.15); border-radius: 7px; padding: 3px 8px; }
.dg-chip.blue { color: #93c5fd; border-color: rgba(59,130,246,0.3); background: rgba(59,130,246,0.1); }
.dg-badge { font-size: 9px; font-weight: 900; border-radius: 999px; padding: 2px 7px; letter-spacing: 0.04em; }
.dg-badge.new { background: #22c55e; color: #04220f; }
.dg-badge.ok { background: rgba(34,197,94,0.18); color: #86efac; }
.dg-badge.soon { background: rgba(148,163,184,0.2); color: #cbd5e1; }
.b-zinios { background: linear-gradient(150deg, rgba(249,158,11,0.16), rgba(249,115,22,0.03)); }
.b-zinios .dg-ico { background: linear-gradient(135deg, #f59e0b, #f97316); }
.b-atradimai { background: linear-gradient(150deg, rgba(34,211,238,0.14), rgba(34,197,94,0.04)); }
.b-atradimai .dg-ico { background: linear-gradient(135deg, #22d3ee, #22c55e); }
.b-reakcija { background: linear-gradient(150deg, rgba(139,92,246,0.16), rgba(236,72,153,0.05)); }
.b-reakcija .dg-ico { background: linear-gradient(135deg, #8b5cf6, #ec4899); }
.b-strategija { background: linear-gradient(150deg, rgba(59,130,246,0.16), rgba(59,130,246,0.03)); }
.b-strategija .dg-ico { background: linear-gradient(135deg, #60a5fa, #3b82f6); }

.dg-login { margin-top: 14px; text-align: center; font-size: 13px; color: var(--text-muted); }
.dg-login a { color: var(--accent-orange); font-weight: 800; text-decoration: none; }

/* Desktop — didesni boxai, per visą plotį */
@media (min-width: 720px) {
  .dg-head h1 { font-size: 30px; }
  .dg-grid { gap: 16px; min-height: 0; grid-template-rows: auto auto; }
  .dg-box { min-height: 240px; padding: 22px; gap: 10px; }
  .dg-ico { width: 50px; height: 50px; font-size: 25px; border-radius: 15px; }
  .dg-ttl { font-size: 21px; }
  .dg-desc { font-size: 13px; }
}

/* Wizard */
.dg-wrap { position: fixed; inset: 0; z-index: 60; background: rgba(5,7,12,0.66); display: flex; align-items: flex-end; justify-content: center; padding: 0; }
.dg-card { position: relative; width: 100%; max-width: 460px; background: var(--panel, #161b26); border: 1px solid rgba(140,160,190,0.2); border-radius: 22px 22px 0 0; padding: 22px 18px 26px; max-height: 86vh; overflow-y: auto; animation: dgup .22s ease; }
@keyframes dgup { from { transform: translateY(30px); opacity: 0.4; } to { transform: translateY(0); opacity: 1; } }
@media (min-width: 720px) { .dg-wrap { align-items: center; } .dg-card { border-radius: 22px; } }
.dg-close { position: absolute; top: 14px; right: 14px; width: 30px; height: 30px; border-radius: 50%; border: 0; background: rgba(255,255,255,0.08); color: var(--text-secondary); font-size: 14px; cursor: pointer; }
.dg-wh { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.dg-wh-ico { width: 44px; height: 44px; border-radius: 13px; background: rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: center; font-size: 22px; }
.dg-wh-t { font-size: 19px; font-weight: 900; }
.dg-wh-s { font-size: 12.5px; color: var(--text-muted); }
.dg-primary { display: flex; align-items: center; justify-content: space-between; gap: 10px; background: var(--accent-orange); color: #fff; border: 0; width: 100%; border-radius: 14px; padding: 13px 16px; text-decoration: none; cursor: pointer; text-align: left; }
.dg-primary.blue { background: #3b82f6; }
.dg-primary.teal { background: #0891b2; }
.dg-primary.muted { background: var(--bg-surface); color: var(--text-primary); border: 1px solid rgba(140,160,190,0.25); }
.dg-primary b { font-size: 15px; font-weight: 900; display: block; }
.dg-primary span { font-size: 11.5px; opacity: 0.85; }
.dg-or { text-align: center; font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin: 14px 0 10px; }
.dg-rows { display: flex; flex-direction: column; gap: 8px; }
.dg-row { display: flex; align-items: center; gap: 11px; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.16); border-radius: 12px; padding: 11px 13px; text-decoration: none; color: var(--text-primary); }
.dg-row.big { padding: 14px 14px; }
.dg-row-ico { font-size: 18px; width: 24px; text-align: center; }
.dg-row-m { flex: 1; display: flex; flex-direction: column; }
.dg-row-l { font-size: 14px; font-weight: 800; display: flex; align-items: center; gap: 7px; }
.dg-row-n { font-size: 11.5px; color: var(--text-muted); }
.dg-row svg { color: var(--text-muted); }
.dg-p { font-size: 13.5px; color: var(--text-secondary); line-height: 1.55; margin: 0 0 16px; }
.dg-p b { color: var(--text-primary); }
.dg-team { font-size: 13px; color: var(--text-secondary); margin-bottom: 12px; }
.dg-team b { color: var(--text-primary); }
.dg-stat2 { display: flex; gap: 10px; margin-bottom: 6px; }
.dg-s2 { flex: 1; background: var(--bg-surface); border-radius: 14px; padding: 14px; text-align: center; }
.dg-s2 b { font-size: 26px; font-weight: 900; display: block; line-height: 1; }
.dg-s2 span { font-size: 11px; color: var(--text-muted); }
.dg-empty { font-size: 13px; color: var(--text-muted); text-align: center; padding: 14px 0; }
.dg-lb { list-style: none; padding: 0; margin: 0; }
.dg-lb li { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid rgba(140,160,190,0.12); font-size: 13.5px; }
.dg-lb li:last-child { border-bottom: 0; }
.dg-pos { width: 20px; height: 20px; border-radius: 6px; background: var(--bg-surface); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 900; color: var(--text-muted); }
.dg-pos.p1 { background: var(--accent-orange); color: #fff; }
.dg-name { flex: 1; }
.dg-sc { font-weight: 900; color: var(--accent-orange); }
`
