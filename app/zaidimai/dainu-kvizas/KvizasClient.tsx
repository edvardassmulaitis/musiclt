'use client'

// app/zaidimai/dainu-kvizas/KvizasClient.tsx
//
// „Atspėk dainą" — audio kvizas app režimu (pilnas ekranas, be svetainės
// chrome). Garsas per vieną persistent YT grotuvą (iOS Safari atrakinimas:
// pirmas grojimas — mygtuko gesto kontekste, žr. naudotiKvizoGrotuva).
// Atsakymai tikrinami serveryje (užšifruoti vokai).

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import ZaidimoLangas from '@/components/zaidimai/ZaidimoLangas'
import { naudotiGarsoGrotuva, yraIos } from '@/components/zaidimai/naudotiGarsoGrotuva'

type Option = { id: number; title: string; artist: string }
type Round = { r: number; ytId: string; startSec: number; audioUrl: string | null; options: Option[]; token: string }
type RoundResult = { correct: boolean; correctId: number; points: number; comboNow: number }
type Quiz = {
  quizId: string
  category: string
  isDaily: boolean
  rounds: Round[]
  xpRunsLeft: number
  dailyPlayed: boolean
}
type RoundOutcome = 'fast' | 'slow' | 'wrong' | 'timeout'

type Category = { key: string; label: string; desc: string; accent: string; emoji: string }

const CATEGORIES: Category[] = [
  { key: 'lt-mix', label: 'Lietuviškas mišinys', desc: 'Visa lietuviška muzika', accent: '#f97316', emoji: '🇱🇹' },
  { key: 'lt-nauja', label: 'Nauja banga', desc: 'Šviežia lietuviška muzika', accent: '#f97316', emoji: '🌊' },
  { key: 'lt-klasika', label: 'Lietuviška klasika', desc: 'Dainos, kurias žino visi', accent: '#f97316', emoji: '📼' },
  { key: 'pasaulis', label: 'Pasaulio hitai', desc: 'Užsienio scena', accent: '#f97316', emoji: '🌍' },
]
const ROUND_MS = 15000
const REVEAL_MS = 5000
const COMBO_MIN = 3

type Phase = 'pick' | 'loading' | 'ready' | 'round' | 'reveal' | 'submitting' | 'results'

function outcomeOf(correct: boolean, answerId: number | null, ms: number): RoundOutcome {
  if (correct) return ms < ROUND_MS / 2 ? 'fast' : 'slow'
  return answerId === null ? 'timeout' : 'wrong'
}
const OUTCOME_EMOJI: Record<RoundOutcome, string> = { fast: '🟩', slow: '🟨', wrong: '🟥', timeout: '⬛' }

export default function KvizasClient() {
  const [phase, setPhase] = useState<Phase>('pick')
  const [category, setCategory] = useState<Category>(CATEGORIES[0])
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [roundIdx, setRoundIdx] = useState(0)
  const [outcomes, setOutcomes] = useState<RoundOutcome[]>([])
  const [picked, setPicked] = useState<number | null>(null)
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [roundError, setRoundError] = useState<{ answerId: number | null; ms: number } | null>(null)
  const [timeLeft, setTimeLeft] = useState(ROUND_MS)
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [lastPoints, setLastPoints] = useState(0)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [dailyPlayed, setDailyPlayed] = useState<boolean | null>(null)
  const [shared, setShared] = useState(false)

  const garsas = naudotiGarsoGrotuva()
  const [ios] = useState(() => yraIos())

  const roundStartRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const revealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const phaseRef = useRef<Phase>('pick')
  phaseRef.current = phase
  const answerRef = useRef<(id: number | null) => void>(() => {})

  const round = quiz?.rounds[roundIdx] || null

  // Dienos iššūkio būsenos ženkliukas
  useEffect(() => {
    let alive = true
    fetch('/api/zaidimai/kvizas?kategorija=dienos&raundai=5')
      .then(r => r.json())
      .then(j => { if (alive) setDailyPlayed(!!j.dailyPlayed) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }
  useEffect(() => () => { stopTimer(); if (revealTimeoutRef.current) clearTimeout(revealTimeoutRef.current) }, [])

  function startTimer() {
    roundStartRef.current = Date.now()
    setTimeLeft(ROUND_MS)
    setPicked(null)
    stopTimer()
    timerRef.current = setInterval(() => {
      const left = ROUND_MS - (Date.now() - roundStartRef.current)
      if (left <= 0) { setTimeLeft(0); answerRef.current(null) }
      else setTimeLeft(left)
    }, 100)
  }

  async function pickCategory(cat: Category) {
    setCategory(cat)
    setPhase('loading')
    setError(null)
    try {
      const res = await fetch(`/api/zaidimai/kvizas?kategorija=${cat.key}`)
      const json = await res.json()
      if (!res.ok || !json.rounds?.length) {
        setError(json.error || 'Nepavyko paruošti kvizo — pabandyk vėliau')
        setPhase('pick')
        return
      }
      setQuiz(json)
      setRoundIdx(0)
      setOutcomes([])
      setScore(0)
      setCombo(0)
      setResult(null)
      setRoundResult(null)
      setRoundError(null)
      setShared(false)
      setPhase('ready') // garso startui reikia TAP — iOS atrakinimas
    } catch {
      setError('Tinklo klaida — pabandyk dar kartą')
      setPhase('pick')
    }
  }

  /** SVARBU: kviečiama mygtuko onClick — grojimas gesto kontekste (iOS). */
  function startPlaying() {
    if (!quiz) return
    garsas.play(quiz.rounds[0].audioUrl)
    setPhase('round')
    startTimer()
  }

  function answerRound(answerId: number | null) {
    if (phaseRef.current !== 'round' || !round || checking) return
    stopTimer()
    const ms = Math.min(Date.now() - roundStartRef.current, ROUND_MS)
    setPicked(answerId)
    setChecking(true)
    setRoundError(null)
    void sendAnswer(round, answerId, ms)
  }
  answerRef.current = answerRound

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
      setRoundResult({ correct: json.correct, correctId: json.correctId, points: json.points, comboNow: json.comboNow })
      setCombo(json.correct ? json.comboNow : 0)
      setLastPoints(json.points)
      setScore(s => s + json.points)
      setOutcomes(o => [...o, outcomeOf(json.correct, answerId, ms)])
      setPhase('reveal')
      revealTimeoutRef.current = setTimeout(nextRound, REVEAL_MS)
    } catch {
      setChecking(false)
      setRoundError({ answerId, ms })
    }
  }

  function nextRound() {
    if (revealTimeoutRef.current) { clearTimeout(revealTimeoutRef.current); revealTimeoutRef.current = null }
    if (!quiz) return
    if (roundIdx + 1 >= quiz.rounds.length) { void submitQuiz(); return }
    const next = quiz.rounds[roundIdx + 1]
    setRoundIdx(i => i + 1)
    setRoundResult(null)
    setPhase('round')
    garsas.play(next.audioUrl)
    startTimer()
  }

  async function submitQuiz() {
    if (!quiz) return
    garsas.stop()
    setPhase('submitting')
    try {
      const res = await fetch('/api/zaidimai/kvizas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kategorija: quiz.category, quizId: quiz.quizId }),
      })
      const json = await res.json()
      if (!res.ok && res.status !== 409) {
        setResult({ submitError: json.error || 'Nepavyko užskaityti — pabandyk dar kartą' })
      } else {
        setResult(json)
      }
    } catch {
      setResult({ submitError: 'Tinklo klaida — rezultato užskaityti nepavyko' })
    }
    setPhase('results')
  }

  async function shareResult() {
    const date = new Date().toLocaleDateString('lt-LT', { timeZone: 'Europe/Vilnius', month: '2-digit', day: '2-digit' })
    const grid = outcomes.map(o => OUTCOME_EMOJI[o]).join('')
    const lines = [
      `🎵 music.lt · ${category.label} ${date}`,
      grid,
      `${result?.score ?? score} tšk. · ${result?.correctCount ?? '—'}/${quiz?.rounds.length}${result?.bestCombo >= COMBO_MIN ? ` · serija ×${result.bestCombo}` : ''}`,
      'https://music.lt/zaidimai/dainu-kvizas',
    ]
    try {
      if (navigator.share) await navigator.share({ text: lines.join('\n') })
      else await navigator.clipboard.writeText(lines.join('\n'))
      setShared(true)
      setTimeout(() => setShared(false), 2500)
    } catch { /* atšaukė */ }
  }

  const pct = Math.max(0, timeLeft / ROUND_MS)
  const inGame = phase === 'round' || phase === 'reveal' || phase === 'ready'

  return (
    <ZaidimoLangas
      title="Atspėk dainą"
      right={quiz && inGame ? (
        <>
          {combo >= COMBO_MIN && <span className="kv-combo">🔥×{combo}</span>}
          <span className="kv-chip">{Math.min(roundIdx + 1, quiz.rounds.length)}/{quiz.rounds.length}</span>
          <span className="kv-chip strong">⚡ {score}</span>
        </>
      ) : null}
    >
      <style>{css}</style>

      {/* Progreso taškeliai */}
      {quiz && inGame && phase !== 'ready' && (
        <div className="kv-dots">
          {quiz.rounds.map((_, i) => {
            const o = outcomes[i]
            return <span key={i} className={`kv-dot${o ? ` ${o}` : ''}${i === roundIdx ? ' now' : ''}`} />
          })}
        </div>
      )}

      {/* ── Kategorijos ── */}
      {phase === 'pick' && (
        <div className="kv-pick">
          <p className="kv-lead">Groja ištrauka — 15 sekundžių, 4 variantai. Greičiau atsakai — daugiau taškų, 3+ iš eilės — bonusas.</p>
          {error && <div className="kv-error">{error}</div>}

          <Link href="/zaidimai/dienos" className={`kv-daily${dailyPlayed ? ' played' : ''}`}>
            <span className="kv-daily-badge">⚡ DIENOS IŠŠŪKIS</span>
            <span className="kv-daily-title">Kvizas + dienos misijos — ×2 taškai</span>
            <span className="kv-daily-sub">{dailyPlayed ? 'Kvizo dalis šiandien įveikta ✓' : 'Tas pats visiems, vienas bandymas per dieną →'}</span>
          </Link>

          <div className="kv-cats">
            {CATEGORIES.map(c => (
              <button key={c.key} className="kv-cat" style={{ ['--acc' as any]: c.accent }} onClick={() => pickCategory(c)}>
                <span className="kv-cat-emoji">{c.emoji}</span>
                <span className="kv-cat-label">{c.label}</span>
                <span className="kv-cat-desc">{c.desc}</span>
              </button>
            ))}
          </div>
          <p className="kv-note">Taškai: pirmi 3 kvizai per dieną. Nariams +50%.</p>
        </div>
      )}

      {phase === 'loading' && <div className="kv-center"><div className="kv-spinner" /><p className="kv-note">Renkam dainas…</p></div>}

      {/* ── Pasiruošimas (garso atrakinimo TAP) ── */}
      {phase === 'ready' && quiz && (
        <div className="kv-ready">
          <span className="kv-ready-emoji">{category.emoji}</span>
          <h2 className="kv-ready-title">{category.label}</h2>
          <p className="kv-note">{quiz.rounds.length} raundai · įsijunk garsą 🎧</p>
          <button className="kv-cta-big" onClick={startPlaying}>▶ Pradėti</button>
        </div>
      )}

      {/* ── Raundas / Reveal ── */}
      <div className="kv-stage" style={{ display: phase === 'round' || phase === 'reveal' ? 'flex' : 'none' }}>
        <div className="kv-audio">
          {/* Atsarginis kelias be iTunes ištraukos: paslėptas YT (desktop garsas) */}
          {round && !round.audioUrl && phase === 'round' && !ios && (
            <iframe
              className="kv-hidden-yt"
              src={`https://www.youtube-nocookie.com/embed/${round.ytId}?autoplay=1&start=${round.startSec}&rel=0&playsinline=1&controls=0`}
              allow="autoplay; encrypted-media"
              title="Garso atsarga"
            />
          )}
          {phase === 'round' ? (
            <>
              <div className="kv-eq">
                {Array.from({ length: 7 }).map((_, i) => <span key={i} style={{ animationDelay: `${i * 0.12}s` }} />)}
              </div>
              <div className="kv-clock" style={{ ['--p' as any]: pct }}><span>{Math.ceil(timeLeft / 1000)}</span></div>
              {round && !round.audioUrl && ios ? (
                <span className="kv-nosound-note">Šio raundo ištraukos nėra — spėk be garso 😬</span>
              ) : (
                <button className="kv-nosound" onClick={() => round && garsas.play(round.audioUrl)}>
                  {garsas.failed ? 'Nepavyko paleisti 😬' : 'Negirdi? ▶'}
                </button>
              )}
            </>
          ) : roundResult && (
            <div className={`kv-verdict ${roundResult.correct ? 'ok' : 'bad'}`}>
              {roundResult.correct
                ? `+${lastPoints} tšk.${combo >= COMBO_MIN ? ` 🔥×${combo}` : ''}`
                : picked === null ? 'Laikas baigėsi!' : 'Ne ta daina'}
            </div>
          )}
        </div>

        <div className="kv-timderbar"><div style={{ width: `${pct * 100}%` }} /></div>

        {round && (
          <div className="kv-options">
            {round.options.map(o => {
              let cls = 'kv-opt'
              if (phase === 'reveal' && roundResult) {
                if (o.id === roundResult.correctId) cls += ' correct'
                else if (o.id === picked) cls += ' wrong'
                else cls += ' dim'
              } else if (checking && o.id === picked) {
                cls += ' checking'
              }
              return (
                <button key={o.id} className={cls} disabled={phase === 'reveal' || checking} onClick={() => answerRound(o.id)}>
                  <span className="kv-opt-artist">{o.artist}</span>
                  <span className="kv-opt-title">{o.title}</span>
                </button>
              )
            })}
          </div>
        )}

        {roundError && round && (
          <div className="kv-error">
            Atsakymo išsiųsti nepavyko.
            <button className="kv-retry" onClick={() => { setRoundError(null); setChecking(true); void sendAnswer(round, roundError.answerId, roundError.ms) }}>Bandyti dar</button>
          </div>
        )}

        {phase === 'reveal' && (
          <button className="kv-next" onClick={nextRound}>
            {roundIdx + 1 >= (quiz?.rounds.length || 0) ? 'Rezultatai →' : 'Kitas raundas →'}
          </button>
        )}
      </div>

      {phase === 'submitting' && <div className="kv-center"><div className="kv-spinner" /><p className="kv-note">Skaičiuojam…</p></div>}

      {/* ── Rezultatai ── */}
      {phase === 'results' && (
        <div className="kv-results">
          {result?.submitError && (
            <div className="kv-error" style={{ marginBottom: 14 }}>
              {result.submitError}
              <button className="kv-retry" onClick={() => void submitQuiz()}>Bandyti dar</button>
            </div>
          )}
          <div className="kv-score-big" style={{ ['--acc' as any]: category.accent }}>
            <span className="kv-score-num">{result?.score ?? score}</span>
            <span className="kv-score-max">iš {result?.maxScore ?? '—'} galimų</span>
          </div>
          <div className="kv-grid-line">{outcomes.map((o, i) => <span key={i}>{OUTCOME_EMOJI[o]}</span>)}</div>
          <p className="kv-result-line">
            Atspėta <b>{result?.correctCount ?? '—'}</b> iš {result?.roundCount ?? quiz?.rounds.length}
            {result?.bestCombo >= COMBO_MIN && <> · serija <b>×{result.bestCombo}</b></>}
          </p>
          {result?.xp > 0 ? (
            <p className="kv-xp-line">⚡ +{result.xp} taškų{typeof result.totalXp === 'number' && result.totalXp > 0 ? ` · iš viso ${result.totalXp.toLocaleString('lt-LT')}` : ''}</p>
          ) : result && !result.xpEligible ? (
            <p className="kv-xp-line dim">Dienos taškų limitas — ši partija be taškų 💪</p>
          ) : null}
          <div className="kv-result-actions">
            <button className="kv-share" onClick={shareResult}>{shared ? 'Nukopijuota ✓' : 'Dalintis 📤'}</button>
            <button className="kv-again" onClick={() => void pickCategory(category)}>Dar kartą</button>
            <button className="kv-other" onClick={() => { setPhase('pick'); setQuiz(null) }}>Kita kategorija</button>
          </div>
        </div>
      )}
    </ZaidimoLangas>
  )
}

const css = `
.kv-chip { font-size: 13px; font-weight: 800; color: var(--text-secondary); background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.22); border-radius: 999px; padding: 5px 11px; }
.kv-chip.strong { color: var(--accent-orange); }
.kv-combo { font-size: 13px; font-weight: 900; color: #f97316; animation: kvpulse .6s ease infinite alternate; }
@keyframes kvpulse { from { transform: scale(1); } to { transform: scale(1.1); } }

.kv-dots { display: flex; gap: 6px; justify-content: center; margin-bottom: 12px; }
.kv-dot { width: 10px; height: 10px; border-radius: 50%; background: rgba(148,163,184,0.28); }
.kv-dot.now { outline: 2px solid rgba(245,158,11,0.6); outline-offset: 1px; }
.kv-dot.fast { background: #22c55e; }
.kv-dot.slow { background: #eab308; }
.kv-dot.wrong { background: #ef4444; }
.kv-dot.timeout { background: #334155; }

.kv-lead { font-size: 14px; color: var(--text-secondary); line-height: 1.5; margin: 0 0 16px; }
.kv-note { font-size: 12px; color: var(--text-muted); margin-top: 14px; }
.kv-error { font-size: 14px; color: #f87171; background: rgba(248,113,113,0.1); border-radius: 10px; padding: 10px 14px; margin-bottom: 12px; }
.kv-retry { margin-left: 10px; font-size: 12px; font-weight: 800; color: #f87171; background: transparent; border: 1px solid rgba(248,113,113,0.5); border-radius: 8px; padding: 4px 10px; cursor: pointer; }

.kv-daily {
  display: flex; flex-direction: column; gap: 4px; text-decoration: none; width: 100%;
  padding: 16px; border-radius: 15px; margin-bottom: 14px;
  background: var(--bg-surface);
  border: 1px solid rgba(236,72,153,0.5);
}
.kv-daily.played { opacity: 0.75; }
.kv-daily-badge { font-size: 11px; font-weight: 900; letter-spacing: 0.08em; color: var(--accent-orange); }
.kv-daily-title { font-size: 15px; font-weight: 900; color: var(--text-primary); }
.kv-daily-sub { font-size: 12px; color: var(--text-secondary); }

.kv-cats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
@media (max-width: 480px) { .kv-cats { grid-template-columns: 1fr 1fr; } }
.kv-cat {
  display: flex; flex-direction: column; gap: 3px; align-items: flex-start; text-align: left;
  padding: 15px 13px; border-radius: 15px; cursor: pointer;
  background: var(--bg-surface);
  border: 1px solid rgba(140,160,190,0.22);
}
.kv-cat-emoji { font-size: 22px; }
.kv-cat-label { font-size: 15px; font-weight: 900; color: var(--text-primary); line-height: 1.15; }
.kv-cat-desc { font-size: 11px; color: var(--text-secondary); }

.kv-center { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 0; }
.kv-spinner { width: 38px; height: 38px; border-radius: 50%; border: 3px solid rgba(148,163,184,0.25); border-top-color: var(--accent-orange); animation: kvspin .8s linear infinite; }
@keyframes kvspin { to { transform: rotate(360deg); } }

.kv-ready { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 12vh 0; gap: 6px; }
.kv-ready-emoji { font-size: 46px; }
.kv-ready-title { font-size: 24px; font-weight: 900; color: var(--text-primary); margin: 0; }
.kv-cta-big {
  margin-top: 18px; font-size: 20px; font-weight: 900; color: #fff; cursor: pointer; border: 0;
  border-radius: 999px; padding: 17px 44px;
  background: var(--accent-orange);
}

.kv-stage { flex-direction: column; gap: 12px; }
.kv-audio {
  position: relative; display: flex; align-items: center; justify-content: center; gap: 18px;
  border-radius: 16px; min-height: 110px; padding: 14px;
  background: #10131b;
}
.kv-hidden-yt { position: absolute; width: 2px; height: 2px; opacity: 0.01; pointer-events: none; }
.kv-nosound-note { font-size: 12px; color: rgba(255,255,255,0.8); max-width: 40%; }
.kv-eq { display: flex; align-items: flex-end; gap: 5px; height: 42px; }
.kv-eq span { width: 7px; border-radius: 3px; background: var(--accent-orange); animation: kveq 0.9s ease-in-out infinite alternate; }
@keyframes kveq { from { height: 8px; } to { height: 42px; } }
.kv-clock { width: 60px; height: 60px; border-radius: 50%; background: conic-gradient(var(--accent-orange) calc(var(--p) * 360deg), rgba(148,163,184,0.18) 0); display: flex; align-items: center; justify-content: center; }
.kv-clock span { width: 48px; height: 48px; border-radius: 50%; background: #10131b; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 19px; font-weight: 900; }
.kv-nosound { font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.78); background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.18); border-radius: 999px; padding: 6px 14px; cursor: pointer; max-width: 90%; }
.kv-verdict { font-size: 18px; font-weight: 900; padding: 12px 22px; border-radius: 13px; color: #fff; }
.kv-verdict.ok { background: rgba(16,185,129,0.92); }
.kv-verdict.bad { background: rgba(239,68,68,0.9); }

.kv-timderbar { height: 6px; border-radius: 3px; background: rgba(148,163,184,0.18); overflow: hidden; }
.kv-timderbar div { height: 100%; background: var(--accent-orange); transition: width .1s linear; }

.kv-options { display: grid; grid-template-columns: repeat(2, 1fr); gap: 9px; }
@media (max-width: 520px) { .kv-options { grid-template-columns: 1fr; } }
.kv-opt {
  display: flex; flex-direction: column; gap: 1px; align-items: flex-start; text-align: left;
  padding: 12px 14px; border-radius: 13px; cursor: pointer;
  background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.22);
}
.kv-opt-artist { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.kv-opt-title { font-size: 15px; font-weight: 800; color: var(--text-primary); }
.kv-opt.correct { background: rgba(16,185,129,0.16); border-color: #10b981; }
.kv-opt.correct .kv-opt-title { color: #34d399; }
.kv-opt.wrong { background: rgba(239,68,68,0.13); border-color: #ef4444; }
.kv-opt.dim { opacity: 0.45; }
.kv-opt.checking { border-color: var(--accent-orange); animation: kvcheck .5s ease infinite alternate; }
@keyframes kvcheck { from { opacity: 0.75; } to { opacity: 1; } }

.kv-next { align-self: center; font-size: 16px; font-weight: 800; color: #fff; cursor: pointer; background: var(--accent-orange); border: 0; border-radius: 999px; padding: 13px 30px; }

.kv-results { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 20px 0; }
.kv-score-big { display: flex; align-items: baseline; gap: 8px; margin-bottom: 12px; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.25); border-radius: 16px; padding: 20px 32px; }
.kv-score-num { font-size: 44px; font-weight: 900; color: var(--text-primary); line-height: 1; }
.kv-score-max { font-size: 14px; color: var(--text-muted); }
.kv-grid-line { font-size: 20px; letter-spacing: 2px; margin-bottom: 8px; }
.kv-result-line { font-size: 15px; color: var(--text-secondary); margin: 4px 0; }
.kv-result-line b { color: var(--text-primary); }
.kv-xp-line { font-size: 16px; font-weight: 700; color: var(--accent-orange); margin: 8px 0; }
.kv-xp-line.dim { color: var(--text-muted); font-weight: 500; }
.kv-result-actions { display: flex; gap: 9px; margin: 18px 0 8px; flex-wrap: wrap; justify-content: center; }
.kv-share { font-size: 15px; font-weight: 800; color: var(--text-primary); cursor: pointer; border: 1px solid rgba(140,160,190,0.3); border-radius: 999px; padding: 12px 22px; background: var(--bg-surface); }
.kv-again { font-size: 15px; font-weight: 800; color: #fff; cursor: pointer; border: 0; border-radius: 999px; padding: 12px 22px; background: var(--accent-orange); }
.kv-other { font-size: 15px; font-weight: 800; color: var(--text-primary); cursor: pointer; border-radius: 999px; padding: 12px 22px; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.3); }
`
