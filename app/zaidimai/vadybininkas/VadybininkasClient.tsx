'use client'

// app/zaidimai/vadybininkas/VadybininkasClient.tsx
//
// „Muzikos vadybininkas" v1: draft'as (3 atlikėjai į biudžetą) → metų
// simuliacija ketvirčiais (server-side, realūs atlikėjų duomenys) → agentūros
// vertė + vadybininko titulas.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'

type MarketArtist = {
  id: number; name: string; slug: string; image: string | null
  tier: 'A' | 'B' | 'C'; tierLabel: string; price: number; stars: number; trending: boolean
}
type SimEvent = { artist: string; text: string; delta: number }
type SimQuarter = { q: number; label: string; events: SimEvent[]; income: number }
type SimResult = {
  spent: number; remaining: number; quarters: SimQuarter[]
  resale: Array<{ id: number; name: string; image: string | null; bought: number; value: number }>
  totalIncome: number; finalValue: number
  grade: { label: string; emoji: string }
  xp: number; xpEligible: boolean; xpRunsLeft: number; totalXp: number
}

type Phase = 'loading' | 'draft' | 'simulating' | 'season' | 'results'

const TIER_ACCENT: Record<string, string> = { A: '#f59e0b', B: '#6366f1', C: '#10b981' }

export default function VadybininkasClient() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [market, setMarket] = useState<MarketArtist[]>([])
  const [budget, setBudget] = useState(100)
  const [token, setToken] = useState('')
  const [picked, setPicked] = useState<number[]>([])
  const [result, setResult] = useState<SimResult | null>(null)
  const [shownQ, setShownQ] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [xpRunsLeft, setXpRunsLeft] = useState<number | null>(null)
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function loadMarket() {
    setPhase('loading')
    setPicked([])
    setResult(null)
    setShownQ(0)
    setError(null)
    try {
      const res = await fetch('/api/zaidimai/vadybininkas')
      const json = await res.json()
      if (!res.ok || !json.market) {
        setError(json.error || 'Rinka nepasiekiama — pabandyk vėliau')
        return
      }
      setMarket(json.market)
      setBudget(json.budget)
      setToken(json.token)
      setXpRunsLeft(json.xpRunsLeft ?? null)
      setPhase('draft')
    } catch {
      setError('Tinklo klaida — pabandyk dar kartą')
    }
  }

  useEffect(() => {
    void loadMarket()
    return () => { if (qTimer.current) clearTimeout(qTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const spent = picked.reduce((s, id) => s + (market.find(m => m.id === id)?.price || 0), 0)
  const left = budget - spent
  const canStart = picked.length === 3 && left >= 0

  function toggle(id: number) {
    setPicked(p => {
      if (p.includes(id)) return p.filter(x => x !== id)
      if (p.length >= 3) return p
      return [...p, id]
    })
  }

  async function startSeason() {
    if (!canStart) return
    setPhase('simulating')
    try {
      const res = await fetch('/api/zaidimai/vadybininkas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, picked }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Simuliacija nepavyko')
        setPhase('draft')
        return
      }
      setResult(json)
      setShownQ(0)
      setPhase('season')
      scheduleNextQuarter(0)
    } catch {
      setError('Tinklo klaida — pabandyk dar kartą')
      setPhase('draft')
    }
  }

  function scheduleNextQuarter(current: number) {
    if (qTimer.current) clearTimeout(qTimer.current)
    qTimer.current = setTimeout(() => {
      if (current + 1 < 4) {
        setShownQ(current + 1)
        scheduleNextQuarter(current + 1)
      } else {
        setPhase('results')
      }
    }, 2600)
  }

  function skipToResults() {
    if (qTimer.current) clearTimeout(qTimer.current)
    setPhase('results')
  }

  const pickedArtists = picked.map(id => market.find(m => m.id === id)!).filter(Boolean)

  return (
    <div className="vd-root">
      <style>{css}</style>

      <div className="vd-top">
        <Link href="/zaidimai" className="vd-back">← Žaidimai</Link>
        {phase === 'draft' && xpRunsLeft !== null && (
          <span className="vd-xp-note">{xpRunsLeft > 0 ? `Taškai dar už ${xpRunsLeft} žaidim${xpRunsLeft === 1 ? 'ą' : 'us'} šiandien` : 'Šiandien — treniruotės režimas'}</span>
        )}
      </div>

      <h1 className="vd-h1">Muzikos vadybininkas</h1>

      {error && <div className="vd-error">{error} <button className="vd-retry" onClick={loadMarket}>Bandyti dar</button></div>}

      {phase === 'loading' && !error && (
        <div className="vd-center"><div className="vd-spinner" /><p className="vd-lead">Ruošiam atlikėjų rinką...</p></div>
      )}

      {/* ── Draft ── */}
      {phase === 'draft' && (
        <>
          <p className="vd-lead">
            Turi <b>{budget} tšk. biudžetą</b> — pasamdyk <b>3 atlikėjus</b> ir išgyvenk metus muzikos versle.
            Superžvaigždė saugu, bet brangu; kylantys — pigūs, bet gali iššauti.
          </p>

          <div className="vd-budget">
            <div className="vd-budget-bar">
              <div style={{ width: `${Math.min(100, (spent / budget) * 100)}%`, background: left < 0 ? '#ef4444' : undefined }} />
            </div>
            <span className={`vd-budget-num${left < 0 ? ' over' : ''}`}>{left < 0 ? `Viršyta ${-left}` : `Liko ${left}`} tšk.</span>
          </div>

          <div className="vd-market">
            {(['A', 'B', 'C'] as const).map(tier => (
              <div key={tier} className="vd-tier">
                <div className="vd-tier-head" style={{ color: TIER_ACCENT[tier] }}>
                  {tier === 'A' ? '⭐ Superžvaigždės' : tier === 'B' ? '🎤 Scenos vardai' : '🚀 Kylantys'}
                </div>
                <div className="vd-tier-row">
                  {market.filter(m => m.tier === tier).map(m => {
                    const isPicked = picked.includes(m.id)
                    const disabled = !isPicked && (picked.length >= 3 || m.price > left)
                    return (
                      <button
                        key={m.id}
                        className={`vd-card${isPicked ? ' picked' : ''}${disabled ? ' disabled' : ''}`}
                        style={{ ['--acc' as any]: TIER_ACCENT[tier] }}
                        onClick={() => toggle(m.id)}
                        disabled={disabled && !isPicked}
                      >
                        <span className="vd-card-img">
                          {m.image
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={proxyImg(m.image, 160)} alt="" loading="lazy" />
                            : <span className="vd-card-img-ph">🎤</span>}
                          {m.trending && <span className="vd-card-trend">📈 kyla</span>}
                        </span>
                        <span className="vd-card-name">{m.name}</span>
                        <span className="vd-card-stars">{'★'.repeat(m.stars)}{'☆'.repeat(5 - m.stars)}</span>
                        <span className="vd-card-price">{m.price} tšk.</span>
                        {isPicked && <span className="vd-card-check">✓ Pasirašyta</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="vd-startbar">
            <span className="vd-startbar-info">
              {picked.length}/3 atlikėjai{spent > 0 ? ` · išleista ${spent} tšk.` : ''}
            </span>
            <button className="vd-start" disabled={!canStart} onClick={startSeason}>Pradėti sezoną →</button>
          </div>
        </>
      )}

      {phase === 'simulating' && (
        <div className="vd-center"><div className="vd-spinner" /><p className="vd-lead">Metai prasideda...</p></div>
      )}

      {/* ── Sezono eiga ── */}
      {phase === 'season' && result && (
        <div className="vd-season">
          <div className="vd-roster-mini">
            {pickedArtists.map(a => (
              <span key={a.id} className="vd-roster-chip">{a.name}</span>
            ))}
          </div>
          {result.quarters.slice(0, shownQ + 1).map(q => (
            <div key={q.q} className="vd-quarter">
              <div className="vd-quarter-head">
                <span className="vd-quarter-label">{q.label}</span>
                <span className={`vd-quarter-income${q.income >= 0 ? '' : ' neg'}`}>{q.income >= 0 ? '+' : ''}{q.income} tšk.</span>
              </div>
              {q.events.length === 0 ? (
                <div className="vd-event dim">Ramus ketvirtis — koncertai, streamai, rutina.</div>
              ) : q.events.map((e, i) => (
                <div key={i} className="vd-event">
                  <b>{e.artist}</b> {e.text}
                  <span className={`vd-event-delta${e.delta >= 0 ? '' : ' neg'}`}>{e.delta >= 0 ? '+' : ''}{e.delta}</span>
                </div>
              ))}
            </div>
          ))}
          <button className="vd-skip" onClick={skipToResults}>Praleisti į rezultatus →</button>
        </div>
      )}

      {/* ── Rezultatai ── */}
      {phase === 'results' && result && (
        <div className="vd-results">
          <div className="vd-grade">
            <span className="vd-grade-emoji">{result.grade.emoji}</span>
            <span className="vd-grade-label">{result.grade.label}</span>
          </div>
          <div className="vd-value">
            Agentūros vertė: <b>{result.finalValue} tšk.</b>
            <span className="vd-value-sub">(startavai su 100)</span>
          </div>

          <div className="vd-breakdown">
            <div><span>Liko biudžeto</span><b>{result.remaining}</b></div>
            <div><span>Metų pajamos</span><b>{result.totalIncome >= 0 ? '+' : ''}{result.totalIncome}</b></div>
            <div><span>Roster'io vertė</span><b>{result.resale.reduce((s, r) => s + r.value, 0)}</b></div>
          </div>

          <div className="vd-resale">
            {result.resale.map(r => (
              <div key={r.id} className="vd-resale-row">
                <span className="vd-resale-name">{r.name}</span>
                <span className="vd-resale-nums">
                  pirkta už {r.bought} → dabar <b className={r.value >= r.bought ? 'up' : 'down'}>{r.value}</b>
                </span>
              </div>
            ))}
          </div>

          {result.xp > 0 ? (
            <p className="vd-xp-line">⚡ Užskaityta <b>+{result.xp}</b> taškų{result.totalXp > 0 ? ` — iš viso ${result.totalXp.toLocaleString('lt-LT')}` : ''}</p>
          ) : !result.xpEligible ? (
            <p className="vd-xp-line dim">Dienos limitas — ši partija be taškų, bet įgūdžiai auga 😉</p>
          ) : null}

          <div className="vd-result-actions">
            <button className="vd-again" onClick={loadMarket}>Nauja rinka — žaisti dar</button>
            <Link href="/zaidimai" className="vd-back-btn">← Žaidimai</Link>
          </div>
        </div>
      )}
    </div>
  )
}

const css = `
.vd-root { max-width: 900px; margin: 0 auto; padding: 24px 16px 90px; }
.vd-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.vd-back { font-size: 14px; font-weight: 700; color: var(--text-secondary); text-decoration: none; }
.vd-xp-note { font-size: 12px; color: var(--text-muted); }
.vd-h1 { font-size: 30px; font-weight: 900; letter-spacing: -0.02em; color: var(--text-primary); margin: 0 0 10px; }
.vd-lead { font-size: 14px; color: var(--text-secondary); line-height: 1.55; margin: 0 0 18px; max-width: 640px; }
.vd-lead b { color: var(--text-primary); }
.vd-error { font-size: 14px; color: #f87171; background: rgba(248,113,113,0.1); border-radius: 10px; padding: 10px 14px; margin-bottom: 14px; display: flex; align-items: center; gap: 10px; }
.vd-retry { font-size: 12px; font-weight: 800; border: 1px solid rgba(248,113,113,0.5); background: transparent; color: #f87171; border-radius: 8px; padding: 4px 10px; cursor: pointer; }

.vd-center { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 70px 0; }
.vd-spinner { width: 38px; height: 38px; border-radius: 50%; border: 3px solid rgba(148,163,184,0.25); border-top-color: #10b981; animation: vdspin .8s linear infinite; }
@keyframes vdspin { to { transform: rotate(360deg); } }

.vd-budget { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; position: sticky; top: 64px; z-index: 5; background: var(--bg-body); padding: 8px 0; }
.vd-budget-bar { flex: 1; height: 10px; border-radius: 5px; background: rgba(148,163,184,0.18); overflow: hidden; }
.vd-budget-bar div { height: 100%; background: linear-gradient(90deg, #10b981, #f59e0b); transition: width .2s ease; }
.vd-budget-num { font-size: 14px; font-weight: 900; color: var(--text-primary); white-space: nowrap; }
.vd-budget-num.over { color: #ef4444; }

.vd-tier { margin-bottom: 18px; }
.vd-tier-head { font-size: 14px; font-weight: 900; margin-bottom: 8px; }
.vd-tier-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
@media (max-width: 560px) { .vd-tier-row { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; } }

.vd-card {
  position: relative; display: flex; flex-direction: column; align-items: center; gap: 3px; text-align: center;
  padding: 12px 8px 12px; border-radius: 14px; cursor: pointer;
  background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.2);
  transition: transform .13s ease, border-color .13s ease, opacity .13s ease;
}
.vd-card:hover:not(.disabled) { transform: translateY(-2px); border-color: var(--acc); }
.vd-card.picked { border-color: var(--acc); box-shadow: 0 0 0 2px color-mix(in srgb, var(--acc) 45%, transparent); }
.vd-card.disabled { opacity: 0.42; cursor: not-allowed; }
.vd-card-img { position: relative; width: 68px; height: 68px; border-radius: 50%; overflow: hidden; background: rgba(148,163,184,0.15); margin-bottom: 4px; }
.vd-card-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.vd-card-img-ph { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; font-size: 26px; }
.vd-card-trend { position: absolute; bottom: -2px; left: 50%; transform: translateX(-50%); font-size: 9px; font-weight: 800; background: #10b981; color: #062; color: #04120b; border-radius: 999px; padding: 1px 6px; white-space: nowrap; }
.vd-card-name { font-size: 12px; font-weight: 800; color: var(--text-primary); line-height: 1.2; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.vd-card-stars { font-size: 10px; color: #f59e0b; letter-spacing: 0.08em; }
.vd-card-price { font-size: 14px; font-weight: 900; color: var(--acc); }
.vd-card-check { font-size: 10px; font-weight: 800; color: var(--acc); }

.vd-startbar {
  position: sticky; bottom: 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px;
  background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.25); border-radius: 16px; padding: 12px 16px;
  box-shadow: 0 12px 34px rgba(0,0,0,0.35);
}
.vd-startbar-info { font-size: 14px; color: var(--text-secondary); }
.vd-start {
  font-size: 16px; font-weight: 800; color: #fff; cursor: pointer; border: 0; border-radius: 999px; padding: 11px 24px;
  background: linear-gradient(135deg, #10b981, #059669);
}
.vd-start:disabled { opacity: 0.4; cursor: not-allowed; }

.vd-roster-mini { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.vd-roster-chip { font-size: 12px; font-weight: 800; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.25); color: var(--text-primary); border-radius: 999px; padding: 5px 12px; }

.vd-quarter { background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.2); border-radius: 14px; padding: 14px 16px; margin-bottom: 10px; animation: vdin .35s ease; }
@keyframes vdin { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.vd-quarter-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.vd-quarter-label { font-size: 14px; font-weight: 900; color: var(--text-primary); }
.vd-quarter-income { font-size: 16px; font-weight: 900; color: #10b981; }
.vd-quarter-income.neg { color: #ef4444; }
.vd-event { font-size: 14px; color: var(--text-secondary); padding: 4px 0; display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
.vd-event b { color: var(--text-primary); }
.vd-event.dim { color: var(--text-muted); }
.vd-event-delta { margin-left: auto; font-weight: 900; color: #10b981; }
.vd-event-delta.neg { color: #ef4444; }
.vd-skip { display: block; margin: 8px auto 0; font-size: 14px; font-weight: 800; color: var(--text-secondary); background: transparent; border: 1px solid rgba(140,160,190,0.3); border-radius: 999px; padding: 9px 20px; cursor: pointer; }

.vd-results { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 16px 0; }
.vd-grade { display: flex; flex-direction: column; align-items: center; gap: 6px; margin-bottom: 12px; }
.vd-grade-emoji { font-size: 52px; }
.vd-grade-label { font-size: 24px; font-weight: 900; color: var(--text-primary); }
.vd-value { font-size: 16px; color: var(--text-secondary); margin-bottom: 18px; }
.vd-value b { color: #10b981; font-size: 20px; }
.vd-value-sub { display: block; font-size: 12px; color: var(--text-muted); }
.vd-breakdown { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-bottom: 16px; }
.vd-breakdown > div { display: flex; flex-direction: column; gap: 2px; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.2); border-radius: 12px; padding: 10px 18px; }
.vd-breakdown span { font-size: 12px; color: var(--text-muted); }
.vd-breakdown b { font-size: 16px; color: var(--text-primary); }
.vd-resale { width: 100%; max-width: 460px; margin-bottom: 16px; }
.vd-resale-row { display: flex; align-items: center; justify-content: space-between; font-size: 14px; padding: 7px 4px; border-bottom: 1px dashed rgba(140,160,190,0.2); }
.vd-resale-name { font-weight: 800; color: var(--text-primary); }
.vd-resale-nums { color: var(--text-secondary); font-size: 12px; }
.vd-resale-nums b.up { color: #10b981; }
.vd-resale-nums b.down { color: #ef4444; }
.vd-xp-line { font-size: 16px; font-weight: 700; color: #f59e0b; margin: 6px 0 14px; }
.vd-xp-line.dim { color: var(--text-muted); font-weight: 500; }
.vd-result-actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; justify-content: center; }
.vd-again { font-size: 16px; font-weight: 800; color: #fff; cursor: pointer; border: 0; border-radius: 999px; padding: 12px 24px; background: linear-gradient(135deg, #10b981, #059669); box-shadow: 0 10px 26px rgba(16,185,129,0.3); }
.vd-back-btn { font-size: 14px; font-weight: 700; color: var(--text-secondary); text-decoration: none; }
`
