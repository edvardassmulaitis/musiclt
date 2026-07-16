'use client'

// app/zaidimai/atspek-is-vaizdo/VaizdasClient.tsx
//
// „Atspėk iš vaizdo" — populiaraus albumo viršelis ARBA atlikėjo nuotrauka
// pradžioje paslėpta ir per 12 s ryškėja. Kas antrą kartą — dėlionės (puzzle)
// efektas (langeliai nyksta po vieną), kitą — blur. Kuo greičiau atspėsi —
// tuo daugiau taškų. Rezultatas skaičiuojamas server-side.

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import ZaidimoLangas from '@/components/zaidimai/ZaidimoLangas'

type Option = { id: number; name: string }
type Round = {
  r: number
  image: string
  kind?: 'album' | 'artist'
  prompt?: string
  reveal?: 'puzzle' | 'blur'
  options: Option[]
  token: string
}
type RoundResult = { correct: boolean; correctId: number; points: number }

const ROUND_MS = 12000
const REVEAL_MS = 3500
const PUZZLE_COLS = 6
const PUZZLE_TILES = PUZZLE_COLS * PUZZLE_COLS

function shuffledRanks(n: number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  // rank[tile] = kelinta eilėje ta plytelė atsidengia
  const rank = new Array(n)
  idx.forEach((tile, r) => { rank[tile] = r })
  return rank
}

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

  // Be tarpinio intro — žaidimas startuoja iškart (garso čia nereikia,
  // tad iOS gesto apribojimai negalioja).
  useEffect(() => {
    void start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
  const isPuzzle = round?.reveal === 'puzzle'
  // Dėlionė: plytelių atsidengimo eiliškumas — stabilus per raundą
  const tileRanks = useMemo(() => shuffledRanks(PUZZLE_TILES), [round?.r])
  // Kiek dalies plytelių jau atsidengę (0→1 per raundą; reveal — viskas)
  const revealProgress = phase === 'reveal' ? 1 : Math.min(1, (1 - pct) * 1.15)

  return (
    <ZaidimoLangas
      title="Atspėk iš vaizdo"
      maxWidth={620}
      right={phase !== 'intro' && phase !== 'results' && rounds.length > 0 ? (
        <>
          <span className="vz-n">{Math.min(idx + 1, rounds.length)}/{rounds.length}</span>
          <span className="vz-score">⚡ {score}</span>
        </>
      ) : null}
    >
      <style>{css}</style>

      {phase === 'intro' && (
        <div className="vz-intro">
          {error ? (
            <>
              <div className="vz-error">{error}</div>
              <button className="vz-cta" onClick={start}>Bandyti dar</button>
            </>
          ) : (
            <div className="vz-center"><div className="vz-spinner" /></div>
          )}
        </div>
      )}

      {(phase === 'loading' || phase === 'submitting') && (
        <div className="vz-center"><div className="vz-spinner" /></div>
      )}

      {(phase === 'round' || phase === 'reveal') && round && (
        <div className="vz-stage">
          {idx === 0 && phase === 'round' && (
            <p className="vz-hint">Vaizdas ryškėja — atpažink kuo greičiau</p>
          )}
          <div className="vz-imgbox">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={round.r}
              src={proxyImg(round.image, 640)}
              alt={round.prompt || 'Kas tai?'}
              decoding="async"
              style={isPuzzle ? undefined : {
                filter: `blur(${blurNow}px)`,
                transition: phase === 'reveal' ? 'filter .4s ease' : `filter ${ROUND_MS}ms linear`,
              }}
            />
            {isPuzzle && (
              <div className="vz-puzzle" aria-hidden>
                {Array.from({ length: PUZZLE_TILES }).map((_, i) => {
                  const gone = tileRanks[i] / PUZZLE_TILES < revealProgress
                  return <span key={i} className="vz-tile" style={{ opacity: gone ? 0 : 1 }} />
                })}
              </div>
            )}
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
            <span className="vz-score-max">iš {result?.maxScore ?? rounds.length * 100} galimų</span>
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
    </ZaidimoLangas>
  )
}

const css = `
.vz-n { font-size: 13px; font-weight: 800; color: var(--text-secondary); }
.vz-score { font-size: 15px; font-weight: 900; color: var(--text-primary); }
.vz-h1 { font-size: 26px; font-weight: 900; letter-spacing: -0.02em; color: var(--text-primary); margin: 0 0 8px; }
.vz-lead { font-size: 14px; color: var(--text-secondary); line-height: 1.5; margin: 0 0 18px; }
.vz-note { font-size: 12px; color: var(--text-muted); margin-top: 14px; }
.vz-error { font-size: 14px; color: var(--accent-red); background: rgba(248,113,113,0.1); border-radius: 10px; padding: 10px 14px; margin-bottom: 12px; }
.vz-cta { font-size: 16px; font-weight: 800; color: #fff; cursor: pointer; border: 0; border-radius: 999px; padding: 13px 30px; background: var(--accent-orange); }
.vz-center { display: flex; justify-content: center; padding: 70px 0; }
.vz-spinner { width: 38px; height: 38px; border-radius: 50%; border: 3px solid rgba(148,163,184,0.25); border-top-color: var(--accent-orange); animation: vzspin .8s linear infinite; }
@keyframes vzspin { to { transform: rotate(360deg); } }

.vz-stage { display: flex; flex-direction: column; gap: 12px; }
.vz-hint { font-size: 12.5px; color: var(--text-secondary); text-align: center; margin: 0; }
.vz-imgbox { position: relative; border-radius: 14px; overflow: hidden; aspect-ratio: 1/1; background: #0c0f15; }
.vz-imgbox img { width: 100%; height: 100%; object-fit: cover; display: block; transform: scale(1.06); }
.vz-puzzle { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(6, 1fr); grid-template-rows: repeat(6, 1fr); }
.vz-tile { background: #10131b; transition: opacity .45s ease; }
.vz-clock { position: absolute; top: 12px; right: 12px; width: 56px; height: 56px; border-radius: 50%; background: conic-gradient(var(--accent-orange) calc(var(--p) * 360deg), rgba(255,255,255,0.15) 0); display: flex; align-items: center; justify-content: center; }
.vz-clock span { width: 46px; height: 46px; border-radius: 50%; background: rgba(12,15,21,0.85); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 900; }
.vz-tag { position: absolute; top: 12px; left: 12px; font-size: 14px; font-weight: 900; padding: 8px 14px; border-radius: 11px; color: #fff; }
.vz-tag.ok { background: rgba(16,185,129,0.92); }
.vz-tag.bad { background: rgba(239,68,68,0.9); }
.vz-timebar { height: 5px; border-radius: 3px; background: rgba(148,163,184,0.18); overflow: hidden; }
.vz-timebar div { height: 100%; background: var(--accent-orange); transition: width .1s linear; }

.vz-options { display: grid; grid-template-columns: 1fr; gap: 8px; }
.vz-opt {
  font-size: 14.5px; font-weight: 700; color: var(--text-primary); text-align: left; cursor: pointer;
  padding: 12px 14px; border-radius: 11px; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.22);
}
.vz-opt:hover:not(:disabled) { border-color: var(--accent-orange); }
.vz-opt.correct { background: rgba(16,185,129,0.16); border-color: #10b981; color: #34d399; }
.vz-opt.wrong { background: rgba(239,68,68,0.13); border-color: #ef4444; }
.vz-opt.dim { opacity: 0.45; }
.vz-opt.checking { border-color: var(--accent-orange); animation: vzcheck .5s ease infinite alternate; }
@keyframes vzcheck { from { opacity: 0.75; } to { opacity: 1; } }
.vz-retry { margin-left: 10px; font-size: 12px; font-weight: 800; color: var(--accent-red); background: transparent; border: 1px solid rgba(248,113,113,0.5); border-radius: 8px; padding: 4px 10px; cursor: pointer; }
.vz-next { align-self: center; font-size: 16px; font-weight: 800; color: #fff; cursor: pointer; background: var(--accent-orange); border: 0; border-radius: 999px; padding: 12px 28px; }

.vz-results { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 30px 0; }
.vz-score-big { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.25); border-radius: 16px; padding: 22px 34px; }
.vz-score-num { font-size: 44px; font-weight: 900; color: var(--text-primary); line-height: 1; }
.vz-score-max { font-size: 14px; color: var(--text-muted); }
.vz-line { font-size: 16px; color: var(--text-secondary); margin: 4px 0; }
.vz-line b { color: var(--text-primary); }
.vz-xp { font-size: 16px; font-weight: 700; color: var(--accent-orange); margin: 8px 0; }
.vz-xp.dim { color: var(--text-muted); font-weight: 500; }
.vz-actions { display: flex; gap: 14px; align-items: center; margin-top: 16px; }
.vz-back-link { font-size: 14px; color: var(--text-secondary); text-decoration: none; }
`
