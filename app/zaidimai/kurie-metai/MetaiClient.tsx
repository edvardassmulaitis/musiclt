'use client'

// app/zaidimai/kurie-metai/MetaiClient.tsx
//
// „Kurie metai?" — populiaraus albumo viršelis + pavadinimas; spėk
// išleidimo metus (4 variantai, 12 s). Startuoja iškart, be intro.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import ZaidimoLangas from '@/components/zaidimai/ZaidimoLangas'

type Option = { id: number; name: string }
type Round = { r: number; image: string; label: string; options: Option[]; token: string }
type RoundResult = { correct: boolean; correctId: number; points: number }

const ROUND_MS = 12000
const REVEAL_MS = 3000

type Phase = 'loading' | 'round' | 'reveal' | 'submitting' | 'results'

export default function MetaiClient() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [rounds, setRounds] = useState<Round[]>([])
  const [quizId, setQuizId] = useState('')
  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [roundError, setRoundError] = useState<{ answerId: number | null; ms: number } | null>(null)
  const [timeLeft, setTimeLeft] = useState(ROUND_MS)
  const [score, setScore] = useState(0)
  const [lastPoints, setLastPoints] = useState(0)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const startRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const answerRef = useRef<(id: number | null) => void>(() => {})
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); if (revealTimerRef.current) clearTimeout(revealTimerRef.current) }, [])

  const round = rounds[idx] || null

  useEffect(() => {
    void start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function start() {
    setPhase('loading')
    setError(null)
    try {
      const res = await fetch('/api/zaidimai/metai?raundai=8')
      const json = await res.json()
      if (!res.ok || !json.rounds?.length) { setError(json.error || 'Nepavyko įkelti'); return }
      setRounds(json.rounds)
      setQuizId(json.quizId)
      setIdx(0)
      setScore(0)
      setResult(null)
      setRoundResult(null)
      setRoundError(null)
      startRound()
      setPhase('round')
    } catch { setError('Tinklo klaida') }
  }

  function startRound() {
    startRef.current = Date.now()
    setTimeLeft(ROUND_MS)
    setPicked(null)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      const left = ROUND_MS - (Date.now() - startRef.current)
      if (left <= 0) { setTimeLeft(0); answerRef.current(null) }
      else setTimeLeft(left)
    }, 100)
  }

  function answer(answerId: number | null) {
    if (phaseRef.current !== 'round' || !round || checking) return
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    const ms = Math.min(Date.now() - startRef.current, ROUND_MS)
    setPicked(answerId)
    setChecking(true)
    setRoundError(null)
    void sendAnswer(round, answerId, ms)
  }
  answerRef.current = answer

  async function sendAnswer(r: Round, answerId: number | null, ms: number) {
    try {
      const res = await fetch('/api/zaidimai/raundas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: r.token, answerId, ms }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Nepavyko')
      setChecking(false)
      setRoundResult({ correct: json.correct, correctId: json.correctId, points: json.points })
      setLastPoints(json.points)
      setScore(s => s + json.points)
      setPhase('reveal')
      revealTimerRef.current = setTimeout(next, REVEAL_MS)
    } catch {
      setChecking(false)
      setRoundError({ answerId, ms })
    }
  }

  function next() {
    if (revealTimerRef.current) { clearTimeout(revealTimerRef.current); revealTimerRef.current = null }
    if (idx + 1 >= rounds.length) { void submit(); return }
    setIdx(i => i + 1)
    setRoundResult(null)
    startRound()
    setPhase('round')
  }

  async function submit() {
    setPhase('submitting')
    try {
      const res = await fetch('/api/zaidimai/metai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizId }),
      })
      const json = await res.json()
      if (!res.ok && res.status !== 409) setResult({ submitError: json.error || 'Nepavyko užskaityti — pabandyk dar kartą' })
      else setResult(json)
    } catch { setResult({ submitError: 'Tinklo klaida — rezultato užskaityti nepavyko' }) }
    setPhase('results')
  }

  const pct = Math.max(0, timeLeft / ROUND_MS)

  return (
    <ZaidimoLangas
      title="Kurie metai?"
      maxWidth={620}
      right={phase !== 'results' && rounds.length > 0 ? (
        <>
          <span className="mt-n">{Math.min(idx + 1, rounds.length)}/{rounds.length}</span>
          <span className="mt-score">⚡ {score}</span>
        </>
      ) : null}
    >
      <style>{css}</style>

      {phase === 'loading' && (
        error ? (
          <div className="mt-center">
            <div className="mt-error">{error}</div>
            <button className="mt-cta" onClick={() => void start()}>Bandyti dar</button>
          </div>
        ) : <div className="mt-center"><div className="mt-spinner" /></div>
      )}

      {(phase === 'round' || phase === 'reveal') && round && (
        <div className="mt-stage">
          {idx === 0 && phase === 'round' && (
            <p className="mt-hint">Kuriais metais išleistas šis albumas?</p>
          )}
          <div className="mt-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={round.r} src={proxyImg(round.image, 480)} alt={round.label} decoding="async" />
            <div className="mt-card-meta">
              <span className="mt-card-label">{round.label}</span>
              {phase === 'round' && <span className="mt-clock">{Math.ceil(timeLeft / 1000)}</span>}
              {phase === 'reveal' && roundResult && (
                <span className={`mt-tag ${roundResult.correct ? 'ok' : 'bad'}`}>
                  {roundResult.correct ? `+${lastPoints} tšk.` : picked === null ? 'Laikas baigėsi!' : `${roundResult.correctId} m.`}
                </span>
              )}
            </div>
          </div>
          <div className="mt-timebar"><div style={{ width: `${pct * 100}%` }} /></div>
          <div className="mt-options">
            {round.options.map(o => {
              let cls = 'mt-opt'
              if (phase === 'reveal' && roundResult) {
                if (o.id === roundResult.correctId) cls += ' correct'
                else if (o.id === picked) cls += ' wrong'
                else cls += ' dim'
              } else if (checking && o.id === picked) {
                cls += ' checking'
              }
              return (
                <button key={o.id} className={cls} disabled={phase !== 'round' || checking} onClick={() => answer(o.id)}>
                  {o.name}
                </button>
              )
            })}
          </div>
          {roundError && (
            <div className="mt-error">
              Atsakymo išsiųsti nepavyko.
              <button className="mt-retry" onClick={() => { setRoundError(null); setChecking(true); void sendAnswer(round, roundError.answerId, roundError.ms) }}>Bandyti dar</button>
            </div>
          )}
          {phase === 'reveal' && (
            <button className="mt-next" onClick={next}>{idx + 1 >= rounds.length ? 'Rezultatai →' : 'Kitas →'}</button>
          )}
        </div>
      )}

      {phase === 'submitting' && <div className="mt-center"><div className="mt-spinner" /></div>}

      {phase === 'results' && (
        <div className="mt-results">
          {result?.submitError && (
            <div className="mt-error" style={{ marginBottom: 12 }}>
              {result.submitError}
              <button className="mt-retry" onClick={() => void submit()}>Bandyti dar</button>
            </div>
          )}
          <div className="mt-score-big">
            <span className="mt-score-num">{result?.score ?? score}</span>
            <span className="mt-score-max">iš {result?.maxScore ?? rounds.length * 100} galimų</span>
          </div>
          <p className="mt-line">Atspėta <b>{result?.correctCount ?? '—'}</b> iš {result?.roundCount ?? rounds.length}</p>
          {result?.xp > 0 ? (
            <p className="mt-xp">⚡ +{result.xp} taškų{result.totalXp > 0 ? ` · iš viso ${result.totalXp.toLocaleString('lt-LT')}` : ''}</p>
          ) : result && !result.xpEligible ? (
            <p className="mt-xp dim">Dienos taškų limitas — ši partija be taškų 💪</p>
          ) : null}
          <div className="mt-actions">
            <button className="mt-cta" onClick={() => void start()}>Dar kartą</button>
            <Link href="/zaidimai" className="mt-back-link">← Žaidimai</Link>
          </div>
        </div>
      )}
    </ZaidimoLangas>
  )
}

const css = `
.mt-n { font-size: 13px; font-weight: 800; color: var(--text-secondary); }
.mt-score { font-size: 15px; font-weight: 900; color: var(--text-primary); }
.mt-hint { font-size: 12.5px; color: var(--text-secondary); text-align: center; margin: 0; }
.mt-error { font-size: 14px; color: var(--accent-red); background: rgba(248,113,113,0.1); border-radius: 10px; padding: 10px 14px; margin-bottom: 12px; }
.mt-retry { margin-left: 10px; font-size: 12px; font-weight: 800; color: var(--accent-red); background: transparent; border: 1px solid rgba(248,113,113,0.5); border-radius: 8px; padding: 4px 10px; cursor: pointer; }
.mt-cta { font-size: 16px; font-weight: 800; color: #fff; cursor: pointer; border: 0; border-radius: 999px; padding: 13px 30px; background: var(--accent-orange); }
.mt-center { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 70px 0; }
.mt-spinner { width: 38px; height: 38px; border-radius: 50%; border: 3px solid rgba(148,163,184,0.25); border-top-color: var(--accent-orange); animation: mtspin .8s linear infinite; }
@keyframes mtspin { to { transform: rotate(360deg); } }

.mt-stage { display: flex; flex-direction: column; gap: 12px; }
.mt-card { border-radius: 14px; overflow: hidden; background: #10131b; }
.mt-card img { width: 100%; aspect-ratio: 1/1; object-fit: cover; display: block; max-height: 44vh; }
.mt-card-meta { display: flex; align-items: center; gap: 10px; padding: 10px 14px; }
.mt-card-label { font-size: 14px; font-weight: 800; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mt-clock { margin-left: auto; flex-shrink: 0; font-size: 16px; font-weight: 900; color: var(--accent-orange); }
.mt-tag { margin-left: auto; flex-shrink: 0; font-size: 13px; font-weight: 900; padding: 5px 12px; border-radius: 9px; color: #fff; }
.mt-tag.ok { background: rgba(16,185,129,0.92); }
.mt-tag.bad { background: rgba(239,68,68,0.9); }
.mt-timebar { height: 5px; border-radius: 3px; background: rgba(148,163,184,0.18); overflow: hidden; }
.mt-timebar div { height: 100%; background: var(--accent-orange); transition: width .1s linear; }

.mt-options { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
@media (max-width: 480px) { .mt-options { grid-template-columns: repeat(2, 1fr); } }
.mt-opt {
  font-size: 17px; font-weight: 900; color: var(--text-primary); text-align: center; cursor: pointer;
  padding: 13px 6px; border-radius: 12px; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.22);
}
.mt-opt:hover:not(:disabled) { border-color: var(--accent-orange); }
.mt-opt.correct { background: rgba(16,185,129,0.16); border-color: #10b981; color: #34d399; }
.mt-opt.wrong { background: rgba(239,68,68,0.13); border-color: #ef4444; }
.mt-opt.dim { opacity: 0.45; }
.mt-opt.checking { border-color: var(--accent-orange); animation: mtcheck .5s ease infinite alternate; }
@keyframes mtcheck { from { opacity: 0.75; } to { opacity: 1; } }
.mt-next { align-self: center; font-size: 16px; font-weight: 800; color: #fff; cursor: pointer; background: var(--accent-orange); border: 0; border-radius: 999px; padding: 12px 28px; }

.mt-results { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 30px 0; }
.mt-score-big { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.25); border-radius: 16px; padding: 22px 34px; }
.mt-score-num { font-size: 44px; font-weight: 900; color: var(--text-primary); line-height: 1; }
.mt-score-max { font-size: 14px; color: var(--text-muted); }
.mt-line { font-size: 16px; color: var(--text-secondary); margin: 4px 0; }
.mt-line b { color: var(--text-primary); }
.mt-xp { font-size: 16px; font-weight: 700; color: var(--accent-orange); margin: 8px 0; }
.mt-xp.dim { color: var(--text-muted); font-weight: 500; }
.mt-actions { display: flex; gap: 14px; align-items: center; margin-top: 16px; }
.mt-back-link { font-size: 14px; color: var(--text-secondary); text-decoration: none; }
`
