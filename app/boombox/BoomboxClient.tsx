'use client'

// app/boombox/BoomboxClient.tsx
//
// Boombox wizard'as: linijinis flow per 3 misijas + drops + summary.
// State machine: 'landing' → 'image' → 'duel' → 'verdict' → 'drops' → 'summary'
//
// Stilius: naudoja site CSS variables (--bg-body, --accent-orange, etc.) — be
// custom dark mode'o, kad atrodytų kaip native music.lt dalis.

import { useEffect, useMemo, useState } from 'react'
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
  { emoji: '😭', label: 'taip gerai' },
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

export default function BoomboxClient(props: Props) {
  const { image, duel, verdict, videos, completions: initialCompletions, streak: initialStreak } = props

  // Determine starting stage: skip missions already completed.
  const initialStage: Stage = useMemo(() => {
    if (image && !initialCompletions.image) return 'landing'
    if (duel && !initialCompletions.duel) return 'landing'
    if (verdict && !initialCompletions.verdict) return 'landing'
    return 'drops'
  }, [image, duel, verdict, initialCompletions])

  const [stage, setStage] = useState<Stage>(initialStage)
  const [streak, setStreak] = useState(initialStreak)
  const [sessionXp, setSessionXp] = useState(0)

  // Per-mission state
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

  const noContent = !image && !duel && !verdict && videos.length === 0

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

  function handleImagePick(option: ImageDrop['options'][number]) {
    if (!image || imageGuess.pickedTrackId !== null) return
    const isCorrect = option.id === image.correct.id
    setImageGuess({ pickedTrackId: option.id, isCorrect, stats: null })
    submit('image_guess', image.id, { choice: option.id }, { guessTrackId: option.id }).then(j => {
      if (j?.stats) setImageGuess(s => ({ ...s, stats: j.stats }))
    })
    setTimeout(() => setStage('duel'), 2800)
  }

  function handleDuelPick(pick: 'A' | 'B' | 'skip') {
    if (!duel || duelChoice.pick !== null) return
    setDuelChoice({ pick, stats: null })
    submit('duel', duel.id, { choice: pick }).then(j => {
      if (j?.stats) setDuelChoice(s => ({ ...s, stats: j.stats }))
    })
    setTimeout(() => setStage('verdict'), 2800)
  }

  function handleVerdictPick(emoji: string) {
    if (!verdict || verdictPick.emoji !== null) return
    setVerdictPick({ emoji, stats: null })
    submit('verdict', verdict.id, { emoji }).then(j => {
      if (j?.stats) setVerdictPick(s => ({ ...s, stats: j.stats }))
    })
    setTimeout(() => setStage('drops'), 2800)
  }

  function handleVideoReaction(videoId: number, emoji: string) {
    if (videoReactions[videoId]) return
    setVideoReactions(prev => ({ ...prev, [videoId]: emoji }))
    submit('video_react', videoId, { emoji })
  }

  // ─── Render ───
  return (
    <div style={{ background: 'var(--bg-body)', color: 'var(--text-primary)', minHeight: '100vh' }}>
      <style>{boomboxCss}</style>

      <div className="bb-container">
        {stage === 'landing' && (
          <Landing
            streak={streak}
            hasContent={!noContent}
            onStart={() => {
              if (image && !imageGuess.pickedTrackId) setStage('image')
              else if (duel && !duelChoice.pick) setStage('duel')
              else if (verdict && !verdictPick.emoji) setStage('verdict')
              else setStage('drops')
            }}
          />
        )}

        {stage === 'image' && image && (
          <ImageGuessStage
            drop={image}
            picked={imageGuess.pickedTrackId}
            isCorrect={imageGuess.isCorrect}
            stats={imageGuess.stats}
            onPick={handleImagePick}
            onSkip={() => setStage('duel')}
          />
        )}

        {stage === 'duel' && duel && (
          <DuelStage
            drop={duel}
            picked={duelChoice.pick}
            stats={duelChoice.stats}
            onPick={handleDuelPick}
            onSkip={() => setStage('verdict')}
          />
        )}

        {stage === 'verdict' && verdict && (
          <VerdictStage
            drop={verdict}
            picked={verdictPick.emoji}
            stats={verdictPick.stats}
            onPick={handleVerdictPick}
            onSkip={() => setStage('drops')}
          />
        )}

        {stage === 'drops' && (
          <DropsStage
            videos={videos}
            reactions={videoReactions}
            onReact={handleVideoReaction}
            onContinue={() => setStage('summary')}
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
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
            <p>Šiandien dar niekas nepublikuota.</p>
            <p style={{ fontSize: 13, marginTop: 8 }}>Grįžk vėliau arba <Link href="/" style={{ color: 'var(--accent-orange)' }}>pagrindinis puslapis</Link>.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Landing ───

function Landing({ streak, hasContent, onStart }: { streak: any; hasContent: boolean; onStart: () => void }) {
  return (
    <>
      <div className="bb-topbar">
        <Link href="/" className="bb-logo">music.lt</Link>
        {streak.current > 0 && (
          <span className="bb-streak-pill">
            <span style={{ marginRight: 4 }}>🔥</span>
            {streak.current} d. iš eilės
          </span>
        )}
      </div>

      <div className="bb-landing">
        <div className="bb-brand">BOOMBOX</div>

        <div className="bb-equalizer">
          {[40, 75, 55, 95, 68, 50, 80].map((h, i) => (
            <div key={i} className="bb-eq-bar" style={{ height: `${h}%`, animationDelay: `${i * 0.12}s` }} />
          ))}
        </div>

        <div className="bb-day-info">
          <div className="bb-day-title">Šiandien — 3 misijos</div>
          <div className="bb-day-sub">~2 minutės · po jų — drop'ai</div>
        </div>

        <button className="bb-btn-primary" onClick={onStart} disabled={!hasContent}>
          {hasContent ? 'Pradėti' : 'Nieko šiandien'}
        </button>
      </div>
    </>
  )
}

// ─── Image Guess ───

function ImageGuessStage({ drop, picked, isCorrect, stats, onPick, onSkip }: {
  drop: ImageDrop
  picked: number | null
  isCorrect: boolean | null
  stats: any
  onPick: (opt: ImageDrop['options'][number]) => void
  onSkip: () => void
}) {
  const correctOpt = drop.options.find(o => o.isCorrect)!

  return (
    <>
      <ProgressTopbar step={1} />
      <div className="bb-mission-tag">misija · atspėk dainą</div>
      <div className="bb-mission-headline">Kuri daina paslėpta vaizde?</div>

      <div className="bb-ai-image">
        <img src={drop.image_url} alt="AI sugeneruotas vaizdas" loading="lazy" />
      </div>
      <div className="bb-ai-label">ai sugeneruotas vaizdas</div>

      <div>
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
              ].join(' ')}
              onClick={() => onPick(opt)}
              disabled={picked !== null}
            >
              <div className="bb-answer-artist">{opt.artist}</div>
              <div className="bb-answer-song">{opt.title}</div>
            </button>
          )
        })}
      </div>

      {picked !== null && (
        <div className="bb-reveal" onClick={onSkip}>
          <div className={isCorrect ? 'bb-reveal-status bb-correct-text' : 'bb-reveal-status bb-wrong-text'}>
            {isCorrect ? '✓ Teisingai' : '✗ Beveik'}
          </div>
          <div className="bb-reveal-stat">
            {correctOpt.artist} · {correctOpt.title}
            {stats?.correctPct !== null && stats?.correctPct !== undefined ? ` · atspėjo ${stats.correctPct}%` : ''}
          </div>
          <div className="bb-progress-track"><div className="bb-progress-fill" /></div>
          <div className="bb-auto-hint">tap, kad peršokti</div>
        </div>
      )}
    </>
  )
}

// ─── Duel ───

function DuelStage({ drop, picked, stats, onPick, onSkip }: {
  drop: DuelDrop
  picked: 'A' | 'B' | 'skip' | null
  stats: any
  onPick: (p: 'A' | 'B' | 'skip') => void
  onSkip: () => void
}) {
  const [playing, setPlaying] = useState<'A' | 'B' | null>(null)

  const ytA = youtubeIdFromUrl(drop.track_a.video_url)
  const ytB = youtubeIdFromUrl(drop.track_b.video_url)

  function togglePlay(which: 'A' | 'B') {
    setPlaying(prev => (prev === which ? null : which))
  }

  return (
    <>
      <ProgressTopbar step={2} />
      <div className="bb-duel-tag">{MATCHUP_LABEL[drop.matchup_type]}</div>
      <div className="bb-duel-hint">tap kortelę — balsuoji už ją · tap ▶ — paklausai</div>

      {(['A', 'B'] as const).map(which => {
        const t = which === 'A' ? drop.track_a : drop.track_b
        const yt = which === 'A' ? ytA : ytB
        const isPicked = picked === which
        const isOtherPicked = picked && picked !== which
        return (
          <div
            key={which}
            className={[
              'bb-vote-card',
              isPicked ? 'bb-voted' : '',
              isOtherPicked ? 'bb-dimmed' : '',
              playing === which ? 'bb-expanded' : '',
            ].join(' ')}
          >
            <div className="bb-vote-row" onClick={() => picked === null && onPick(which)}>
              <div className={`bb-thumb bb-thumb-${which.toLowerCase()}`}>
                {t.cover_url ? <img src={proxyImg(t.cover_url)} alt="" /> : which}
              </div>
              <div className="bb-track-info">
                <div className="bb-track-title">{t.title}</div>
                <div className="bb-track-artist">{t.artist}</div>
              </div>
              <button
                className="bb-play-btn"
                onClick={(e) => { e.stopPropagation(); togglePlay(which) }}
              >
                {playing === which ? '⏸' : '▶'}
              </button>
            </div>
            {playing === which && yt && (
              <div className="bb-vote-embed">
                <iframe
                  src={`https://www.youtube.com/embed/${yt}?autoplay=1&rel=0&modestbranding=1`}
                  allow="encrypted-media; autoplay"
                  allowFullScreen
                />
              </div>
            )}
          </div>
        )
      })}

      {picked === null && (
        <div className="bb-skip-link" onClick={() => onPick('skip')}>nei viena</div>
      )}

      {picked !== null && (
        <div className="bb-reveal" onClick={onSkip}>
          {stats && (
            <div className="bb-reveal-stat">
              {(() => {
                const total = stats.total || 0
                const a = stats.choiceDistribution?.A || 0
                const b = stats.choiceDistribution?.B || 0
                const s = stats.choiceDistribution?.skip || 0
                if (total === 0) return 'Tu pirmas šiandien balsuoji'
                const pa = Math.round((a / total) * 100)
                const pb = Math.round((b / total) * 100)
                if (pa === pb) return `Lyguma — ${pa}% už A · ${pb}% už B`
                if (pa > pb) return `${pa}% rinkosi A · ${pb}% B`
                return `${pb}% rinkosi B · ${pa}% A`
              })()}
            </div>
          )}
          <div className="bb-progress-track"><div className="bb-progress-fill" /></div>
          <div className="bb-auto-hint">tap, kad peršokti</div>
        </div>
      )}
    </>
  )
}

// ─── Verdict ───

function VerdictStage({ drop, picked, stats, onPick, onSkip }: {
  drop: VerdictDrop
  picked: string | null
  stats: any
  onPick: (emoji: string) => void
  onSkip: () => void
}) {
  const [playing, setPlaying] = useState(false)
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
    <>
      <ProgressTopbar step={3} />
      <div className="bb-mission-tag">misija · dienos verdiktas</div>
      <div className="bb-mission-headline">Kaip jauti šitą?</div>

      <div className="bb-verdict-song">
        <div className="bb-thumb bb-thumb-c">
          {drop.track.cover_url ? <img src={proxyImg(drop.track.cover_url)} alt="" /> : '🎵'}
        </div>
        <div className="bb-track-info">
          <div className="bb-track-title">{drop.track.title}</div>
          <div className="bb-track-artist">{drop.track.artist}</div>
        </div>
        <button className="bb-play-btn" onClick={() => setPlaying(p => !p)}>
          {playing ? '⏸' : '▶'}
        </button>
      </div>
      {playing && yt && (
        <div className="bb-verdict-embed">
          <iframe
            src={`https://www.youtube.com/embed/${yt}?autoplay=1&rel=0&modestbranding=1`}
            allow="encrypted-media; autoplay"
            allowFullScreen
          />
        </div>
      )}

      <div className="bb-emoji-grid">
        {VERDICT_EMOJIS.map(({ emoji, label }) => (
          <button
            key={emoji}
            className={['bb-emoji-btn', picked === emoji ? 'bb-emoji-selected' : ''].join(' ')}
            onClick={() => onPick(emoji)}
            disabled={picked !== null}
            title={label}
          >
            {emoji}
          </button>
        ))}
      </div>

      {picked !== null && (
        <div className="bb-reveal" onClick={onSkip}>
          <div className="bb-reveal-stat">
            {topEmoji
              ? <>Bendruomenė šiandien dažniausiai — <strong style={{ color: 'var(--accent-orange)' }}>{topEmoji.emoji} ({topEmoji.pct}%)</strong></>
              : 'Tu pirmas balsuoji šiandien'}
          </div>
          <div className="bb-progress-track"><div className="bb-progress-fill" /></div>
          <div className="bb-auto-hint">tap, kad peršokti</div>
        </div>
      )}
    </>
  )
}

// ─── Drops ───

function DropsStage({ videos, reactions, onReact, onContinue }: {
  videos: VideoDrop[]
  reactions: Record<number, string>
  onReact: (id: number, emoji: string) => void
  onContinue: () => void
}) {
  return (
    <>
      <div className="bb-drops-header">
        <div className="bb-unlock-icon">🔓</div>
        <div className="bb-drops-title">Šiandienos drop'ai</div>
        <div className="bb-drops-sub">{videos.length || 0} video — kuris labiausiai uzstrige?</div>
      </div>

      {videos.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          Šiandien drop'ų dar nepublikuota.
        </div>
      )}

      {videos.map(v => {
        const reacted = reactions[v.id]
        const embedUrl = embedUrlFor(v)
        return (
          <div className="bb-drop-card" key={v.id}>
            <div className="bb-drop-video">
              {embedUrl ? (
                <iframe
                  src={embedUrl}
                  allow="encrypted-media"
                  allowFullScreen
                />
              ) : (
                <a href={v.source_url} target="_blank" rel="noopener noreferrer" className="bb-drop-link-fallback">
                  Atidaryti {v.source}
                </a>
              )}
            </div>
            <div className="bb-drop-meta">
              <span className="bb-drop-source">{v.source}</span>
              {v.related_artist && <span className="bb-drop-artist-tag">→ {v.related_artist.name}</span>}
            </div>
            <div className="bb-drop-caption">{v.caption}</div>
            <div className="bb-drop-reactions">
              {DROP_REACTIONS.map(({ emoji, label }) => (
                <button
                  key={emoji}
                  className={['bb-drop-reaction', reacted === emoji ? 'bb-drop-react-selected' : ''].join(' ')}
                  onClick={() => onReact(v.id, emoji)}
                  disabled={!!reacted}
                >
                  {emoji}
                  <span className="bb-drop-react-label">{label}</span>
                </button>
              ))}
            </div>
          </div>
        )
      })}

      <button className="bb-btn-primary" onClick={onContinue} style={{ marginTop: 16 }}>
        Pamatyti rezultatus →
      </button>
    </>
  )
}

function embedUrlFor(v: VideoDrop): string | null {
  if (v.embed_id) {
    if (v.source === 'shorts' || v.source === 'youtube') {
      return `https://www.youtube.com/embed/${v.embed_id}?rel=0&modestbranding=1`
    }
    if (v.source === 'tiktok') {
      return `https://www.tiktok.com/embed/v2/${v.embed_id}`
    }
    if (v.source === 'reels') {
      return `https://www.instagram.com/reel/${v.embed_id}/embed`
    }
  }
  // Fallback: parse YouTube ID from URL
  const yt = youtubeIdFromUrl(v.source_url)
  if (yt) return `https://www.youtube.com/embed/${yt}?rel=0&modestbranding=1`
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
    <>
      <div className="bb-topbar">
        <span className="bb-logo-mini">boombox · šiandien</span>
        <span className="bb-step-counter" style={{ color: 'var(--accent-orange)' }}>+{sessionXp} XP</span>
      </div>

      <div className="bb-summary-card">
        <div className="bb-xp-big">+{sessionXp}</div>
        <div className="bb-xp-label">XP uždirbta</div>
        {streak.current > 0 && <div className="bb-streak-result">🔥 {streak.current} dienų streak'as</div>}
      </div>

      <div className="bb-section-title">tavo žingsniai</div>

      {results.image && (
        <RecapCard
          icon="🎯"
          title={results.image.isCorrect ? 'Atspėjai vaizdą' : 'Vaizdas — beveik'}
          sub={`${results.image.artist} — ${results.image.title}${results.image.stats?.correctPct !== null && results.image.stats?.correctPct !== undefined ? ` · ${results.image.stats.correctPct}% atspėjo` : ''}`}
        />
      )}

      {results.duel && (
        <RecapCard
          icon="⚔️"
          title={results.duel.pick === 'skip' ? 'Praleidai dvikovą' : `Balsavai už ${results.duel.pick}`}
          sub={
            (() => {
              const t = results.duel.stats
              if (!t || !t.total) return 'Tu pirmas balsuoji'
              const a = t.choiceDistribution?.A || 0
              const b = t.choiceDistribution?.B || 0
              const pa = Math.round((a / t.total) * 100)
              const pb = Math.round((b / t.total) * 100)
              return `${pa}% A · ${pb}% B`
            })()
          }
        />
      )}

      {results.verdict && (
        <RecapCard
          icon={results.verdict.emoji}
          title="Verdiktas paliktas"
          sub={`${results.verdict.track.artist} — ${results.verdict.track.title}`}
        />
      )}

      {results.videosWatched > 0 && (
        <RecapCard
          icon="📺"
          title={`${results.videosWatched} drop'ai`}
          sub="peržiūrėta šiandien"
        />
      )}

      {!isAuthenticated && (
        <div className="bb-save-trap">
          <div className="bb-save-streak-row">
            <div className="bb-save-streak-num">🔥 {streak.current}</div>
            <div>
              <div className="bb-save-streak-label">Tavo dienų streak'as</div>
              <div className="bb-save-streak-sub">prašaliečių režimu</div>
            </div>
          </div>
          <div className="bb-save-trap-warning">
            Streak'as <strong>dings</strong>, jei nesukursi profilio.
            Profilis užtruks ~15 sekundžių.
          </div>
          <div className="bb-save-trap-actions">
            <Link href="/auth/signin" className="bb-btn-primary" style={{ flex: 1, textAlign: 'center', textDecoration: 'none', display: 'block' }}>
              Susikurti profilį
            </Link>
          </div>
        </div>
      )}

      <div className="bb-return-cta">
        Rytoj <span style={{ color: 'var(--accent-orange)', fontWeight: 700 }}>8:00</span> — naujas drop'as 🔔
      </div>
    </>
  )
}

function RecapCard({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="bb-recap-card">
      <div className="bb-recap-icon">{icon}</div>
      <div className="bb-recap-text">
        <div className="bb-recap-main">{title}</div>
        <div className="bb-recap-sub">{sub}</div>
      </div>
    </div>
  )
}

// ─── Topbar ───

function ProgressTopbar({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="bb-topbar">
      <div className="bb-progress-dots">
        {[1, 2, 3].map(i => (
          <div key={i} className={['bb-dot', i <= step ? 'bb-dot-filled' : ''].join(' ')} />
        ))}
      </div>
      <span className="bb-step-counter">{step} / 3</span>
    </div>
  )
}

// ─── Styles ───

const boomboxCss = `
  .bb-container {
    max-width: 480px;
    margin: 0 auto;
    padding: 18px 16px 80px;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .bb-topbar {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 24px;
  }
  .bb-logo {
    font-size: 12px; color: var(--text-muted); letter-spacing: 3px;
    text-transform: uppercase; text-decoration: none; font-weight: 600;
  }
  .bb-logo-mini { font-size: 11.5px; color: var(--text-muted); letter-spacing: 2px; text-transform: uppercase; }
  .bb-streak-pill {
    background: var(--card-bg); border: 1px solid var(--border-default);
    color: var(--accent-orange); padding: 6px 12px; border-radius: 14px;
    font-size: 12px; font-weight: 600;
  }
  .bb-progress-dots { display: flex; gap: 6px; }
  .bb-dot { width: 28px; height: 4px; background: var(--border-default); border-radius: 2px; }
  .bb-dot-filled { background: var(--accent-orange); }
  .bb-step-counter { font-size: 12px; color: var(--text-muted); font-weight: 500; }

  /* Landing */
  .bb-landing { flex: 1; display: flex; flex-direction: column; justify-content: center; text-align: center; }
  .bb-brand {
    font-family: 'Outfit', system-ui, sans-serif;
    font-size: 56px; font-weight: 900; letter-spacing: -2px;
    background: linear-gradient(90deg, var(--accent-orange), var(--accent-link));
    -webkit-background-clip: text; background-clip: text; color: transparent;
    margin-bottom: 28px; line-height: 1;
  }
  .bb-equalizer { display: flex; justify-content: center; gap: 5px; margin-bottom: 40px; height: 60px; align-items: flex-end; }
  .bb-eq-bar {
    width: 8px; border-radius: 4px;
    background: linear-gradient(0deg, var(--accent-orange), #fbbf24);
    transform-origin: bottom; animation: bbEq 1.1s infinite ease-in-out;
  }
  @keyframes bbEq { 0%, 100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }
  .bb-day-info { margin-bottom: 30px; }
  .bb-day-title { font-family: 'Outfit', system-ui, sans-serif; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
  .bb-day-sub { font-size: 14px; color: var(--text-muted); margin-top: 6px; }

  .bb-btn-primary {
    background: var(--accent-orange); color: white; border: none;
    padding: 16px 28px; border-radius: 14px; font-size: 16px; font-weight: 700;
    cursor: pointer; width: 100%; transition: opacity .15s, transform .15s;
  }
  .bb-btn-primary:hover { opacity: 0.92; }
  .bb-btn-primary:active { transform: scale(0.98); }
  .bb-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Mission headers */
  .bb-mission-tag {
    font-size: 11px; color: var(--text-muted); letter-spacing: 2px;
    text-transform: uppercase; font-weight: 600; margin-bottom: 6px;
  }
  .bb-mission-headline {
    font-family: 'Outfit', system-ui, sans-serif;
    font-size: 22px; font-weight: 800; letter-spacing: -0.3px;
    margin-bottom: 22px; line-height: 1.2;
  }

  /* Image guess */
  .bb-ai-image {
    aspect-ratio: 1.1; border-radius: 18px; margin-bottom: 10px; overflow: hidden;
    background: var(--player-placeholder-bg);
  }
  .bb-ai-image img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .bb-ai-label {
    font-size: 10.5px; color: var(--text-faint); text-align: center;
    margin-bottom: 18px; letter-spacing: 1px; text-transform: uppercase;
  }
  .bb-answer-card {
    display: block; width: 100%; text-align: left;
    background: var(--card-bg); border: 1px solid var(--border-default);
    border-radius: 14px; padding: 13px 16px; margin-bottom: 8px;
    cursor: pointer; transition: all .2s;
    color: var(--text-primary); font-family: inherit;
  }
  .bb-answer-card:hover:not(:disabled) { background: var(--card-hover); }
  .bb-answer-card:disabled { cursor: default; }
  .bb-answer-card.bb-correct { border-color: var(--accent-green); background: rgba(34,197,94,0.08); }
  .bb-answer-card.bb-wrong { border-color: var(--accent-orange); background: rgba(249,115,22,0.06); opacity: 0.55; }
  .bb-answer-artist { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 2px; }
  .bb-answer-song { font-size: 16px; font-weight: 600; }

  /* Reveal */
  .bb-reveal {
    text-align: center; margin-top: 22px; cursor: pointer;
    animation: bbRevealIn 0.4s ease-out;
  }
  @keyframes bbRevealIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .bb-reveal-status { font-size: 20px; font-weight: 800; margin-bottom: 4px; }
  .bb-correct-text { color: var(--accent-green); }
  .bb-wrong-text { color: var(--accent-orange); }
  .bb-reveal-stat { font-size: 13.5px; color: var(--text-secondary); margin-bottom: 12px; }
  .bb-progress-track {
    height: 3px; background: var(--border-default); border-radius: 2px;
    margin: 12px auto 6px; max-width: 200px; overflow: hidden;
  }
  .bb-progress-fill {
    height: 100%; background: var(--accent-orange); border-radius: 2px;
    width: 0%; animation: bbProgressFill 2.8s linear forwards;
  }
  @keyframes bbProgressFill { from { width: 0%; } to { width: 100%; } }
  .bb-auto-hint { font-size: 10.5px; color: var(--text-faint); letter-spacing: 1px; text-transform: uppercase; }

  /* Duel */
  .bb-duel-tag {
    display: inline-block; background: rgba(249,115,22,0.12); color: var(--accent-orange);
    padding: 5px 12px; border-radius: 8px; font-size: 11px; font-weight: 700;
    letter-spacing: 1.4px; margin-bottom: 12px;
  }
  .bb-duel-hint { color: var(--text-faint); font-size: 11.5px; margin-bottom: 18px; }
  .bb-vote-card {
    background: var(--card-bg); border: 1px solid var(--border-default);
    border-radius: 16px; margin-bottom: 12px; overflow: hidden; cursor: pointer;
    transition: all .2s;
  }
  .bb-vote-card.bb-voted { border-color: var(--accent-orange); background: rgba(249,115,22,0.06); }
  .bb-vote-card.bb-dimmed { opacity: 0.4; }
  .bb-vote-row { padding: 12px; display: flex; align-items: center; gap: 12px; }
  .bb-thumb {
    width: 52px; height: 52px; border-radius: 10px; flex-shrink: 0; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    color: white; font-size: 20px; font-weight: 800;
    background: var(--player-placeholder-bg);
  }
  .bb-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .bb-thumb-a { background: linear-gradient(135deg, var(--accent-orange), #fbbf24); }
  .bb-thumb-b { background: linear-gradient(135deg, var(--accent-blue), var(--accent-link)); }
  .bb-thumb-c { background: linear-gradient(135deg, #4c1d95, var(--accent-orange)); }
  .bb-track-info { flex: 1; min-width: 0; }
  .bb-track-title {
    font-size: 15px; font-weight: 700; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis;
  }
  .bb-track-artist { font-size: 12.5px; color: var(--text-muted); margin-top: 2px; }
  .bb-play-btn {
    width: 38px; height: 38px; border-radius: 50%;
    background: rgba(249,115,22,0.15); border: 1px solid var(--accent-orange);
    color: var(--accent-orange); font-size: 12px; cursor: pointer; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
  }
  .bb-vote-embed { background: black; }
  .bb-vote-embed iframe {
    width: 100%; aspect-ratio: 16/9; border: 0; display: block;
  }
  .bb-skip-link {
    text-align: center; color: var(--text-faint); font-size: 12.5px;
    margin-top: 6px; cursor: pointer; text-decoration: underline;
  }

  /* Verdict */
  .bb-verdict-song {
    background: var(--card-bg); border: 1px solid var(--border-default);
    border-radius: 16px; padding: 12px; margin-bottom: 18px;
    display: flex; align-items: center; gap: 12px;
  }
  .bb-verdict-embed { background: black; border-radius: 12px; overflow: hidden; margin-bottom: 18px; }
  .bb-verdict-embed iframe { width: 100%; aspect-ratio: 16/9; border: 0; display: block; }
  .bb-emoji-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .bb-emoji-btn {
    aspect-ratio: 1; background: var(--card-bg); border: 1px solid var(--border-default);
    border-radius: 14px; font-size: 28px; cursor: pointer; transition: all .2s;
    display: flex; align-items: center; justify-content: center;
  }
  .bb-emoji-btn:hover:not(:disabled) { background: var(--card-hover); transform: scale(1.03); }
  .bb-emoji-btn:disabled { cursor: default; }
  .bb-emoji-selected {
    background: rgba(249,115,22,0.15) !important;
    border-color: var(--accent-orange) !important;
    transform: scale(1.05);
  }

  /* Drops */
  .bb-drops-header { text-align: center; margin-bottom: 20px; }
  .bb-unlock-icon { font-size: 44px; margin-bottom: 4px; }
  .bb-drops-title {
    font-family: 'Outfit', system-ui, sans-serif;
    font-size: 24px; font-weight: 900; letter-spacing: -0.5px;
    background: linear-gradient(90deg, var(--accent-orange), var(--accent-link));
    -webkit-background-clip: text; background-clip: text; color: transparent;
    margin-bottom: 4px;
  }
  .bb-drops-sub { font-size: 12.5px; color: var(--text-muted); }
  .bb-drop-card {
    background: var(--card-bg); border: 1px solid var(--border-default);
    border-radius: 16px; overflow: hidden; margin-bottom: 14px;
  }
  .bb-drop-video { aspect-ratio: 9/12; background: var(--player-placeholder-bg); position: relative; }
  .bb-drop-video iframe { width: 100%; height: 100%; border: 0; display: block; }
  .bb-drop-link-fallback {
    display: flex; height: 100%; align-items: center; justify-content: center;
    color: var(--accent-orange); text-decoration: none; font-size: 14px;
  }
  .bb-drop-meta { padding: 10px 14px 4px; display: flex; gap: 8px; align-items: center; }
  .bb-drop-source {
    font-size: 9.5px; background: var(--bg-active); color: var(--text-secondary);
    padding: 3px 8px; border-radius: 6px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;
  }
  .bb-drop-artist-tag { font-size: 11.5px; color: var(--text-muted); }
  .bb-drop-caption { padding: 0 14px 10px; font-size: 13.5px; font-weight: 600; line-height: 1.4; }
  .bb-drop-reactions { display: flex; justify-content: space-around; padding: 8px 14px 14px; }
  .bb-drop-reaction {
    background: transparent; border: none; font-size: 22px; cursor: pointer;
    padding: 4px 8px; border-radius: 10px; transition: all .2s;
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    color: var(--text-primary);
  }
  .bb-drop-reaction:disabled { opacity: 0.5; cursor: default; }
  .bb-drop-react-selected { background: rgba(249,115,22,0.18) !important; transform: scale(1.05); }
  .bb-drop-react-label { font-size: 9px; color: var(--text-faint); letter-spacing: 0.4px; }

  /* Summary */
  .bb-summary-card {
    background: linear-gradient(135deg, rgba(249,115,22,0.10), rgba(29,78,216,0.04));
    border: 1px solid rgba(249,115,22,0.22);
    border-radius: 18px; padding: 22px; text-align: center; margin-bottom: 20px;
  }
  .bb-xp-big {
    font-family: 'Outfit', system-ui, sans-serif;
    font-size: 40px; font-weight: 900; letter-spacing: -1.5px; line-height: 1;
    background: linear-gradient(90deg, var(--accent-orange), var(--accent-link));
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .bb-xp-label {
    font-size: 11px; color: var(--text-muted); margin: 6px 0 12px;
    text-transform: uppercase; letter-spacing: 1.4px;
  }
  .bb-streak-result { font-size: 14px; color: var(--accent-orange); font-weight: 600; }
  .bb-section-title {
    font-size: 10.5px; color: var(--text-faint); letter-spacing: 2px;
    text-transform: uppercase; margin: 12px 0 8px; font-weight: 600;
  }
  .bb-recap-card {
    display: flex; align-items: center; gap: 12px;
    background: var(--card-bg); border: 1px solid var(--border-default);
    border-radius: 14px; padding: 12px; margin-bottom: 8px;
  }
  .bb-recap-icon {
    width: 40px; height: 40px; flex-shrink: 0; border-radius: 10px;
    background: var(--bg-elevated); display: flex; align-items: center; justify-content: center; font-size: 20px;
  }
  .bb-recap-text { flex: 1; min-width: 0; }
  .bb-recap-main {
    font-size: 13.5px; font-weight: 700; margin-bottom: 2px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .bb-recap-sub { font-size: 11.5px; color: var(--text-muted); }

  .bb-save-trap {
    background: linear-gradient(135deg, rgba(249,115,22,0.06), rgba(29,78,216,0.04));
    border: 1px dashed rgba(249,115,22,0.4);
    border-radius: 16px; padding: 16px; margin-top: 16px;
  }
  .bb-save-streak-row { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
  .bb-save-streak-num {
    font-family: 'Outfit', system-ui, sans-serif;
    font-size: 28px; font-weight: 900; line-height: 1;
    background: linear-gradient(90deg, var(--accent-orange), #fbbf24);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .bb-save-streak-label { font-size: 13.5px; font-weight: 700; }
  .bb-save-streak-sub { font-size: 11.5px; color: var(--text-muted); margin-top: 2px; }
  .bb-save-trap-warning { font-size: 12.5px; color: var(--text-secondary); margin-bottom: 12px; line-height: 1.5; }
  .bb-save-trap-warning strong { color: var(--accent-orange); font-weight: 700; }
  .bb-save-trap-actions { display: flex; gap: 8px; }
  .bb-return-cta {
    text-align: center; margin-top: 16px; padding: 12px;
    color: var(--text-muted); font-size: 13px;
  }
`
