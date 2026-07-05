'use client'

// app/zaidimai/atspek-is-vaizdo/VaizdasClient.tsx
//
// „Atspėk iš vaizdo" — atlikėjo nuotrauka pradžioje išblurinta (blur 34px)
// ir per 12 s ryškėja (CSS transition). Kuo greičiau atspėsi — tuo daugiau
// taškų. 8 raundai, rezultatas skaičiuojamas server-side (HMAC token'ai).

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'

type Option = { id: number; name: string }
type Round = { r: number; image: string; options: Option[]; token: string }
type RoundResult = { correct: boolean; correctId: number; points: number }

const ROUND_MS = 12000
const REVEAL_MS = 3500

type Phase = 'intro' | 'loading' | 'round' | 'reveal' | 'submitting' | 'results'

export default function VaizdasClient() {
  const [phase, setPhase] = useState<Phase>('intro')
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
  const [revealed, setRevealed] = useState(false)   // valdo blur animaciją
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [xpRunsLeft, setXpRunsLeft] = useState<number | null>(null)

  const startRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const answerRef = useRef<(id: number | null) => void>(() => {})
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); if (revealTimerRef.current) clearTimeout(revealTimerRef.current) }, [])

  const round = rounds[idx] || null

  async function start() {
    setPhase('loading')
    setError(null)
    try {
      const res = await fetch('/api/zaidimai/vaizdas?raundai=8')
      const json = await res.json()
      if (!res.ok || !json.rounds?.length) { setError(json.error || 'Nepavyko įkelti'); setPhase('intro'); return }
      setRounds(json.rounds)
      setQuizId(json.quizId)
      setXpRunsLeft(json.xpRunsLeft ?? null)
      setIdx(0)
      setScore(0)
      setResult(null)
      setRoundResult(null)
      setRoundError(null)
      startRound()
      setPhase('round')
    } catch { setError('Tinklo klaida'); setPhase('intro') }
  }

  function startRound() {
    startRef.current = Date.now()
    setTimeLeft(ROUND_MS)
    setPicked(null)
    setRevealed(false)
    // Kito frame'o metu paleidžiam blur → 0 transition
    requestAnimationFrame(() => requestAnimationFrame(() => setRevealed(true)))
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
      const res = await fetch('/api/zaidimai/vaizdas', {
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
  // Blur: nuo 34px iki 0 per ROUND_MS (transition valdo CSS)
  const blurNow = phase === 'reveal' ? 0 : revealed ? 0 : 34

  return (
    <div className="vz-root">
      <style>{css}</style>

      <div className="vz-top">
        <Link href="/zaidimai" className="vz-back">← Žaidimai</Link>
        {phase !== 'intro' && phase !== 'results' && rounds.length > 0 && (
          <div className="vz-progress">
            <span className="vz-n">{Math.min(idx + 1, rounds.length)} / {rounds.length}</span>
            <span className="vz-score">⚡ {score}</span>
          </div>
        )}
      </div>

      {phase === 'intro' && (
        <div className="vz-intro">
          <h1 className="vz-h1">Atspėk iš vaizdo</h1>
          <p className="vz-lead">Nuotrauka ryškėja 12 sekundžių. Kuo anksčiau atpažinsi atlikėją — tuo daugiau taškų. 8 raundai.</p>
          {error && <div className="vz-error">{error}</div>}
          <button className="vz-cta" onClick={start}>Žaisti →</button>
          <p className="vz-note">Taškai už pirmus 3 žaidimus per dieną. Nariams +50%.</p>
        </div>
      )}

      {(phase === 'loading' || phase === 'submitting') && (
        <div className="vz-center"><div className="vz-spinner" /></div>
      )}

      {(phase === 'round' || phase === 'reveal') && round && (
        <div className="vz-stage">
          <div className="vz-imgbox">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={round.r}
              src={proxyImg(round.image, 640)}
              alt="Kas šis atlikėjas?"
              style={{
                filter: `blur(${blurNow}px)`,
                transition: phase === 'reveal' ? 'filter .4s ease' : `filter ${ROUND_MS}ms linear`,
              }}
            />
            {phase === 'round' && (
              <div className="vz-clock" style={{ ['--p' as any]: pct }}><span>{Math.ceil(timeLeft / 1000)}</span></div>
            )}
            {phase === 'reveal' && roundResult && (
              <div className={`vz-tag ${roundResult.correct ? 'ok' : 'bad'}`}>
                {roundResult.correct ? `+${lastPoints} tšk.` : picked === null ? 'Laikas baigėsi!' : 'Ne tas!'}
              </div>
            )}
          </div>
          <div className="vz-timebar"><div style={{ width: `${pct * 100}%` }} /></div>
          <div className="vz-options">
            {round.options.map(o => {
              let cls = 'vz-opt'
              if (phase === 'reveal' && roundResult) {
                if (o.id === roundResult.correctId) cls += ' correct'
                else if (o.id === picked) cls += ' wrong'
                else cls += ' dim'
              } else if (checking && o.id === picked) {
                cls += ' checking'
              }
              return (
                <button key={o.id} className={cls} disabled={phase === 'reveal' || checking} onClick={() => answer(o.id)}>
                  {o.name}
                </button>
              )
            })}
          </div>
          {roundError && (
            <div className="vz-error">
              Atsakymo išsiųsti nepavyko.
              <button className="vz-retry" onClick={() => { setRoundError(null); setChecking(true); void sendAnswer(round, roundError.answerId, roundError.ms) }}>Bandyti dar</button>
            </div>
          )}
          {phase === 'reveal' && (
            <button className="vz-next" onClick={next}>{idx + 1 >= rounds.length ? 'Rezultatai →' : 'Kitas →'}</button>
          )}
        </div>
      )}

      {phase === 'results' && (
        <div className="vz-results">
          {result?.submitError && (
            <div className="vz-error" style={{ marginBottom: 12 }}>
              {result.submitError}
              <button className="vz-retry" onClick={() => void submit()}>Bandyti dar</button>
            </div>
          )}
          <div className="vz-score-big">
            <span className="vz-score-num">{result?.score ?? score}</span>
            <span className="vz-score-max">/ {result?.maxScore ?? rounds.length * 100} tšk.</span>
          </div>
          <p className="vz-line">Atpažinta <b>{result?.correctCount ?? '—'}</b> iš {result?.roundCount ?? rounds.length}</p>
          {result?.xp > 0 ? (
            <p className="vz-xp">⚡ Užskaityta <b>+{result.xp}</b> taškų{result.totalXp > 0 ? ` — iš viso ${result.totalXp.toLocaleString('lt-LT')}` : ''}</p>
          ) : result && !result.xpEligible ? (
            <p className="vz-xp dim">Dienos taškų limitas išnaudotas — čia treniruotė 💪</p>
          ) : null}
          <div className="vz-actions">
            <button className="vz-cta" onClick={start}>Dar kartą</button>
            <Link href="/zaidimai" className="vz-back-link">← Žaidimai</Link>
          </div>
        </div>
      )}
    </div>
  )
}

const css = `
.vz-root { max-width: 620px; margin: 0 auto; padding: 24px 16px 90px; }
.vz-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.vz-back { font-size: 14px; font-weight: 700; color: var(--text-secondary); text-decoration: none; }
.vz-progress { display: flex; gap: 10px; align-items: center; }
.vz-n { font-size: 14px; font-weight: 800; color: var(--text-secondary); }
.vz-score { font-size: 16px; font-weight: 900; color: #f59e0b; }
.vz-h1 { font-size: 30px; font-weight: 900; letter-spacing: -0.02em; color: var(--text-primary); margin: 0 0 8px; }
.vz-lead { font-size: 14px; color: var(--text-secondary); line-height: 1.5; margin: 0 0 18px; }
.vz-note { font-size: 12px; color: var(--text-muted); margin-top: 14px; }
.vz-error { font-size: 14px; color: #f87171; background: rgba(248,113,113,0.1); border-radius: 10px; padding: 10px 14px; margin-bottom: 12px; }
.vz-cta { font-size: 16px; font-weight: 800; color: #fff; cursor: pointer; border: 0; border-radius: 999px; padding: 13px 30px; background: linear-gradient(135deg, #8b5cf6, #6366f1); box-shadow: 0 10px 26px rgba(139,92,246,0.35); }
.vz-center { display: flex; justify-content: center; padding: 70px 0; }
.vz-spinner { width: 38px; height: 38px; border-radius: 50%; border: 3px solid rgba(148,163,184,0.25); border-top-color: #8b5cf6; animation: vzspin .8s linear infinite; }
@keyframes vzspin { to { transform: rotate(360deg); } }

.vz-stage { display: flex; flex-direction: column; gap: 12px; }
.vz-imgbox { position: relative; border-radius: 18px; overflow: hidden; aspect-ratio: 1/1; background: #0c0f15; }
.vz-imgbox img { width: 100%; height: 100%; object-fit: cover; display: block; transform: scale(1.06); }
.vz-clock { position: absolute; top: 12px; right: 12px; width: 56px; height: 56px; border-radius: 50%; background: conic-gradient(#8b5cf6 calc(var(--p) * 360deg), rgba(255,255,255,0.15) 0); display: flex; align-items: center; justify-content: center; }
.vz-clock span { width: 46px; height: 46px; border-radius: 50%; background: rgba(12,15,21,0.85); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 900; }
.vz-tag { position: absolute; top: 12px; left: 12px; font-size: 14px; font-weight: 900; padding: 8px 14px; border-radius: 11px; color: #fff; }
.vz-tag.ok { background: rgba(16,185,129,0.92); }
.vz-tag.bad { background: rgba(239,68,68,0.9); }
.vz-timebar { height: 6px; border-radius: 3px; background: rgba(148,163,184,0.18); overflow: hidden; }
.vz-timebar div { height: 100%; background: linear-gradient(90deg, #8b5cf6, #6366f1); transition: width .1s linear; }

.vz-options { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.vz-opt {
  font-size: 16px; font-weight: 800; color: var(--text-primary); text-align: center; cursor: pointer;
  padding: 14px 10px; border-radius: 13px; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.22);
}
.vz-opt:hover:not(:disabled) { border-color: #8b5cf6; }
.vz-opt.correct { background: rgba(16,185,129,0.16); border-color: #10b981; color: #34d399; }
.vz-opt.wrong { background: rgba(239,68,68,0.13); border-color: #ef4444; }
.vz-opt.dim { opacity: 0.45; }
.vz-opt.checking { border-color: #8b5cf6; animation: vzcheck .5s ease infinite alternate; }
@keyframes vzcheck { from { opacity: 0.75; } to { opacity: 1; } }
.vz-retry { margin-left: 10px; font-size: 12px; font-weight: 800; color: #f87171; background: transparent; border: 1px solid rgba(248,113,113,0.5); border-radius: 8px; padding: 4px 10px; cursor: pointer; }
.vz-next { align-self: center; font-size: 16px; font-weight: 800; color: #fff; cursor: pointer; background: linear-gradient(135deg, #8b5cf6, #6366f1); border: 0; border-radius: 999px; padding: 12px 28px; }

.vz-results { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 30px 0; }
.vz-score-big { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; background: var(--bg-surface); border: 1px solid rgba(139,92,246,0.4); border-radius: 20px; padding: 22px 34px; }
.vz-score-num { font-size: 44px; font-weight: 900; color: var(--text-primary); line-height: 1; }
.vz-score-max { font-size: 14px; color: var(--text-muted); }
.vz-line { font-size: 16px; color: var(--text-secondary); margin: 4px 0; }
.vz-line b { color: var(--text-primary); }
.vz-xp { font-size: 16px; font-weight: 700; color: #f59e0b; margin: 8px 0; }
.vz-xp.dim { color: var(--text-muted); font-weight: 500; }
.vz-actions { display: flex; gap: 14px; align-items: center; margin-top: 16px; }
.vz-back-link { font-size: 14px; color: var(--text-secondary); text-decoration: none; }
`
