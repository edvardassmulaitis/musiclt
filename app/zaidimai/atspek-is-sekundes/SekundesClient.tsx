'use client'

// app/zaidimai/atspek-is-sekundes/SekundesClient.tsx
//
// „Atspėk iš sekundės" — groja 1 s ištrauka; gali paprašyti +3 s ir +5 s,
// bet kuo greičiau atsakai, tuo daugiau taškų (100 → 60 → 30, pagal laiką).
// Garsas per HTML5 <audio> (iOS atrakinimas — ▶ pirmame raunde).

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import ZaidimoLangas from '@/components/zaidimai/ZaidimoLangas'
import { naudotiGarsoGrotuva } from '@/components/zaidimai/naudotiGarsoGrotuva'

type Option = { id: number; title: string; artist: string }
type Round = { r: number; audioUrl: string; options: Option[]; token: string }
type RoundResult = { correct: boolean; correctId: number; points: number }

const ROUND_MS = 25000
const REVEAL_MS = 3500
const STAGES = [1000, 4000, 9000]   // kiek ištraukos girdisi 1 / 2 / 3 pakopoje

type Phase = 'loading' | 'ready' | 'round' | 'reveal' | 'submitting' | 'results'

function potentialPoints(elapsedMs: number): number {
  return elapsedMs <= 6000 ? 100 : elapsedMs <= 13000 ? 60 : 30
}

export default function SekundesClient() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [rounds, setRounds] = useState<Round[]>([])
  const [quizId, setQuizId] = useState('')
  const [idx, setIdx] = useState(0)
  const [stage, setStage] = useState(0)          // 0/1/2 — kelinta klausymo pakopa
  const [picked, setPicked] = useState<number | null>(null)
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [roundError, setRoundError] = useState<{ answerId: number | null; ms: number } | null>(null)
  const [timeLeft, setTimeLeft] = useState(ROUND_MS)
  const [score, setScore] = useState(0)
  const [lastPoints, setLastPoints] = useState(0)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const garsas = naudotiGarsoGrotuva()
  const startRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const snippetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const answerRef = useRef<(id: number | null) => void>(() => {})
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current)
    if (snippetTimerRef.current) clearTimeout(snippetTimerRef.current)
  }, [])

  const round = rounds[idx] || null

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load() {
    setPhase('loading')
    setError(null)
    try {
      const res = await fetch('/api/zaidimai/sekundes?raundai=5')
      const json = await res.json()
      if (!res.ok || !json.rounds?.length) { setError(json.error || 'Nepavyko įkelti'); return }
      setRounds(json.rounds)
      setQuizId(json.quizId)
      setIdx(0)
      setScore(0)
      setResult(null)
      setRoundResult(null)
      setRoundError(null)
      setPhase('ready') // pirmam grojimui reikia TAP (iOS)
    } catch { setError('Tinklo klaida') }
  }

  /** Groja ištrauką ribotą laiką (nuo pradžios). */
  function grotiIstrauka(url: string, durMs: number) {
    if (snippetTimerRef.current) clearTimeout(snippetTimerRef.current)
    garsas.play(url)
    snippetTimerRef.current = setTimeout(() => garsas.stop(), durMs)
  }

  /** Kviečiama mygtuko onClick — iOS garso atrakinimas. */
  function startPlaying() {
    if (!rounds.length) return
    setPhase('round')
    startRound(rounds[0])
  }

  function startRound(r: Round) {
    startRef.current = Date.now()
    setTimeLeft(ROUND_MS)
    setPicked(null)
    setStage(0)
    grotiIstrauka(r.audioUrl, STAGES[0])
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      const left = ROUND_MS - (Date.now() - startRef.current)
      if (left <= 0) { setTimeLeft(0); answerRef.current(null) }
      else setTimeLeft(left)
    }, 100)
  }

  function listenMore() {
    if (!round || stage >= STAGES.length - 1) return
    const next = stage + 1
    setStage(next)
    grotiIstrauka(round.audioUrl, STAGES[next])
  }

  function answer(answerId: number | null) {
    if (phaseRef.current !== 'round' || !round || checking) return
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    garsas.stop()
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
    const n = rounds[idx + 1]
    setIdx(i => i + 1)
    setRoundResult(null)
    setPhase('round')
    startRound(n)
  }

  async function submit() {
    garsas.stop()
    setPhase('submitting')
    try {
      const res = await fetch('/api/zaidimai/sekundes', {
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

  const elapsed = ROUND_MS - timeLeft
  const potential = potentialPoints(elapsed)
  const pct = Math.max(0, timeLeft / ROUND_MS)

  return (
    <ZaidimoLangas
      title="Atspėk iš sekundės"
      maxWidth={620}
      right={phase !== 'results' && rounds.length > 0 ? (
        <>
          <span className="sk-n">{Math.min(idx + 1, rounds.length)}/{rounds.length}</span>
          <span className="sk-score">⚡ {score}</span>
        </>
      ) : null}
    >
      <style>{css}</style>

      {phase === 'loading' && (
        error ? (
          <div className="sk-center">
            <div className="sk-error">{error}</div>
            <button className="sk-cta" onClick={() => void load()}>Bandyti dar</button>
          </div>
        ) : <div className="sk-center"><div className="sk-spinner" /></div>
      )}

      {(phase === 'ready' || phase === 'round' || phase === 'reveal') && round && (
        <div className="sk-stage">
          {idx === 0 && (phase === 'ready' || phase === 'round') && (
            <p className="sk-hint">Išgirsi 1 sekundę dainos — atspėk ją. Reikia daugiau? Klausyk ilgiau, bet gausi mažiau taškų.</p>
          )}
          <div className="sk-audio">
            {phase === 'ready' ? (
              <button className="sk-play-big" onClick={startPlaying} aria-label="Pradėti">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                <span>Pradėti</span>
              </button>
            ) : phase === 'round' ? (
              <>
                <div className={`sk-eq${garsas.grojama ? ' on' : ''}`}>
                  {Array.from({ length: 7 }).map((_, i) => <span key={i} style={{ animationDelay: `${i * 0.12}s` }} />)}
                </div>
                <div className="sk-pot">verta <b>{potential}</b></div>
                {stage < STAGES.length - 1 && (
                  <button className="sk-more" onClick={listenMore}>
                    ▶ Klausyti ilgiau ({(STAGES[stage + 1] / 1000)} s)
                  </button>
                )}
              </>
            ) : roundResult && (
              <div className={`sk-tag ${roundResult.correct ? 'ok' : 'bad'}`}>
                {roundResult.correct ? `+${lastPoints} tšk.` : picked === null ? 'Laikas baigėsi!' : 'Ne ta daina'}
              </div>
            )}
          </div>
          <div className="sk-timebar"><div style={{ width: `${pct * 100}%` }} /></div>
          <div className="sk-options">
            {round.options.map(o => {
              let cls = 'sk-opt'
              if (phase === 'reveal' && roundResult) {
                if (o.id === roundResult.correctId) cls += ' correct'
                else if (o.id === picked) cls += ' wrong'
                else cls += ' dim'
              } else if (checking && o.id === picked) {
                cls += ' checking'
              }
              return (
                <button key={o.id} className={cls} disabled={phase !== 'round' || checking} onClick={() => answer(o.id)}>
                  <span className="sk-opt-artist">{o.artist}</span>
                  <span className="sk-opt-title">{o.title}</span>
                </button>
              )
            })}
          </div>
          {roundError && (
            <div className="sk-error">
              Atsakymo išsiųsti nepavyko.
              <button className="sk-retry" onClick={() => { setRoundError(null); setChecking(true); void sendAnswer(round, roundError.answerId, roundError.ms) }}>Bandyti dar</button>
            </div>
          )}
          {phase === 'reveal' && (
            <button className="sk-next" onClick={next}>{idx + 1 >= rounds.length ? 'Rezultatai →' : 'Kitas →'}</button>
          )}
        </div>
      )}

      {phase === 'submitting' && <div className="sk-center"><div className="sk-spinner" /></div>}

      {phase === 'results' && (
        <div className="sk-results">
          {result?.submitError && (
            <div className="sk-error" style={{ marginBottom: 12 }}>
              {result.submitError}
              <button className="sk-retry" onClick={() => void submit()}>Bandyti dar</button>
            </div>
          )}
          <div className="sk-score-big">
            <span className="sk-score-num">{result?.score ?? score}</span>
            <span className="sk-score-max">iš {result?.maxScore ?? rounds.length * 100} galimų</span>
          </div>
          <p className="sk-line">Atspėta <b>{result?.correctCount ?? '—'}</b> iš {result?.roundCount ?? rounds.length}</p>
          {result?.xp > 0 ? (
            <p className="sk-xp">⚡ +{result.xp} taškų{result.totalXp > 0 ? ` · iš viso ${result.totalXp.toLocaleString('lt-LT')}` : ''}</p>
          ) : result && !result.xpEligible ? (
            <p className="sk-xp dim">Dienos taškų limitas — ši partija be taškų 💪</p>
          ) : null}
          <div className="sk-actions">
            <button className="sk-cta" onClick={() => void load()}>Dar kartą</button>
            <Link href="/zaidimai" className="sk-back-link">← Žaidimai</Link>
          </div>
        </div>
      )}
    </ZaidimoLangas>
  )
}

const css = `
.sk-n { font-size: 13px; font-weight: 800; color: var(--text-secondary); }
.sk-score { font-size: 15px; font-weight: 900; color: var(--text-primary); }
.sk-hint { font-size: 12.5px; color: var(--text-secondary); text-align: center; margin: 0; }
.sk-error { font-size: 14px; color: var(--accent-red); background: rgba(248,113,113,0.1); border-radius: 10px; padding: 10px 14px; margin-bottom: 12px; }
.sk-retry { margin-left: 10px; font-size: 12px; font-weight: 800; color: var(--accent-red); background: transparent; border: 1px solid rgba(248,113,113,0.5); border-radius: 8px; padding: 4px 10px; cursor: pointer; }
.sk-cta { font-size: 16px; font-weight: 800; color: #fff; cursor: pointer; border: 0; border-radius: 999px; padding: 13px 30px; background: var(--accent-orange); }
.sk-center { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 70px 0; }
.sk-spinner { width: 38px; height: 38px; border-radius: 50%; border: 3px solid rgba(148,163,184,0.25); border-top-color: var(--accent-orange); animation: skspin .8s linear infinite; }
@keyframes skspin { to { transform: rotate(360deg); } }

.sk-stage { display: flex; flex-direction: column; gap: 12px; }
.sk-audio {
  position: relative; display: flex; align-items: center; justify-content: center; gap: 16px;
  border-radius: 16px; min-height: 110px; padding: 14px;
  background: #10131b;
}
.sk-play-big {
  display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 900; color: #fff;
  cursor: pointer; border: 0; border-radius: 999px; padding: 14px 34px;
  background: var(--accent-orange);
}
.sk-eq { display: flex; align-items: flex-end; gap: 5px; height: 42px; }
.sk-eq span { width: 7px; border-radius: 3px; height: 8px; background: rgba(148,163,184,0.4); }
.sk-eq.on span { background: var(--accent-orange); animation: skeq 0.9s ease-in-out infinite alternate; }
@keyframes skeq { from { height: 8px; } to { height: 42px; } }
.sk-pot { font-size: 13px; color: rgba(255,255,255,0.75); }
.sk-pot b { color: #fff; font-size: 16px; }
.sk-more { font-size: 13px; font-weight: 800; color: rgba(255,255,255,0.85); background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); border-radius: 999px; padding: 8px 16px; cursor: pointer; }
.sk-tag { font-size: 18px; font-weight: 900; padding: 12px 22px; border-radius: 13px; color: #fff; }
.sk-tag.ok { background: rgba(16,185,129,0.92); }
.sk-tag.bad { background: rgba(239,68,68,0.9); }
.sk-timebar { height: 5px; border-radius: 3px; background: rgba(148,163,184,0.18); overflow: hidden; }
.sk-timebar div { height: 100%; background: var(--accent-orange); transition: width .1s linear; }

.sk-options { display: grid; grid-template-columns: repeat(2, 1fr); gap: 9px; }
@media (max-width: 520px) { .sk-options { grid-template-columns: 1fr; } }
.sk-opt {
  display: flex; flex-direction: column; gap: 1px; align-items: flex-start; text-align: left;
  padding: 12px 14px; border-radius: 13px; cursor: pointer;
  background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.22);
}
.sk-opt-artist { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.sk-opt-title { font-size: 15px; font-weight: 800; color: var(--text-primary); }
.sk-opt.correct { background: rgba(16,185,129,0.16); border-color: #10b981; }
.sk-opt.correct .sk-opt-title { color: #34d399; }
.sk-opt.wrong { background: rgba(239,68,68,0.13); border-color: #ef4444; }
.sk-opt.dim { opacity: 0.45; }
.sk-opt.checking { border-color: var(--accent-orange); animation: skcheck .5s ease infinite alternate; }
@keyframes skcheck { from { opacity: 0.75; } to { opacity: 1; } }
.sk-next { align-self: center; font-size: 16px; font-weight: 800; color: #fff; cursor: pointer; background: var(--accent-orange); border: 0; border-radius: 999px; padding: 12px 28px; }

.sk-results { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 30px 0; }
.sk-score-big { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.25); border-radius: 16px; padding: 22px 34px; }
.sk-score-num { font-size: 44px; font-weight: 900; color: var(--text-primary); line-height: 1; }
.sk-score-max { font-size: 14px; color: var(--text-muted); }
.sk-line { font-size: 16px; color: var(--text-secondary); margin: 4px 0; }
.sk-line b { color: var(--text-primary); }
.sk-xp { font-size: 16px; font-weight: 700; color: var(--accent-orange); margin: 8px 0; }
.sk-xp.dim { color: var(--text-muted); font-weight: 500; }
.sk-actions { display: flex; gap: 14px; align-items: center; margin-top: 16px; }
.sk-back-link { font-size: 14px; color: var(--text-secondary); text-decoration: none; }
`
