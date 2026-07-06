'use client'

// app/zaidimai/dienos/DienosClient.tsx
//
// Dienos iššūkio wizard'as: kvizas (5) → dvikova → verdiktas → AI vaizdas
// (jei yra) → suvestinė. Visi step'ai viename flow, bendras taškų krepšys.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { ImageDrop, DuelDrop, VerdictDrop, DropCompletionLookup } from '@/lib/boombox'
import ZaidimoLangas from '@/components/zaidimai/ZaidimoLangas'
import { naudotiGarsoGrotuva, yraIos } from '@/components/zaidimai/naudotiGarsoGrotuva'

type Props = {
  isAuthenticated: boolean
  duel: DuelDrop | null
  verdict: VerdictDrop | null
  image: ImageDrop | null
  completions: DropCompletionLookup
  quizPlayed: boolean
  quizScore: number | null
  streak: { current: number; total_xp: number }
}

type Stage = 'intro' | 'kvizas' | 'duel' | 'verdict' | 'image' | 'summary'
type StepKey = 'kvizas' | 'duel' | 'verdict' | 'image'

// ── Kvizo tipai ──
type QOption = { id: number; title: string; artist: string }
type QRound = { r: number; ytId: string; startSec: number; audioUrl: string | null; options: QOption[]; token: string }
type QRoundResult = { correct: boolean; correctId: number; points: number; comboNow: number }
type QOutcome = 'fast' | 'slow' | 'wrong' | 'timeout'
const OUTCOME_EMOJI: Record<QOutcome, string> = { fast: '🟩', slow: '🟨', wrong: '🟥', timeout: '⬛' }

const ROUND_MS = 15000
const REVEAL_MS = 4000
const COMBO_MIN = 3
const COMBO_BONUS = 15

const REACTIONS: Array<{ emoji: string; label: string }> = [
  { emoji: '🔥', label: 'Dega' },
  { emoji: '🐐', label: 'Legenda' },
  { emoji: '😭', label: 'Emocija' },
  { emoji: '😬', label: 'Ne man' },
]

function ytIdFrom(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

export default function DienosClient(props: Props) {
  const { duel, verdict, image, completions } = props

  // ── Step'ų sąrašas ──
  const steps: Array<{ key: StepKey; label: string; emoji: string; present: boolean; initiallyDone: boolean }> = [
    { key: 'kvizas', label: 'Atspėk 5 dainas', emoji: '🎧', present: true, initiallyDone: props.quizPlayed },
    { key: 'duel', label: 'Dienos dvikova', emoji: '⚔️', present: !!duel, initiallyDone: !!completions.duel },
    { key: 'verdict', label: 'Dienos verdiktas', emoji: '🔥', present: !!verdict, initiallyDone: !!completions.verdict },
    { key: 'image', label: 'Atspėk iš vaizdo', emoji: '🖼️', present: !!image, initiallyDone: !!completions.image },
  ].filter(s => s.present) as any

  const [done, setDone] = useState<Record<StepKey, boolean>>({
    kvizas: props.quizPlayed,
    duel: !!completions.duel,
    verdict: !!completions.verdict,
    image: !!completions.image,
  })
  const [stage, setStage] = useState<Stage>('intro')
  const [sessionXp, setSessionXp] = useState(0)
  const [streak, setStreak] = useState(props.streak)

  function nextStageAfter(cur: Stage): Stage {
    const order: StepKey[] = steps.map((s: any) => s.key)
    const idx = cur === 'intro' ? -1 : order.indexOf(cur as StepKey)
    for (let i = idx + 1; i < order.length; i++) {
      if (!done[order[i]]) return order[i] as Stage
    }
    return 'summary'
  }

  function markDone(key: StepKey) {
    setDone(d => ({ ...d, [key]: true }))
  }

  // ═══════════ KVIZAS ═══════════
  const [qRounds, setQRounds] = useState<QRound[]>([])
  const [qQuizId, setQQuizId] = useState('')
  const [qIdx, setQIdx] = useState(0)
  const [qOutcomes, setQOutcomes] = useState<QOutcome[]>([])
  const [qPicked, setQPicked] = useState<number | null>(null)
  const [qRoundResult, setQRoundResult] = useState<QRoundResult | null>(null)
  const [qChecking, setQChecking] = useState(false)
  const [qRoundError, setQRoundError] = useState<{ answerId: number | null; ms: number } | null>(null)
  const [qTimeLeft, setQTimeLeft] = useState(ROUND_MS)
  const [qScore, setQScore] = useState(0)
  const [qCombo, setQCombo] = useState(0)
  const [qLastPoints, setQLastPoints] = useState(0)
  const [qPhase, setQPhase] = useState<'load' | 'ready' | 'round' | 'reveal' | 'submitting'>('load')
  const garsas = naudotiGarsoGrotuva()
  const [ios] = useState(() => yraIos())
  const [qResult, setQResult] = useState<any>(null)
  const [qError, setQError] = useState<string | null>(null)

  const qStartRef = useRef(0)
  const qTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const qRevealRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const qPhaseRef = useRef(qPhase)
  qPhaseRef.current = qPhase
  const qAnswerRef = useRef<(id: number | null) => void>(() => {})
  useEffect(() => () => { if (qTimerRef.current) clearInterval(qTimerRef.current); if (qRevealRef.current) clearTimeout(qRevealRef.current) }, [])

  const qRound = qRounds[qIdx] || null

  async function startKvizas() {
    setStage('kvizas')
    setQPhase('load')
    setQError(null)
    try {
      const res = await fetch('/api/zaidimai/kvizas?kategorija=dienos&raundai=5')
      const json = await res.json()
      if (!res.ok || !json.rounds?.length) {
        setQError(json.error || 'Nepavyko įkelti — pabandyk vėliau')
        return
      }
      setQRounds(json.rounds)
      setQQuizId(json.quizId)
      setQIdx(0)
      setQOutcomes([])
      setQScore(0)
      setQCombo(0)
      setQResult(null)
      setQRoundResult(null)
      setQRoundError(null)
      setQPhase('ready') // grojimui reikia TAP — iOS garso atrakinimas
    } catch {
      setQError('Tinklo klaida')
    }
  }

  /** Kviečiama mygtuko onClick — grojimas gesto kontekste (iOS). */
  function qStartPlaying() {
    const first = qRounds[0]
    if (!first) return
    garsas.play(first.audioUrl)
    setQPhase('round')
    qStartRound()
  }

  function qStartRound() {
    qStartRef.current = Date.now()
    setQTimeLeft(ROUND_MS)
    setQPicked(null)
    if (qTimerRef.current) clearInterval(qTimerRef.current)
    qTimerRef.current = setInterval(() => {
      const left = ROUND_MS - (Date.now() - qStartRef.current)
      if (left <= 0) { setQTimeLeft(0); qAnswerRef.current(null) }
      else setQTimeLeft(left)
    }, 100)
  }

  function qAnswer(answerId: number | null) {
    if (qPhaseRef.current !== 'round' || !qRound || qChecking) return
    if (qTimerRef.current) { clearInterval(qTimerRef.current); qTimerRef.current = null }
    const ms = Math.min(Date.now() - qStartRef.current, ROUND_MS)
    setQPicked(answerId)
    setQChecking(true)
    setQRoundError(null)
    void qSendAnswer(qRound, answerId, ms)
  }
  qAnswerRef.current = qAnswer

  async function qSendAnswer(r: QRound, answerId: number | null, ms: number) {
    try {
      const res = await fetch('/api/zaidimai/raundas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: r.token, answerId, ms }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Nepavyko')
      setQChecking(false)
      setQRoundResult({ correct: json.correct, correctId: json.correctId, points: json.points, comboNow: json.comboNow })
      setQCombo(json.correct ? json.comboNow : 0)
      setQLastPoints(json.points)
      setQScore(s => s + json.points)
      setQOutcomes(o => [...o, json.correct ? (ms < ROUND_MS / 2 ? 'fast' : 'slow') : (answerId === null ? 'timeout' : 'wrong')])
      setQPhase('reveal')
      qRevealRef.current = setTimeout(qNext, REVEAL_MS)
    } catch {
      setQChecking(false)
      setQRoundError({ answerId, ms })
    }
  }

  function qNext() {
    if (qRevealRef.current) { clearTimeout(qRevealRef.current); qRevealRef.current = null }
    if (qIdx + 1 >= qRounds.length) { void qSubmit(); return }
    const next = qRounds[qIdx + 1]
    setQIdx(i => i + 1)
    setQRoundResult(null)
    setQPhase('round')
    garsas.play(next.audioUrl)
    qStartRound()
  }

  async function qSubmit() {
    garsas.stop()
    setQPhase('submitting')
    try {
      const res = await fetch('/api/zaidimai/kvizas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kategorija: 'dienos', quizId: qQuizId }),
      })
      const json = await res.json()
      if (!res.ok && res.status !== 409) {
        // Užskaityti nepavyko — NEžymim atlikto, leidžiam bandyti dar
        setQError(json.error || 'Rezultato užskaityti nepavyko')
        setQPhase('reveal')
        return
      }
      setQResult(json)
      if (json.xp) setSessionXp(x => x + json.xp)
      if (json.streak) setStreak(s => ({ current: json.streak, total_xp: json.totalXp ?? s.total_xp }))
    } catch {
      setQError('Tinklo klaida — rezultato užskaityti nepavyko')
      setQPhase('reveal')
      return
    }
    markDone('kvizas')
    setStage(() => nextAfterDone('kvizas'))
  }

  function nextAfterDone(key: StepKey): Stage {
    const order: StepKey[] = steps.map((s: any) => s.key)
    const idx = order.indexOf(key)
    for (let i = idx + 1; i < order.length; i++) {
      if (!doneRef.current[order[i]]) return order[i] as Stage
    }
    return 'summary'
  }
  const doneRef = useRef(done)
  useEffect(() => { doneRef.current = done }, [done])

  // ═══════════ BOOMBOX SUBMIT (duel/verdict/image) ═══════════
  async function boomboxSubmit(missionType: string, dropId: number, payload: any, extra: any = {}) {
    try {
      const res = await fetch('/api/boombox/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missionType, dropId, payload, ...extra }),
      })
      const json = await res.json()
      if (typeof json.xp === 'number' && json.xp > 0) setSessionXp(x => x + json.xp)
      if (json.streak) setStreak(s => ({ current: json.streak, total_xp: json.totalXp ?? s.total_xp }))
      return json
    } catch { return null }
  }

  // Duel
  const [duelPick, setDuelPick] = useState<'A' | 'B' | null>(completions.duel?.payload?.choice ?? null)
  const [duelStats, setDuelStats] = useState<any>(null)
  const [duelPlaying, setDuelPlaying] = useState<'A' | 'B' | null>(null)
  function voteDuel(pick: 'A' | 'B') {
    if (!duel || duelPick) return
    setDuelPick(pick)
    setDuelPlaying(null)
    boomboxSubmit('duel', duel.id, { choice: pick, source: 'dienos' }).then(j => {
      if (!j) { setDuelPick(null); return } // tinklo klaida — leisti bandyti dar
      if (j.stats) setDuelStats(j.stats)
      markDone('duel')
    })
  }

  // Verdict
  const [verdictPick, setVerdictPick] = useState<string | null>(completions.verdict?.payload?.emoji ?? null)
  const [verdictStats, setVerdictStats] = useState<any>(null)
  function voteVerdict(emoji: string) {
    if (!verdict || verdictPick) return
    setVerdictPick(emoji)
    boomboxSubmit('verdict', verdict.id, { emoji, source: 'dienos' }).then(j => {
      if (!j) { setVerdictPick(null); return }
      if (j.stats) setVerdictStats(j.stats)
      markDone('verdict')
    })
  }

  // Image
  const [imgPick, setImgPick] = useState<number | null>(completions.image?.payload?.guessTrackId ?? null)
  const [imgCorrect, setImgCorrect] = useState<boolean | null>(completions.image?.isCorrect ?? null)
  function guessImage(optionId: number) {
    if (!image || imgPick !== null) return
    setImgPick(optionId)
    setImgCorrect(optionId === image.correct.id)
    boomboxSubmit('image_guess', image.id, { choice: optionId, source: 'dienos' }, { guessTrackId: optionId })
    markDone('image')
  }

  // ── Share ──
  const [shared, setShared] = useState(false)
  async function share() {
    const date = new Date().toLocaleDateString('lt-LT', { timeZone: 'Europe/Vilnius', month: '2-digit', day: '2-digit' })
    const grid = qOutcomes.length ? qOutcomes.map(o => OUTCOME_EMOJI[o]).join('') : ''
    const lines = [
      `⚡ music.lt Dienos iššūkis ${date}`,
      ...(grid ? [grid] : []),
      `${sessionXp > 0 ? `+${sessionXp} tšk.` : ''}${streak.current > 1 ? ` · 🔥 ${streak.current} d. serija` : ''}`.trim(),
      'https://music.lt/zaidimai/dienos',
    ].filter(Boolean)
    try {
      if (navigator.share) await navigator.share({ text: lines.join('\n') })
      else await navigator.clipboard.writeText(lines.join('\n'))
      setShared(true)
      setTimeout(() => setShared(false), 2500)
    } catch { /* ok */ }
  }

  const allDone = steps.every((s: any) => done[s.key as StepKey])
  // Kiek iš viso ĮMANOMA surinkti šiandien šiame iššūkyje (anon skalė)
  const galimaXp = Math.round((5 * 100 + 3 * 15) / 10) * 2 + (duel ? 20 : 0) + (verdict ? 20 : 0) + (image ? 80 : 0)
  const qPct = Math.max(0, qTimeLeft / ROUND_MS)
  const stepIdx = stage === 'intro' ? 0 : steps.findIndex((s: any) => s.key === stage) + 1

  return (
    <ZaidimoLangas
      title="Dienos iššūkis"
      right={<>
        {sessionXp > 0 && <span className="di-xp">⚡ +{sessionXp}</span>}
        {streak.current > 1 && <span className="di-streak">🔥 {streak.current} d.</span>}
      </>}
    >
      <style>{css}</style>

      {/* Step'ų juosta */}
      {stage !== 'intro' && stage !== 'summary' && (
        <div className="di-stepbar">
          {steps.map((s: any, i: number) => (
            <span key={s.key} className={`di-step${done[s.key as StepKey] ? ' done' : ''}${stage === s.key ? ' now' : ''}`}>
              {done[s.key as StepKey] ? '✓' : s.emoji} <em>{i + 1}</em>
            </span>
          ))}
        </div>
      )}

      {/* ═══ INTRO ═══ */}
      {stage === 'intro' && (
        <div className="di-intro">
          <div className="di-badge">⚡ DIENOS IŠŠŪKIS</div>
          <h1 className="di-h1">Vienas iššūkis per dieną.<br />Tas pats visiems.</h1>
          <div className="di-steps-list">
            {steps.map((s: any) => (
              <div key={s.key} className={`di-intro-step${done[s.key as StepKey] ? ' done' : ''}`}>
                <span className="di-intro-emoji">{s.emoji}</span>
                <span className="di-intro-label">{s.label}</span>
                <span className="di-intro-state">{done[s.key as StepKey] ? '✓ atlikta' : ''}</span>
              </div>
            ))}
          </div>
          {props.quizPlayed && props.quizScore !== null && (
            <p className="di-note">Šiandienos kvizo rezultatas: <b>{props.quizScore} tšk.</b></p>
          )}
          <button className="di-cta" onClick={() => {
            const next = nextStageAfter('intro')
            if (next === 'kvizas') void startKvizas()
            else setStage(next)
          }}>
            {allDone ? 'Peržiūrėti suvestinę →' : 'Pradėti →'}
          </button>
          <p className="di-note dim">Kvizas ×2 taškai (1 bandymas/d.) · misijos po 40 tšk. · nariams +50%</p>
        </div>
      )}

      {/* ═══ KVIZAS ═══ */}
      {stage === 'kvizas' && (
        <div className="di-stage">
          {qError && <div className="di-error">{qError} <button onClick={() => void startKvizas()}>Bandyti dar</button></div>}
          {qPhase === 'load' && !qError && <div className="di-center"><div className="di-spinner" /></div>}
          {qPhase === 'submitting' && <div className="di-center"><div className="di-spinner" /><p className="di-note">Skaičiuojam…</p></div>}

          {qPhase === 'ready' && (
            <div className="di-ready">
              <span className="di-ready-emoji">🎧</span>
              <p className="di-note">{qRounds.length} raundai · įsijunk garsą</p>
              <button className="di-cta" onClick={qStartPlaying}>▶ Pradėti kvizą</button>
            </div>
          )}

          {(qPhase === 'round' || qPhase === 'reveal') && qRound && (
            <>
              <div className="di-q-head">
                <span className="di-q-n">{qIdx + 1} / {qRounds.length}</span>
                {qCombo >= COMBO_MIN && <span className="di-combo">🔥 ×{qCombo}</span>}
                <span className="di-q-score">⚡ {qScore}</span>
              </div>
              <div className="di-audio">
                {qRound && !qRound.audioUrl && qPhase === 'round' && !ios && (
                  <iframe
                    className="di-hidden-yt"
                    src={`https://www.youtube-nocookie.com/embed/${qRound.ytId}?autoplay=1&start=${qRound.startSec}&rel=0&playsinline=1&controls=0`}
                    allow="autoplay; encrypted-media"
                    title="Garso atsarga"
                  />
                )}
                {qPhase === 'round' ? (
                  <>
                    <div className="di-eq">{Array.from({ length: 7 }).map((_, i) => <span key={i} style={{ animationDelay: `${i * 0.12}s` }} />)}</div>
                    <div className="di-clock" style={{ ['--p' as any]: qPct }}><span>{Math.ceil(qTimeLeft / 1000)}</span></div>
                    {qRound && !qRound.audioUrl && ios ? (
                      <span className="di-nosound-note">Ištraukos nėra — spėk be garso 😬</span>
                    ) : (
                      <button className="di-nosound" onClick={() => qRound && garsas.play(qRound.audioUrl)}>
                        {garsas.failed ? 'Nepavyko paleisti 😬' : 'Negirdi? ▶'}
                      </button>
                    )}
                  </>
                ) : qRoundResult && (
                  <div className={`di-verdict-tag ${qRoundResult.correct ? 'ok' : 'bad'}`}>
                    {qRoundResult.correct ? `+${qLastPoints} tšk.${qCombo >= COMBO_MIN ? ` 🔥×${qCombo}` : ''}` : qPicked === null ? 'Laikas baigėsi!' : 'Ne ta daina'}
                  </div>
                )}
              </div>
              <div className="di-timebar"><div style={{ width: `${qPct * 100}%` }} /></div>
              <div className="di-options">
                {qRound.options.map(o => {
                  let cls = 'di-opt'
                  if (qPhase === 'reveal' && qRoundResult) {
                    if (o.id === qRoundResult.correctId) cls += ' correct'
                    else if (o.id === qPicked) cls += ' wrong'
                    else cls += ' dim'
                  } else if (qChecking && o.id === qPicked) {
                    cls += ' checking'
                  }
                  return (
                    <button key={o.id} className={cls} disabled={qPhase === 'reveal' || qChecking} onClick={() => qAnswer(o.id)}>
                      <span className="di-opt-artist">{o.artist}</span>
                      <span className="di-opt-title">{o.title}</span>
                    </button>
                  )
                })}
              </div>
              {qRoundError && (
                <div className="di-error">
                  Atsakymo išsiųsti nepavyko.
                  <button onClick={() => { setQRoundError(null); setQChecking(true); void qSendAnswer(qRound, qRoundError.answerId, qRoundError.ms) }}>Bandyti dar</button>
                </div>
              )}
              {qPhase === 'reveal' && (
                <button className="di-next" onClick={qNext}>{qIdx + 1 >= qRounds.length ? 'Toliau →' : 'Kitas raundas →'}</button>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══ DVIKOVA ═══ */}
      {stage === 'duel' && duel && (
        <div className="di-stage">
          <h2 className="di-h2">⚔️ Dienos dvikova</h2>
          <p className="di-note">Kuri daina stipresnė? Balsas = 20 tšk.</p>
          <div className="di-duel">
            {(['A', 'B'] as const).map(tag => {
              const side: any = tag === 'A' ? duel.track_a : duel.track_b
              const ytId = ytIdFrom(side.video_url)
              const pct = duelStats ? (tag === 'A' ? duelStats.choiceDistribution?.A || 0 : duelStats.choiceDistribution?.B || 0) : null
              const total = duelStats ? (duelStats.choiceDistribution?.A || 0) + (duelStats.choiceDistribution?.B || 0) : 0
              const pctVal = pct !== null && total > 0 ? Math.round((pct / total) * 100) : null
              return (
                <div key={tag} className={`di-duel-side${duelPick === tag ? ' picked' : ''}${duelPick && duelPick !== tag ? ' faded' : ''}`}>
                  <div className="di-duel-media">
                    {duelPlaying === tag && ytId ? (
                      <iframe src={`https://www.youtube-nocookie.com/embed/${ytId}?${ios ? '' : 'autoplay=1&'}rel=0&playsinline=1`} allow="autoplay; encrypted-media" title={side.title} />
                    ) : (
                      <>
                        {side.cover_url
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={side.cover_url} alt="" loading="lazy" />
                          : ytId
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt="" loading="lazy" />
                          : <span className="di-duel-ph">🎵</span>}
                        {ytId && !duelPick && <button className="di-play" onClick={() => setDuelPlaying(tag)}>▶</button>}
                      </>
                    )}
                    {pctVal !== null && <span className="di-pct">{pctVal}%</span>}
                  </div>
                  <span className="di-duel-title">{side.title}</span>
                  <span className="di-duel-artist">{side.artist}</span>
                  {!duelPick && <button className="di-vote" onClick={() => voteDuel(tag)}>Balsuoju</button>}
                </div>
              )
            })}
          </div>
          {duelPick && <button className="di-next" onClick={() => setStage(nextAfterDone('duel'))}>Toliau →</button>}
        </div>
      )}

      {/* ═══ VERDIKTAS ═══ */}
      {stage === 'verdict' && verdict && (
        <div className="di-stage">
          <h2 className="di-h2">🔥 Dienos verdiktas</h2>
          <p className="di-note">Paklausyk ir palik savo verdiktą — 20 tšk.</p>
          <div className="di-verdict-card">
            <div className="di-player small">
              {ytIdFrom(verdict.track.video_url) ? (
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${ytIdFrom(verdict.track.video_url)}?rel=0&playsinline=1`}
                  allow="autoplay; encrypted-media"
                  title={verdict.track.title}
                />
              ) : verdict.track.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={verdict.track.cover_url} alt="" />
              ) : null}
            </div>
            <div className="di-verdict-meta">
              <b>{verdict.track.title}</b>
              <span>{verdict.track.artist}{verdict.track.release_year ? ` · ${verdict.track.release_year}` : ''}</span>
            </div>
            <div className="di-reactions">
              {REACTIONS.map(r => {
                const count = verdictStats?.emojiDistribution?.[r.emoji] || 0
                return (
                  <button
                    key={r.emoji}
                    className={`di-reaction${verdictPick === r.emoji ? ' on' : ''}${verdictPick && verdictPick !== r.emoji ? ' off' : ''}`}
                    disabled={!!verdictPick}
                    onClick={() => voteVerdict(r.emoji)}
                  >
                    <span className="di-reaction-emoji">{r.emoji}</span>
                    <span className="di-reaction-label">{r.label}</span>
                    {verdictPick && <span className="di-reaction-count">{count}</span>}
                  </button>
                )
              })}
            </div>
          </div>
          {verdictPick && <button className="di-next" onClick={() => setStage(nextAfterDone('verdict'))}>Toliau →</button>}
        </div>
      )}

      {/* ═══ AI VAIZDAS ═══ */}
      {stage === 'image' && image && (
        <div className="di-stage">
          <h2 className="di-h2">🖼️ Atspėk dainą iš vaizdo</h2>
          <p className="di-note">AI nupiešė dainą — atspėk kurią. Teisingai = 80 tšk.</p>
          <div className="di-image-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.image_url} alt="AI vaizdas pagal dainą" />
            {imgPick !== null && (
              <div className={`di-verdict-tag ${imgCorrect ? 'ok' : 'bad'}`}>
                {imgCorrect ? 'Teisingai! +80 tšk.' : `Ne — tai ${image.correct.artist} „${image.correct.title}"`}
              </div>
            )}
          </div>
          <div className="di-options">
            {image.options.map(o => {
              let cls = 'di-opt'
              if (imgPick !== null) {
                if (o.id === image.correct.id) cls += ' correct'
                else if (o.id === imgPick) cls += ' wrong'
                else cls += ' dim'
              }
              return (
                <button key={o.id} className={cls} disabled={imgPick !== null} onClick={() => guessImage(o.id)}>
                  <span className="di-opt-artist">{o.artist}</span>
                  <span className="di-opt-title">{o.title}</span>
                </button>
              )
            })}
          </div>
          {imgPick !== null && <button className="di-next" onClick={() => setStage('summary')}>Suvestinė →</button>}
        </div>
      )}

      {/* ═══ SUVESTINĖ ═══ */}
      {stage === 'summary' && (
        <div className="di-summary">
          <div className="di-badge">⚡ DIENOS IŠŠŪKIS ĮVEIKTAS</div>
          {qOutcomes.length > 0 && <div className="di-grid-line">{qOutcomes.map((o, i) => <span key={i}>{OUTCOME_EMOJI[o]}</span>)}</div>}
          {qResult && (
            <p className="di-sum-line">Kvizas: <b>{qResult.score} tšk.</b> ({qResult.correctCount}/{qResult.roundCount})
              {qResult.dailyRank && qResult.dailyRank.total > 1 && <> · geriau nei <b>{Math.round(((qResult.dailyRank.total - 1 - qResult.dailyRank.better) / (qResult.dailyRank.total - 1)) * 100)}%</b></>}
            </p>
          )}
          {sessionXp > 0
            ? <p className="di-sum-xp">Surinkta <b>{sessionXp}</b> iš ~{galimaXp} galimų tšk.{streak.total_xp > 0 ? ` · iš viso ${streak.total_xp.toLocaleString('lt-LT')}` : ''}</p>
            : <p className="di-sum-xp dim">Visos dienos misijos jau buvo atliktos anksčiau ✓</p>}
          {streak.current > 0 && <p className="di-sum-line">🔥 Serija: <b>{streak.current} d.</b> — grįžk rytoj, kad nenutrūktų!</p>}
          <div className="di-sum-actions">
            <button className="di-share" onClick={share}>{shared ? 'Nukopijuota ✓' : 'Dalintis 📤'}</button>
            <Link href="/zaidimai" className="di-more">Daugiau žaidimų →</Link>
          </div>
          <Link href="/zaidimai/atspek-is-vaizdo" className="di-next-game">
            <span>🖼️</span>
            <span><b>Dar šiandien: Atspėk iš vaizdo</b><br/>Nuotrauka ryškėja — atpažink atlikėją</span>
            <span className="di-next-game-go">→</span>
          </Link>
        </div>
      )}
    </ZaidimoLangas>
  )
}

const css = `
.di-xp { font-size: 15px; font-weight: 900; color: #f59e0b; }
.di-streak { font-size: 13px; font-weight: 800; color: var(--text-secondary); }
.di-ready { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; padding: 10vh 0; }
.di-ready-emoji { font-size: 44px; }
.di-yt { position: absolute; inset: 0; }
.di-yt iframe { width: 100%; height: 100%; }

.di-stepbar { display: flex; gap: 8px; justify-content: center; margin-bottom: 16px; }
.di-step {
  display: flex; align-items: center; gap: 5px; font-size: 14px; font-weight: 800;
  color: var(--text-muted); background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.2);
  border-radius: 999px; padding: 6px 12px;
}
.di-step em { font-style: normal; font-size: 10px; opacity: 0.7; }
.di-step.now { border-color: #ec4899; color: var(--text-primary); }
.di-step.done { color: #10b981; border-color: rgba(16,185,129,0.4); }

.di-badge { font-size: 12px; font-weight: 900; letter-spacing: 0.1em; color: #ec4899; margin-bottom: 10px; }
.di-h1 { font-size: 30px; font-weight: 900; letter-spacing: -0.02em; color: var(--text-primary); line-height: 1.15; margin: 0 0 18px; }
.di-h2 { font-size: 20px; font-weight: 900; color: var(--text-primary); margin: 0 0 4px; }
.di-note { font-size: 14px; color: var(--text-secondary); margin: 0 0 14px; }
.di-note.dim { font-size: 12px; color: var(--text-muted); margin-top: 14px; }
.di-note b { color: var(--text-primary); }

.di-intro { display: flex; flex-direction: column; align-items: flex-start; padding-top: 10px; }
.di-steps-list { display: flex; flex-direction: column; gap: 8px; width: 100%; margin-bottom: 18px; }
.di-intro-step {
  display: flex; align-items: center; gap: 12px; padding: 13px 16px; border-radius: 13px;
  background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.2); width: 100%;
}
.di-intro-step.done { opacity: 0.65; }
.di-intro-emoji { font-size: 20px; }
.di-intro-label { font-size: 16px; font-weight: 800; color: var(--text-primary); }
.di-intro-state { margin-left: auto; font-size: 12px; font-weight: 800; color: #10b981; }
.di-cta {
  font-size: 16px; font-weight: 900; color: #fff; cursor: pointer; border: 0; border-radius: 999px; padding: 14px 34px;
  background: linear-gradient(135deg, #ec4899, #8b5cf6); box-shadow: 0 12px 30px rgba(236,72,153,0.35);
}

.di-center { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 0; }
.di-spinner { width: 38px; height: 38px; border-radius: 50%; border: 3px solid rgba(148,163,184,0.25); border-top-color: #ec4899; animation: dispin .8s linear infinite; }
@keyframes dispin { to { transform: rotate(360deg); } }
.di-error { font-size: 14px; color: #f87171; background: rgba(248,113,113,0.1); border-radius: 10px; padding: 10px 14px; margin-bottom: 12px; display: flex; gap: 10px; align-items: center; }
.di-error button { font-size: 12px; font-weight: 800; color: #f87171; background: transparent; border: 1px solid rgba(248,113,113,0.5); border-radius: 8px; padding: 4px 10px; cursor: pointer; }

.di-stage { display: flex; flex-direction: column; gap: 12px; }
.di-q-head { display: flex; align-items: center; gap: 12px; }
.di-q-n { font-size: 14px; font-weight: 800; color: var(--text-secondary); }
.di-combo { font-size: 12px; font-weight: 900; color: #f97316; animation: dipulse .6s ease infinite alternate; }
@keyframes dipulse { from { transform: scale(1); } to { transform: scale(1.12); } }
.di-q-score { margin-left: auto; font-size: 16px; font-weight: 900; color: #f59e0b; }

.di-player { position: relative; border-radius: 14px; overflow: hidden; aspect-ratio: 16/9; max-height: 30vh; margin: 0 auto; width: 100%; background: #0c0f15; }
.di-player.small { aspect-ratio: 16/9; }
.di-player iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.di-player img { width: 100%; height: 100%; object-fit: cover; display: block; }
.di-audio {
  position: relative; display: flex; align-items: center; justify-content: center; gap: 16px;
  border-radius: 15px; min-height: 100px; padding: 12px;
  background: radial-gradient(ellipse at 30% 20%, rgba(236,72,153,0.3), transparent 60%), radial-gradient(ellipse at 75% 80%, rgba(99,102,241,0.3), transparent 55%), #10131b;
}
.di-hidden-yt { position: absolute; width: 2px; height: 2px; opacity: 0.01; pointer-events: none; }
.di-nosound-note { font-size: 12px; color: rgba(255,255,255,0.8); max-width: 40%; }
.di-eq { display: flex; align-items: flex-end; gap: 5px; height: 44px; }
.di-eq span { width: 7px; border-radius: 3px; background: linear-gradient(180deg, #ec4899, #6366f1); animation: dieq 0.9s ease-in-out infinite alternate; }
@keyframes dieq { from { height: 8px; } to { height: 44px; } }
.di-clock { width: 62px; height: 62px; border-radius: 50%; background: conic-gradient(#ec4899 calc(var(--p) * 360deg), rgba(148,163,184,0.18) 0); display: flex; align-items: center; justify-content: center; }
.di-clock span { width: 50px; height: 50px; border-radius: 50%; background: #10131b; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 900; }
.di-nosound { font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.75); background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.18); border-radius: 999px; padding: 6px 14px; cursor: pointer; }
.di-verdict-tag { font-size: 17px; font-weight: 900; padding: 11px 20px; border-radius: 12px; color: #fff; }
.di-image-wrap .di-verdict-tag { position: absolute; top: 10px; left: 10px; font-size: 14px; padding: 8px 14px; }
.di-verdict-tag.ok { background: rgba(16,185,129,0.92); }
.di-verdict-tag.bad { background: rgba(239,68,68,0.9); }

.di-timebar { height: 6px; border-radius: 3px; background: rgba(148,163,184,0.18); overflow: hidden; }
.di-timebar div { height: 100%; background: linear-gradient(90deg, #ec4899, #6366f1); transition: width .1s linear; }

.di-options { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
@media (max-width: 520px) { .di-options { grid-template-columns: 1fr; } }
.di-opt {
  display: flex; flex-direction: column; gap: 2px; align-items: flex-start; text-align: left;
  padding: 12px 14px; border-radius: 13px; cursor: pointer;
  background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.22);
}
.di-opt:hover:not(:disabled) { border-color: #ec4899; }
.di-opt-artist { font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.di-opt-title { font-size: 16px; font-weight: 800; color: var(--text-primary); }
.di-opt.correct { background: rgba(16,185,129,0.16); border-color: #10b981; }
.di-opt.wrong { background: rgba(239,68,68,0.13); border-color: #ef4444; }
.di-opt.dim { opacity: 0.45; }
.di-opt.checking { border-color: #ec4899; animation: dicheck .5s ease infinite alternate; }
@keyframes dicheck { from { opacity: 0.75; } to { opacity: 1; } }

.di-next { align-self: center; font-size: 16px; font-weight: 800; color: #fff; cursor: pointer; background: linear-gradient(135deg, #ec4899, #8b5cf6); border: 0; border-radius: 999px; padding: 12px 28px; box-shadow: 0 10px 26px rgba(236,72,153,0.35); margin-top: 4px; }

.di-duel { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.di-duel-side { display: flex; flex-direction: column; gap: 6px; padding: 12px; border-radius: 15px; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.2); }
.di-duel-side.picked { border-color: #ec4899; box-shadow: 0 0 0 2px rgba(236,72,153,0.3); }
.di-duel-side.faded { opacity: 0.6; }
.di-duel-media { position: relative; border-radius: 11px; overflow: hidden; aspect-ratio: 1/1; max-height: 24vh; background: #0c0f15; }
@media (min-width: 560px) { .di-duel-media { aspect-ratio: 16/10; } }
.di-duel-media img { width: 100%; height: 100%; object-fit: cover; display: block; }
.di-duel-media iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.di-duel-ph { display: flex; align-items: center; justify-content: center; height: 100%; font-size: 30px; }
.di-play { position: absolute; inset: 0; margin: auto; width: 50px; height: 50px; border-radius: 50%; background: rgba(12,15,21,0.72); color: #fff; font-size: 16px; border: 1px solid rgba(255,255,255,0.35); cursor: pointer; }
.di-pct { position: absolute; right: 8px; bottom: 8px; font-size: 18px; font-weight: 900; color: #fff; background: rgba(12,15,21,0.8); border-radius: 9px; padding: 3px 10px; }
.di-duel-title { font-size: 14px; font-weight: 800; color: var(--text-primary); line-height: 1.2; }
.di-duel-artist { font-size: 12px; color: var(--text-secondary); }
.di-vote { font-size: 14px; font-weight: 800; color: #fff; cursor: pointer; border: 0; border-radius: 11px; padding: 10px 0; background: linear-gradient(135deg, #ec4899, #8b5cf6); }

.di-verdict-card { display: flex; flex-direction: column; gap: 12px; }
.di-verdict-meta { display: flex; flex-direction: column; gap: 2px; }
.di-verdict-meta b { font-size: 20px; font-weight: 900; color: var(--text-primary); }
.di-verdict-meta span { font-size: 14px; color: var(--text-secondary); }
.di-reactions { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
@media (max-width: 480px) { .di-reactions { grid-template-columns: repeat(2, 1fr); } }
.di-reaction { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 12px 6px; border-radius: 13px; cursor: pointer; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.22); }
.di-reaction:hover:not(:disabled) { border-color: #ec4899; }
.di-reaction.on { border-color: #ec4899; box-shadow: 0 0 0 2px rgba(236,72,153,0.3); }
.di-reaction.off { opacity: 0.5; }
.di-reaction-emoji { font-size: 24px; }
.di-reaction-label { font-size: 12px; font-weight: 700; color: var(--text-secondary); }
.di-reaction-count { font-size: 12px; font-weight: 900; color: var(--text-primary); }

.di-image-wrap { position: relative; border-radius: 16px; overflow: hidden; }
.di-image-wrap img { width: 100%; display: block; }

.di-summary { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 30px 0; }
.di-grid-line { font-size: 22px; letter-spacing: 2px; margin: 10px 0; }
.di-sum-line { font-size: 14px; color: var(--text-secondary); margin: 4px 0; }
.di-sum-line b { color: var(--text-primary); }
.di-sum-xp { font-size: 20px; font-weight: 900; color: #f59e0b; margin: 10px 0 4px; }
.di-sum-xp.dim { color: var(--text-muted); font-weight: 600; font-size: 14px; }
.di-sum-actions { display: flex; gap: 12px; align-items: center; margin-top: 18px; flex-wrap: wrap; justify-content: center; }
.di-next-game {
  display: flex; align-items: center; gap: 12px; text-decoration: none; margin-top: 18px; width: 100%; max-width: 420px;
  background: var(--bg-surface); border: 1px solid rgba(139,92,246,0.4); border-radius: 14px; padding: 13px 16px;
  color: var(--text-secondary); font-size: 12px; text-align: left;
}
.di-next-game b { color: var(--text-primary); font-size: 14px; }
.di-next-game span:first-child { font-size: 24px; }
.di-next-game-go { margin-left: auto; font-size: 16px; font-weight: 900; color: #8b5cf6; }
.di-share { font-size: 16px; font-weight: 800; color: #fff; cursor: pointer; border: 0; border-radius: 999px; padding: 12px 26px; background: linear-gradient(135deg, #ec4899, #8b5cf6); box-shadow: 0 10px 26px rgba(236,72,153,0.35); }
.di-more { font-size: 14px; font-weight: 800; color: var(--text-secondary); text-decoration: none; }
`
