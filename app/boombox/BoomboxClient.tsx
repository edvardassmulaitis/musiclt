'use client'

// app/boombox/BoomboxClient.tsx
//
// Boombox kasdienis wizard'as. App-feel — viskas telpa į viewport'ą, jokio
// scroll'o iki footer'io. Cassette estetika.
//
// Stage'ai: landing → image → duel → verdict → drops → summary
// (drops — kiekvienas video pasirodo po vieną, auto-advance po reakcijos).

import { useEffect, useMemo, useState, useRef } from 'react'
import Link from 'next/link'
import type { ImageDrop, DuelDrop, VerdictDrop, VideoDrop, DropCompletionLookup } from '@/lib/boombox'
import { proxyImg } from '@/lib/img-proxy'

type Props = {
  isAuthenticated: boolean
  username: string | null
  image: ImageDrop | null
  duel: DuelDrop | null
  verdict: VerdictDrop | null
  videos: VideoDrop[]
  completions: DropCompletionLookup
  streak: { current: number; total_xp: number; longest: number }
}

type Stage = 'landing' | 'image' | 'duel' | 'verdict' | 'drops' | 'summary'

// Unified 4-emoji reaction set — naudojam verdiktui, drops'ams ir vėliau
// site-wide track reakcijoms. Pakeičia ❤️ (kuris turi būti like'ui), padengia
// platų spektrą: degantis hit'as / aukščiausia pagarba / emocingas /
// asmeniškai ne.
const REACTION_SET: Array<{ emoji: string; label: string }> = [
  { emoji: '🔥', label: 'fire' },
  { emoji: '🐐', label: 'GOAT' },
  { emoji: '😭', label: 'emocija' },
  { emoji: '😬', label: 'ne man' },
]

const MATCHUP_LABEL: Record<DuelDrop['matchup_type'], string> = {
  old_vs_old: 'Senas vs Senas',
  new_vs_new: 'Naujas vs Naujas',
  old_vs_new: 'Senas vs Naujas',
}

function youtubeIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

const STAGE_ORDER: Stage[] = ['landing', 'image', 'duel', 'verdict', 'drops', 'summary']
const MISSION_STAGES: Stage[] = ['image', 'duel', 'verdict']

export default function BoomboxClient(props: Props) {
  const { image, duel, verdict, videos, completions: initialCompletions } = props

  const initialStage: Stage = useMemo(() => {
    if (image && !initialCompletions.image) return 'landing'
    if (duel && !initialCompletions.duel) return 'landing'
    if (verdict && !initialCompletions.verdict) return 'landing'
    return videos.length > 0 ? 'drops' : 'summary'
  }, [image, duel, verdict, videos, initialCompletions])

  const [stage, setStage] = useState<Stage>(initialStage)
  const [streak, setStreak] = useState(props.streak)
  const [sessionXp, setSessionXp] = useState(0)
  const [dropIdx, setDropIdx] = useState(0)

  // ── Per-mission state
  const [imageGuess, setImageGuess] = useState<{ pickedTrackId: number | null; isCorrect: boolean | null; stats: any }>({
    pickedTrackId: initialCompletions.image?.payload?.guessTrackId ?? null,
    isCorrect: initialCompletions.image?.isCorrect ?? null,
    stats: null,
  })
  const [duelChoice, setDuelChoice] = useState<{ pick: 'A' | 'B' | 'skip' | null; stats: any }>({
    pick: initialCompletions.duel?.payload?.choice ?? null,
    stats: null,
  })
  const [verdictPick, setVerdictPick] = useState<{ emoji: string | null; stats: any }>({
    emoji: initialCompletions.verdict?.payload?.emoji ?? null,
    stats: null,
  })
  const [videoReactions, setVideoReactions] = useState<Record<number, string>>(() => {
    const map: Record<number, string> = {}
    for (const v of initialCompletions.videos || []) {
      const e = v.payload?.emoji
      if (typeof e === 'string') map[v.dropId] = e
    }
    return map
  })

  // ── Auto-scroll to top on every stage change AND on mount (reload safety)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    }
  }, [stage, dropIdx])

  // Lock body scroll while on /boombox — app-feel
  useEffect(() => {
    if (typeof document === 'undefined') return
    const prevOverflow = document.body.style.overflow
    const prevHtmlOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
      document.documentElement.style.overflow = prevHtmlOverflow
    }
  }, [])

  const noContent = !image && !duel && !verdict && videos.length === 0

  // Wizard progress: image (1), duel (2), verdict (3), drops (4) jei yra video.
  // Skip'inami stages, kurių nėra (jei nėra duel'o, verdict tampa #2 ir t.t.).
  const missionStages: Stage[] = []
  if (image) missionStages.push('image')
  if (duel) missionStages.push('duel')
  if (verdict) missionStages.push('verdict')
  if (videos.length > 0) missionStages.push('drops')
  const missionTotal = missionStages.length
  const currentMissionIdx = (stage === 'image' || stage === 'duel' || stage === 'verdict' || stage === 'drops')
    ? missionStages.indexOf(stage) + 1
    : 0

  // ─── Submit helpers ───
  async function submit(missionType: string, dropId: number, payload: any, extra: any = {}) {
    try {
      const res = await fetch('/api/boombox/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missionType, dropId, payload, ...extra }),
      })
      const json = await res.json()
      if (json.streak) setStreak(s => ({ ...s, current: json.streak, total_xp: json.totalXp ?? s.total_xp }))
      if (typeof json.xp === 'number') setSessionXp(x => x + json.xp)
      return json
    } catch (e) {
      console.error(e)
      return null
    }
  }

  function nextStageAfter(s: Stage): Stage {
    // Skip stages without content
    const order: Stage[] = ['image', 'duel', 'verdict', 'drops', 'summary']
    const i = order.indexOf(s)
    for (let j = i + 1; j < order.length; j++) {
      const cand = order[j]
      if (cand === 'image' && !image) continue
      if (cand === 'duel' && !duel) continue
      if (cand === 'verdict' && !verdict) continue
      if (cand === 'drops' && videos.length === 0) continue
      return cand
    }
    return 'summary'
  }

  function handleImagePick(option: ImageDrop['options'][number]) {
    if (!image || imageGuess.pickedTrackId !== null) return
    const isCorrect = option.id === image.correct.id
    setImageGuess({ pickedTrackId: option.id, isCorrect, stats: null })
    submit('image_guess', image.id, { choice: option.id }, { guessTrackId: option.id }).then(j => {
      if (j?.stats) setImageGuess(s => ({ ...s, stats: j.stats }))
    })
    setTimeout(() => setStage(nextStageAfter('image')), 2500)
  }

  function handleDuelPick(pick: 'A' | 'B' | 'skip') {
    if (!duel || duelChoice.pick !== null) return
    setDuelChoice({ pick, stats: null })
    submit('duel', duel.id, { choice: pick }).then(j => {
      if (j?.stats) setDuelChoice(s => ({ ...s, stats: j.stats }))
    })
    setTimeout(() => setStage(nextStageAfter('duel')), 2500)
  }

  function handleVerdictPick(emoji: string) {
    if (!verdict || verdictPick.emoji !== null) return
    setVerdictPick({ emoji, stats: null })
    submit('verdict', verdict.id, { emoji }).then(j => {
      if (j?.stats) setVerdictPick(s => ({ ...s, stats: j.stats }))
    })
    setTimeout(() => setStage(nextStageAfter('verdict')), 2500)
  }

  function handleVideoReaction(videoId: number, emoji: string) {
    if (videoReactions[videoId]) return
    setVideoReactions(prev => ({ ...prev, [videoId]: emoji }))
    submit('video_react', videoId, { emoji })
    // Auto-advance to next video, or summary if last
    setTimeout(() => {
      if (dropIdx + 1 < videos.length) {
        setDropIdx(dropIdx + 1)
      } else {
        setStage('summary')
      }
    }, 1200)
  }

  function startWizard() {
    setStage(nextStageAfter('landing'))
  }

  return (
    <div className="bb-root" style={{ background: 'var(--bg-body)', color: 'var(--text-primary)' }}>
      <style>{boomboxCss}</style>

      {stage === 'landing' && (
        <Landing
          streak={streak}
          hasContent={!noContent}
          missionCount={missionTotal}
          videoCount={videos.length}
          onStart={startWizard}
        />
      )}

      {stage === 'image' && image && (
        <ImageGuessStage
          drop={image}
          stepIdx={currentMissionIdx}
          stepTotal={missionTotal}
          picked={imageGuess.pickedTrackId}
          isCorrect={imageGuess.isCorrect}
          stats={imageGuess.stats}
          onPick={handleImagePick}
        />
      )}

      {stage === 'duel' && duel && (
        <DuelStage
          drop={duel}
          stepIdx={currentMissionIdx}
          stepTotal={missionTotal}
          picked={duelChoice.pick}
          stats={duelChoice.stats}
          onPick={handleDuelPick}
        />
      )}

      {stage === 'verdict' && verdict && (
        <VerdictStage
          drop={verdict}
          stepIdx={currentMissionIdx}
          stepTotal={missionTotal}
          picked={verdictPick.emoji}
          stats={verdictPick.stats}
          onPick={handleVerdictPick}
        />
      )}

      {stage === 'drops' && videos.length > 0 && (
        <DropsStage
          videos={videos}
          currentIdx={dropIdx}
          reaction={videoReactions[videos[dropIdx]?.id] || null}
          stepIdx={currentMissionIdx}
          stepTotal={missionTotal}
          onReact={handleVideoReaction}
        />
      )}

      {stage === 'summary' && (
        <SummaryStage
          sessionXp={sessionXp}
          streak={streak}
          isAuthenticated={props.isAuthenticated}
          videos={videos.filter(v => videoReactions[v.id])}
          results={{
            image: image && imageGuess.pickedTrackId !== null
              ? {
                  trackId: image.correct.id,
                  trackSlug: image.correct.slug,
                  title: image.correct.title,
                  artist: image.correct.artist,
                  coverUrl: image.correct.cover_url,
                  videoUrl: image.correct.video_url,
                  imageUrl: image.image_url,
                  isCorrect: imageGuess.isCorrect,
                  stats: imageGuess.stats,
                }
              : null,
            duel: duel && duelChoice.pick
              ? { trackA: duel.track_a, trackB: duel.track_b, pick: duelChoice.pick, stats: duelChoice.stats }
              : null,
            verdict: verdict && verdictPick.emoji
              ? { track: verdict.track, emoji: verdictPick.emoji, stats: verdictPick.stats }
              : null,
            videosWatched: Object.keys(videoReactions).length,
          }}
        />
      )}

      {noContent && stage === 'landing' && (
        <div className="bb-empty">
          <div className="bb-empty-text">Šiandien drop&apos;as dar pasiruošia.</div>
          <Link href="/" className="bb-empty-link">← į pagrindinį</Link>
        </div>
      )}
    </div>
  )
}

// ─── Landing ───

function Landing({ streak, hasContent, missionCount, videoCount, onStart }: {
  streak: any
  hasContent: boolean
  missionCount: number
  videoCount: number
  onStart: () => void
}) {
  return (
    <div className="bb-screen">
      <header className="bb-topbar">
        <span />
        {streak.current > 0 && (
          <span className="bb-streak-pill">
            <span style={{ marginRight: 4 }}>🔥</span>
            {streak.current} d. iš eilės
          </span>
        )}
      </header>

      <main className="bb-landing-main">
        <Cassette playing />

        <div className="bb-brand">BOOMBOX</div>
        <div className="bb-tagline">kasdienis muzikos žaidimas</div>

        <button className="bb-btn-primary bb-landing-cta" onClick={onStart} disabled={!hasContent}>
          {hasContent ? `Pradėti · ${missionCount} ${missionCount === 1 ? 'misija' : 'misijos'}` : 'Šiandien tylu'}
        </button>
      </main>
    </div>
  )
}

// ─── Cassette SVG ───

function Cassette({ playing = false, size = 160 }: { playing?: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size * 0.65}
      viewBox="0 0 200 130"
      className={`bb-cassette ${playing ? 'playing' : ''}`}
      aria-hidden
    >
      <defs>
        <linearGradient id="bbCasGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent-orange)" />
          <stop offset="1" stopColor="#fbbf24" />
        </linearGradient>
      </defs>
      {/* Body */}
      <rect x="6" y="14" width="188" height="100" rx="10" fill="var(--bg-elevated)" stroke="var(--border-strong)" strokeWidth="1.5" />
      {/* Window */}
      <rect x="22" y="34" width="156" height="60" rx="6" fill="rgba(0,0,0,0.5)" />
      {/* Tape line */}
      <line x1="60" y1="64" x2="140" y2="64" stroke="url(#bbCasGrad)" strokeWidth="2" strokeLinecap="round" />
      {/* Reels */}
      <g className="bb-reel" style={{ transformOrigin: '60px 64px' }}>
        <circle cx="60" cy="64" r="22" fill="var(--bg-surface)" stroke="url(#bbCasGrad)" strokeWidth="2" />
        <circle cx="60" cy="64" r="6" fill="url(#bbCasGrad)" />
        <line x1="60" y1="46" x2="60" y2="42" stroke="url(#bbCasGrad)" strokeWidth="3" strokeLinecap="round" />
        <line x1="60" y1="86" x2="60" y2="82" stroke="url(#bbCasGrad)" strokeWidth="3" strokeLinecap="round" />
        <line x1="42" y1="64" x2="46" y2="64" stroke="url(#bbCasGrad)" strokeWidth="3" strokeLinecap="round" />
        <line x1="78" y1="64" x2="74" y2="64" stroke="url(#bbCasGrad)" strokeWidth="3" strokeLinecap="round" />
      </g>
      <g className="bb-reel" style={{ transformOrigin: '140px 64px' }}>
        <circle cx="140" cy="64" r="22" fill="var(--bg-surface)" stroke="url(#bbCasGrad)" strokeWidth="2" />
        <circle cx="140" cy="64" r="6" fill="url(#bbCasGrad)" />
        <line x1="140" y1="46" x2="140" y2="42" stroke="url(#bbCasGrad)" strokeWidth="3" strokeLinecap="round" />
        <line x1="140" y1="86" x2="140" y2="82" stroke="url(#bbCasGrad)" strokeWidth="3" strokeLinecap="round" />
        <line x1="122" y1="64" x2="126" y2="64" stroke="url(#bbCasGrad)" strokeWidth="3" strokeLinecap="round" />
        <line x1="158" y1="64" x2="154" y2="64" stroke="url(#bbCasGrad)" strokeWidth="3" strokeLinecap="round" />
      </g>
      {/* Label tab */}
      <rect x="60" y="98" width="80" height="12" rx="2" fill="var(--accent-orange)" opacity="0.3" />
    </svg>
  )
}

// ─── Stage progress — thin gradient bar with smooth fill ───

function StageHeader({ idx, total }: { idx: number; total: number }) {
  const pct = total > 0 ? (idx / total) * 100 : 0
  return (
    <header className="bb-topbar bb-topbar-stage">
      <div className="bb-progress-track-thin">
        <div className="bb-progress-fill-thin" style={{ width: `${Math.max(pct, 6)}%` }} />
      </div>
      <span className="bb-step-counter">{idx} / {total}</span>
    </header>
  )
}

// ─── Image Guess ───

function ImageGuessStage({ drop, stepIdx, stepTotal, picked, isCorrect, stats, onPick }: {
  drop: ImageDrop
  stepIdx: number
  stepTotal: number
  picked: number | null
  isCorrect: boolean | null
  stats: any
  onPick: (opt: ImageDrop['options'][number]) => void
}) {
  return (
    <div className="bb-screen">
      <StageHeader idx={stepIdx} total={stepTotal} />

      <main className="bb-stage-main">
        <h1 className="bb-question">Kuri daina paslėpta vaizde?</h1>

        <div className="bb-image-wrapper">
          <img src={drop.image_url} alt="" className="bb-ai-image" loading="eager" />

        </div>

        <div className="bb-answers">
          {drop.options.map(opt => {
            const wasPicked = picked === opt.id
            const showCorrect = picked !== null && opt.isCorrect
            const showWrong = wasPicked && !opt.isCorrect
            return (
              <button
                key={opt.id}
                className={[
                  'bb-answer-card',
                  showCorrect ? 'bb-correct' : '',
                  showWrong ? 'bb-wrong' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => onPick(opt)}
                disabled={picked !== null}
              >
                <div className="bb-answer-artist">{opt.artist}</div>
                <div className="bb-answer-song">{opt.title}</div>
              </button>
            )
          })}
        </div>
      </main>

      {picked !== null && (
        <FullStageOverlay
          status={isCorrect ? 'correct' : 'wrong'}
          title={`${drop.correct.artist} — ${drop.correct.title}`}
          body={(stats?.total || 0) >= STATS_MIN && stats?.correctPct != null ? `atspėjo ${stats.correctPct}% žmonių` : ''}
        />
      )}
    </div>
  )
}

// ─── Duel ───

function DuelStage({ drop, stepIdx, stepTotal, picked, stats, onPick }: {
  drop: DuelDrop
  stepIdx: number
  stepTotal: number
  picked: 'A' | 'B' | 'skip' | null
  stats: any
  onPick: (p: 'A' | 'B' | 'skip') => void
}) {
  const ytA = youtubeIdFromUrl(drop.track_a.video_url)
  const ytB = youtubeIdFromUrl(drop.track_b.video_url)

  return (
    <div className="bb-screen">
      <StageHeader idx={stepIdx} total={stepTotal} />

      <main className="bb-stage-main">
        <div className="bb-duel-header">
          <h1 className="bb-question">Dienos dvikova</h1>
          <span className="bb-duel-tag">{MATCHUP_LABEL[drop.matchup_type]}</span>
        </div>

        <div className="bb-duel-grid">
          {(['A', 'B'] as const).map(which => {
            const t = which === 'A' ? drop.track_a : drop.track_b
            const yt = which === 'A' ? ytA : ytB
            const isPicked = picked === which
            const isOther = picked && picked !== which
            return (
              <div key={which} className={`bb-duel-card ${isPicked ? 'voted' : ''} ${isOther ? 'dimmed' : ''}`}>
                <div className="bb-duel-embed">
                  {yt ? (
                    <iframe
                      src={`https://www.youtube.com/embed/${yt}?rel=0&modestbranding=1&playsinline=1`}
                      allow="encrypted-media; autoplay"
                      allowFullScreen
                    />
                  ) : (
                    <div className="bb-duel-thumb">
                      {t.cover_url ? <img src={proxyImg(t.cover_url)} alt="" /> : <span>{which}</span>}
                    </div>
                  )}
                </div>
                <div className="bb-duel-side">
                  <div className="bb-duel-info">
                    <div className="bb-duel-title">{t.title}</div>
                    <div className="bb-duel-artist">{t.artist}</div>
                  </div>
                  <button
                    className={`bb-duel-fire ${isPicked ? 'picked' : ''}`}
                    onClick={() => onPick(which)}
                    disabled={picked !== null}
                    aria-label={`Rinktis ${which}`}
                  >
                    <span className="bb-fire-emoji">🔥</span>
                    <span className="bb-fire-label">Rinktis</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <button
          className={`bb-duel-neither ${picked === 'skip' ? 'picked' : ''}`}
          onClick={() => onPick('skip')}
          disabled={picked !== null}
        >
          <span className="bb-neither-emoji">🥱</span>
          <span>nei viena netinka</span>
        </button>
      </main>

      {picked !== null && (
        <DuelRevealOverlay picked={picked} stats={stats} drop={drop} />
      )}
    </div>
  )
}

const STATS_MIN = 3   // Min completions before showing distribution

function DuelRevealOverlay({ picked, stats, drop }: { picked: 'A' | 'B' | 'skip'; stats: any; drop: DuelDrop }) {
  let title = 'Balsas užfiksuotas'
  let body = ''
  const total = stats?.total || 0
  if (total >= STATS_MIN) {
    const a = stats.choiceDistribution?.A || 0
    const b = stats.choiceDistribution?.B || 0
    const pa = Math.round((a / total) * 100)
    const pb = Math.round((b / total) * 100)
    const winner = pa > pb ? 'A' : pb > pa ? 'B' : null
    if (winner) {
      title = `${winner === 'A' ? pa : pb}% rinkosi ${winner === 'A' ? drop.track_a.title : drop.track_b.title}`
      body = picked === winner ? 'Esi su dauguma' : picked === 'skip' ? '' : 'Esi mažumoj'
    } else {
      title = `Lygiomis · ${pa}% A · ${pb}% B`
    }
  } else if (total === 1) {
    title = 'Tu pirmas balsuoji šiandien'
  }
  return <FullStageOverlay title={title} body={body} />
}

// ─── Unified full-stage transition overlay ───

function FullStageOverlay({ title, body, status }: {
  title: string
  body?: string
  status?: 'correct' | 'wrong' | null
}) {
  return (
    <div className="bb-stage-overlay">
      {status && (
        <div className={status === 'correct' ? 'bb-overlay-status bb-correct-text' : 'bb-overlay-status bb-wrong-text'}>
          {status === 'correct' ? '✓ Teisingai' : '✗ Beveik'}
        </div>
      )}
      <div className="bb-overlay-title">{title}</div>
      {body && <div className="bb-overlay-body">{body}</div>}
      <div className="bb-progress-track"><div className="bb-progress-fill" /></div>
    </div>
  )
}

// ─── Verdict ───

function VerdictStage({ drop, stepIdx, stepTotal, picked, stats, onPick }: {
  drop: VerdictDrop
  stepIdx: number
  stepTotal: number
  picked: string | null
  stats: any
  onPick: (emoji: string) => void
}) {
  const yt = youtubeIdFromUrl(drop.track.video_url)
  const topEmoji = useMemo(() => {
    const dist = stats?.emojiDistribution || {}
    const total = stats?.total || 0
    if (total === 0) return null
    let topKey = ''
    let topCount = 0
    for (const [k, v] of Object.entries(dist)) {
      if ((v as number) > topCount) { topCount = v as number; topKey = k }
    }
    return topKey ? { emoji: topKey, pct: Math.round((topCount / total) * 100) } : null
  }, [stats])

  return (
    <div className="bb-screen">
      <StageHeader idx={stepIdx} total={stepTotal} />

      <main className="bb-stage-main">
        <h1 className="bb-question">Hitas? <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Įvertink naują dainą</span></h1>

        <div className="bb-verdict-track-row">
          <div className="bb-thumb bb-thumb-c">
            {drop.track.artist_image
              ? <img src={proxyImg(drop.track.artist_image)} alt="" />
              : drop.track.cover_url
                ? <img src={proxyImg(drop.track.cover_url)} alt="" />
                : '🎵'}
          </div>
          <div className="bb-verdict-track-info">
            <div className="bb-verdict-track-title">{drop.track.title}</div>
            <div className="bb-verdict-track-artist">
              {drop.track.artist}
              {(drop.track.release_date || drop.track.release_year) && (
                <span className="bb-verdict-date">
                  {' · '}
                  {drop.track.release_date
                    ? new Date(drop.track.release_date).toLocaleDateString('lt-LT', { year: 'numeric', month: 'short', day: 'numeric' })
                    : drop.track.release_year}
                </span>
              )}
            </div>
          </div>
        </div>

        {yt && (
          <div className="bb-verdict-embed">
            <iframe
              src={`https://www.youtube.com/embed/${yt}?rel=0&modestbranding=1&playsinline=1`}
              allow="encrypted-media; autoplay"
              allowFullScreen
            />
          </div>
        )}

        <div className="bb-reaction-row">
          {REACTION_SET.map(({ emoji, label }) => (
            <button
              key={emoji}
              className={['bb-reaction-btn', picked === emoji ? 'bb-reaction-selected' : ''].filter(Boolean).join(' ')}
              onClick={() => onPick(emoji)}
              disabled={picked !== null}
              title={label}
            >
              <span className="bb-reaction-emoji">{emoji}</span>
            </button>
          ))}
        </div>

      </main>

      {picked !== null && (
        <FullStageOverlay
          title={(stats?.total || 0) >= STATS_MIN && topEmoji
            ? `Bendruomenės top — ${topEmoji.emoji} ${topEmoji.pct}%`
            : 'Reakcija užfiksuota'}
          body={(stats?.total || 0) >= STATS_MIN && topEmoji && picked === topEmoji.emoji ? 'Esi su dauguma' : ''}
        />
      )}
    </div>
  )
}

// ─── Drops (one video at a time, TikTok-style) ───

function DropsStage({ videos, currentIdx, reaction, stepIdx, stepTotal, onReact }: {
  videos: VideoDrop[]
  currentIdx: number
  reaction: string | null
  stepIdx: number
  stepTotal: number
  onReact: (id: number, emoji: string) => void
}) {
  const v = videos[currentIdx]
  if (!v) return null
  const embedUrl = embedUrlFor(v)
  const totalVideos = videos.length

  return (
    <div className="bb-screen">
      <StageHeader idx={stepIdx} total={stepTotal} />

      <main className="bb-stage-main">
        <h1 className="bb-question">
          Klipai
          <span className="bb-drops-counter-inline"> · {currentIdx + 1}/{totalVideos}</span>
        </h1>

        <div className="bb-drop-frame">
          {embedUrl ? (
            <iframe
              key={v.id}
              src={embedUrl}
              allow="encrypted-media; autoplay"
              allowFullScreen
            />
          ) : (
            <a href={v.source_url} target="_blank" rel="noopener noreferrer" className="bb-drop-link-fallback">
              Atidaryti {v.source} ↗
            </a>
          )}
        </div>

        <div className="bb-reaction-row">
          {REACTION_SET.map(({ emoji, label }) => (
            <button
              key={emoji}
              className={['bb-reaction-btn', reaction === emoji ? 'bb-reaction-selected' : ''].filter(Boolean).join(' ')}
              onClick={() => onReact(v.id, emoji)}
              disabled={!!reaction}
              title={label}
            >
              <span className="bb-reaction-emoji">{emoji}</span>
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}

function embedUrlFor(v: VideoDrop): string | null {
  if (v.embed_id) {
    if (v.source === 'shorts' || v.source === 'youtube') {
      return `https://www.youtube.com/embed/${v.embed_id}?rel=0&modestbranding=1&playsinline=1`
    }
    if (v.source === 'tiktok') {
      return `https://www.tiktok.com/embed/v2/${v.embed_id}`
    }
    if (v.source === 'reels') {
      return `https://www.instagram.com/reel/${v.embed_id}/embed`
    }
  }
  const yt = youtubeIdFromUrl(v.source_url)
  if (yt) return `https://www.youtube.com/embed/${yt}?rel=0&modestbranding=1&playsinline=1`
  return null
}

// ─── Summary ───

function ytThumbFromUrl(videoUrl: string | undefined): string | null {
  const id = youtubeIdFromUrl(videoUrl)
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null
}

function trackPagePath(track: { id: number; slug?: string }): string {
  return track.slug ? `/lt/daina/${track.slug}/${track.id}` : `/lt/daina/-/${track.id}`
}

type ModalTrack = {
  id: number
  slug?: string
  title: string
  artist: string
  cover_url?: string | null
  video_url?: string | null
}

function SummaryStage({ sessionXp, streak, isAuthenticated, results, videos }: {
  sessionXp: number
  streak: { current: number; total_xp: number; longest: number }
  isAuthenticated: boolean
  results: any
  videos: VideoDrop[]
}) {
  const [modalTrack, setModalTrack] = useState<ModalTrack | null>(null)

  function openModal(t: any) {
    if (!t || !t.id) return
    setModalTrack({
      id: t.id,
      slug: t.slug,
      title: t.title,
      artist: t.artist,
      cover_url: t.cover_url,
      video_url: t.video_url,
    })
  }

  async function shareVideo(v: VideoDrop) {
    const url = v.source_url
    const title = `Boombox · ${v.related_artist?.name || 'klipas'}`
    if (navigator.share) {
      try { await navigator.share({ title, url }) } catch {}
    } else {
      try { await navigator.clipboard.writeText(url) } catch {}
    }
  }

  return (
    <div className="bb-screen bb-summary-screen">
      <main className="bb-stage-main">
        <div className="bb-summary-score">
          <div className="bb-xp-big">+{sessionXp}</div>
          <div className="bb-xp-label">{isAuthenticated ? 'taškai (su profilio bonusu)' : 'taškai šiandien'}</div>
        </div>

        <div className="bb-recap-list">
          {results.image && (
            <RecapRow
              thumb={results.image.imageUrl}
              accent={results.image.isCorrect ? 'green' : 'orange'}
              title={results.image.isCorrect ? 'Atspėjai vaizdą' : 'Beveik atspėjai'}
              sub={`${results.image.artist} — ${results.image.title}`}
              onClick={() => openModal({
                id: results.image.trackId,
                slug: results.image.trackSlug,
                title: results.image.title,
                artist: results.image.artist,
                cover_url: results.image.coverUrl,
                video_url: results.image.videoUrl,
              })}
            />
          )}
          {results.duel && results.duel.pick !== 'skip' && (
            <RecapRow
              thumb={ytThumbFromUrl(results.duel.pick === 'A' ? results.duel.trackA?.video_url : results.duel.trackB?.video_url)}
              title={`Pasirinkai ${results.duel.pick}`}
              sub={dueRecapSub(results.duel)}
              onClick={() => openModal(results.duel.pick === 'A' ? results.duel.trackA : results.duel.trackB)}
            />
          )}
          {results.duel && results.duel.pick === 'skip' && (
            <RecapRow icon="🥱" title="Praleidai dvikovą" sub="nei viena netiko" />
          )}
          {results.verdict && (
            <RecapRow
              thumb={ytThumbFromUrl(results.verdict.track.video_url) || (results.verdict.track.cover_url ? proxyImg(results.verdict.track.cover_url) : null)}
              icon={results.verdict.emoji}
              title={`Reakcija: ${results.verdict.emoji}`}
              sub={`${results.verdict.track.artist} — ${results.verdict.track.title}`}
              onClick={() => openModal(results.verdict.track)}
            />
          )}
        </div>

        {videos.length > 0 && (
          <div>
            <div className="bb-section-label">Klipai</div>
            <div className="bb-clips-row">
              {videos.map(v => {
                const yt = v.embed_id || youtubeIdFromUrl(v.source_url)
                const thumb = yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : null
                return (
                  <button key={v.id} className="bb-clip-thumb" onClick={() => shareVideo(v)} title="Bendrinti">
                    {thumb ? <img src={thumb} alt="" /> : <div className="bb-clip-fallback">▶</div>}
                    <span className="bb-clip-share">↗</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {!isAuthenticated && (
          <div className="bb-save-trap">
            <div className="bb-save-streak-row">
              <div className="bb-save-streak-num">🔥 {streak.current || 1}</div>
              <div>
                <div className="bb-save-streak-label">{streak.current > 1 ? `${streak.current} dienų streak'as` : 'Tu jau pradėjai'}</div>
                <div className="bb-save-streak-sub">+50% taškų jei prisijungsi</div>
              </div>
            </div>
            <Link href="/auth/signin" className="bb-btn-primary">Susikurti profilį</Link>
          </div>
        )}

        <div className="bb-return-cta">
          Rytoj <span style={{ color: 'var(--accent-orange)', fontWeight: 700 }}>8:00</span> — naujas drop&apos;as
        </div>
      </main>

      {modalTrack && <TrackQuickModal track={modalTrack} onClose={() => setModalTrack(null)} />}
    </div>
  )
}

// ─── Lightweight track modal — backdrop click + X close ───

function TrackQuickModal({ track, onClose }: { track: ModalTrack; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const yt = youtubeIdFromUrl(track.video_url || undefined)

  return (
    <div className="bb-track-modal-backdrop" onClick={onClose}>
      <div className="bb-track-modal" onClick={e => e.stopPropagation()}>
        <button className="bb-track-modal-close" onClick={onClose} aria-label="Uždaryti">×</button>

        {yt ? (
          <div className="bb-track-modal-embed">
            <iframe
              src={`https://www.youtube.com/embed/${yt}?rel=0&modestbranding=1&autoplay=1&playsinline=1`}
              allow="encrypted-media; autoplay"
              allowFullScreen
            />
          </div>
        ) : track.cover_url ? (
          <img src={proxyImg(track.cover_url)} alt="" className="bb-track-modal-cover" />
        ) : null}

        <div className="bb-track-modal-info">
          <div className="bb-track-modal-artist">{track.artist}</div>
          <div className="bb-track-modal-title">{track.title}</div>
        </div>

        <Link href={trackPagePath(track)} className="bb-track-modal-cta">
          Atidaryti pilną dainos puslapį →
        </Link>
      </div>
    </div>
  )
}

function dueRecapSub(d: any): string {
  const t = d.stats
  if (!t || !t.total) return d.pick === 'A' ? d.trackA?.title : d.pick === 'B' ? d.trackB?.title : '—'
  const a = t.choiceDistribution?.A || 0
  const b = t.choiceDistribution?.B || 0
  const pa = Math.round((a / t.total) * 100)
  const pb = Math.round((b / t.total) * 100)
  const winner = pa > pb ? 'A' : pb > pa ? 'B' : null
  if (winner === d.pick) return `Su dauguma (${winner === 'A' ? pa : pb}%)`
  return `${pa}% už A · ${pb}% už B`
}

function RecapRow({ thumb, icon, accent, title, sub, onClick }: {
  thumb?: string | null
  icon?: string
  accent?: 'green' | 'orange'
  title: string
  sub: string
  onClick?: () => void
}) {
  const inner = (
    <>
      <div className={`bb-recap-icon ${accent ? `bb-recap-accent-${accent}` : ''}`}>
        {thumb ? <img src={thumb} alt="" /> : icon || '•'}
      </div>
      <div className="bb-recap-text">
        <div className="bb-recap-main">{title}</div>
        <div className="bb-recap-sub">{sub}</div>
      </div>
      {onClick && <span className="bb-recap-arrow">›</span>}
    </>
  )

  if (onClick) {
    return (
      <button onClick={onClick} className="bb-recap-row bb-recap-link" type="button">
        {inner}
      </button>
    )
  }
  return <div className="bb-recap-row">{inner}</div>
}

// ─── Styles ───

const boomboxCss = `
  /* Account for SiteHeader which sits above (sticky). Approximate height 56px;
     adjust if site header changes. */
  .bb-root {
    height: calc(100dvh - 56px);
    overflow: hidden;
    display: flex; justify-content: center;
  }

  .bb-screen {
    width: 100%; max-width: 480px;
    height: 100%;
    display: flex; flex-direction: column;
    padding: 10px 14px 14px;
    overflow: hidden;
    position: relative;
  }

  .bb-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100dvh; gap: 12px; }
  .bb-empty-text { color: var(--text-muted); font-size: 14px; }
  .bb-empty-link { color: var(--accent-orange); text-decoration: none; font-size: 13px; }

  /* Topbar */
  .bb-topbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding-bottom: 12px; flex-shrink: 0; }
  .bb-logo { font-size: 11px; color: var(--text-muted); letter-spacing: 3px; text-transform: uppercase; text-decoration: none; font-weight: 600; }
  .bb-logo-mini { font-size: 10.5px; color: var(--text-muted); letter-spacing: 2px; text-transform: uppercase; }
  .bb-streak-pill { background: var(--card-bg); border: 1px solid var(--border-default); color: var(--accent-orange); padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; white-space: nowrap; }
  .bb-stage-tag { font-size: 10px; color: var(--text-muted); letter-spacing: 2px; text-transform: uppercase; font-weight: 700; }
  .bb-step-counter { font-size: 11px; color: var(--text-muted); font-weight: 600; white-space: nowrap; }

  .bb-topbar-stage .bb-progress-track-thin {
    flex: 1; height: 4px; background: var(--border-default); border-radius: 2px; overflow: hidden;
  }
  .bb-progress-fill-thin {
    height: 100%; background: linear-gradient(90deg, var(--accent-orange), #fbbf24);
    border-radius: 2px; transition: width 0.5s cubic-bezier(.2,.8,.2,1);
  }

  /* Landing */
  .bb-landing-main {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px;
    text-align: center;
  }
  .bb-cassette { display: block; }
  .bb-cassette.playing .bb-reel { animation: bbReelSpin 3s linear infinite; }
  @keyframes bbReelSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

  .bb-brand {
    font-family: 'Outfit', system-ui, sans-serif;
    font-size: 52px; font-weight: 900; letter-spacing: -2px; line-height: 1;
    background: linear-gradient(90deg, var(--accent-orange), var(--accent-link));
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .bb-tagline { font-size: 13px; color: var(--text-muted); letter-spacing: 1px; }
  .bb-landing-cta { max-width: 320px; }

  .bb-btn-primary {
    background: var(--accent-orange); color: white; border: none;
    padding: 14px 24px; border-radius: 12px; font-size: 15px; font-weight: 700;
    cursor: pointer; width: 100%; transition: opacity .15s, transform .15s;
    display: inline-block; text-decoration: none; text-align: center;
  }
  .bb-btn-primary:active { transform: scale(0.98); }
  .bb-btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }

  /* Stage main */
  .bb-stage-main {
    flex: 1; display: flex; flex-direction: column; gap: 14px; min-height: 0; position: relative;
  }
  .bb-question {
    font-family: 'Outfit', system-ui, sans-serif;
    font-size: 19px; font-weight: 800; letter-spacing: -0.4px; line-height: 1.2;
    margin: 0; color: var(--text-primary);
  }

  /* Image guess */
  .bb-image-wrapper {
    position: relative; flex: 1; min-height: 0;
    border-radius: 14px; overflow: hidden;
    background: var(--bg-elevated);
  }
  .bb-ai-image { width: 100%; height: 100%; object-fit: cover; display: block; }

  .bb-answers { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
  .bb-answer-card {
    display: block; width: 100%; text-align: left;
    background: var(--card-bg); border: 1px solid var(--border-default);
    border-radius: 12px; padding: 10px 14px; cursor: pointer;
    color: var(--text-primary); font-family: inherit; transition: all .15s;
  }
  .bb-answer-card:active { transform: scale(0.99); }
  .bb-answer-card:disabled { cursor: default; }
  .bb-answer-card.bb-correct { border-color: var(--accent-green); background: rgba(34,197,94,0.1); }
  .bb-answer-card.bb-wrong { border-color: var(--accent-orange); background: rgba(249,115,22,0.06); opacity: 0.5; }
  .bb-answer-artist { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 1px; }
  .bb-answer-song { font-size: 15px; font-weight: 600; }

  /* Unified full-stage transition overlay */
  .bb-stage-overlay {
    position: absolute; inset: 0;
    background: rgba(8, 13, 20, 0.92);
    backdrop-filter: blur(20px);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 24px; gap: 10px; z-index: 10;
    animation: bbOverlayIn 0.3s ease-out;
  }
  @keyframes bbOverlayIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
  .bb-overlay-status { font-family: 'Outfit', system-ui, sans-serif; font-size: 32px; font-weight: 900; letter-spacing: -0.5px; }
  .bb-overlay-title { font-family: 'Outfit', system-ui, sans-serif; font-size: 19px; font-weight: 700; color: var(--text-primary); text-align: center; max-width: 90%; line-height: 1.25; }
  .bb-overlay-body { font-size: 13px; color: var(--text-secondary); text-align: center; }
  .bb-correct-text { color: var(--accent-green); }
  .bb-wrong-text { color: var(--accent-orange); }
  .bb-progress-track {
    height: 2px; background: rgba(255,255,255,0.18); border-radius: 1px;
    margin: 14px auto 0; max-width: 200px; width: 100%; overflow: hidden;
  }
  .bb-progress-fill {
    height: 100%; background: linear-gradient(90deg, var(--accent-orange), #fbbf24); width: 0%;
    animation: bbProgressFill 2.5s linear forwards;
  }
  @keyframes bbProgressFill { from { width: 0%; } to { width: 100%; } }

  /* Duel */
  .bb-duel-header { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
  .bb-duel-tag {
    background: rgba(249,115,22,0.12); color: var(--accent-orange);
    padding: 4px 10px; border-radius: 6px; font-size: 10px; font-weight: 700; letter-spacing: 1.4px;
    flex-shrink: 0;
  }
  .bb-duel-grid { display: flex; flex-direction: column; gap: 10px; flex: 1; min-height: 0; }
  .bb-duel-card {
    background: var(--card-bg); border: 1px solid var(--border-default);
    border-radius: 12px; padding: 8px;
    display: grid; grid-template-columns: 1fr 96px; gap: 8px;
    transition: all .2s; flex: 1; min-height: 0; align-items: stretch;
  }
  .bb-duel-card.voted { border-color: var(--accent-orange); box-shadow: 0 0 0 2px rgba(249,115,22,0.25); }
  .bb-duel-card.dimmed { opacity: 0.45; }
  .bb-duel-embed { border-radius: 8px; overflow: hidden; background: black; min-height: 0; }
  .bb-duel-embed iframe { width: 100%; height: 100%; border: 0; display: block; }
  .bb-duel-thumb { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: var(--bg-elevated); color: var(--text-muted); font-size: 24px; }
  .bb-duel-thumb img { width: 100%; height: 100%; object-fit: cover; }

  .bb-duel-side {
    display: flex; flex-direction: column; gap: 8px; min-width: 0;
    justify-content: space-between;
  }
  .bb-duel-info { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .bb-duel-title { font-size: 13px; font-weight: 700; line-height: 1.2; word-break: break-word; }
  .bb-duel-artist { font-size: 11.5px; color: var(--text-muted); line-height: 1.2; }

  .bb-duel-fire {
    flex-shrink: 0; width: 100%;
    background: rgba(249,115,22,0.10); border: 1.5px solid var(--accent-orange);
    color: var(--accent-orange);
    cursor: pointer; transition: all .15s; padding: 8px 6px;
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    border-radius: 10px; font-family: inherit;
  }
  .bb-duel-fire:hover:not(:disabled) { background: rgba(249,115,22,0.18); }
  .bb-duel-fire:disabled { cursor: default; opacity: 0.45; border-color: var(--border-default); background: var(--card-bg); color: var(--text-muted); }
  .bb-duel-fire.picked {
    background: rgba(249,115,22,0.28) !important; border-color: var(--accent-orange) !important;
    color: white; opacity: 1; box-shadow: 0 0 0 3px rgba(249,115,22,0.2);
  }
  .bb-fire-emoji { font-size: 22px; }
  .bb-fire-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }

  .bb-duel-neither {
    flex-shrink: 0; width: 100%;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    background: var(--card-bg); border: 1px solid var(--border-default);
    padding: 12px 16px; border-radius: 12px;
    font-size: 13px; font-weight: 600; color: var(--text-secondary);
    cursor: pointer; transition: all .15s; font-family: inherit;
  }
  .bb-duel-neither:hover:not(:disabled) { background: var(--card-hover); }
  .bb-duel-neither:disabled { cursor: default; opacity: 0.45; }
  .bb-duel-neither.picked {
    background: rgba(249,115,22,0.18); border-color: var(--accent-orange); opacity: 1;
  }
  .bb-neither-emoji { font-size: 22px; }

  /* Verdict */
  .bb-verdict-track-row {
    display: flex; align-items: center; gap: 12px;
    background: var(--card-bg); border: 1px solid var(--border-default);
    border-radius: 12px; padding: 10px;
  }
  .bb-thumb { width: 56px; height: 56px; border-radius: 12px; flex-shrink: 0; overflow: hidden; display: flex; align-items: center; justify-content: center; color: white; font-size: 18px; }
  .bb-verdict-date { font-size: 11px; color: var(--text-faint); }
  .bb-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .bb-thumb-c { background: linear-gradient(135deg, #4c1d95, var(--accent-orange)); }
  .bb-verdict-track-info { flex: 1; min-width: 0; }
  .bb-verdict-track-title { font-size: 15px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bb-verdict-track-artist { font-size: 12px; color: var(--text-muted); }

  .bb-verdict-embed { border-radius: 12px; overflow: hidden; background: black; flex: 1; min-height: 0; }
  .bb-verdict-embed iframe { width: 100%; height: 100%; border: 0; display: block; }

  /* Unified reaction set (used in verdict + drops) */
  .bb-reaction-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; flex-shrink: 0; }
  .bb-reaction-btn {
    background: var(--card-bg); border: 1px solid var(--border-default); border-radius: 12px;
    padding: 12px 6px; display: flex; flex-direction: column; align-items: center; gap: 3px;
    cursor: pointer; transition: all .15s; color: var(--text-primary); font-family: inherit;
  }
  .bb-reaction-btn:active { transform: scale(0.94); }
  .bb-reaction-btn:disabled { opacity: 0.5; cursor: default; }
  .bb-reaction-selected { background: rgba(249,115,22,0.18) !important; border-color: var(--accent-orange) !important; transform: scale(1.04); }
  .bb-reaction-emoji { font-size: 30px; line-height: 1; }
  .bb-reaction-label { font-size: 10px; color: var(--text-muted); }

  /* Drops */
  .bb-drops-counter-inline { font-size: 13px; color: var(--text-muted); font-weight: 500; }
  .bb-drop-frame {
    flex: 1; min-height: 0; border-radius: 14px; overflow: hidden; background: black;
    position: relative;
  }
  .bb-drop-frame iframe { width: 100%; height: 100%; border: 0; display: block; }
  .bb-drop-link-fallback {
    display: flex; height: 100%; align-items: center; justify-content: center;
    color: var(--accent-orange); text-decoration: none; font-size: 14px;
  }
  .bb-drop-meta { display: flex; gap: 8px; align-items: center; flex-shrink: 0; flex-wrap: wrap; }
  .bb-drop-source { font-size: 9.5px; background: var(--bg-active); color: var(--text-secondary); padding: 3px 7px; border-radius: 5px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; }
  .bb-drop-artist-tag { font-size: 11px; color: var(--text-muted); }
  .bb-drop-caption-inline { font-size: 12px; color: var(--text-secondary); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* Summary */
  .bb-summary-screen .bb-stage-main { gap: 14px; overflow-y: auto; padding-top: 24px; }
  .bb-summary-score { text-align: center; padding: 10px 0; }
  .bb-section-label {
    font-size: 10.5px; color: var(--text-faint); text-transform: uppercase;
    letter-spacing: 1.5px; font-weight: 600; margin-bottom: 8px;
  }
  .bb-clips-row {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 6px;
  }
  .bb-clip-thumb {
    aspect-ratio: 9/12; border-radius: 8px; overflow: hidden; background: var(--bg-elevated);
    border: 1px solid var(--border-default); cursor: pointer; padding: 0;
    position: relative; transition: all .15s;
  }
  .bb-clip-thumb:hover { border-color: var(--accent-orange); transform: translateY(-1px); }
  .bb-clip-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .bb-clip-fallback {
    width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
    color: var(--text-muted); font-size: 24px;
  }
  .bb-clip-share {
    position: absolute; bottom: 6px; right: 6px; width: 22px; height: 22px;
    background: rgba(0,0,0,0.65); color: white; border-radius: 50%;
    font-size: 11px; display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(4px);
  }
  .bb-xp-big {
    font-family: 'Outfit', system-ui, sans-serif;
    font-size: 36px; font-weight: 900; letter-spacing: -1.5px; line-height: 1;
    background: linear-gradient(90deg, var(--accent-orange), var(--accent-link));
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .bb-xp-label { font-size: 10px; color: var(--text-muted); margin: 4px 0 10px; text-transform: uppercase; letter-spacing: 1.4px; }
  .bb-streak-result { font-size: 13px; color: var(--accent-orange); font-weight: 700; }

  .bb-recap-list { display: flex; flex-direction: column; gap: 6px; }
  .bb-recap-row { display: flex; align-items: center; gap: 10px; background: var(--card-bg); border: 1px solid var(--border-default); border-radius: 10px; padding: 8px 12px; text-decoration: none; color: inherit; }
  .bb-recap-link:hover { background: var(--card-hover); border-color: var(--accent-orange); }
  .bb-recap-icon { width: 44px; height: 44px; border-radius: 8px; background: var(--bg-elevated); display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0; overflow: hidden; }
  .bb-recap-icon img { width: 100%; height: 100%; object-fit: cover; }
  .bb-recap-accent-green { background: rgba(34,197,94,0.18); color: var(--accent-green); }
  .bb-recap-accent-orange { background: rgba(249,115,22,0.18); color: var(--accent-orange); }
  .bb-recap-text { flex: 1; min-width: 0; }
  .bb-recap-main { font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bb-recap-sub { font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bb-recap-arrow { color: var(--text-faint); font-size: 18px; flex-shrink: 0; }

  .bb-save-trap { background: linear-gradient(135deg, rgba(249,115,22,0.06), rgba(29,78,216,0.04)); border: 1px dashed rgba(249,115,22,0.4); border-radius: 14px; padding: 14px; }
  .bb-save-streak-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .bb-save-streak-num { font-family: 'Outfit', system-ui, sans-serif; font-size: 24px; font-weight: 900; line-height: 1; background: linear-gradient(90deg, var(--accent-orange), #fbbf24); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .bb-save-streak-label { font-size: 12.5px; font-weight: 700; }
  .bb-save-streak-sub { font-size: 11px; color: var(--text-muted); }
  .bb-save-trap-warning { font-size: 12px; color: var(--text-secondary); margin-bottom: 10px; line-height: 1.45; }
  .bb-save-trap-warning strong { color: var(--accent-orange); }

  .bb-return-cta { text-align: center; padding: 8px; color: var(--text-muted); font-size: 12px; }

  /* Track quick modal (summary thumbnails) */
  .bb-track-modal-backdrop {
    position: fixed; inset: 0; z-index: 100;
    background: rgba(0,0,0,0.7); backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center;
    padding: 20px; animation: bbOverlayIn 0.2s ease-out;
  }
  .bb-track-modal {
    background: var(--bg-surface); border: 1px solid var(--border-default);
    border-radius: 16px; max-width: 440px; width: 100%; overflow: hidden;
    position: relative; max-height: 90dvh; display: flex; flex-direction: column;
  }
  .bb-track-modal-close {
    position: absolute; top: 10px; right: 10px; z-index: 2;
    width: 32px; height: 32px; border-radius: 50%;
    background: rgba(0,0,0,0.5); backdrop-filter: blur(8px);
    border: none; color: white; font-size: 22px; cursor: pointer;
    display: flex; align-items: center; justify-content: center; line-height: 1;
  }
  .bb-track-modal-embed { aspect-ratio: 16/9; background: black; }
  .bb-track-modal-embed iframe { width: 100%; height: 100%; border: 0; display: block; }
  .bb-track-modal-cover { width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; }
  .bb-track-modal-info { padding: 14px 16px 8px; }
  .bb-track-modal-artist { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 2px; }
  .bb-track-modal-title { font-family: 'Outfit', system-ui, sans-serif; font-size: 18px; font-weight: 800; }
  .bb-track-modal-cta {
    display: block; padding: 14px 16px; margin-top: auto;
    color: var(--accent-orange); font-size: 13px; font-weight: 600;
    text-decoration: none; border-top: 1px solid var(--border-default);
    text-align: center;
  }
  .bb-track-modal-cta:hover { background: var(--card-hover); }

  /* Mobile narrowing */
  @media (max-width: 380px) {
    .bb-question { font-size: 17px; }
    .bb-reaction-emoji { font-size: 26px; }
  }
`
