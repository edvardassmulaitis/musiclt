'use client'

// app/zaidimai/dainu-kvizas/KvizasClient.tsx
//
// „Atspėk dainą" — songtrivia2.io stiliaus audio kvizas + Wordle mechanikos:
//   * DIENOS IŠŠŪKIS — visiems tas pats (date-seeded), ×2 taškai, 1 užskaitytas
//     bandymas/d., share'inamas emoji rezultatas (viral loop).
//   * COMBO — 3+ teisingi iš eilės duoda bonusą (server'is skaičiuoja tą patį).
//   * Progreso taškeliai kaip songtrivia.
//
// YT grojimas: plain <iframe autoplay=1 start=N> už equalizer overlay
// (site'o patikrintas pattern'as; „Negirdi?" remount'as mobile fallback'ui).

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

type Option = { id: number; title: string; artist: string }
type Round = { r: number; ytId: string; startSec: number; correctId: number; options: Option[]; token: string }
type Quiz = {
  quizId: string
  category: string
  isDaily: boolean
  roundMs: number
  rounds: Round[]
  xpRunsLeft: number
  dailyPlayed: boolean
  dailyMult: number
}
type Answer = { token: string; answerId: number | null; ms: number }
type RoundOutcome = 'fast' | 'slow' | 'wrong' | 'timeout'

type Category = { key: string; label: string; desc: string; accent: string; emoji: string }

const CATEGORIES: Category[] = [
  { key: 'lt-mix', label: 'Lietuviškas mišinys', desc: 'Visa lietuviška muzika', accent: '#f59e0b', emoji: '🇱🇹' },
  { key: 'lt-nauja', label: 'Nauja banga', desc: 'Šviežia lietuviška muzika', accent: '#10b981', emoji: '🌊' },
  { key: 'lt-klasika', label: 'Lietuviška klasika', desc: 'Dainos, kurias žino visi', accent: '#8b5cf6', emoji: '📼' },
  { key: 'pasaulis', label: 'Pasaulio hitai', desc: 'Užsienio scena', accent: '#3b82f6', emoji: '🌍' },
]
const ROUND_MS = 15000
const REVEAL_MS = 5000
const COMBO_MIN = 3
const COMBO_BONUS = 15

type Phase = 'pick' | 'loading' | 'round' | 'reveal' | 'submitting' | 'results'

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
  const [answers, setAnswers] = useState<Answer[]>([])
  const [outcomes, setOutcomes] = useState<RoundOutcome[]>([])
  const [picked, setPicked] = useState<number | null>(null)
  const [timeLeft, setTimeLeft] = useState(ROUND_MS)
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [lastPoints, setLastPoints] = useState(0)
  const [iframeNonce, setIframeNonce] = useState(0)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [dailyInfo, setDailyInfo] = useState<{ played: boolean; quiz: Quiz | null } | null>(null)
  const [shared, setShared] = useState(false)

  const roundStartRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const revealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const phaseRef = useRef<Phase>('pick')
  phaseRef.current = phase
  const answerRef = useRef<(id: number | null) => void>(() => {})
  const answersRef = useRef<Answer[]>([])
  useEffect(() => { answersRef.current = answers }, [answers])

  const round = quiz?.rounds[roundIdx] || null

  // ── Dienos iššūkio prefetch (statusas + instant start) ──
  useEffect(() => {
    let alive = true
    fetch('/api/zaidimai/kvizas?kategorija=dienos')
      .then(r => r.json())
      .then(j => { if (alive && j.rounds) setDailyInfo({ played: !!j.dailyPlayed, quiz: j }) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // ── Timer ──
  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }
  function startRound() {
    roundStartRef.current = Date.now()
    setTimeLeft(ROUND_MS)
    setPicked(null)
    stopTimer()
    timerRef.current = setInterval(() => {
      const left = ROUND_MS - (Date.now() - roundStartRef.current)
      if (left <= 0) {
        setTimeLeft(0)
        answerRef.current(null)
      } else {
        setTimeLeft(left)
      }
    }, 100)
  }
  useEffect(() => () => { stopTimer(); if (revealTimeoutRef.current) clearTimeout(revealTimeoutRef.current) }, [])

  function beginQuiz(cat: Category, q: Quiz) {
    setCategory(cat)
    setQuiz(q)
    setRoundIdx(0)
    setAnswers([])
    setOutcomes([])
    setScore(0)
    setCombo(0)
    setResult(null)
    setShared(false)
    setPhase('round')
    setIframeNonce(n => n + 1)
    startRound()
  }

  async function startQuiz(cat: Category) {
    setCategory(cat)
    setPhase('loading')
    setError(null)
    try {
      const res = await fetch(`/api/zaidimai/kvizas?kategorija=${cat.key}`)
      const json = await res.json()
      if (!res.ok || !json.rounds?.length) {
        setError(json.error || 'Nepavyko sugeneruoti kvizo — pabandyk vėliau')
        setPhase('pick')
        return
      }
      beginQuiz(cat, json)
    } catch {
      setError('Tinklo klaida — pabandyk dar kartą')
      setPhase('pick')
    }
  }

  // ── Answer (client-side skaičiavimas = server formulei, greitam feedback'ui) ──
  function answerRound(answerId: number | null) {
    if (phaseRef.current !== 'round' || !round) return
    stopTimer()
    const ms = Math.min(Date.now() - roundStartRef.current, ROUND_MS)
    const correct = answerId !== null && answerId === round.correctId
    const newCombo = correct ? combo + 1 : 0
    let points = 0
    if (correct) {
      points = 50 + Math.round(50 * (ROUND_MS - ms) / ROUND_MS)
      if (newCombo >= COMBO_MIN) points += COMBO_BONUS
    }
    setCombo(newCombo)
    setPicked(answerId)
    setLastPoints(points)
    setScore(s => s + points)
    setAnswers(a => [...a, { token: round.token, answerId, ms }])
    setOutcomes(o => [...o, outcomeOf(correct, answerId, ms)])
    setPhase('reveal')
    revealTimeoutRef.current = setTimeout(nextRound, REVEAL_MS)
  }
  answerRef.current = answerRound

  function nextRound() {
    if (revealTimeoutRef.current) { clearTimeout(revealTimeoutRef.current); revealTimeoutRef.current = null }
    if (!quiz) return
    if (roundIdx + 1 >= quiz.rounds.length) {
      void submitQuiz()
      return
    }
    setRoundIdx(i => i + 1)
    setPhase('round')
    setIframeNonce(n => n + 1)
    startRound()
  }

  async function submitQuiz() {
    if (!quiz) return
    setPhase('submitting')
    try {
      const res = await fetch('/api/zaidimai/kvizas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kategorija: quiz.category, rounds: answersRef.current }),
      })
      const json = await res.json()
      setResult(json)
      if (quiz.isDaily) setDailyInfo(d => (d ? { ...d, played: true } : d))
    } catch {
      setResult(null)
    }
    setPhase('results')
  }

  // ── Share (Wordle stiliaus) ──
  async function shareResult() {
    const date = new Date().toLocaleDateString('lt-LT', { timeZone: 'Europe/Vilnius', month: '2-digit', day: '2-digit' })
    const grid = outcomes.map(o => OUTCOME_EMOJI[o]).join('')
    const title = category.key === 'dienos' ? `Dienos iššūkis ${date}` : category.label
    const lines = [
      `🎵 music.lt · ${title}`,
      grid,
      `${result?.score ?? score} tšk. · ${result?.correctCount ?? outcomes.filter(o => o === 'fast' || o === 'slow').length}/${quiz?.rounds.length}${result?.bestCombo >= COMBO_MIN ? ` · combo ×${result.bestCombo}` : ''}`,
      'https://music.lt/zaidimai/dainu-kvizas',
    ]
    const text = lines.join('\n')
    try {
      if (navigator.share) {
        await navigator.share({ text })
      } else {
        await navigator.clipboard.writeText(text)
      }
      setShared(true)
      setTimeout(() => setShared(false), 2500)
    } catch { /* atšaukė — ok */ }
  }

  const pct = Math.max(0, timeLeft / ROUND_MS)

  return (
    <div className="kv-root">
      <style>{css}</style>

      <div className="kv-top">
        <Link href="/zaidimai" className="kv-back">← Žaidimai</Link>
        {quiz && phase !== 'pick' && phase !== 'results' && (
          <div className="kv-progress">
            {combo >= COMBO_MIN && <span className="kv-combo">🔥 COMBO ×{combo}</span>}
            <span className="kv-progress-n">{Math.min(roundIdx + 1, quiz.rounds.length)} / {quiz.rounds.length}</span>
            <span className="kv-progress-score">⚡ {score}</span>
          </div>
        )}
      </div>

      {/* Progreso taškeliai */}
      {quiz && (phase === 'round' || phase === 'reveal') && (
        <div className="kv-dots">
          {quiz.rounds.map((_, i) => {
            const o = outcomes[i]
            return <span key={i} className={`kv-dot${o ? ` ${o}` : ''}${i === roundIdx ? ' now' : ''}`} />
          })}
        </div>
      )}

      {/* ── Kategorijos pasirinkimas ── */}
      {phase === 'pick' && (
        <div className="kv-pick">
          <h1 className="kv-h1">Atspėk dainą</h1>
          <p className="kv-lead">Groja ištrauka — turi 15 sekundžių ir 4 variantus. Greitis = taškai, serija = combo bonusas.</p>
          {error && <div className="kv-error">{error}</div>}

          {/* Dienos iššūkis gyvena atskirai — wizard'e /zaidimai/dienos */}
          <Link href="/zaidimai/dienos" className={`kv-daily${dailyInfo?.played ? ' played' : ''}`}>
            <span className="kv-daily-badge">⚡ DIENOS IŠŠŪKIS</span>
            <span className="kv-daily-title">Kvizas + dienos misijos viename — ×2 taškai</span>
            <span className="kv-daily-sub">
              {dailyInfo?.played ? 'Kvizo dalis šiandien įveikta ✓' : 'Tas pats visiems, vienas bandymas per dieną →'}
            </span>
          </Link>

          <div className="kv-cats">
            {CATEGORIES.map(c => (
              <button key={c.key} className="kv-cat" style={{ ['--acc' as any]: c.accent }} onClick={() => startQuiz(c)}>
                <span className="kv-cat-emoji">{c.emoji}</span>
                <span className="kv-cat-label">{c.label}</span>
                <span className="kv-cat-desc">{c.desc}</span>
              </button>
            ))}
          </div>
          <p className="kv-note">Taškai: dienos iššūkis ×2 (1 k./d.) + pirmi 3 laisvi kvizai. Nariams +50%.</p>
        </div>
      )}

      {phase === 'loading' && (
        <div className="kv-center"><div className="kv-spinner" /><p className="kv-lead">Renkam dainas...</p></div>
      )}

      {/* ── Raundas / Reveal ── */}
      {(phase === 'round' || phase === 'reveal') && round && (
        <div className="kv-stage">
          <div className="kv-player">
            <iframe
              key={`${round.ytId}-${iframeNonce}`}
              src={`https://www.youtube-nocookie.com/embed/${round.ytId}?autoplay=1&start=${round.startSec}&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3${phase === 'round' ? '&controls=0&disablekb=1&fs=0' : ''}`}
              allow="autoplay; encrypted-media"
              title="Kvizo daina"
            />
            {phase === 'round' && (
              <div className="kv-cover">
                <div className="kv-eq">
                  {Array.from({ length: 7 }).map((_, i) => <span key={i} style={{ animationDelay: `${i * 0.12}s` }} />)}
                </div>
                <div className="kv-clock" style={{ ['--p' as any]: pct }}>
                  <span>{Math.ceil(timeLeft / 1000)}</span>
                </div>
                <button className="kv-nosound" onClick={() => setIframeNonce(n => n + 1)}>
                  Negirdi? Spausk čia ▶
                </button>
              </div>
            )}
            {phase === 'reveal' && (
              <div className={`kv-verdict ${picked === round.correctId ? 'ok' : 'bad'}`}>
                {picked === round.correctId
                  ? `+${lastPoints} tšk.${combo >= COMBO_MIN ? ` 🔥×${combo}` : ''}`
                  : picked === null ? 'Laikas baigėsi!' : 'Ne ta daina'}
              </div>
            )}
          </div>

          <div className="kv-timderbar"><div style={{ width: `${pct * 100}%` }} /></div>

          <div className="kv-options">
            {round.options.map(o => {
              let cls = 'kv-opt'
              if (phase === 'reveal') {
                if (o.id === round.correctId) cls += ' correct'
                else if (o.id === picked) cls += ' wrong'
                else cls += ' dim'
              }
              return (
                <button key={o.id} className={cls} disabled={phase === 'reveal'} onClick={() => answerRound(o.id)}>
                  <span className="kv-opt-artist">{o.artist}</span>
                  <span className="kv-opt-title">{o.title}</span>
                </button>
              )
            })}
          </div>

          {phase === 'reveal' && (
            <button className="kv-next" onClick={nextRound}>
              {roundIdx + 1 >= (quiz?.rounds.length || 0) ? 'Rezultatai →' : 'Kitas raundas →'}
            </button>
          )}
        </div>
      )}

      {phase === 'submitting' && (
        <div className="kv-center"><div className="kv-spinner" /><p className="kv-lead">Skaičiuojam rezultatą...</p></div>
      )}

      {/* ── Rezultatai ── */}
      {phase === 'results' && (
        <div className="kv-results">
          {category.key === 'dienos' && <div className="kv-results-daily">⚡ Dienos iššūkis</div>}
          <div className="kv-score-big" style={{ ['--acc' as any]: category.accent }}>
            <span className="kv-score-num">{result?.score ?? score}</span>
            <span className="kv-score-max">/ {result?.maxScore ?? '—'} tšk.</span>
          </div>

          <div className="kv-grid-line">{outcomes.map((o, i) => <span key={i}>{OUTCOME_EMOJI[o]}</span>)}</div>

          <p className="kv-result-line">
            Atspėta <b>{result?.correctCount ?? '—'}</b> iš {result?.roundCount ?? quiz?.rounds.length}
            {result?.bestCombo >= COMBO_MIN && <> · geriausias combo <b>×{result.bestCombo}</b></>}
          </p>

          {result?.isDaily && result?.dailyRank && result.dailyRank.total > 1 && (
            <p className="kv-result-line">
              Šiandien įveikei <b>{Math.round(((result.dailyRank.total - 1 - result.dailyRank.better) / (result.dailyRank.total - 1)) * 100)}%</b> žaidusių
            </p>
          )}

          {result?.xp > 0 ? (
            <p className="kv-xp-line">⚡ Užskaityta <b>+{result.xp}</b> taškų{typeof result.totalXp === 'number' && result.totalXp > 0 ? ` — iš viso ${result.totalXp.toLocaleString('lt-LT')}` : ''}</p>
          ) : result && !result.xpEligible ? (
            <p className="kv-xp-line dim">{result.isDaily ? 'Dienos iššūkis jau užskaitytas anksčiau — čia treniruotė 💪' : 'Dienos taškų limitas išnaudotas — treniruotė 💪'}</p>
          ) : null}

          <div className="kv-result-actions">
            <button className="kv-share" onClick={shareResult}>{shared ? 'Nukopijuota ✓' : 'Dalintis rezultatu 📤'}</button>
            <button className="kv-again" onClick={() => startQuiz(category)}>Dar kartą</button>
            <button className="kv-other" onClick={() => { setPhase('pick'); setQuiz(null) }}>Kita kategorija</button>
          </div>
          <Link href="/zaidimai" className="kv-back-link">← Grįžti į žaidimus</Link>
        </div>
      )}
    </div>
  )
}

const css = `
.kv-root { max-width: 760px; margin: 0 auto; padding: 24px 16px 90px; }
.kv-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.kv-back { font-size: 14px; font-weight: 700; color: var(--text-secondary); text-decoration: none; }
.kv-back:hover { color: var(--text-primary); }
.kv-progress { display: flex; gap: 10px; align-items: center; }
.kv-combo { font-size: 12px; font-weight: 900; color: #f97316; animation: kvpulse .6s ease infinite alternate; }
@keyframes kvpulse { from { transform: scale(1); } to { transform: scale(1.12); } }
.kv-progress-n { font-size: 14px; font-weight: 800; color: var(--text-secondary); }
.kv-progress-score { font-size: 16px; font-weight: 900; color: #f59e0b; }

.kv-dots { display: flex; gap: 6px; justify-content: center; margin-bottom: 12px; }
.kv-dot { width: 10px; height: 10px; border-radius: 50%; background: rgba(148,163,184,0.28); }
.kv-dot.now { outline: 2px solid rgba(245,158,11,0.6); outline-offset: 1px; }
.kv-dot.fast { background: #22c55e; }
.kv-dot.slow { background: #eab308; }
.kv-dot.wrong { background: #ef4444; }
.kv-dot.timeout { background: #334155; }

.kv-h1 { font-size: 30px; font-weight: 900; letter-spacing: -0.02em; color: var(--text-primary); margin: 0 0 8px; }
.kv-lead { font-size: 14px; color: var(--text-secondary); line-height: 1.5; margin: 0 0 20px; }
.kv-note { font-size: 12px; color: var(--text-muted); margin-top: 16px; }
.kv-error { font-size: 14px; color: #f87171; background: rgba(248,113,113,0.1); border-radius: 10px; padding: 10px 14px; margin-bottom: 14px; }

.kv-daily {
  display: flex; flex-direction: column; gap: 5px; align-items: flex-start; text-align: left; width: 100%;
  padding: 18px 18px; border-radius: 16px; cursor: pointer; margin-bottom: 14px;
  background: linear-gradient(135deg, rgba(236,72,153,0.22), rgba(99,102,241,0.18)), var(--bg-surface);
  border: 1px solid rgba(236,72,153,0.55);
  box-shadow: 0 10px 30px rgba(236,72,153,0.18);
  transition: transform .15s ease, box-shadow .15s ease;
}
.kv-daily:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 16px 38px rgba(236,72,153,0.3); }
.kv-daily.played { opacity: 0.75; box-shadow: none; }
.kv-daily:disabled { opacity: 0.5; cursor: wait; }
.kv-daily-badge { font-size: 12px; font-weight: 900; letter-spacing: 0.08em; color: #ec4899; }
.kv-daily-title { font-size: 16px; font-weight: 900; color: var(--text-primary); }
.kv-daily-sub { font-size: 12px; color: var(--text-secondary); }

.kv-cats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
@media (max-width: 520px) { .kv-cats { grid-template-columns: 1fr; } }
.kv-cat {
  display: flex; flex-direction: column; gap: 4px; align-items: flex-start; text-align: left;
  padding: 18px 16px; border-radius: 16px; cursor: pointer;
  background: linear-gradient(160deg, color-mix(in srgb, var(--acc) 14%, var(--bg-surface)) 0%, var(--bg-surface) 60%);
  border: 1px solid color-mix(in srgb, var(--acc) 40%, transparent);
  transition: transform .15s ease, box-shadow .15s ease;
}
.kv-cat:hover { transform: translateY(-2px); box-shadow: 0 12px 30px color-mix(in srgb, var(--acc) 25%, transparent); }
.kv-cat-emoji { font-size: 24px; }
.kv-cat-label { font-size: 16px; font-weight: 900; color: var(--text-primary); }
.kv-cat-desc { font-size: 12px; color: var(--text-secondary); }

.kv-center { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 70px 0; }
.kv-spinner {
  width: 38px; height: 38px; border-radius: 50%; border: 3px solid rgba(148,163,184,0.25);
  border-top-color: #f59e0b; animation: kvspin .8s linear infinite;
}
@keyframes kvspin { to { transform: rotate(360deg); } }

.kv-stage { display: flex; flex-direction: column; gap: 14px; }
.kv-player { position: relative; border-radius: 16px; overflow: hidden; aspect-ratio: 16/9; background: #0c0f15; }
.kv-player iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.kv-cover {
  position: absolute; inset: 0; z-index: 2; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
  background:
    radial-gradient(ellipse at 30% 20%, rgba(99,102,241,0.35), transparent 60%),
    radial-gradient(ellipse at 75% 80%, rgba(245,158,11,0.28), transparent 55%),
    #10131b;
}
.kv-eq { display: flex; align-items: flex-end; gap: 5px; height: 46px; }
.kv-eq span {
  width: 7px; border-radius: 3px; background: linear-gradient(180deg, #f59e0b, #6366f1);
  animation: kveq 0.9s ease-in-out infinite alternate;
}
@keyframes kveq { from { height: 8px; } to { height: 46px; } }
.kv-clock {
  width: 64px; height: 64px; border-radius: 50%;
  background: conic-gradient(#f59e0b calc(var(--p) * 360deg), rgba(148,163,184,0.18) 0);
  display: flex; align-items: center; justify-content: center;
}
.kv-clock span {
  width: 52px; height: 52px; border-radius: 50%; background: #10131b; color: #fff;
  display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 900;
}
.kv-nosound {
  font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.75); background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.18); border-radius: 999px; padding: 6px 14px; cursor: pointer;
}
.kv-verdict {
  position: absolute; top: 10px; left: 10px; z-index: 3; font-size: 16px; font-weight: 900;
  padding: 8px 16px; border-radius: 12px; color: #fff;
}
.kv-verdict.ok { background: rgba(16,185,129,0.92); }
.kv-verdict.bad { background: rgba(239,68,68,0.9); }

.kv-timderbar { height: 6px; border-radius: 3px; background: rgba(148,163,184,0.18); overflow: hidden; }
.kv-timderbar div { height: 100%; background: linear-gradient(90deg, #6366f1, #f59e0b); transition: width .1s linear; }

.kv-options { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
@media (max-width: 520px) { .kv-options { grid-template-columns: 1fr; } }
.kv-opt {
  display: flex; flex-direction: column; gap: 2px; align-items: flex-start; text-align: left;
  padding: 13px 15px; border-radius: 13px; cursor: pointer;
  background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.22);
  transition: transform .12s ease, border-color .12s ease, background .12s ease;
}
.kv-opt:hover:not(:disabled) { transform: translateY(-1px); border-color: #6366f1; }
.kv-opt-artist { font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.kv-opt-title { font-size: 16px; font-weight: 800; color: var(--text-primary); }
.kv-opt.correct { background: rgba(16,185,129,0.16); border-color: #10b981; }
.kv-opt.correct .kv-opt-title { color: #34d399; }
.kv-opt.wrong { background: rgba(239,68,68,0.13); border-color: #ef4444; }
.kv-opt.dim { opacity: 0.45; }

.kv-next {
  align-self: center; font-size: 16px; font-weight: 800; color: #fff; cursor: pointer;
  background: linear-gradient(135deg, #6366f1, #8b5cf6); border: 0; border-radius: 999px; padding: 12px 28px;
  box-shadow: 0 10px 26px rgba(99,102,241,0.4);
}

.kv-results { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 30px 0; }
.kv-results-daily { font-size: 14px; font-weight: 900; letter-spacing: 0.06em; color: #ec4899; margin-bottom: 10px; }
.kv-score-big {
  display: flex; align-items: baseline; gap: 8px; margin-bottom: 12px;
  background: linear-gradient(160deg, color-mix(in srgb, var(--acc) 18%, var(--bg-surface)), var(--bg-surface));
  border: 1px solid color-mix(in srgb, var(--acc) 40%, transparent);
  border-radius: 20px; padding: 22px 34px;
}
.kv-score-num { font-size: 44px; font-weight: 900; color: var(--text-primary); line-height: 1; }
.kv-score-max { font-size: 14px; color: var(--text-muted); }
.kv-grid-line { font-size: 20px; letter-spacing: 2px; margin-bottom: 8px; }
.kv-result-line { font-size: 16px; color: var(--text-secondary); margin: 4px 0; }
.kv-result-line b { color: var(--text-primary); }
.kv-xp-line { font-size: 16px; font-weight: 700; color: #f59e0b; margin: 8px 0; }
.kv-xp-line.dim { color: var(--text-muted); font-weight: 500; }
.kv-result-actions { display: flex; gap: 10px; margin: 20px 0 14px; flex-wrap: wrap; justify-content: center; }
.kv-share {
  font-size: 16px; font-weight: 800; color: #fff; cursor: pointer; border: 0; border-radius: 999px; padding: 12px 24px;
  background: linear-gradient(135deg, #ec4899, #8b5cf6); box-shadow: 0 10px 26px rgba(236,72,153,0.35);
}
.kv-again {
  font-size: 16px; font-weight: 800; color: #fff; cursor: pointer; border: 0; border-radius: 999px; padding: 12px 24px;
  background: linear-gradient(135deg, #f59e0b, #f97316); box-shadow: 0 10px 26px rgba(245,158,11,0.35);
}
.kv-other {
  font-size: 16px; font-weight: 800; color: var(--text-primary); cursor: pointer; border-radius: 999px; padding: 12px 24px;
  background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.3);
}
.kv-back-link { font-size: 14px; color: var(--text-secondary); text-decoration: none; margin-top: 8px; }
`
