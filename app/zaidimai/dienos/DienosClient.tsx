'use client'

// app/zaidimai/dienos/DienosClient.tsx
//
// Dienos iššūkio wizard'as: kvizas (5) → dvikova → verdiktas → AI vaizdas
// (jei yra) → suvestinė. Visi step'ai viename flow, bendras taškų krepšys.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
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
  activeExtras: string[]
  extrasDone: Record<string, boolean>
  extrasScore: Record<string, number>
  streak: { current: number; total_xp: number }
}

type Stage = 'intro' | 'kvizas' | 'metai' | 'vaizdas' | 'sekundes' | 'duel' | 'verdict' | 'image' | 'summary'
type StepKey = 'kvizas' | 'metai' | 'vaizdas' | 'sekundes' | 'duel' | 'verdict' | 'image'

const EXTRA_META: Record<string, { label: string; emoji: string }> = {
  metai: { label: 'Kurie metai?', emoji: '📅' },
  vaizdas: { label: 'Atspėk iš vaizdo', emoji: '💿' },
  sekundes: { label: 'Atspėk iš sekundės', emoji: '⏱️' },
}

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

// Dienos verdiktas — binarinė prognozė: ar ši daina taps hitu?
const REACTIONS: Array<{ emoji: string; label: string }> = [
  { emoji: '🔥', label: 'Taps hitu' },
  { emoji: '💤', label: 'Nebus hitas' },
]

function ytIdFrom(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

export default function DienosClient(props: Props) {
  const { duel, verdict, image, completions } = props

  // ── Step'ų sąrašas ──
  const extraSteps = props.activeExtras.map(g => ({
    key: g as StepKey, label: EXTRA_META[g].label, emoji: EXTRA_META[g].emoji, present: true, initiallyDone: !!props.extrasDone[g],
  }))
  const steps: Array<{ key: StepKey; label: string; emoji: string; present: boolean; initiallyDone: boolean }> = [
    { key: 'kvizas', label: 'Atspėk 5 dainas', emoji: '🎧', present: true, initiallyDone: props.quizPlayed },
    ...extraSteps,
    { key: 'duel', label: 'Dienos dvikova', emoji: '⚔️', present: !!duel, initiallyDone: !!completions.duel },
    { key: 'verdict', label: 'Hitas ar ne', emoji: '🔮', present: !!verdict, initiallyDone: !!completions.verdict },
    { key: 'image', label: 'AI vaizdas', emoji: '🖼️', present: !!image, initiallyDone: !!completions.image },
  ].filter(s => s.present) as any

  const [done, setDone] = useState<Record<StepKey, boolean>>({
    kvizas: props.quizPlayed,
    metai: !!props.extrasDone.metai,
    vaizdas: !!props.extrasDone.vaizdas,
    sekundes: !!props.extrasDone.sekundes,
    duel: !!completions.duel,
    verdict: !!completions.verdict,
    image: !!completions.image,
  })
  const [stage, setStage] = useState<Stage>('intro')
  const [sessionXp, setSessionXp] = useState(0)
  const [streak, setStreak] = useState(props.streak)

  // Be tarpinio intro ekrano — iškart į pirmą neatliktą užduotį.
  // (Kvizo garso atrakinimo gestas — ▶ mygtukas pačiame pirmame raunde.)
  useEffect(() => {
    const next = nextStageAfter('intro')
    if (next === 'kvizas') void startKvizas()
    else setStage(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
  const [duelWin, setDuelWin] = useState<boolean | null>(null)
  const [duelPlaying, setDuelPlaying] = useState<'A' | 'B' | null>(null)
  function voteDuel(pick: 'A' | 'B') {
    if (!duel || duelPick) return
    setDuelPick(pick)
    setDuelPlaying(null)
    boomboxSubmit('duel', duel.id, { choice: pick, source: 'dienos' }).then(j => {
      if (!j) { setDuelPick(null); return } // tinklo klaida — leisti bandyti dar
      if (j.stats) setDuelStats(j.stats)
      setDuelWin(!!j.crowdWin)
      markDone('duel')
    })
  }

  // Verdict
  const [verdictPick, setVerdictPick] = useState<string | null>(completions.verdict?.payload?.emoji ?? null)
  const [verdictStats, setVerdictStats] = useState<any>(null)
  const [verdictWin, setVerdictWin] = useState<boolean | null>(null)
  function voteVerdict(emoji: string) {
    if (!verdict || verdictPick) return
    setVerdictPick(emoji)
    boomboxSubmit('verdict', verdict.id, { emoji, source: 'dienos' }).then(j => {
      if (!j) { setVerdictPick(null); return }
      if (j.stats) setVerdictStats(j.stats)
      setVerdictWin(!!j.crowdWin)
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

  // ── Rotuojami papildomi žaidimai (metai / vaizdas / sekundes) ──
  const [extrasResult, setExtrasResult] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {}
    for (const g of props.activeExtras) if (props.extrasDone[g]) init[g] = { alreadyDone: true }
    return init
  })
  function onExtraDone(key: string, result: any) {
    if (result?.xp) setSessionXp(x => x + result.xp)
    if (result?.streak) setStreak(s => ({ current: result.streak, total_xp: result.totalXp ?? s.total_xp }))
    setExtrasResult(r => ({ ...r, [key]: result }))
    markDone(key as StepKey)
    setStage(nextAfterDone(key as StepKey))
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
              {done[s.key as StepKey] ? '✓' : i + 1}
            </span>
          ))}
        </div>
      )}

      {/* ═══ KRAUNASI (intro nebėra — šokam tiesiai į užduotį) ═══ */}
      {stage === 'intro' && <div className="di-center"><div className="di-spinner" /></div>}

      {/* ═══ KVIZAS ═══ */}
      {stage === 'kvizas' && (
        <div className="di-stage">
          {qError && <div className="di-error">{qError} <button onClick={() => void startKvizas()}>Bandyti dar</button></div>}
          {qPhase === 'load' && !qError && <div className="di-center"><div className="di-spinner" /></div>}
          {qPhase === 'submitting' && <div className="di-center"><div className="di-spinner" /><p className="di-note">Skaičiuojam…</p></div>}

          {/* Orientacija: aiškiai kas laukia, prieš pradedant (vienas ▶) */}
          {qPhase === 'ready' && qRound && (
            <div className="di-orient">
              <span className="di-orient-step">Dienos iššūkis</span>
              <h2 className="di-orient-title">{steps.length} užduotys — tas pats visiems</h2>
              <p className="di-orient-sub">Rink taškus ir augink seriją. Kuo greičiau atsakai, tuo daugiau taškų.</p>
              <ol className="di-orient-list">
                {steps.map((s: any, i: number) => (
                  <li key={s.key} className={`${done[s.key as StepKey] ? 'done' : ''}${i === 0 ? ' first' : ''}`}>
                    <span className="di-orient-li-emoji">{s.emoji}</span>
                    <span className="di-orient-li-label">{s.label}</span>
                    {done[s.key as StepKey] && <span className="di-orient-li-check">✓</span>}
                  </li>
                ))}
              </ol>
              <button className="di-play-big" onClick={qStartPlaying} aria-label="Pradėti">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                <span>Pradėti</span>
              </button>
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
                    <button key={o.id} className={cls} disabled={qPhase !== 'round' || qChecking} onClick={() => qAnswer(o.id)}>
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

      {/* ═══ Rotuojami žaidimai: Kurie metai? / Atspėk iš vaizdo / Iš sekundės ═══ */}
      {(stage === 'metai' || stage === 'vaizdas') && (
        <AlbumGameStep
          key={stage}
          game={stage}
          stepNo={steps.findIndex((s: any) => s.key === stage) + 1}
          stepTotal={steps.length}
          onDone={r => onExtraDone(stage, r)}
        />
      )}
      {stage === 'sekundes' && (
        <SekundesGameStep
          stepNo={steps.findIndex((s: any) => s.key === 'sekundes') + 1}
          stepTotal={steps.length}
          onDone={r => onExtraDone('sekundes', r)}
        />
      )}

      {/* ═══ DVIKOVA ═══ */}
      {stage === 'duel' && duel && (
        <div className="di-stage">
          <span className="di-stage-no">{steps.findIndex((s: any) => s.key === 'duel') + 1} iš {steps.length} · Dvikova</span>
          <h2 className="di-h2">⚔️ Kurią rinksis dauguma?</h2>
          {duel.blurb && <div className="di-duel-blurb">{duel.blurb}</div>}
          <p className="di-note">Paspausk ▶ paklausyti. Atspėsi bendruomenės favoritą — <b>dvigubi taškai</b>.</p>
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
          {duelPick && (
            <div className="di-crowd neutral">
              ✅ Balsas užskaitytas. Kas surinks daugumą — paaiškės dienos gale.
            </div>
          )}
          {duelPick && <button className="di-next" onClick={() => setStage(nextAfterDone('duel'))}>Toliau →</button>}
        </div>
      )}

      {/* ═══ VERDIKTAS ═══ */}
      {stage === 'verdict' && verdict && (
        <div className="di-stage">
          <span className="di-stage-no">{steps.findIndex((s: any) => s.key === 'verdict') + 1} iš {steps.length} · Verdiktas</span>
          <h2 className="di-h2">🔮 Ar ši daina taps hitu?</h2>
          <p className="di-note">Paklausyk ir nuspėk. Sutapsi su dauguma — <b>dvigubi taškai</b>.</p>
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
          {verdictPick && (
            <div className="di-crowd neutral">
              ✅ Balsas užskaitytas. Ar sutapsi su dauguma — paaiškės dienos gale.
            </div>
          )}
          {verdictPick && <button className="di-next" onClick={() => setStage(nextAfterDone('verdict'))}>Toliau →</button>}
        </div>
      )}

      {/* ═══ AI VAIZDAS ═══ */}
      {stage === 'image' && image && (
        <div className="di-stage">
          <span className="di-stage-no">{steps.findIndex((s: any) => s.key === 'image') + 1} iš {steps.length} · Vaizdas</span>
          <h2 className="di-h2">🖼️ Atspėk dainą iš vaizdo</h2>
          <p className="di-note">Dirbtinis intelektas nupiešė dainą — atspėk kurią. Teisingas atsakymas — 80 taškų.</p>
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

      {/* ═══ SUVESTINĖ — visų žingsnių rezultatai + palyginimas ═══ */}
      {stage === 'summary' && (() => {
        const better = qResult?.dailyRank && qResult.dailyRank.total > 1
          ? Math.round(((qResult.dailyRank.total - 1 - qResult.dailyRank.better) / (qResult.dailyRank.total - 1)) * 100)
          : null
        const rows: Array<{ icon: string; label: string; value: string; ok?: boolean }> = []
        // Kvizas — gyvai (qResult) arba iš išsaugoto rezultato (grįžus vėliau)
        if (qResult) rows.push({ icon: '🎧', label: 'Atspėk 5 dainas', value: `${qResult.correctCount}/${qResult.roundCount} · ${qResult.score} tšk.` })
        else if (props.quizPlayed) rows.push({ icon: '🎧', label: 'Atspėk 5 dainas', value: `${props.quizScore ?? 0} tšk.` })
        for (const g of props.activeExtras) {
          const er = extrasResult[g]
          if (!(er || props.extrasDone[g])) continue
          const liveScore = er && !er.alreadyDone && typeof er.score === 'number' ? er.score : null
          const storedScore = props.extrasScore?.[g]
          const value = liveScore != null ? `${er.correctCount}/${er.roundCount} · ${er.score} tšk.`
            : storedScore != null ? `${storedScore} tšk.` : 'Atlikta ✓'
          rows.push({ icon: EXTRA_META[g].emoji, label: EXTRA_META[g].label, value })
        }
        if (duel && done.duel) rows.push({ icon: '⚔️', label: 'Dvikova', value: 'Balsuota ✓', ok: true })
        if (verdict && done.verdict) rows.push({ icon: '🔮', label: 'Hitas ar ne', value: 'Balsuota ✓', ok: true })
        if (image && done.image) rows.push({ icon: '🖼️', label: 'Atspėk iš vaizdo', value: imgCorrect ? 'Teisingai ✓' : 'Neatspėta', ok: !!imgCorrect })

        // Bendras rezultatas — skalė 0–100, proporcingai iš VISŲ užduočių:
        // kiekviena užduotis duoda vienodą dalį (100 / užduočių skaičius), o
        // jos viduje surenki tiek, kiek atspėjai. Balsavimai (dvikova/verdiktas)
        // — dalyvavimo dalis (rezultatas finalizuojasi dienos gale).
        const KVIZ_MAX = 575, EXTRA_MAX = 300
        const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
        const quizPts = qResult?.score ?? (props.quizPlayed ? (props.quizScore ?? 0) : 0)
        const stepFracs: number[] = [clamp01(quizPts / KVIZ_MAX)]
        for (const g of props.activeExtras) {
          const er = extrasResult[g]
          const live = er && !er.alreadyDone && typeof er.score === 'number' ? er.score : null
          const pts = live ?? props.extrasScore?.[g] ?? 0
          stepFracs.push(clamp01(pts / EXTRA_MAX))
        }
        if (duel) stepFracs.push(done.duel ? 1 : 0)
        if (verdict) stepFracs.push(done.verdict ? 1 : 0)
        if (image) stepFracs.push(done.image && imgCorrect ? 1 : 0)
        const stepShare = 100 / Math.max(1, stepFracs.length)
        const dailyTotal = Math.round(stepFracs.reduce((s, f) => s + f * stepShare, 0))

        return (
          <div className="di-summary">
            <div className="di-badge">DIENOS IŠŠŪKIS ĮVEIKTAS</div>

            <div className="di-sum-score">
              <span className="di-sum-score-num">{dailyTotal}</span>
              <span className="di-sum-score-max">iš 100 galimų</span>
            </div>

            {better !== null && (
              <div className="di-sum-rank">
                Šiandien lenki <b>{better}%</b> dalyvių{qResult?.dailyRank ? ` · #${(qResult.dailyRank.better || 0) + 1} iš ${qResult.dailyRank.total}` : ''}
              </div>
            )}

            <div className="di-sum-rows">
              {rows.map((r, i) => (
                <div key={i} className="di-sum-row">
                  <span className="di-sum-row-ic">{r.icon}</span>
                  <span className="di-sum-row-lbl">{r.label}</span>
                  <span className={`di-sum-row-val${r.ok ? ' ok' : ''}`}>{r.value}</span>
                </div>
              ))}
            </div>

            {streak.current > 0 && <p className="di-sum-streak">🔥 Serija: <b>{streak.current} d.</b> — grįžk rytoj, kad nenutrūktų!</p>}

            <div className="di-sum-actions">
              <button className="di-share" onClick={share}>{shared ? 'Nukopijuota ✓' : 'Dalintis rezultatu 📤'}</button>
            </div>
          </div>
        )
      })()}
    </ZaidimoLangas>
  )
}

// ═══════════ Albumų žaidimo žingsnis (Kurie metai? / Atspėk iš vaizdo) ═══════════
// Kompaktiškas 3 raundų žaidimas dienos iššūkyje. Turinys — dienos „snapshot"
// (tas pats visiems). Taškai skaičiuojami server-side (užšifruoti vokai).

type AlbumRound = { r: number; image: string; label?: string; kind?: string; reveal?: 'puzzle' | 'blur'; options: { id: number; name: string }[]; token: string }

// Puzzle atvertimas — plytelės po vieną atsidengia (ne blur)
const PZ_COLS = 6
const PZ_N = PZ_COLS * PZ_COLS
function makePzRanks(): number[] {
  const a = Array.from({ length: PZ_N }, (_, i) => i)
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]] }
  return a
}

function AlbumGameStep({ game, stepNo, stepTotal, onDone }: {
  game: 'metai' | 'vaizdas'
  stepNo: number
  stepTotal: number
  onDone: (result: any) => void
}) {
  const ROUND_MS = game === 'vaizdas' ? 16000 : 12000   // vaizdas — lėčiau
  const REVEAL_MS = 2200
  const pzRanksRef = useRef<number[]>(makePzRanks())
  const [phase, setPhase] = useState<'load' | 'round' | 'reveal' | 'submit' | 'error'>('load')
  const [rounds, setRounds] = useState<AlbumRound[]>([])
  const [quizId, setQuizId] = useState('')
  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [rr, setRr] = useState<{ correct: boolean; correctId: number; points: number } | null>(null)
  const [score, setScore] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const startRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const revealRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [timeLeft, setTimeLeft] = useState(ROUND_MS)
  const phaseRef = useRef(phase); phaseRef.current = phase
  const answerRef = useRef<(id: number | null) => void>(() => {})
  const round = rounds[idx] || null

  useEffect(() => { void load(); return () => { if (timerRef.current) clearInterval(timerRef.current); if (revealRef.current) clearTimeout(revealRef.current) } }, [])

  async function load() {
    setPhase('load'); setErr(null)
    try {
      const res = await fetch(`/api/zaidimai/${game}?dienos=1`)
      const j = await res.json()
      if (!res.ok || !j.rounds?.length) { setErr(j.error || 'Nepavyko įkelti'); setPhase('error'); return }
      setRounds(j.rounds); setQuizId(j.quizId); setIdx(0); setScore(0)
      startRound(); setPhase('round')
    } catch { setErr('Tinklo klaida'); setPhase('error') }
  }

  function startRound() {
    startRef.current = Date.now(); setTimeLeft(ROUND_MS); setPicked(null); setRr(null); setRevealed(false)
    pzRanksRef.current = makePzRanks()
    requestAnimationFrame(() => requestAnimationFrame(() => setRevealed(true)))
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      const left = ROUND_MS - (Date.now() - startRef.current)
      if (left <= 0) { setTimeLeft(0); answerRef.current(null) } else setTimeLeft(left)
    }, 100)
  }

  async function answer(id: number | null) {
    if (phaseRef.current !== 'round' || !round) return
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    const ms = Math.min(Date.now() - startRef.current, ROUND_MS)
    setPicked(id); setPhase('reveal')
    try {
      const res = await fetch('/api/zaidimai/raundas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: round.token, answerId: id, ms }),
      })
      const j = await res.json()
      if (res.ok) { setRr({ correct: j.correct, correctId: j.correctId, points: j.points }); setScore(s => s + (j.points || 0)) }
    } catch { /* rodom vis tiek */ }
    revealRef.current = setTimeout(next, REVEAL_MS)
  }
  answerRef.current = answer

  function next() {
    if (revealRef.current) { clearTimeout(revealRef.current); revealRef.current = null }
    if (idx + 1 >= rounds.length) { void submit(); return }
    setIdx(i => i + 1); setPhase('round'); startRound()
  }

  async function submit() {
    setPhase('submit')
    try {
      const res = await fetch(`/api/zaidimai/${game}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizId }),
      })
      const j = await res.json()
      onDone(res.ok || res.status === 409 ? j : { score, correctCount: 0, roundCount: rounds.length })
    } catch { onDone({ score, correctCount: 0, roundCount: rounds.length }) }
  }

  const pct = Math.max(0, timeLeft / ROUND_MS)
  // puzzle progresas: 0 = viskas uždengta, 1 = pilnai atverta (arba atsakius)
  const pzProgress = phase === 'reveal' ? 1 : Math.min(1, (1 - pct) * 1.12)
  const title = game === 'metai' ? '📅 Kuriais metais išleistas?' : '💿 Kas tai?'

  if (phase === 'load') return <div className="di-center"><div className="di-spinner" /></div>
  if (phase === 'error') return <div className="di-stage"><div className="di-error">{err} <button onClick={() => void load()}>Bandyti dar</button></div></div>
  if (!round) return <div className="di-center"><div className="di-spinner" /></div>

  return (
    <div className="di-stage">
      <span className="di-stage-no">{stepNo} iš {stepTotal} · {game === 'metai' ? 'Kurie metai' : 'Vaizdas'}</span>
      <div className="di-ag-head">
        <h2 className="di-h2">{title}</h2>
        <span className="di-ag-prog">{idx + 1}/{rounds.length} · ⚡ {score}</span>
      </div>

      <div className="di-ag-imgwrap">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={round.r} src={proxyImg(round.image, 480)} alt="" />
        {game === 'vaizdas' && (
          <div className="di-ag-puzzle" aria-hidden>
            {pzRanksRef.current.map((rank, i) => (
              <span key={i} style={{ opacity: (rank + 1) / PZ_N > pzProgress ? 1 : 0 }} />
            ))}
          </div>
        )}
        {phase === 'round' && <span className="di-ag-clock">{Math.ceil(timeLeft / 1000)}</span>}
        {phase === 'reveal' && rr && (
          <span className={`di-ag-tag ${rr.correct ? 'ok' : 'bad'}`}>
            {rr.correct ? `+${rr.points}` : game === 'metai' ? `${rr.correctId} m.` : 'Ne!'}
          </span>
        )}
      </div>
      {game === 'metai' && round.label && <div className="di-ag-label">{round.label}</div>}
      <div className="di-ag-bar"><div style={{ width: `${pct * 100}%` }} /></div>

      <div className={`di-ag-opts${game === 'metai' ? ' years' : ''}`}>
        {round.options.map(o => {
          let cls = 'di-ag-opt'
          if (phase === 'reveal' && rr) {
            if (o.id === rr.correctId) cls += ' correct'
            else if (o.id === picked) cls += ' wrong'
            else cls += ' dim'
          }
          return <button key={o.id} className={cls} disabled={phase !== 'round'} onClick={() => answer(o.id)}>{o.name}</button>
        })}
      </div>
    </div>
  )
}

// ═══════════ „Atspėk iš sekundės" žingsnis (audio) ═══════════
type SekRound = { r: number; audioUrl: string; options: { id: number; title: string; artist: string }[]; token: string }
const SEK_STAGES = [1000, 4000, 9000]

function SekundesGameStep({ stepNo, stepTotal, onDone }: { stepNo: number; stepTotal: number; onDone: (r: any) => void }) {
  const ROUND_MS = 25000, REVEAL_MS = 2200
  const [phase, setPhase] = useState<'load' | 'ready' | 'round' | 'reveal' | 'submit' | 'error'>('load')
  const [rounds, setRounds] = useState<SekRound[]>([])
  const [quizId, setQuizId] = useState('')
  const [idx, setIdx] = useState(0)
  const [stg, setStg] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [rr, setRr] = useState<{ correct: boolean; correctId: number; points: number } | null>(null)
  const [score, setScore] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const garsas = naudotiGarsoGrotuva()
  const startRef = useRef(0)
  const snipRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const revealRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const phaseRef = useRef(phase); phaseRef.current = phase
  const round = rounds[idx] || null

  useEffect(() => { void load(); return () => { if (snipRef.current) clearTimeout(snipRef.current); if (revealRef.current) clearTimeout(revealRef.current); garsas.stop() } }, [])

  async function load() {
    setPhase('load'); setErr(null)
    try {
      const res = await fetch('/api/zaidimai/sekundes?dienos=1')
      const j = await res.json()
      if (!res.ok || !j.rounds?.length) { setErr(j.error || 'Nepavyko įkelti'); setPhase('error'); return }
      setRounds(j.rounds); setQuizId(j.quizId); setIdx(0); setScore(0); setPhase('ready')
    } catch { setErr('Tinklo klaida'); setPhase('error') }
  }

  function groti(url: string, dur: number) {
    if (snipRef.current) clearTimeout(snipRef.current)
    garsas.play(url)
    snipRef.current = setTimeout(() => garsas.stop(), dur)
  }
  function startPlaying() { if (rounds[0]) { setPhase('round'); startRound(rounds[0]) } }
  function startRound(r: SekRound) { startRef.current = Date.now(); setStg(0); setPicked(null); setRr(null); groti(r.audioUrl, SEK_STAGES[0]) }
  function listenMore() { if (round && stg < SEK_STAGES.length - 1) { const n = stg + 1; setStg(n); groti(round.audioUrl, SEK_STAGES[n]) } }

  async function answer(id: number) {
    if (phaseRef.current !== 'round' || !round) return
    garsas.stop()
    const ms = Math.min(Date.now() - startRef.current, ROUND_MS)
    setPicked(id); setPhase('reveal')
    try {
      const res = await fetch('/api/zaidimai/raundas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: round.token, answerId: id, ms }) })
      const j = await res.json()
      if (res.ok) { setRr({ correct: j.correct, correctId: j.correctId, points: j.points }); setScore(s => s + (j.points || 0)) }
    } catch { /* ok */ }
    revealRef.current = setTimeout(next, REVEAL_MS)
  }
  function next() {
    if (revealRef.current) { clearTimeout(revealRef.current); revealRef.current = null }
    if (idx + 1 >= rounds.length) { void submit(); return }
    const n = rounds[idx + 1]; setIdx(i => i + 1); setPhase('round'); startRound(n)
  }
  async function submit() {
    garsas.stop(); setPhase('submit')
    try {
      const res = await fetch('/api/zaidimai/sekundes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quizId }) })
      const j = await res.json()
      onDone(res.ok || res.status === 409 ? j : { score, correctCount: 0, roundCount: rounds.length })
    } catch { onDone({ score, correctCount: 0, roundCount: rounds.length }) }
  }

  const potential = (Date.now() - startRef.current) <= 6000 ? 100 : (Date.now() - startRef.current) <= 13000 ? 60 : 30

  if (phase === 'load') return <div className="di-center"><div className="di-spinner" /></div>
  if (phase === 'error') return <div className="di-stage"><div className="di-error">{err} <button onClick={() => void load()}>Bandyti dar</button></div></div>

  return (
    <div className="di-stage">
      <span className="di-stage-no">{stepNo} iš {stepTotal} · Iš sekundės</span>
      <div className="di-ag-head">
        <h2 className="di-h2">⏱️ Kokia tai daina?</h2>
        {phase !== 'ready' && <span className="di-ag-prog">{idx + 1}/{rounds.length} · ⚡ {score}</span>}
      </div>

      {phase === 'ready' && (
        <div className="di-sek-intro">
          <p className="di-sek-intro-lead">Pradžioje skamba tik <b>1 sekundė</b>.</p>
          <p className="di-sek-intro-sub">Atspėk kuo greičiau iš 4 variantų — kuo trumpiau klausai, tuo daugiau taškų. Neatpažįsti? Spausk <b>„Klausyti ilgiau"</b> (iki 9 sek.), bet taškų bus mažiau.</p>
          <button className="di-play-big" onClick={startPlaying}><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg><span>Pradėti</span></button>
        </div>
      )}

      {phase !== 'ready' && <div className="di-sek-audio">
        {phase === 'round' ? (
          <>
            <div className={`di-eq${garsas.grojama ? '' : ' off'}`}>{Array.from({ length: 7 }).map((_, i) => <span key={i} style={{ animationDelay: `${i * 0.12}s` }} />)}</div>
            <span className="di-sek-pot">verta {potential}</span>
            {stg < SEK_STAGES.length - 1 && <button className="di-sek-more" onClick={listenMore}>▶ Klausyti ilgiau ({SEK_STAGES[stg + 1] / 1000} s)</button>}
          </>
        ) : rr ? (
          <div className={`di-ag-tag ${rr.correct ? 'ok' : 'bad'}`} style={{ position: 'static' }}>{rr.correct ? `+${rr.points}` : 'Ne ta daina'}</div>
        ) : null}
      </div>}

      {phase !== 'ready' && round && (
        <div className="di-ag-opts" style={{ marginTop: 10 }}>
          {round.options.map(o => {
            let cls = 'di-ag-opt'
            if (phase === 'reveal' && rr) { if (o.id === rr.correctId) cls += ' correct'; else if (o.id === picked) cls += ' wrong'; else cls += ' dim' }
            return <button key={o.id} className={cls} disabled={phase !== 'round'} onClick={() => answer(o.id)}><b>{o.artist}</b> — {o.title}</button>
          })}
        </div>
      )}
    </div>
  )
}

const css = `
.di-sek-intro { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; padding: 2vh 0 1vh; }
.di-sek-intro-lead { font-size: 18px; font-weight: 900; color: var(--text-primary); margin: 0; }
.di-sek-intro-sub { font-size: 13px; color: var(--text-secondary); margin: 0 0 8px; max-width: 340px; line-height: 1.5; }
.di-sek-intro-sub b, .di-sek-intro-lead b { color: var(--accent-orange); }
.di-sek-audio { position: relative; display: flex; align-items: center; justify-content: center; gap: 14px; border-radius: 14px; min-height: 96px; padding: 14px; background: #10131b; }
.di-sek-pot { font-size: 13px; color: rgba(255,255,255,0.8); }
.di-sek-more { font-size: 13px; font-weight: 800; color: rgba(255,255,255,0.85); background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); border-radius: 999px; padding: 8px 15px; cursor: pointer; }
.di-eq.off span { animation: none !important; background: rgba(148,163,184,0.4) !important; }
.di-xp { font-size: 15px; font-weight: 900; color: var(--accent-orange); }
.di-streak { font-size: 13px; font-weight: 800; color: var(--text-secondary); }
.di-play-big {
  display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 900; color: #fff;
  cursor: pointer; border: 0; border-radius: 999px; padding: 14px 34px;
  background: var(--accent-orange);
}
.di-orient { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; padding: 4vh 0 2vh; }
.di-orient-step { font-size: 11px; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent-orange); }
.di-orient-title { font-size: 22px; font-weight: 900; color: var(--text-primary); margin: 2px 0 0; }
.di-orient-sub { font-size: 13px; color: var(--text-secondary); margin: 0; max-width: 340px; }
.di-orient-list { list-style: none; margin: 14px 0 20px; padding: 0; display: flex; flex-direction: column; gap: 7px; width: 100%; max-width: 320px; }
.di-orient-list li { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 700; color: var(--text-secondary); background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.2); border-radius: 12px; padding: 10px 13px; }
.di-orient-list li.first { border-color: var(--accent-orange); color: var(--text-primary); }
.di-orient-list li.done { opacity: 0.6; }
.di-orient-li-emoji { font-size: 17px; }
.di-orient-li-label { flex: 1; text-align: left; }
.di-orient-li-check { color: var(--accent-green); font-weight: 900; }
.di-stage-no { display: block; font-size: 11px; font-weight: 900; letter-spacing: 0.07em; text-transform: uppercase; color: var(--accent-orange); margin-bottom: 4px; }
.di-yt { position: absolute; inset: 0; }
.di-yt iframe { width: 100%; height: 100%; }

.di-stepbar { display: flex; gap: 8px; justify-content: center; margin-bottom: 16px; }
.di-step {
  display: flex; align-items: center; gap: 5px; font-size: 14px; font-weight: 800;
  color: var(--text-muted); background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.2);
  border-radius: 999px; padding: 6px 12px;
}
.di-step em { font-style: normal; font-size: 10px; opacity: 0.7; }
.di-step.now { border-color: var(--accent-orange); color: var(--text-primary); }
.di-step.done { color: #10b981; border-color: rgba(16,185,129,0.4); }

.di-badge { font-size: 12px; font-weight: 900; letter-spacing: 0.1em; color: var(--accent-orange); margin-bottom: 10px; }
.di-h1 { font-size: 30px; font-weight: 900; letter-spacing: -0.02em; color: var(--text-primary); line-height: 1.15; margin: 0 0 18px; }
.di-h2 { font-size: 20px; font-weight: 900; color: var(--text-primary); margin: 0 0 4px; }
.di-note { font-size: 14px; color: var(--text-secondary); margin: 0 0 14px; }
.di-duel-blurb { display: inline-block; font-size: 12px; font-weight: 800; color: #cbd5e1; background: rgba(255,255,255,0.05); border: 1px solid rgba(140,160,190,0.2); border-radius: 999px; padding: 4px 12px; margin: 0 0 10px; }
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
  background: var(--accent-orange);
}

.di-center { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 0; }
.di-spinner { width: 38px; height: 38px; border-radius: 50%; border: 3px solid rgba(148,163,184,0.25); border-top-color: var(--accent-orange); animation: dispin .8s linear infinite; }
@keyframes dispin { to { transform: rotate(360deg); } }
.di-error { font-size: 14px; color: #f87171; background: rgba(248,113,113,0.1); border-radius: 10px; padding: 10px 14px; margin-bottom: 12px; display: flex; gap: 10px; align-items: center; }
.di-error button { font-size: 12px; font-weight: 800; color: #f87171; background: transparent; border: 1px solid rgba(248,113,113,0.5); border-radius: 8px; padding: 4px 10px; cursor: pointer; }

.di-stage { display: flex; flex-direction: column; gap: 12px; }
.di-q-head { display: flex; align-items: center; gap: 12px; }
.di-q-n { font-size: 14px; font-weight: 800; color: var(--text-secondary); }
.di-combo { font-size: 12px; font-weight: 900; color: #f97316; animation: dipulse .6s ease infinite alternate; }
@keyframes dipulse { from { transform: scale(1); } to { transform: scale(1.12); } }
.di-q-score { margin-left: auto; font-size: 16px; font-weight: 900; color: var(--accent-orange); }

.di-player { position: relative; border-radius: 14px; overflow: hidden; aspect-ratio: 16/9; max-height: 30vh; margin: 0 auto; width: 100%; background: #0c0f15; }
.di-player.small { aspect-ratio: 16/9; }
.di-player iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.di-player img { width: 100%; height: 100%; object-fit: cover; display: block; }
.di-audio {
  position: relative; display: flex; align-items: center; justify-content: center; gap: 16px;
  border-radius: 15px; min-height: 100px; padding: 12px;
  background: #10131b;
}
.di-hidden-yt { position: absolute; width: 2px; height: 2px; opacity: 0.01; pointer-events: none; }
.di-nosound-note { font-size: 12px; color: rgba(255,255,255,0.8); max-width: 40%; }
.di-eq { display: flex; align-items: flex-end; gap: 5px; height: 44px; }
.di-eq span { width: 7px; border-radius: 3px; background: var(--accent-orange); animation: dieq 0.9s ease-in-out infinite alternate; }
@keyframes dieq { from { height: 8px; } to { height: 44px; } }
.di-clock { width: 62px; height: 62px; border-radius: 50%; background: conic-gradient(var(--accent-orange) calc(var(--p) * 360deg), rgba(148,163,184,0.18) 0); display: flex; align-items: center; justify-content: center; }
.di-clock span { width: 50px; height: 50px; border-radius: 50%; background: #10131b; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 900; }
.di-nosound { font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.75); background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.18); border-radius: 999px; padding: 6px 14px; cursor: pointer; }
.di-verdict-tag { font-size: 17px; font-weight: 900; padding: 11px 20px; border-radius: 12px; color: #fff; }
.di-image-wrap .di-verdict-tag { position: absolute; top: 10px; left: 10px; font-size: 14px; padding: 8px 14px; }
.di-verdict-tag.ok { background: rgba(16,185,129,0.92); }
.di-verdict-tag.bad { background: rgba(239,68,68,0.9); }

.di-timebar { height: 6px; border-radius: 3px; background: rgba(148,163,184,0.18); overflow: hidden; }
.di-timebar div { height: 100%; background: var(--accent-orange); transition: width .1s linear; }

.di-options { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
@media (max-width: 520px) { .di-options { grid-template-columns: 1fr; } }
.di-opt {
  display: flex; flex-direction: column; gap: 2px; align-items: flex-start; text-align: left;
  padding: 12px 14px; border-radius: 13px; cursor: pointer;
  background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.22);
}
.di-opt:hover:not(:disabled) { border-color: var(--accent-orange); }
.di-opt-artist { font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.di-opt-title { font-size: 16px; font-weight: 800; color: var(--text-primary); }
.di-opt.correct { background: rgba(16,185,129,0.16); border-color: #10b981; }
.di-opt.wrong { background: rgba(239,68,68,0.13); border-color: #ef4444; }
.di-opt.dim { opacity: 0.45; }
.di-opt.checking { border-color: var(--accent-orange); animation: dicheck .5s ease infinite alternate; }
@keyframes dicheck { from { opacity: 0.75; } to { opacity: 1; } }

.di-next { align-self: center; font-size: 16px; font-weight: 800; color: #fff; cursor: pointer; background: var(--accent-orange); border: 0; border-radius: 999px; padding: 12px 28px; margin-top: 4px; }

.di-duel { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.di-duel-side { display: flex; flex-direction: column; gap: 6px; padding: 12px; border-radius: 15px; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.2); }
.di-duel-side.picked { border-color: var(--accent-orange); box-shadow: 0 0 0 2px rgba(249,115,22,0.3); }
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
.di-vote { font-size: 14px; font-weight: 800; color: #fff; cursor: pointer; border: 0; border-radius: 11px; padding: 10px 0; background: var(--accent-orange); }

.di-verdict-card { display: flex; flex-direction: column; gap: 12px; }
.di-verdict-meta { display: flex; flex-direction: column; gap: 2px; }
.di-verdict-meta b { font-size: 20px; font-weight: 900; color: var(--text-primary); }
.di-verdict-meta span { font-size: 14px; color: var(--text-secondary); }
.di-reactions { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
@media (max-width: 480px) { .di-reactions { grid-template-columns: repeat(2, 1fr); } }
.di-reaction { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 12px 6px; border-radius: 13px; cursor: pointer; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.22); }
.di-reaction:hover:not(:disabled) { border-color: var(--accent-orange); }
.di-reaction.on { border-color: var(--accent-orange); box-shadow: 0 0 0 2px rgba(249,115,22,0.3); }
.di-reaction.off { opacity: 0.5; }
.di-reaction-emoji { font-size: 24px; }
.di-reaction-label { font-size: 12px; font-weight: 700; color: var(--text-secondary); }
.di-reaction-count { font-size: 12px; font-weight: 900; color: var(--text-primary); }

.di-image-wrap { position: relative; border-radius: 16px; overflow: hidden; }
.di-image-wrap img { width: 100%; display: block; }

/* „Spėk daugumą" atsiliepimas */
.di-crowd { align-self: stretch; text-align: center; font-size: 14px; font-weight: 800; border-radius: 12px; padding: 11px; margin-top: 4px; }
.di-crowd.win { color: var(--accent-green); background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.4); }
.di-crowd.miss { color: var(--text-secondary); background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.25); }
.di-crowd.neutral { color: var(--text-secondary); background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.25); }

/* Albumų žaidimo žingsnis */
.di-ag-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.di-ag-prog { font-size: 13px; font-weight: 800; color: var(--text-secondary); flex-shrink: 0; }
.di-ag-imgwrap { position: relative; border-radius: 14px; overflow: hidden; aspect-ratio: 1/1; max-height: 42vh; background: #10131b; margin: 4px auto 0; }
.di-ag-imgwrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
.di-ag-puzzle { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(6, 1fr); grid-template-rows: repeat(6, 1fr); z-index: 2; }
.di-ag-puzzle span { background: #0b0f18; transition: opacity .55s ease; }
.di-ag-clock { position: absolute; top: 10px; right: 10px; width: 40px; height: 40px; border-radius: 50%; background: rgba(12,15,21,0.8); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 17px; font-weight: 900; }
.di-ag-tag { position: absolute; top: 10px; left: 10px; font-size: 14px; font-weight: 900; padding: 6px 13px; border-radius: 10px; color: #fff; }
.di-ag-tag.ok { background: rgba(16,185,129,0.92); }
.di-ag-tag.bad { background: rgba(239,68,68,0.9); }
.di-ag-label { font-size: 14px; font-weight: 800; color: var(--text-primary); text-align: center; margin-top: 8px; }
.di-ag-bar { height: 5px; border-radius: 3px; background: rgba(148,163,184,0.18); overflow: hidden; margin: 10px 0; }
.di-ag-bar div { height: 100%; background: var(--accent-orange); transition: width .1s linear; }
.di-ag-opts { display: grid; grid-template-columns: 1fr; gap: 8px; }
.di-ag-opts.years { grid-template-columns: repeat(4, 1fr); }
@media (max-width: 480px) { .di-ag-opts.years { grid-template-columns: repeat(2, 1fr); } }
.di-ag-opt { font-size: 15px; font-weight: 700; color: var(--text-primary); text-align: left; cursor: pointer; padding: 12px 14px; border-radius: 11px; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.22); }
.di-ag-opts.years .di-ag-opt { text-align: center; font-size: 16px; font-weight: 900; }
.di-ag-opt:hover:not(:disabled) { border-color: var(--accent-orange); }
.di-ag-opt.correct { background: rgba(16,185,129,0.16); border-color: #10b981; color: #34d399; }
.di-ag-opt.wrong { background: rgba(239,68,68,0.13); border-color: #ef4444; }
.di-ag-opt.dim { opacity: 0.45; }

/* Suvestinė */
.di-summary { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 24px 0; }
.di-sum-score { display: flex; flex-direction: column; align-items: center; margin: 6px 0 4px; }
.di-sum-score-num { font-size: 52px; font-weight: 900; color: var(--accent-orange); line-height: 1; }
.di-sum-score-max { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
.di-sum-rank { font-size: 14px; color: var(--text-secondary); background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.22); border-radius: 999px; padding: 7px 16px; margin: 12px 0 4px; }
.di-sum-rank b { color: var(--text-primary); }
.di-sum-rows { align-self: stretch; display: flex; flex-direction: column; gap: 6px; margin: 16px 0 6px; }
.di-sum-row { display: flex; align-items: center; gap: 10px; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.18); border-radius: 12px; padding: 11px 14px; }
.di-sum-row-ic { font-size: 18px; flex-shrink: 0; }
.di-sum-row-lbl { font-size: 14px; font-weight: 700; color: var(--text-primary); text-align: left; }
.di-sum-row-val { margin-left: auto; font-size: 13px; font-weight: 700; color: var(--text-secondary); text-align: right; }
.di-sum-row-val.ok { color: var(--accent-green); }
.di-sum-streak { font-size: 13.5px; color: var(--text-secondary); margin: 12px 0 0; }
.di-sum-streak b { color: var(--text-primary); }
.di-sum-actions { display: flex; gap: 12px; align-items: center; margin-top: 18px; flex-wrap: wrap; justify-content: center; }
.di-share { font-size: 16px; font-weight: 800; color: #fff; cursor: pointer; border: 0; border-radius: 999px; padding: 12px 26px; background: var(--accent-orange); }
`
