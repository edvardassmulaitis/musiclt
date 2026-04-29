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

const VERDICT_EMOJIS: Array<{ emoji: string; label: string }> = [
  { emoji: '🔥', label: 'banger' },
  { emoji: '😭', label: 'gerai' },
  { emoji: '🥶', label: 'cold' },
  { emoji: '✨', label: 'vibe' },
  { emoji: '👀', label: 'įdomu' },
  { emoji: '🌶️', label: 'aštru' },
  { emoji: '🥱', label: 'nuobodu' },
  { emoji: '🤡', label: 'cringe' },
]

const DROP_REACTIONS: Array<{ emoji: string; label: string }> = [
  { emoji: '🔥', label: 'veža' },
  { emoji: '😂', label: 'juokas' },
  { emoji: '🥱', label: 'nuobodu' },
  { emoji: '👎', label: 'ne' },
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

  // Wizard progress: how many missions done out of expected total
  const missionTotal = [image, duel, verdict].filter(Boolean).length
  const currentMissionIdx = stage === 'image' ? 1 : stage === 'duel' ? 2 : stage === 'verdict' ? 3 : 0

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
          onReact={handleVideoReaction}
          onSkip={() => {
            if (dropIdx + 1 < videos.length) setDropIdx(dropIdx + 1)
            else setStage('summary')
          }}
        />
      )}

      {stage === 'summary' && (
        <SummaryStage
          sessionXp={sessionXp}
          streak={streak}
          isAuthenticated={props.isAuthenticated}
          results={{
            image: image && imageGuess.pickedTrackId !== null
              ? { title: image.correct.title, artist: image.correct.artist, isCorrect: imageGuess.isCorrect, stats: imageGuess.stats }
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
        <Link href="/" className="bb-logo">music.lt</Link>
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
          {hasContent ? `Pradėti · ${missionCount} ${missionCount === 1 ? 'misija' : 'misijos'}${videoCount > 0 ? ` + ${videoCount} drop'ai` : ''}` : 'Šiandien tylu'}
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

// ─── Stage progress (full-width fill bar + step counter) ───

function StageHeader({ idx, total, label }: { idx: number; total: number; label?: string }) {
  const pct = total > 0 ? (idx / (total + 1)) * 100 : 0
  return (
    <header className="bb-topbar bb-topbar-stage">
      <div className="bb-progress-track-thin">
        <div className="bb-progress-fill-thin" style={{ width: `${Math.max(pct, 8)}%` }} />
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

          {picked !== null && (
            <ImageRevealOverlay
              isCorrect={isCorrect}
              correctTitle={drop.correct.title}
              correctArtist={drop.correct.artist}
              stats={stats}
            />
          )}
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
    </div>
  )
}

function ImageRevealOverlay({ isCorrect, correctTitle, correctArtist, stats }: {
  isCorrect: boolean | null
  correctTitle: string
  correctArtist: string
  stats: any
}) {
  return (
    <div className="bb-reveal-overlay">
      <div className={`bb-reveal-status ${isCorrect ? 'bb-correct-text' : 'bb-wrong-text'}`}>
        {isCorrect ? '✓ Teisingai' : '✗ Beveik'}
      </div>
      <div className="bb-reveal-track">
        {correctArtist} — {correctTitle}
      </div>
      {stats?.correctPct !== null && stats?.correctPct !== undefined && (
        <div className="bb-reveal-stat">atspėjo {stats.correctPct}% žmonių</div>
      )}
      <div className="bb-progress-track"><div className="bb-progress-fill" /></div>
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
        <div className="bb-duel-tag">{MATCHUP_LABEL[drop.matchup_type]}</div>
        <h1 className="bb-question">Kurią rinktum?</h1>

        <div className="bb-duel-grid">
          {(['A', 'B'] as const).map(which => {
            const t = which === 'A' ? drop.track_a : drop.track_b
            const yt = which === 'A' ? ytA : ytB
            const isPicked = picked === which
            const isOther = picked && picked !== which && picked !== 'skip'
            return (
              <div key={which} className={`bb-duel-card ${isPicked ? 'voted' : ''} ${isOther ? 'dimmed' : ''}`}>
                <div className="bb-duel-letter">{which}</div>
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
                <div className="bb-duel-info">
                  <div className="bb-duel-title">{t.title}</div>
                  <div className="bb-duel-artist">{t.artist}</div>
                </div>
                <button
                  className="bb-duel-vote"
                  onClick={() => onPick(which)}
                  disabled={picked !== null}
                >
                  {isPicked ? '✓ Pasirinkta' : 'Rinktis'}
                </button>
              </div>
            )
          })}
        </div>

        {picked === null && (
          <button className="bb-skip-link" onClick={() => onPick('skip')}>nei viena netinka</button>
        )}

        {picked !== null && (
          <DuelRevealOverlay picked={picked} stats={stats} drop={drop} />
        )}
      </main>
    </div>
  )
}

function DuelRevealOverlay({ picked, stats, drop }: { picked: 'A' | 'B' | 'skip'; stats: any; drop: DuelDrop }) {
  let body = 'Balsas užfiksuotas'
  if (stats) {
    const total = stats.total || 0
    const a = stats.choiceDistribution?.A || 0
    const b = stats.choiceDistribution?.B || 0
    if (total > 0) {
      const pa = Math.round((a / total) * 100)
      const pb = Math.round((b / total) * 100)
      const winner = pa > pb ? 'A' : pb > pa ? 'B' : null
      body = winner
        ? `${winner === 'A' ? pa : pb}% rinkosi ${winner === 'A' ? drop.track_a.title : drop.track_b.title}`
        : `Lygiomis: ${pa}% A · ${pb}% B`
    }
  }
  return (
    <div className="bb-reveal-overlay bb-reveal-bottom">
      <div className="bb-reveal-stat">{body}</div>
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
        <h1 className="bb-question">Šiandienos verdiktas</h1>

        <div className="bb-verdict-track-row">
          <div className="bb-thumb bb-thumb-c">
            {drop.track.cover_url ? <img src={proxyImg(drop.track.cover_url)} alt="" /> : '🎵'}
          </div>
          <div className="bb-verdict-track-info">
            <div className="bb-verdict-track-title">{drop.track.title}</div>
            <div className="bb-verdict-track-artist">{drop.track.artist}</div>
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

        <div className="bb-emoji-grid">
          {VERDICT_EMOJIS.map(({ emoji, label }) => (
            <button
              key={emoji}
              className={['bb-emoji-btn', picked === emoji ? 'bb-emoji-selected' : ''].filter(Boolean).join(' ')}
              onClick={() => onPick(emoji)}
              disabled={picked !== null}
              title={label}
            >
              {emoji}
            </button>
          ))}
        </div>

        {picked !== null && (
          <div className="bb-reveal-overlay bb-reveal-bottom">
            <div className="bb-reveal-stat">
              {topEmoji
                ? <>Bendruomenės top — <strong style={{ color: 'var(--accent-orange)' }}>{topEmoji.emoji} ({topEmoji.pct}%)</strong></>
                : <>Užfiksuota</>}
            </div>
            <div className="bb-progress-track"><div className="bb-progress-fill" /></div>
          </div>
        )}
      </main>
    </div>
  )
}

// ─── Drops (one video at a time, TikTok-style) ───

function DropsStage({ videos, currentIdx, reaction, onReact, onSkip }: {
  videos: VideoDrop[]
  currentIdx: number
  reaction: string | null
  onReact: (id: number, emoji: string) => void
  onSkip: () => void
}) {
  const v = videos[currentIdx]
  if (!v) return null
  const embedUrl = embedUrlFor(v)
  const total = videos.length

  return (
    <div className="bb-screen">
      <header className="bb-topbar bb-topbar-stage">
        <span className="bb-stage-tag">DROP&apos;AI</span>
        <span className="bb-step-counter">{currentIdx + 1} / {total}</span>
      </header>

      <main className="bb-stage-main">
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

        <div className="bb-drop-meta">
          <span className="bb-drop-source">{v.source}</span>
          {v.related_artist && <span className="bb-drop-artist-tag">→ {v.related_artist.name}</span>}
        </div>
        {v.caption && <div className="bb-drop-caption">{v.caption}</div>}

        <div className="bb-drop-reactions">
          {DROP_REACTIONS.map(({ emoji, label }) => (
            <button
              key={emoji}
              className={`bb-drop-reaction ${reaction === emoji ? 'selected' : ''}`}
              onClick={() => onReact(v.id, emoji)}
              disabled={!!reaction}
            >
              <span className="bb-drop-react-emoji">{emoji}</span>
              <span className="bb-drop-react-label">{label}</span>
            </button>
          ))}
        </div>

        {!reaction && (
          <button className="bb-skip-link" onClick={onSkip}>praleisti →</button>
        )}
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

function SummaryStage({ sessionXp, streak, isAuthenticated, results }: {
  sessionXp: number
  streak: { current: number; total_xp: number; longest: number }
  isAuthenticated: boolean
  results: any
}) {
  return (
    <div className="bb-screen bb-summary-screen">
      <header className="bb-topbar">
        <span className="bb-logo-mini">boombox · šiandien</span>
        <span style={{ fontSize: 13, color: 'var(--accent-orange)', fontWeight: 700 }}>+{sessionXp} XP</span>
      </header>

      <main className="bb-stage-main">
        <div className="bb-summary-card">
          <div className="bb-xp-big">+{sessionXp}</div>
          <div className="bb-xp-label">XP uždirbta</div>
          {streak.current > 0 && <div className="bb-streak-result">🔥 {streak.current} dienų streak&apos;as</div>}
        </div>

        <div className="bb-recap-list">
          {results.image && (
            <RecapRow icon={results.image.isCorrect ? '✓' : '✗'} title={results.image.isCorrect ? 'Atspėjai vaizdą' : 'Vaizdas — beveik'} sub={`${results.image.artist} — ${results.image.title}`} />
          )}
          {results.duel && (
            <RecapRow icon="⚔" title={results.duel.pick === 'skip' ? 'Praleidai dvikovą' : `Balsavai už ${results.duel.pick}`} sub={dueRecapSub(results.duel)} />
          )}
          {results.verdict && (
            <RecapRow icon={results.verdict.emoji} title="Verdiktas paliktas" sub={`${results.verdict.track.artist} — ${results.verdict.track.title}`} />
          )}
          {results.videosWatched > 0 && (
            <RecapRow icon="📺" title={`${results.videosWatched} drop'ai`} sub="peržiūrėta" />
          )}
        </div>

        {!isAuthenticated && streak.current > 0 && (
          <div className="bb-save-trap">
            <div className="bb-save-streak-row">
              <div className="bb-save-streak-num">🔥 {streak.current}</div>
              <div>
                <div className="bb-save-streak-label">Tavo dienų streak&apos;as</div>
                <div className="bb-save-streak-sub">prašaliečių režimu</div>
              </div>
            </div>
            <div className="bb-save-trap-warning">
              Streak&apos;as <strong>dings</strong>, jei nesukursi profilio.
            </div>
            <Link href="/auth/signin" className="bb-btn-primary">Susikurti profilį (~15s)</Link>
          </div>
        )}

        <div className="bb-return-cta">
          Rytoj <span style={{ color: 'var(--accent-orange)', fontWeight: 700 }}>8:00</span> — naujas drop&apos;as
        </div>
      </main>
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
  return `A — ${pa}% · B — ${pb}%`
}

function RecapRow({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="bb-recap-row">
      <div className="bb-recap-icon">{icon}</div>
      <div className="bb-recap-text">
        <div className="bb-recap-main">{title}</div>
        <div className="bb-recap-sub">{sub}</div>
      </div>
    </div>
  )
}

// ─── Styles ───

const boomboxCss = `
  .bb-root {
    position: fixed; inset: 0;
    overflow: hidden;
    display: flex; justify-content: center;
  }

  .bb-screen {
    width: 100%; max-width: 480px;
    height: 100dvh;
    display: flex; flex-direction: column;
    padding: 14px 16px 20px;
    overflow: hidden;
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
    flex: 1; height: 3px; background: var(--border-default); border-radius: 2px; overflow: hidden;
  }
  .bb-progress-fill-thin {
    height: 100%; background: linear-gradient(90deg, var(--accent-orange), #fbbf24);
    border-radius: 2px; transition: width 0.4s cubic-bezier(.2,.8,.2,1);
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
    font-size: 22px; font-weight: 800; letter-spacing: -0.4px; line-height: 1.2;
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

  /* Reveal overlay — covers image area or sits on bottom */
  .bb-reveal-overlay {
    position: absolute; inset: 0; background: rgba(0,0,0,0.78); backdrop-filter: blur(14px);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 20px; gap: 8px; border-radius: 14px;
    animation: bbRevealIn 0.3s ease-out;
  }
  .bb-reveal-overlay.bb-reveal-bottom {
    inset: auto 0 0 0; height: auto;
    background: linear-gradient(transparent, rgba(0,0,0,0.85) 30%);
    border-radius: 0;
    padding: 24px 16px 16px;
  }
  @keyframes bbRevealIn { from { opacity: 0; } to { opacity: 1; } }
  .bb-reveal-status { font-family: 'Outfit', system-ui, sans-serif; font-size: 28px; font-weight: 800; }
  .bb-correct-text { color: var(--accent-green); }
  .bb-wrong-text { color: var(--accent-orange); }
  .bb-reveal-track { font-size: 16px; font-weight: 600; color: white; text-align: center; }
  .bb-reveal-stat { font-size: 13px; color: rgba(255,255,255,0.85); text-align: center; }
  .bb-progress-track {
    height: 2px; background: rgba(255,255,255,0.2); border-radius: 1px;
    margin: 12px auto 0; max-width: 200px; width: 100%; overflow: hidden;
  }
  .bb-progress-fill {
    height: 100%; background: var(--accent-orange); width: 0%;
    animation: bbProgressFill 2.5s linear forwards;
  }
  @keyframes bbProgressFill { from { width: 0%; } to { width: 100%; } }

  /* Duel */
  .bb-duel-tag {
    display: inline-block; align-self: flex-start;
    background: rgba(249,115,22,0.12); color: var(--accent-orange);
    padding: 4px 10px; border-radius: 6px; font-size: 10px; font-weight: 700; letter-spacing: 1.4px;
  }
  .bb-duel-grid { display: flex; flex-direction: column; gap: 10px; flex: 1; min-height: 0; }
  .bb-duel-card {
    background: var(--card-bg); border: 1px solid var(--border-default);
    border-radius: 14px; padding: 8px; display: grid;
    grid-template-columns: 32px 1fr auto; grid-template-rows: auto auto;
    grid-template-areas: 'letter embed embed' 'info info vote';
    gap: 8px; align-items: center;
    transition: all .2s;
  }
  .bb-duel-card.voted { border-color: var(--accent-orange); box-shadow: 0 0 0 2px rgba(249,115,22,0.25); }
  .bb-duel-card.dimmed { opacity: 0.4; }
  .bb-duel-letter { grid-area: letter; align-self: stretch; display: flex; align-items: center; justify-content: center;
    font-family: 'Outfit', system-ui, sans-serif; font-size: 22px; font-weight: 900; color: var(--accent-orange); }
  .bb-duel-embed { grid-area: embed; aspect-ratio: 16/9; border-radius: 10px; overflow: hidden; background: black; max-height: 22vh; }
  .bb-duel-embed iframe { width: 100%; height: 100%; border: 0; display: block; }
  .bb-duel-thumb { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: var(--bg-elevated); color: var(--text-muted); font-size: 24px; }
  .bb-duel-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .bb-duel-info { grid-area: info; min-width: 0; padding: 0 4px; }
  .bb-duel-title { font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bb-duel-artist { font-size: 11.5px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bb-duel-vote { grid-area: vote; background: var(--accent-orange); color: white; border: none; padding: 8px 14px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
  .bb-duel-vote:disabled { background: var(--bg-active); color: var(--text-muted); cursor: default; }

  .bb-skip-link {
    background: transparent; border: none; color: var(--text-faint);
    font-size: 12px; cursor: pointer; padding: 6px; text-decoration: underline;
    text-underline-offset: 3px; align-self: center; flex-shrink: 0;
  }

  /* Verdict */
  .bb-verdict-track-row {
    display: flex; align-items: center; gap: 12px;
    background: var(--card-bg); border: 1px solid var(--border-default);
    border-radius: 12px; padding: 10px;
  }
  .bb-thumb { width: 48px; height: 48px; border-radius: 10px; flex-shrink: 0; overflow: hidden; display: flex; align-items: center; justify-content: center; color: white; font-size: 18px; }
  .bb-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .bb-thumb-c { background: linear-gradient(135deg, #4c1d95, var(--accent-orange)); }
  .bb-verdict-track-info { flex: 1; min-width: 0; }
  .bb-verdict-track-title { font-size: 15px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bb-verdict-track-artist { font-size: 12px; color: var(--text-muted); }

  .bb-verdict-embed { border-radius: 12px; overflow: hidden; background: black; flex: 1; min-height: 0; max-height: 30vh; }
  .bb-verdict-embed iframe { width: 100%; height: 100%; border: 0; display: block; }

  .bb-emoji-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; flex-shrink: 0; }
  .bb-emoji-btn {
    aspect-ratio: 1; background: var(--card-bg); border: 1px solid var(--border-default);
    border-radius: 10px; font-size: 26px; cursor: pointer; transition: all .15s;
    display: flex; align-items: center; justify-content: center;
  }
  .bb-emoji-btn:active { transform: scale(0.92); }
  .bb-emoji-btn:disabled { cursor: default; }
  .bb-emoji-selected {
    background: rgba(249,115,22,0.18) !important;
    border-color: var(--accent-orange) !important;
    transform: scale(1.05);
  }

  /* Drops */
  .bb-drop-frame {
    flex: 1; min-height: 0; border-radius: 14px; overflow: hidden; background: black;
    position: relative;
  }
  .bb-drop-frame iframe { width: 100%; height: 100%; border: 0; display: block; }
  .bb-drop-link-fallback {
    display: flex; height: 100%; align-items: center; justify-content: center;
    color: var(--accent-orange); text-decoration: none; font-size: 14px;
  }
  .bb-drop-meta { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
  .bb-drop-source { font-size: 9.5px; background: var(--bg-active); color: var(--text-secondary); padding: 3px 7px; border-radius: 5px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; }
  .bb-drop-artist-tag { font-size: 11px; color: var(--text-muted); }
  .bb-drop-caption { font-size: 13px; font-weight: 600; line-height: 1.3; flex-shrink: 0; }
  .bb-drop-reactions { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; flex-shrink: 0; }
  .bb-drop-reaction {
    background: var(--card-bg); border: 1px solid var(--border-default);
    border-radius: 10px; padding: 8px 4px; cursor: pointer; color: var(--text-primary);
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    transition: all .15s;
  }
  .bb-drop-reaction:active { transform: scale(0.94); }
  .bb-drop-reaction:disabled { opacity: 0.5; cursor: default; }
  .bb-drop-reaction.selected { background: rgba(249,115,22,0.18); border-color: var(--accent-orange); }
  .bb-drop-react-emoji { font-size: 22px; }
  .bb-drop-react-label { font-size: 10px; color: var(--text-muted); }

  /* Summary */
  .bb-summary-screen .bb-stage-main { gap: 10px; overflow-y: auto; }
  .bb-summary-card {
    background: linear-gradient(135deg, rgba(249,115,22,0.10), rgba(29,78,216,0.04));
    border: 1px solid rgba(249,115,22,0.22);
    border-radius: 16px; padding: 18px; text-align: center;
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
  .bb-recap-row { display: flex; align-items: center; gap: 10px; background: var(--card-bg); border: 1px solid var(--border-default); border-radius: 10px; padding: 8px 12px; }
  .bb-recap-icon { width: 30px; height: 30px; border-radius: 8px; background: var(--bg-elevated); display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
  .bb-recap-main { font-size: 13px; font-weight: 700; }
  .bb-recap-sub { font-size: 11px; color: var(--text-muted); }

  .bb-save-trap { background: linear-gradient(135deg, rgba(249,115,22,0.06), rgba(29,78,216,0.04)); border: 1px dashed rgba(249,115,22,0.4); border-radius: 14px; padding: 14px; }
  .bb-save-streak-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .bb-save-streak-num { font-family: 'Outfit', system-ui, sans-serif; font-size: 24px; font-weight: 900; line-height: 1; background: linear-gradient(90deg, var(--accent-orange), #fbbf24); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .bb-save-streak-label { font-size: 12.5px; font-weight: 700; }
  .bb-save-streak-sub { font-size: 11px; color: var(--text-muted); }
  .bb-save-trap-warning { font-size: 12px; color: var(--text-secondary); margin-bottom: 10px; line-height: 1.45; }
  .bb-save-trap-warning strong { color: var(--accent-orange); }

  .bb-return-cta { text-align: center; padding: 8px; color: var(--text-muted); font-size: 12px; }

  /* Mobile narrowing */
  @media (max-width: 380px) {
    .bb-question { font-size: 18px; }
    .bb-emoji-btn { font-size: 22px; }
  }
`
