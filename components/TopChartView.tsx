'use client'

/* ──────────────────────────────────────────────────────────────────
 * Single TOP chart view — naudojama /top40 ir /top30 puslapiuose.
 *
 * Dizainas — light theme su CSS kintamaisiais (žr. globals.css).
 * Layout:
 *   - Header su title + week countdown + suggest CTA
 *   - Sticky info bar (savaitė + balsų likutis)
 *   - Two-column body: kairėje sąrašo eilutės, dešinėje YT preview
 * ────────────────────────────────────────────────────────────────── */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

type Artist = { id: number; slug: string; name: string; cover_image_url: string | null }
type Track = {
  id: number; slug: string; title: string;
  cover_url: string | null; spotify_id: string | null; video_url: string | null;
  artists: Artist | null
}
type Entry = {
  id: number; position: number; prev_position: number | null;
  weeks_in_top: number; total_votes: number; is_new: boolean;
  peak_position: number | null; tracks: Track | null
  // Legacy archyvo fallback (kai track dar neimportuotas į katalogą):
  artist_name?: string | null; title?: string | null; legacy_track_id?: number | null
}
type Week = {
  id: number; top_type: string; week_start: string;
  is_active: boolean; is_finalized?: boolean;
  vote_close?: string | null
}

// isFallback=true → rodom NE einamąją savaitę, o naujausią finalizuotą (legacy)
// archyvo savaitę. Balsavimas išjungtas, viršuje rodom žymą.
export type TopData = { entries: Entry[]; week: Week | null; isFallback?: boolean }

type ThemeAccent = {
  /** Solid hex color used for badges, hero accents */
  hex: string
  /** rgba string for soft glow / background tint */
  rgb: string
}

function getYouTubeId(url: string | null): string | null {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}

/**
 * Cover image fallback chain:
 *   1. YouTube thumbnail (jei video_url'as turi YT id)
 *   2. track.cover_url (jei track turi savo cover'į, pvz. albumo art)
 *   3. artist.cover_image_url (atlikėjo profilio nuotrauka)
 *   4. null (UI rodys ♪ iconą)
 */
function getCoverUrl(track: Track | null): string | null {
  if (!track) return null
  const ytId = getYouTubeId(track.video_url)
  if (ytId) return `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`
  if (track.cover_url) return track.cover_url
  if (track.artists?.cover_image_url) return track.artists.cover_image_url
  return null
}

function TrackCover({ track, size = 36 }: { track: Track | null; size?: number }) {
  const url = getCoverUrl(track)
  if (url) return <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
  return <span style={{ fontSize: size > 30 ? 14 : 12, color: 'var(--text-muted)' }}>♪</span>
}

// Vėliava header'yje (consistent su /topai). LT TOP 30 → LT vėliava;
// Music.lt TOP 40 (pasaulinis) → švari linijinė pasaulio ikona.
function Flag({ country }: { country: string | null }) {
  const cc = (country || '').toLowerCase()
  if (/^[a-z]{2}$/.test(cc))
    return <span className="tcv-pflag" style={{ backgroundImage: `url(https://flagcdn.com/w40/${cc}.png)` }} aria-hidden />
  return (
    <span className="tcv-pflag tcv-pflag-globe" aria-hidden>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M3.5 9.5h17M3.5 14.5h17" /><path d="M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18" /></svg>
    </span>
  )
}

function Countdown({ targetDate }: { targetDate: string }) {
  const [t, setT] = useState('')
  useEffect(() => {
    const calc = () => {
      const diff = new Date(targetDate).getTime() - Date.now()
      if (diff <= 0) { setT('Baigėsi'); return }
      const d = Math.floor(diff / 86400000)
      const h = Math.floor((diff % 86400000) / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      // Lietuviška forma: "5 d. 14 val." arba "14 val. 23 min."
      setT(d > 0 ? `${d} d. ${h} val.` : `${h} val. ${m} min.`)
    }
    calc()
    const id = setInterval(calc, 30000)
    return () => clearInterval(id)
  }, [targetDate])
  return <>{t}</>
}

function TrendIndicator({ curr, prev, isNew, weeksInTop }: {
  curr: number; prev: number | null; isNew: boolean; weeksInTop?: number
}) {
  // NEW jeigu: explicit is_new flag, prev_position null'as, ARBA šis yra
  // pirmoji savaitė tope (weeks_in_top === 1 — ką tik ką promoted'inta iš
  // newcomers'ių). Be to fallback'o net ir kai is_new flag'as nesutvarkytas
  // legacy duomenys atvaizduos teisingai.
  if (isNew || prev === null || weeksInTop === 1) {
    return <span className="tcv-new">NEW</span>
  }
  if (curr < prev) return <span className="tcv-up">↑{prev - curr}</span>
  if (curr > prev) return <span className="tcv-down">↓{curr - prev}</span>
  return <span className="tcv-same">—</span>
}

/**
 * Player — iOS Safari autoplay reliability:
 *
 * Vietoj useEffect+state+iframe-swap pattern'o (kuris "praranda" user-gesture
 * kontekstą tarp click'o ir iframe creation'o), sukuriam iframe SINKRONIŠKAI
 * pačiame click handler'yje. iOS Safari leidžia autoplay tik jei iframe
 * sukurtas TAME PAČIAME synchronous click event tick'e. Re-render'ai per
 * setState susiploja iki kelių mikrosekundžių, bet užtenka, kad Safari
 * pažymėtų video kaip "user-initiated".
 *
 * Tech: tiesiog įkrauname iframe su `?autoplay=1&playsinline=1` query'ais.
 * YT IFrame API nereikia (jis pridėjo įvairius race condition'us).
 */
function Player({ entry, accent }: { entry: Entry | null; accent: ThemeAccent }) {
  const [playing, setPlaying] = useState(false)
  const [imgErr, setImgErr] = useState(false)
  const slotRef = useRef<HTMLDivElement | null>(null)

  // Reset playing kai keičiasi entry
  useEffect(() => { setPlaying(false); setImgErr(false) }, [entry?.id])

  if (!entry || !entry.tracks) return (
    <div className="tcv-player tcv-player-empty">
      <div className="tcv-player-video">
        <div className="tcv-thumb">
          <div className="tcv-thumb-empty" />
        </div>
      </div>
    </div>
  )

  const vid = getYouTubeId(entry.tracks.video_url)
  const cover = entry.tracks.cover_url

  // Inline click handler — sukuriam iframe SINKRONIŠKAI (ne per useEffect),
  // kad Safari'ui užtikrinti user-gesture context'ą.
  const startPlay = () => {
    if (!vid || !slotRef.current) return
    const iframe = document.createElement('iframe')
    iframe.src = `https://www.youtube.com/embed/${vid}?autoplay=1&playsinline=1&rel=0&modestbranding=1`
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture'
    iframe.allowFullscreen = true
    iframe.style.width = '100%'
    iframe.style.height = '100%'
    iframe.style.border = '0'
    iframe.title = entry.tracks?.title || ''
    slotRef.current.innerHTML = ''
    slotRef.current.appendChild(iframe)
    setPlaying(true)
  }

  return (
    <div className="tcv-player">
      <div className="tcv-player-video">
        {/* slotRef visada montuotas — playing=true tik perjungia z-stack visibility */}
        <div
          ref={slotRef}
          style={{ width: '100%', height: '100%', display: playing ? 'block' : 'none' }}
        />
        {!playing && (
          <div className="tcv-thumb" onClick={startPlay} style={{ cursor: vid ? 'pointer' : 'default' }}>
            {vid && !imgErr ? (
              <img
                src={`https://img.youtube.com/vi/${vid}/maxresdefault.jpg`}
                alt=""
                className="tcv-thumb-img"
                onError={() => setImgErr(true)}
              />
            ) : cover ? (
              <img src={cover} alt="" className="tcv-thumb-img" />
            ) : (
              <div className="tcv-thumb-empty" />
            )}
            {vid && (
              <div className="tcv-play-btn" style={{ background: accent.hex }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SuggestModal({ onClose, topType }: { onClose: () => void; topType: string }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [manualTitle, setManualTitle] = useState('')
  const [manualArtist, setManualArtist] = useState('')
  const [mode, setMode] = useState<'search' | 'manual'>('search')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      // Master search (palaiko compound queries: artist+title kombinacijas)
      const res = await fetch(`/api/search-master?q=${encodeURIComponent(query)}&categories=tracks&limit=8`)
      const data = await res.json()
      const hits = data.results?.tracks || []
      // Hit struktūra: { id, title, subtitle (=artist name), image_url, ... }
      setResults(hits.map((h: any) => ({
        id: h.id,
        title: h.title,
        artist_name: h.subtitle,
        cover_url: h.image_url,
      })))
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const submit = async (trackId?: number) => {
    setSending(true)
    setError(null)
    const res = await fetch('/api/top/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        top_type: topType, track_id: trackId || null,
        manual_title: trackId ? null : manualTitle,
        manual_artist: trackId ? null : manualArtist,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) setSent(true)
    else setError(data?.error || 'Nepavyko išsiųsti pasiūlymo')
    setSending(false)
  }

  return (
    <div className="tcv-modal-bg" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tcv-modal">
        <div className="tcv-modal-head">
          <span>Siūlyti dainą</span>
          <button onClick={onClose} className="tcv-modal-close">✕</button>
        </div>
        {sent ? (
          <div className="tcv-modal-sent">
            <p className="tcv-sent-title">Pasiūlymas išsiųstas</p>
            <p className="tcv-sent-sub">Adminas peržiūrės artimiausiu metu.</p>
            <button onClick={onClose} className="tcv-btn-primary">Uždaryti</button>
          </div>
        ) : (
          <div className="tcv-modal-body">
            {error && (
              <div className="tcv-modal-error" role="alert">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{error}</span>
              </div>
            )}
            <div className="tcv-mode-tabs">
              {(['search', 'manual'] as const).map(m => (
                <button key={m} onClick={() => { setMode(m); setError(null) }} className={`tcv-mode-tab${mode === m ? ' active' : ''}`}>
                  {m === 'search' ? 'Ieškoti' : 'Įvesti rankiniu'}
                </button>
              ))}
            </div>
            {mode === 'search' ? (
              <div>
                <input
                  type="text" value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="Dainos pavadinimas arba atlikėjas…"
                  className="tcv-input" autoFocus
                />
                {results.length > 0 && (
                  <div className="tcv-results">
                    {results.map((t: any) => (
                      <button key={t.id} onClick={() => submit(t.id)} disabled={sending} className="tcv-result-row">
                        <div className="tcv-result-cover">
                          {t.cover_url ? <img src={t.cover_url} alt="" /> : '♪'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                          <p className="tcv-result-title">{t.title}</p>
                          <p className="tcv-result-artist">{t.artist_name || t.artists?.name}</p>
                        </div>
                        <span className="tcv-result-cta">Siūlyti</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="tcv-manual">
                <input type="text" value={manualTitle} onChange={e => setManualTitle(e.target.value)} placeholder="Dainos pavadinimas" className="tcv-input" />
                <input type="text" value={manualArtist} onChange={e => setManualArtist(e.target.value)} placeholder="Atlikėjas" className="tcv-input" />
                <button onClick={() => submit()} disabled={sending || !manualTitle || !manualArtist} className="tcv-btn-primary" style={{ opacity: (!manualTitle || !manualArtist) ? 0.4 : 1 }}>
                  {sending ? 'Siunčiama…' : 'Siųsti'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ChartRow({
  entry, isActive, weekId, accent, onClick, onVoted, onVoteFailed,
  votesPerTrack, votesRemaining, weeklyLimit, dimmed,
}: {
  entry: Entry; isActive: boolean; weekId: number;
  accent: ThemeAccent; onClick: () => void;
  onVoted: (id: number) => void;
  onVoteFailed: (id: number) => void;
  votesPerTrack: Record<number, number>;
  votesRemaining: number; weeklyLimit: number;
  dimmed?: boolean;
}) {
  const top3 = entry.position <= 3 && !dimmed
  return (
    <div
      className={`tcv-row${top3 ? ' top3' : ''}${isActive ? ' active' : ''}${dimmed ? ' dimmed' : ''}`}
      onClick={onClick}
    >
      <div className="tcv-pos-stack">
        <div className={`tcv-pos${top3 ? ' top' : ''}`}>{entry.position}</div>
        <div className="tcv-trend">
          <TrendIndicator
            curr={entry.position}
            prev={entry.prev_position}
            isNew={entry.is_new}
            weeksInTop={entry.weeks_in_top}
          />
        </div>
      </div>
      <div className="tcv-cover">
        <TrackCover track={entry.tracks} size={40} />
      </div>
      <div className="tcv-info">
        <span className="tcv-row-artist">{entry.tracks?.artists?.name ?? entry.artist_name ?? '—'}</span>
        <p className="tcv-row-title">{entry.tracks?.title ?? entry.title ?? '—'}</p>
        {entry.weeks_in_top >= 1 && (
          <WeeksProgress weeks={entry.weeks_in_top} accent={accent} />
        )}
      </div>
      {weekId > 0 && (
        <VoteButton
          entry={entry} weekId={weekId} accent={accent}
          onVoted={onVoted} onVoteFailed={onVoteFailed} votesPerTrack={votesPerTrack}
          votesRemaining={votesRemaining} weeklyLimit={weeklyLimit}
        />
      )}
    </div>
  )
}

/**
 * Weeks progress — 5 dash'iukai, kurių užpildymas auga maždaug kas 2 savaites.
 *   1-2 sav. → 1 / 5
 *   3-4 sav. → 2 / 5
 *   5-6 sav. → 3 / 5
 *   7-8 sav. → 4 / 5
 *   9-12 sav. → 5 / 5 (paskutinis cap)
 *
 * Spalva visada orange (accent) — be warning/critical color shifts.
 */
function WeeksProgress({ weeks, accent }: { weeks: number; accent: ThemeAccent }) {
  const totalSegments = 5
  const w = Math.max(weeks, 0)
  const filled = w === 0 ? 0 : Math.min(Math.ceil(w / 2), totalSegments)
  return (
    <span className="tcv-weeks-progress" title={`${w}/12 sav. tope`} role="progressbar" aria-valuemin={0} aria-valuemax={totalSegments} aria-valuenow={filled}>
      {Array.from({ length: totalSegments }, (_, i) => (
        <span
          key={i}
          className="tcv-week-dash"
          style={{ background: i < filled ? accent.hex : 'var(--bg-elevated)' }}
        />
      ))}
    </span>
  )
}

function NewcomerRow({
  entry, isActive, weekId, accent, onClick, onVoted, onVoteFailed,
  votesPerTrack, votesRemaining, weeklyLimit,
}: {
  entry: Entry; isActive: boolean; weekId: number;
  accent: ThemeAccent; onClick: () => void;
  onVoted: (id: number) => void;
  onVoteFailed: (id: number) => void;
  votesPerTrack: Record<number, number>;
  votesRemaining: number; weeklyLimit: number;
}) {
  return (
    <div
      className={`tcv-newcomer-row${isActive ? ' active' : ''}`}
      onClick={onClick}
    >
      <div className="tcv-newcomer-cover">
        <TrackCover track={entry.tracks} size={36} />
      </div>
      <div className="tcv-newcomer-info">
        <p className="tcv-newcomer-title">{entry.tracks?.title ?? entry.title ?? '—'}</p>
        <p className="tcv-newcomer-artist">{entry.tracks?.artists?.name ?? entry.artist_name ?? '—'}</p>
      </div>
      {weekId > 0 && (
        <VoteButton
          entry={entry} weekId={weekId} accent={accent}
          onVoted={onVoted} onVoteFailed={onVoteFailed} votesPerTrack={votesPerTrack}
          votesRemaining={votesRemaining} weeklyLimit={weeklyLimit}
        />
      )}
    </div>
  )
}

function VoteButton({
  entry, weekId, onVoted, onVoteFailed, votesPerTrack, accent, weeklyLimit,
}: {
  entry: Entry; weekId: number;
  onVoted: (id: number) => void;
  onVoteFailed: (id: number) => void;
  votesPerTrack: Record<number, number>;
  votesRemaining?: number;
  weeklyLimit: number;
  accent: ThemeAccent;
}) {
  const [err, setErr] = useState('')
  const [bursts, setBursts] = useState<number[]>([])
  const [boosting, setBoosting] = useState(false)
  const trackId = entry.tracks?.id ?? -1
  const songVotes = votesPerTrack[trackId] || 0
  const voted = songVotes > 0
  const maxedOut = songVotes >= weeklyLimit
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Lokalus skaitiklis ref'as — kad hold loop'as tiksliai žinotų current
  // count'ą BE async setState round-trip (kitaip persisočiame virš limit'o).
  const localVotesRef = useRef(songVotes)
  useEffect(() => { localVotesRef.current = songVotes }, [songVotes])

  const stopHold = () => {
    if (holdTimer.current) {
      clearInterval(holdTimer.current)
      holdTimer.current = null
    }
    setBoosting(false)
  }

  const sendVote = () => {
    // Naudoti REF, ne stale state — taip cap'inam tiksliai prie limit'o
    if (localVotesRef.current >= weeklyLimit || trackId < 0) return false
    localVotesRef.current += 1
    onVoted(trackId)
    const burstId = Date.now() + Math.random()
    setBursts(b => [...b, burstId])
    setTimeout(() => setBursts(b => b.filter(x => x !== burstId)), 700)

    fetch('/api/top/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track_id: trackId, week_id: weekId, vote_type: 'like' }),
    }).then(async (res) => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const msg = data?.error || `Klaida (${res.status})`
        console.error('[top-vote] POST failed', { status: res.status, error: msg, track_id: trackId, week_id: weekId })
        setErr(msg)
        setTimeout(() => setErr(''), 4000)
        // Server'is atmetė — koreguojam VISUS lokalus state'us atgal
        localVotesRef.current = Math.max(0, localVotesRef.current - 1)
        onVoteFailed(trackId)
      }
    }).catch((e) => {
      console.error('[top-vote] network error', e)
      setErr('Tinklo klaida')
      setTimeout(() => setErr(''), 4000)
      localVotesRef.current = Math.max(0, localVotesRef.current - 1)
      onVoteFailed(trackId)
    })

    // Limit pasiektas po šito balsavimo? Sustabdyk hold.
    if (localVotesRef.current >= weeklyLimit) stopHold()
    return true
  }

  const startHold = () => {
    holdTimer.current = setInterval(() => {
      const ok = sendVote()
      if (!ok) stopHold()
    }, 280)
    setTimeout(() => { if (holdTimer.current) setBoosting(true) }, 250)
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (maxedOut) return
    sendVote()
  }

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    if (maxedOut) return
    startHold()
  }
  const onPointerUp = () => stopHold()
  const onPointerLeave = () => stopHold()

  useEffect(() => () => stopHold(), [])

  return (
    <div className="tcv-vote-wrap" style={{ position: 'relative', flexShrink: 0 }}>
      {err && <div className="tcv-vote-err">{err}</div>}
      {bursts.map(id => (
        <div key={id} className="tcv-vote-burst" style={{ color: accent.hex }}>+1</div>
      ))}
      <button
        onClick={handleClick}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        onContextMenu={e => e.preventDefault()}
        disabled={maxedOut}
        className={`tcv-vote-btn${voted ? ' voted' : ''}${maxedOut ? ' maxed' : ''}${boosting ? ' boosting' : ''}`}
        style={{
          background: accent.hex,
          color: '#fff',
          borderColor: accent.hex,
        }}
        title={maxedOut ? `Pasiektas maks. (${weeklyLimit}) balsų` : 'Spausk arba palaikyk — iki ' + weeklyLimit}
      >
        {voted ? (
          <span className="tcv-vote-mine" aria-label="Tavo balsai">{songVotes}</span>
        ) : (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span className="tcv-vote-label">Balsuoti</span>
          </>
        )}
      </button>
    </div>
  )
}

export default function TopChartView({
  data,
  topType,
  title,
  subtitle,
  badge,
  accent,
  siblingHref,
  siblingLabel,
  archiveMode = false,
  backHref,
}: {
  data: TopData
  topType: 'top40' | 'lt_top30'
  title: string
  subtitle: string
  badge: string             // "TOP 40" / "LT TOP 30" — small label virš title
  accent: ThemeAccent
  siblingHref: string       // link to the other chart
  siblingLabel: string
  archiveMode?: boolean     // archyvo (konkrečios savaitės) peržiūra — read-only, kitokia žyma
  backHref?: string         // "← atgal" nuoroda (pvz. į /topai/archyvas)
}) {
  const { data: session } = useSession()
  const weeklyLimit = 10  // visiems vienodai (anon vs signed-in skirtumas — balso svoris finalize'e)
  const [votesPerTrack, setVotesPerTrack] = useState<Record<number, number>>({})
  const [votesRemaining, setVotesRemaining] = useState(weeklyLimit)
  const [showSuggest, setShowSuggest] = useState(false)
  const [activeEntry, setActiveEntry] = useState<Entry | null>(data.entries[0] ?? null)

  // Padalinam entries pagal state'ą. weeks_in_top yra primary skirstymo
  // kriterijus — semantika svarbesnė nei pozicija:
  //
  //   - Newcomers (NAUJIENOS): weeks_in_top = 0 — bet kokia pozicija. Daina
  //     ką tik atėjo iš pasiūlymų queue, kovoja už pirmą savaitę tope.
  //     Net jei jos pozicija šiuo metu > TOP_SIZE, ji vis tiek "naujiena",
  //     dar nepatekusi į topą. Iškrist'i jos negali — niekada nebuvo tope.
  //   - In top (TOP 1..N): weeks_in_top >= 1 IR position <= TOP_SIZE
  //   - Below (IŠKRITĘ IŠ TOPO): weeks_in_top >= 1 IR position > TOP_SIZE.
  //     Tik anksčiau buvusios tope dainos, šią savaitę nepatekusios.
  const TOP_SIZE = topType === 'top40' ? 40 : 30
  // Read-only kai rodom fallback (legacy archyvas) arba jau finalizuotą savaitę —
  // balsavimas tokioms savaitėms išjungtas (weekId=0 → VoteButton nerodomas).
  const readOnly = archiveMode || !!data.isFallback || !!data.week?.is_finalized
  const voteWeekId = readOnly ? 0 : (data.week?.id ?? 0)
  // Read-only (archyvo/finalizuotos) savaitės rodom kaip paprastą ranked sąrašą
  // pagal position — JOKIO newcomer/below skirstymo. Legacy entries dažnai turi
  // weeks_in_top=null, tad senasis split visus paverstų "naujienomis".
  const newcomers = readOnly ? [] : data.entries.filter(e => (e.weeks_in_top || 0) === 0)
  const mainTop = readOnly
    ? data.entries.filter(e => (e.position || 0) >= 1 && (e.position || 0) <= TOP_SIZE)
    : data.entries.filter(e => (e.weeks_in_top || 0) >= 1 && (e.position || 0) <= TOP_SIZE)
  const belowTop = readOnly ? [] : data.entries.filter(e =>
    (e.weeks_in_top || 0) >= 1 && (e.position || 0) > TOP_SIZE
  )

  useEffect(() => { setActiveEntry(data.entries[0] ?? null) }, [data])

  // 3-dots info popover state
  const [showInfo, setShowInfo] = useState(false)
  const infoRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!showInfo) return
    const onClick = (e: MouseEvent) => {
      if (infoRef.current && !infoRef.current.contains(e.target as Node)) setShowInfo(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [showInfo])

  const loadVoteStatus = useCallback(async () => {
    if (!data.week) return
    const res = await fetch(`/api/top/vote?week_id=${data.week.id}`)
    const d = await res.json()
    setVotesPerTrack(d.votes_per_track || {})
    setVotesRemaining(d.votes_remaining ?? weeklyLimit)
  }, [data.week?.id, weeklyLimit])  // eslint-disable-line

  useEffect(() => { loadVoteStatus() }, [loadVoteStatus])

  const handleVoted = (id: number) => {
    setVotesPerTrack(p => ({ ...p, [id]: (p[id] || 0) + 1 }))
    setVotesRemaining(p => Math.max(0, p - 1))
  }

  // Optimistic vote'as nepavyko serveryje — sumažinam local state'ą atgal,
  // kad pill nerodytų klaidingo skaičiaus. Anksčiau tik localVotesRef'as
  // sumažėdavo, bet votesPerTrack lik o inkrementuotas → pill meluodavo.
  const handleVoteFailed = (id: number) => {
    setVotesPerTrack(p => ({ ...p, [id]: Math.max(0, (p[id] || 0) - 1) }))
    setVotesRemaining(p => p + 1)
  }

  const weekLabel = useMemo(() => {
    if (!data.week) return null
    const d = new Date(data.week.week_start)
    const e = new Date(d); e.setDate(e.getDate() + 6)
    const fmt = (x: Date) => `${x.getDate()} ${x.toLocaleDateString('lt-LT', { month: 'short' })}`
    return `${fmt(d)} – ${fmt(e)}`
  }, [data.week])

  return (
    <>
      <style>{`
        .tcv-wrap {
          max-width: 1180px; margin: 0 auto; padding: 36px 20px 80px;
          color: var(--text-primary);
          /* overflow-x: clip clip'ina horizontaliai NEsukurdamas scroll
             container'io — tai svarbu, kad sticky vaikai (player'is) galėtų
             stick'inti relative to viewport, ne to .tcv-wrap. Senoji
             overflow-x: hidden vertė kūrė overflow context'ą ir lūždavo
             sticky pozicijos elgsena. */
          overflow-x: clip;
          box-sizing: border-box;
          width: 100%;
        }
        .tcv-wrap *, .tcv-wrap *::before, .tcv-wrap *::after { box-sizing: border-box; }
        /* Min-width 0 leidžia flex/grid vaikams traukti'is be horizontal overflow'o */
        .tcv-row, .tcv-newcomer-row, .tcv-info, .tcv-newcomer-info,
        .tcv-track-meta, .tcv-track-title, .tcv-newcomer-title,
        .tcv-newcomer-artist, .tcv-artist, .tcv-list, .tcv-list-wrap,
        .tcv-body, .tcv-sticky, .tcv-player, .tcv-newcomers-panel { min-width: 0; }

        /* Hero — title + countdown + actions visi vienoje row'oje */
        .tcv-hero {
          display: flex; align-items: center;
          gap: 12px; margin-bottom: 18px; flex-wrap: wrap;
        }
        .tcv-title {
          margin: 0; font-size: clamp(22px, 3.4vw, 32px); font-weight: 900;
          letter-spacing: -0.025em; line-height: 1.05; color: var(--text-primary);
          flex-shrink: 0;
        }
        .tcv-hero-actions {
          display: flex; align-items: center; gap: 6px;
          margin-left: auto; flex-shrink: 0;
        }
        .tcv-suggest-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 14px; border-radius: 10px;
          background: ${accent.hex}; color: #fff; border: none;
          font-size: 12px; font-weight: 700; cursor: pointer;
          flex-shrink: 0;
          transition: transform 0.15s, filter 0.15s;
        }
        .tcv-suggest-btn:hover { transform: translateY(-1px); filter: brightness(1.05); }

        /* 3-dots info button + popover */
        .tcv-info-wrap { position: relative; }
        .tcv-info-btn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 34px; height: 34px; border-radius: 10px;
          background: var(--bg-elevated); color: var(--text-secondary);
          border: 1px solid var(--border-subtle); cursor: pointer;
          transition: all 0.15s;
        }
        .tcv-info-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .tcv-info-popover {
          position: absolute; top: calc(100% + 6px); right: 0;
          width: 280px; padding: 14px 16px;
          background: var(--bg-surface); border: 1px solid var(--border-subtle);
          border-radius: 12px;
          box-shadow: 0 14px 32px rgba(0,0,0,0.18);
          z-index: 20;
        }
        .tcv-info-popover h4 { margin: 0 0 6px; font-size: 13px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.01em; }
        .tcv-info-popover p { margin: 0 0 10px; font-size: 11px; color: var(--text-muted); line-height: 1.45; }
        .tcv-info-popover ul { margin: 0 0 10px; padding-left: 16px; }
        .tcv-info-popover li { font-size: 11px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 4px; }
        .tcv-info-popover li strong { color: var(--text-primary); }
        .tcv-info-countdown {
          display: flex; flex-direction: column; gap: 2px;
          background: ${accent.rgb}; border: 1px solid ${accent.hex}33;
          border-radius: 8px; padding: 8px 10px; margin: 0 0 10px;
        }
        .tcv-info-countdown-label { font-size: 9px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); }
        .tcv-info-countdown-value { font-size: 14px; font-weight: 800; color: ${accent.hex}; font-variant-numeric: tabular-nums; }
        .tcv-info-sibling { display: inline-block; font-size: 11px; font-weight: 700; color: ${accent.hex}; text-decoration: none; padding-top: 6px; border-top: 1px solid var(--border-subtle); width: 100%; }

        /* Status bar */
        .tcv-status {
          display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
          padding: 12px 16px; margin-bottom: 18px;
          background: var(--bg-surface); border: 1px solid var(--border-subtle);
          border-radius: 12px;
        }
        .tcv-status-item { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-muted); }
        .tcv-status-item strong { color: var(--text-primary); font-weight: 700; }
        .tcv-status-divider { width: 1px; height: 20px; background: var(--border-subtle); }
        .tcv-countdown-pill {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 4px 10px; border-radius: 999px;
          background: ${accent.rgb}; color: ${accent.hex};
          font-size: 11px; font-weight: 700;
          border: 1px solid ${accent.rgb};
        }
        .tcv-votes-left { font-size: 12px; }

        /* Anon hint — atsiranda po pirmo balso. Subtle text-only banner. */
        .tcv-anon-hint {
          margin-bottom: 14px; padding: 10px 14px; border-radius: 10px;
          background: ${accent.rgb};
          color: var(--text-primary); font-size: 12px;
          line-height: 1.4;
        }
        .tcv-anon-hint a { color: ${accent.hex}; font-weight: 700; text-decoration: underline; text-underline-offset: 2px; }
        .tcv-anon-hint strong { color: ${accent.hex}; }
        .tcv-fallback-note {
          display: flex; align-items: center; gap: 8px;
          margin-bottom: 14px; padding: 10px 14px; border-radius: 10px;
          background: var(--bg-surface); border: 1px solid var(--border-subtle);
          color: var(--text-secondary); font-size: 12px; line-height: 1.4;
        }
        .tcv-fallback-note svg { flex-shrink: 0; color: ${accent.hex}; }
        .tcv-fallback-note strong { color: var(--text-primary); font-weight: 700; }
        .tcv-back-link { display: inline-block; margin-bottom: 12px; font-size: 13px; font-weight: 600; color: var(--text-muted); text-decoration: none; transition: color 0.15s; }
        .tcv-back-link:hover { color: var(--text-primary); }

        /* Body — mobile-first flex column. Mobile order: player → list → newcomers */
        .tcv-body {
          display: flex;
          flex-direction: column;
          gap: 12px;
          width: 100%;
        }
        /* Sticky player VISADA — tiek mobile, tiek desktop'e (pridedam top offset'ą) */
        .tcv-sticky {
          display: flex; flex-direction: column; gap: 10px;
          position: sticky; top: 64px; z-index: 5;
          background: var(--bg-page, transparent);
        }

        @media (min-width: 880px) {
          .tcv-body {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px 22px;
            align-items: stretch;   /* right-col ištįs iki list aukščio,
                                       sticky player stays in view per visa scroll */
          }
          .tcv-list-wrap { min-width: 0; }
          /* Right column 50% pločio (lygiavert'ė su sąrašu). NEPRISIRIŠAM prie
             align-self:start, kad kolona ištįstų lygi sąrašo aukščiui. Tada
             player'is gali būti sticky per VISĄ chart'o scroll'ą (sticky veikia
             tik kol jo parent'as matomas — su tall parent'u player visada
             matomas). Naujienos / iškritę / siūlyk / archyvas eina po player'iu
             normaliai, scroll'inasi su puslapiu. */
          .tcv-right-col {
            display: flex;
            flex-direction: column;
            gap: 18px;
            min-width: 0;
            min-height: 100%;
          }
          /* Dar didesnis tarpas po sticky player'iu — kad iškritę panel'is
             vizualiai atsiskirtų, ne klijuotųsi prie video. */
          .tcv-right-col > .tcv-sticky { margin-bottom: 10px; }
          .tcv-sticky { position: sticky; top: 80px; z-index: 5; align-self: stretch; }
        }
        /* ───────── MOBILE (< 880px) — agresyvus compact layout ───────── */
        @media (max-width: 880px) {
          .tcv-wrap { padding: 14px 12px 40px; }

          /* Hero: row layout — title on left, action icons on right */
          .tcv-hero { flex-direction: row; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; flex-wrap: nowrap; }
          .tcv-hero-left { flex: 1 1 auto; min-width: 0; }
          .tcv-badge { font-size: 9px; padding: 3px 7px; }
          .tcv-title { font-size: 22px; line-height: 1; }
          .tcv-sub { display: none; }
          .tcv-hero-right { flex: 0 0 auto; flex-direction: row; align-items: center; gap: 6px; }
          /* Suggest: icon only on mobile */
          .tcv-suggest-btn { padding: 7px 9px; }
          .tcv-suggest-label { display: none; }
          /* Sibling link: tiny */
          .tcv-sibling-link { font-size: 10px; padding: 5px 8px; white-space: nowrap; }

          /* Status bar: tight, single row, no divider lines */
          .tcv-status { padding: 7px 10px; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
          .tcv-status-divider { display: none; }
          .tcv-status-item { font-size: 11px; gap: 4px; }
          .tcv-countdown-pill { padding: 3px 7px; font-size: 10px; }
          .tcv-guest-bar { padding: 7px 10px; font-size: 11px; margin-bottom: 10px; }

          /* MOBILE: flatten right-col, naudojam order'ius kad surikiuoti DOM:
             player → list → newcomers → iškritę → siūlyk → archyvas. Player
             sticky-as-zoom — laikosi viršuje, kai user'is scroll'ina sąrašą
             žemyn (kaip muzikos atkūrimo programos). */
          .tcv-right-col { display: contents; }
          .tcv-sticky {
            position: sticky;
            top: 56px;             /* po globaliu site headeriu */
            z-index: 10;
            display: block;
            order: 1;
            background: var(--bg-page, #0a0a0a);
            margin: 0 -12px 4px;   /* ištempt'i edge-to-edge mobile */
            padding: 6px 12px;
            border-bottom: 1px solid var(--border-subtle);
          }
          .tcv-list-wrap { gap: 10px; order: 2; }
          .tcv-newcomers-panel { order: 3; }
          .tcv-belowtop-panel { order: 4; }
          .tcv-side-cta { order: 5; }
          .tcv-rules { order: 6; }
          /* Sticky kontekste mažesnis 16:9 player'is, kad neuztraktų pus
             ekrano */
          .tcv-sticky .tcv-player-video { max-height: 200px; }

          /* Player: pilnas 16:9 thumbnail, jokios info sekcijos po juo */
          .tcv-player-card { border: 0; border-radius: 0; }
          .tcv-phead { padding: 8px 12px; }
          .tcv-player { border-radius: 12px; }
          .tcv-player-video { aspect-ratio: 16/9; max-height: 240px; border-radius: 12px; }
          .tcv-play-btn { width: 48px; height: 48px; }
          .tcv-play-btn svg { width: 16px; height: 16px; }

          /* Newcomers panel'is — compact, hint slėpiamas */
          .tcv-newcomers-panel { padding: 10px 12px; }
          .tcv-newcomers-hint { display: none; }
          .tcv-newcomers-head { margin-bottom: 8px; }
          .tcv-newcomer-row { padding: 5px 6px; gap: 8px; }
          .tcv-newcomer-cover { width: 30px; height: 30px; border-radius: 6px; }
          .tcv-newcomer-title { font-size: 12px; }
          .tcv-newcomer-artist { font-size: 10px; }

          /* Pagrindinė lentelė: tight rows */
          .tcv-list { border-radius: 12px; }
          .tcv-row { gap: 7px; padding: 7px 9px; }
          .tcv-cover { width: 32px; height: 32px; border-radius: 6px; }
          .tcv-pos { width: 20px; font-size: 13px; }
          .tcv-pos.top { font-size: 15px; }
          .tcv-trend { width: 22px; }
          .tcv-up, .tcv-down { font-size: 10px; }
          .tcv-new { font-size: 8px; padding: 2px 4px; }
          .tcv-track-title { font-size: 12px; }
          .tcv-artist { font-size: 10px; }
          .tcv-weeks-progress { gap: 1px; }
          .tcv-week-dot { width: 3px; height: 2px; border-radius: 1px; }
          .tcv-spotify-icon { display: none; }
          .tcv-vote-btn { padding: 5px 8px; font-size: 11px; gap: 4px; }
          .tcv-vote-label { display: none; }
          .tcv-vote-mine { font-size: 10px; }

          /* Below-top dashed wrap'as compact */
          .tcv-list-below { padding: 4px; }
          .tcv-section-header { gap: 8px; }
          .tcv-section-label { font-size: 10px; }
          .tcv-section-hint { font-size: 10px; }
        }

        /* ───────── ULTRA SMALL (< 400px) — telpa visus iPhone'us ───────── */
        @media (max-width: 400px) {
          .tcv-row { gap: 6px; padding: 6px 8px; }
          .tcv-cover { width: 28px; height: 28px; }
          .tcv-pos { width: 18px; font-size: 12px; }
          .tcv-trend { width: 20px; }
          .tcv-vote-btn { padding: 4px 6px; }
          .tcv-newcomer-cover { width: 26px; height: 26px; }
        }

        /* List */
        .tcv-list {
          background: var(--bg-surface); border: 1px solid var(--border-subtle);
          border-radius: 14px; overflow: hidden;
        }
        .tcv-row {
          display: flex; align-items: center; gap: 12px;
          padding: 10px 14px; border-bottom: 1px solid var(--border-subtle);
          cursor: pointer; transition: background 0.15s;
        }
        .tcv-row:last-child { border-bottom: none; }
        .tcv-row:hover { background: var(--bg-hover); }
        .tcv-row.active { background: ${accent.rgb}; }
        .tcv-row.top3 { background: linear-gradient(90deg, ${accent.rgb} 0%, transparent 60%); }
        .tcv-row.top3.active { background: ${accent.rgb}; }

        /* Pozicijos + trendo stack — vertikaliai sutaupytos vietos */
        .tcv-pos-stack {
          display: flex; flex-direction: column; align-items: center;
          width: 32px; flex-shrink: 0; gap: 1px;
        }
        .tcv-pos {
          font-weight: 900; font-size: 17px; color: var(--text-muted);
          font-variant-numeric: tabular-nums; line-height: 1;
        }
        .tcv-pos.top { color: ${accent.hex}; font-size: 20px; }
        .tcv-trend {
          display: flex; justify-content: center; line-height: 1;
        }
        .tcv-new { font-size: 9px; font-weight: 800; padding: 2px 5px; border-radius: 4px; background: ${accent.rgb}; color: ${accent.hex}; letter-spacing: 0.06em; }
        .tcv-up { font-size: 11px; font-weight: 800; color: #10b981; }
        .tcv-down { font-size: 11px; font-weight: 800; color: #ef4444; }
        .tcv-same { font-size: 13px; color: var(--text-muted); }

        .tcv-cover {
          width: 44px; height: 44px; border-radius: 8px; overflow: hidden;
          flex-shrink: 0; background: var(--bg-elevated);
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; color: var(--text-muted);
        }
        .tcv-cover img { width: 100%; height: 100%; object-fit: cover; }

        .tcv-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        /* Artist FIRST (mažas, mute), Title SECOND (didelis), Progress THIRD */
        .tcv-row-artist { font-size: 11px; color: var(--text-muted); font-weight: 500; text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; }
        .tcv-row-artist:hover { color: ${accent.hex}; }
        .tcv-row-title { margin: 0; font-size: 14px; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.25; }

        .tcv-spotify-icon { color: #1db954; opacity: 0.55; flex-shrink: 0; transition: opacity 0.15s; }
        .tcv-spotify-icon:hover { opacity: 1; }

        .tcv-votes-cell {
          font-size: 12px; font-weight: 700; color: var(--text-secondary);
          font-variant-numeric: tabular-nums; padding: 0 6px; min-width: 38px; text-align: right;
        }

        .tcv-vote-btn {
          display: flex; align-items: center; gap: 5px;
          padding: 6px 12px; border-radius: 999px;
          font-size: 12px; font-weight: 800; cursor: pointer;
          border: 1px solid transparent;
          /* background ir color setina inline'iniu stylu (accent.hex) */
          transition: transform 0.1s, filter 0.15s;
          flex-shrink: 0;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          user-select: none;
          box-shadow: 0 4px 12px ${accent.rgb};
        }
        .tcv-vote-btn:hover:not(.disabled):not(.maxed) { filter: brightness(1.08); transform: translateY(-1px); }
        .tcv-vote-btn:active:not(.disabled) { transform: scale(0.95); }
        .tcv-vote-btn.pulsing { animation: tcv-pulse 0.2s ease-out; }
        @keyframes tcv-pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
        .tcv-vote-btn.disabled { opacity: 0.4; cursor: not-allowed; }
        .tcv-vote-count {
          font-weight: 900; font-size: 13px; min-width: 12px; text-align: center;
          font-variant-numeric: tabular-nums;
        }
        .tcv-vote-mine {
          font-weight: 800; font-size: 11px; min-width: 10px; text-align: center;
          font-variant-numeric: tabular-nums; opacity: 0.85;
        }
        .tcv-vote-btn.boosting {
          animation: tcv-boost 0.6s ease-out infinite;
          box-shadow: 0 0 0 0 ${accent.rgb};
        }
        @keyframes tcv-boost {
          0%   { box-shadow: 0 0 0 0 ${accent.rgb}; }
          50%  { box-shadow: 0 0 0 6px ${accent.rgb}; }
          100% { box-shadow: 0 0 0 0 ${accent.rgb}; }
        }
        .tcv-vote-btn.maxed { opacity: 0.5; cursor: not-allowed; }
        .tcv-vote-btn.maxed:hover { background: var(--bg-elevated); border-color: var(--border-subtle); color: var(--text-secondary); }
        .tcv-vote-err { position: absolute; bottom: calc(100% + 6px); right: 0; padding: 5px 10px; background: #fee2e2; color: #991b1b; font-size: 11px; border-radius: 6px; white-space: nowrap; z-index: 10; }
        .tcv-vote-burst {
          position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%);
          font-size: 14px; font-weight: 900; pointer-events: none;
          animation: tcv-burst 0.8s ease-out forwards;
          z-index: 5;
        }
        @keyframes tcv-burst {
          0% { opacity: 0; transform: translate(-50%, 0) scale(0.5); }
          20% { opacity: 1; transform: translate(-50%, -8px) scale(1.2); }
          100% { opacity: 0; transform: translate(-50%, -28px) scale(0.9); }
        }
        .tcv-spinner { width: 11px; height: 11px; border: 1.5px solid currentColor; border-top-color: transparent; border-radius: 50%; animation: tcv-spin 0.6s linear infinite; }
        @keyframes tcv-spin { to { transform: rotate(360deg) } }
        .tcv-vote-label { display: inline; font-size: 11px; }
        @media (max-width: 520px) { .tcv-vote-label { display: none; } .tcv-votes-cell { display: none; } }

        /* tcv-sticky deprecated kaip standalone sticky — sticky'ina visa
           .tcv-right-col grupė (player + newcomers kartu). Paliekam wrap'ą
           tikslingai DOM ordering'ui. */
        .tcv-player {
          background: var(--bg-surface); border: 1px solid var(--border-subtle);
          border-radius: 16px; overflow: hidden;
        }
        .tcv-player-empty .tcv-player-video { background: var(--bg-elevated); }
        .tcv-player-video { aspect-ratio: 16/9; position: relative; background: #000; }
        .tcv-thumb { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
        .tcv-thumb-img { width: 100%; height: 100%; object-fit: cover; }
        .tcv-thumb-empty { width: 100%; height: 100%; background: var(--bg-elevated); }
        .tcv-play-btn {
          position: absolute; width: 56px; height: 56px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 8px 26px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.3);
          transition: transform 0.15s;
        }
        .tcv-thumb:hover .tcv-play-btn { transform: scale(1.08); }

        /* Player kortelė: švarus header'is (vėliava + title + veiksmai) VIRŠ
           video — consistent su /topai pilnu topu (ne overlay ant video). */
        .tcv-player-card { border: 1px solid var(--border-subtle); border-radius: 16px; overflow: hidden; background: var(--bg-surface); }
        .tcv-player-card .tcv-player { border: 0; border-radius: 0; }
        .tcv-phead { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-surface); }
        .tcv-pflag { width: 24px; height: 16px; flex-shrink: 0; border-radius: 4px; background-size: cover; background-position: center; box-shadow: 0 0 0 1px var(--border-subtle); display: inline-block; }
        .tcv-pflag-globe { display: inline-flex; align-items: center; justify-content: center; background: var(--bg-elevated); color: var(--text-muted); }
        .tcv-h1 { margin: 0; flex: 1; min-width: 0; font-family: 'Outfit', sans-serif; font-size: 16px; font-weight: 800; letter-spacing: -0.015em; line-height: 1.2; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tcv-phead-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

        .tcv-player-info { padding: 16px 18px; }
        .tcv-player-pos { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
        .tcv-pos-num { font-size: 14px; font-weight: 900; }
        .tcv-player-title { margin: 0 0 4px; font-size: 18px; font-weight: 800; letter-spacing: -0.015em; line-height: 1.2; color: var(--text-primary); }
        .tcv-player-artist { font-size: 13px; color: var(--text-secondary); text-decoration: none; font-weight: 600; display: block; margin-bottom: 12px; }
        .tcv-player-artist:hover { color: ${accent.hex}; }
        .tcv-player-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
        .tcv-player-meta span {
          font-size: 11px; color: var(--text-secondary);
          background: var(--bg-elevated); padding: 4px 9px; border-radius: 6px;
          border: 1px solid var(--border-subtle); font-weight: 600;
        }
        .tcv-spotify-btn {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          padding: 10px; border-radius: 10px;
          background: rgba(29,185,84,0.1); border: 1px solid rgba(29,185,84,0.25);
          color: #1db954; font-size: 12px; font-weight: 800; text-decoration: none;
          transition: background 0.15s;
        }
        .tcv-spotify-btn:hover { background: rgba(29,185,84,0.18); }

        /* Empty state */
        .tcv-empty {
          padding: 64px 20px; text-align: center;
          background: var(--bg-surface); border: 1px solid var(--border-subtle);
          border-radius: 14px;
        }
        .tcv-empty-title { font-size: 22px; font-weight: 800; color: var(--text-secondary); margin: 0 0 8px; letter-spacing: -0.015em; }
        .tcv-empty-sub { font-size: 13px; color: var(--text-muted); margin: 0 0 18px; }
        .tcv-btn-primary {
          padding: 10px 22px; background: ${accent.hex}; color: #fff; border: none;
          border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer;
          transition: filter 0.15s;
        }
        .tcv-btn-primary:hover { filter: brightness(1.06); }

        /* Modal */
        .tcv-modal-bg { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0,0,0,0.5); backdrop-filter: blur(8px); }
        .tcv-modal { width: 100%; max-width: 460px; border-radius: 18px; background: var(--bg-surface); border: 1px solid var(--border-subtle); overflow: hidden; box-shadow: 0 30px 80px rgba(0,0,0,0.25); }
        .tcv-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border-subtle); font-size: 16px; font-weight: 800; color: var(--text-primary); }
        .tcv-modal-close { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 18px; padding: 2px 6px; border-radius: 6px; }
        .tcv-modal-close:hover { background: var(--bg-hover); color: var(--text-primary); }
        .tcv-modal-body { padding: 18px; display: flex; flex-direction: column; gap: 14px; }
        .tcv-modal-error {
          display: flex; align-items: flex-start; gap: 8px;
          padding: 10px 12px; border-radius: 10px;
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.25);
          color: #ef4444;
          font-size: 12px; font-weight: 600; line-height: 1.4;
        }
        .tcv-modal-sent { padding: 36px 20px; text-align: center; }
        .tcv-sent-title { font-size: 18px; font-weight: 800; color: var(--text-primary); margin: 0 0 6px; }
        .tcv-sent-sub { font-size: 13px; color: var(--text-muted); margin: 0 0 20px; }

        .tcv-mode-tabs { display: flex; gap: 6px; }
        .tcv-mode-tab { padding: 6px 14px; border-radius: 999px; font-size: 12px; font-weight: 700; cursor: pointer; border: 1px solid var(--border-subtle); background: var(--bg-elevated); color: var(--text-muted); transition: all 0.15s; }
        .tcv-mode-tab.active { background: ${accent.hex}; color: #fff; border-color: ${accent.hex}; }

        /* font-size 16px butini, kitaip iOS Safari prizoominta input'ą fokuse */
        .tcv-input { width: 100%; padding: 10px 13px; background: var(--bg-elevated); border: 1px solid var(--input-border); border-radius: 10px; color: var(--text-primary); font-size: 16px; outline: none; box-sizing: border-box; transition: border-color 0.15s; }
        .tcv-input::placeholder { color: var(--text-muted); }
        .tcv-input:focus { border-color: ${accent.hex}; }

        /* Weeks progress — 5 dash'iukai (kaip artist player'is). Wider. */
        .tcv-weeks-progress {
          display: inline-flex; gap: 4px; align-items: center;
          margin-top: 3px;
        }
        .tcv-week-dash {
          display: inline-block;
          width: 14px; height: 4px; border-radius: 2px;
          transition: background 0.3s ease;
        }
        @media (max-width: 880px) {
          .tcv-week-dash { width: 12px; height: 3px; }
        }

        /* List wrapper — apsiame tiek main top'as, tiek below-top sekcija */
        .tcv-list-wrap { display: flex; flex-direction: column; gap: 16px; }

        .tcv-row.dimmed { opacity: 0.55; background: var(--bg-elevated); }
        .tcv-row.dimmed:hover { opacity: 0.8; }
        .tcv-list-below { background: transparent; border: 1px dashed var(--border-subtle); border-radius: 14px; }

        .tcv-section-header {
          display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;
          padding: 0 4px; margin-top: 8px;
        }
        .tcv-section-label {
          font-size: 11px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase;
          color: var(--text-muted);
        }
        .tcv-section-hint { font-size: 11px; color: var(--text-muted); margin: 0; }

        .tcv-empty-inline {
          padding: 32px 16px; text-align: center; color: var(--text-muted);
          font-size: 13px;
        }

        /* Newcomers panel — pominapintai, su vote mygtukais (švelnesnis stilius) */
        .tcv-newcomers-panel {
          margin-top: 14px;
          background: linear-gradient(180deg, var(--bg-surface), ${accent.rgb});
          border: 1px solid var(--border-subtle);
          border-radius: 14px; padding: 14px;
          position: relative;
        }
        .tcv-newcomers-panel::before {
          content: '';
          position: absolute; top: 0; left: 14px; right: 14px; height: 2px;
          background: ${accent.hex}; border-radius: 0 0 2px 2px;
        }
        .tcv-newcomers-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
        .tcv-newcomers-title {
          font-size: 13px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase;
          color: ${accent.hex};
        }
        .tcv-newcomers-sub { font-size: 11px; color: var(--text-muted); }
        .tcv-newcomers-list { display: flex; flex-direction: column; gap: 4px; }
        .tcv-newcomer-row {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 10px; border-radius: 10px;
          cursor: pointer; transition: background 0.15s;
        }
        .tcv-newcomer-row:hover { background: var(--bg-hover); }
        .tcv-newcomer-row.active { background: ${accent.rgb}; }
        .tcv-newcomer-cover {
          width: 36px; height: 36px; border-radius: 8px; flex-shrink: 0;
          background: var(--bg-elevated);
          display: flex; align-items: center; justify-content: center;
          font-size: 14px; color: var(--text-muted); overflow: hidden;
        }
        .tcv-newcomer-cover img { width: 100%; height: 100%; object-fit: cover; }
        .tcv-newcomer-info { flex: 1; min-width: 0; }
        .tcv-newcomer-title { margin: 0; font-size: 13px; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tcv-newcomer-artist { margin: 1px 0 0; font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tcv-newcomer-counter {
          font-size: 9px; font-weight: 800; letter-spacing: 0.04em;
          padding: 2px 6px; border-radius: 5px;
          background: var(--bg-elevated); color: var(--text-muted);
          border: 1px solid var(--border-subtle); flex-shrink: 0;
          font-variant-numeric: tabular-nums;
        }

        /* Generic side-panel (Iškritę iš topo) — kaip newcomers, bet be accent juostos */
        .tcv-side-panel {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: 14px; padding: 14px;
        }
        .tcv-side-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
        .tcv-side-title { font-size: 13px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-secondary); }
        .tcv-side-sub { font-size: 11px; color: var(--text-muted); }
        .tcv-side-list { display: flex; flex-direction: column; gap: 4px; }
        .tcv-belowtop-panel .tcv-newcomer-row { opacity: 0.85; }
        .tcv-belowtop-panel .tcv-newcomer-title { color: var(--text-secondary); }

        /* Side CTA blokai (Siūlyk dainą / Topo archyvas) */
        .tcv-side-cta {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 14px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          cursor: pointer;
          width: 100%;
          text-align: left;
          transition: background 0.15s, border-color 0.15s, transform 0.05s;
          color: inherit; text-decoration: none;
        }
        .tcv-side-cta:hover { background: var(--bg-hover); border-color: ${accent.hex}66; }
        .tcv-side-cta:active { transform: scale(0.99); }
        .tcv-side-cta-icon {
          width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
        }
        .tcv-side-cta-icon-muted { background: var(--bg-elevated); color: var(--text-muted); }
        .tcv-side-cta-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
        .tcv-side-cta-text strong { font-size: 13px; font-weight: 800; color: var(--text-primary); }
        .tcv-side-cta-text span { font-size: 11px; color: var(--text-muted); line-height: 1.35; }
        .tcv-side-cta-arrow { color: var(--text-muted); flex-shrink: 0; }

        /* Topo taisyklės sekcija — page bottom */
        .tcv-rules { margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--border-subtle); }
        .tcv-rules-title { margin: 0 0 16px; font-size: 18px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.02em; }
        .tcv-rules-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
        .tcv-rule-card {
          display: flex; gap: 12px; padding: 14px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
        }
        .tcv-rule-num {
          flex-shrink: 0; width: 28px; height: 28px; border-radius: 8px;
          color: white; font-weight: 800; font-size: 13px;
          display: flex; align-items: center; justify-content: center;
        }
        .tcv-rule-card h3 { margin: 0 0 4px; font-size: 13px; font-weight: 800; color: var(--text-primary); }
        .tcv-rule-card p { margin: 0; font-size: 12px; color: var(--text-muted); line-height: 1.5; }
        .tcv-rule-card p strong { color: var(--text-primary); font-weight: 700; }
        .tcv-info-link-hint {
          margin: 0; font-size: 10px; color: var(--text-muted);
          font-style: italic; line-height: 1.4;
        }

        /* (legacy) suggestions panel — paliekam stiliaus pasiekiamumui, bet jau nebenaudojam */
        .tcv-suggestions-panel {
          margin-top: 14px;
          background: var(--bg-surface); border: 1px solid var(--border-subtle);
          border-radius: 14px; padding: 14px; overflow: hidden;
        }
        .tcv-suggestions-head {
          display: flex; align-items: center; gap: 7px;
          font-size: 11px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase;
          color: var(--text-muted); margin-bottom: 10px;
        }
        .tcv-suggestions-head svg { color: ${accent.hex}; }
        .tcv-suggestions-list { display: flex; flex-direction: column; gap: 4px; }
        .tcv-suggestion-row {
          display: flex; align-items: center; gap: 9px; padding: 6px 8px;
          border-radius: 8px; transition: background 0.15s;
        }
        .tcv-suggestion-row:hover { background: var(--bg-hover); }
        .tcv-suggestion-cover {
          width: 28px; height: 28px; border-radius: 6px; flex-shrink: 0;
          background: var(--bg-elevated); display: flex; align-items: center; justify-content: center;
          font-size: 12px; color: var(--text-muted);
        }
        .tcv-suggestion-info { flex: 1; min-width: 0; }
        .tcv-suggestion-title { margin: 0; font-size: 12px; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tcv-suggestion-artist { margin: 1px 0 0; font-size: 10px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tcv-suggestion-counter {
          font-size: 9px; font-weight: 800; padding: 2px 5px; border-radius: 4px;
          background: var(--bg-elevated); color: var(--text-muted);
          border: 1px solid var(--border-subtle); flex-shrink: 0;
          font-variant-numeric: tabular-nums;
        }
        .tcv-suggestions-more { margin: 8px 0 0; font-size: 10px; color: var(--text-muted); text-align: center; }

        .tcv-results { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
        .tcv-result-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: 10px; cursor: pointer; transition: background 0.15s; width: 100%; }
        .tcv-result-row:hover { background: var(--bg-hover); }
        .tcv-result-cover { width: 32px; height: 32px; border-radius: 6px; background: var(--bg-surface); display: flex; align-items: center; justify-content: center; font-size: 12px; flex-shrink: 0; overflow: hidden; color: var(--text-muted); }
        .tcv-result-cover img { width: 100%; height: 100%; object-fit: cover; }
        .tcv-result-title { font-size: 13px; font-weight: 700; color: var(--text-primary); margin: 0 0 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tcv-result-artist { font-size: 11px; color: var(--text-muted); margin: 0; }
        .tcv-result-cta { font-size: 11px; font-weight: 800; color: ${accent.hex}; flex-shrink: 0; }
        .tcv-manual { display: flex; flex-direction: column; gap: 8px; }
      `}</style>

      <div className="tcv-wrap">
        {backHref && (
          <Link href={backHref} className="tcv-back-link">← Visas archyvas</Link>
        )}
        {/* Anon hint — TIK kai jau prabalsavo. Be ikonos ir be Prisijungti button'o. */}
        {!session && Object.values(votesPerTrack).reduce((s, v) => s + v, 0) > 0 && (
          <div className="tcv-anon-hint">
            <Link href="/auth/signin">Prisijunk</Link> — ir tavo balsai bus <strong>3× svaresni</strong> finalizavime.
          </div>
        )}

        {/* Archyvo žyma: konkrečios praėjusios savaitės peržiūra (read-only). */}
        {archiveMode && weekLabel && (
          <div className="tcv-fallback-note">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
            <span>Archyvinis topas — <strong>{weekLabel}</strong> savaitės rezultatai.</span>
          </div>
        )}

        {/* Fallback žyma: rodom paskutinę užbaigtą (legacy) savaitę, nes einamoji
            dar neturi balsų. Balsavimas išjungtas. */}
        {!archiveMode && data.isFallback && data.entries.length > 0 && weekLabel && (
          <div className="tcv-fallback-note">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
            <span>Rodomas paskutinės užbaigtos savaitės topas (<strong>{weekLabel}</strong>). Naujos savaitės balsavimas dar prasidės.</span>
          </div>
        )}

        {data.entries.length === 0 ? (
          <div className="tcv-empty">
            <p className="tcv-empty-title">Sąrašas dar tuščias</p>
            <p className="tcv-empty-sub">Patvirtinti pasiūlymai pateks čia kitą savaitę.</p>
            <button className="tcv-btn-primary" onClick={() => setShowSuggest(true)}>Siūlyti dainą</button>
          </div>
        ) : (
          <div className="tcv-body">
            {/* DOM order: list FIRST (kairė kolona desktop'e), tada right-col
                (player + newcomers — dešinė kolona desktop'e). Mobile'ui
                .tcv-right-col turi `display: contents` ir `order` ant kiekvieno
                vaiko, kad gauti player → list → newcomers eiliškumą. */}

            {/* MAIN LIST + BELOW — desktop kairė kolona, mobile order: 2 */}
            <div className="tcv-list-wrap">
              <div className="tcv-list">
                {mainTop.map(entry => (
                  <ChartRow
                    key={entry.id}
                    entry={entry}
                    isActive={activeEntry?.id === entry.id}
                    weekId={voteWeekId}
                    accent={accent}
                    onClick={() => setActiveEntry(entry)}
                    onVoted={handleVoted}
                    onVoteFailed={handleVoteFailed}
                    votesPerTrack={votesPerTrack}
                    votesRemaining={votesRemaining}
                    weeklyLimit={weeklyLimit}
                  />
                ))}
                {mainTop.length === 0 && newcomers.length > 0 && (
                  <div className="tcv-empty-inline">
                    <p>Topas dar formuojasi — naujienos kovoja už pirmas vietas →</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right column — desktop dešinė kolona, mobile: flatten + order'ai
                Tvarka: Player → Naujienos → Iškritę → Siūlyk dainą → Topo archyvas */}
            <div className="tcv-right-col">
              <div className="tcv-sticky">
                <div className="tcv-player-card">
                  {/* Švarus header'is VIRŠ player'io: vėliava + title + veiksmai
                      (consistent su /topai pilnu topu — ne overlay ant video). */}
                  <div className="tcv-phead">
                    <Flag country={topType === 'lt_top30' ? 'lt' : null} />
                    <h1 className="tcv-h1">{title}</h1>
                    <div className="tcv-phead-actions">
                      <button
                        className="tcv-suggest-btn"
                        onClick={() => setShowSuggest(true)}
                        aria-label="Siūlyti dainą"
                        title="Siūlyti dainą"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                        <span className="tcv-suggest-label">Siūlyti</span>
                      </button>
                      <div className="tcv-info-wrap" ref={infoRef}>
                        <button
                          className="tcv-info-btn"
                          onClick={() => setShowInfo(s => !s)}
                          aria-label="Apie topą"
                          title="Apie topą"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="18" cy="12" r="2"/></svg>
                        </button>
                        {showInfo && (
                          <div className="tcv-info-popover">
                            <h4>Apie {title}</h4>
                            <p>{subtitle}</p>
                            {data.week?.vote_close && (
                              <div className="tcv-info-countdown">
                                <div className="tcv-info-countdown-label">Iki šios savaitės pabaigos</div>
                                <div className="tcv-info-countdown-value">
                                  <Countdown targetDate={data.week.vote_close} />
                                </div>
                              </div>
                            )}
                            <p className="tcv-info-link-hint">
                              Pilnas balsavimo reglamentas — žemiau, „Topo taisyklės" sekcijoje.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <Player entry={activeEntry} accent={accent} />
                </div>
              </div>
              {newcomers.length > 0 && (
                <div className="tcv-newcomers-panel">
                  <div className="tcv-newcomers-head">
                    <span className="tcv-newcomers-title">Naujienos</span>
                    <span className="tcv-newcomers-sub">kovoja už vietą tope</span>
                  </div>
                  <div className="tcv-newcomers-list">
                    {newcomers.map(entry => (
                      <NewcomerRow
                        key={entry.id}
                        entry={entry}
                        weekId={voteWeekId}
                        accent={accent}
                        onVoted={handleVoted}
                        onVoteFailed={handleVoteFailed}
                        votesPerTrack={votesPerTrack}
                        votesRemaining={votesRemaining}
                        weeklyLimit={weeklyLimit}
                        onClick={() => setActiveEntry(entry)}
                        isActive={activeEntry?.id === entry.id}
                      />
                    ))}
                  </div>
                </div>
              )}

              {belowTop.length > 0 && (
                <div className="tcv-side-panel tcv-belowtop-panel">
                  <div className="tcv-side-head">
                    <span className="tcv-side-title">Iškritę iš topo</span>
                    <span className="tcv-side-sub">šią savaitę nepateko</span>
                  </div>
                  <div className="tcv-side-list">
                    {belowTop.map(entry => (
                      <NewcomerRow
                        key={entry.id}
                        entry={entry}
                        weekId={voteWeekId}
                        accent={accent}
                        onVoted={handleVoted}
                        onVoteFailed={handleVoteFailed}
                        votesPerTrack={votesPerTrack}
                        votesRemaining={votesRemaining}
                        weeklyLimit={weeklyLimit}
                        onClick={() => setActiveEntry(entry)}
                        isActive={activeEntry?.id === entry.id}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Siūlyk dainą — pakvietimas po iškritusiomis */}
              <button className="tcv-side-cta" onClick={() => setShowSuggest(true)}>
                <div className="tcv-side-cta-icon" style={{ background: accent.hex }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </div>
                <div className="tcv-side-cta-text">
                  <strong>Siūlyk dainą</strong>
                  <span>Tavo pasiūlymai pateks į kitą savaitę</span>
                </div>
              </button>

              {/* Topo archyvas — istoriniai topai */}
              <Link href="/topai/archyvas" className="tcv-side-cta tcv-side-cta-archive">
                <div className="tcv-side-cta-icon tcv-side-cta-icon-muted">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
                </div>
                <div className="tcv-side-cta-text">
                  <strong>Topo archyvas</strong>
                  <span>Praėjusių savaičių rezultatai</span>
                </div>
                <svg className="tcv-side-cta-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><polyline points="9 6 15 12 9 18"/></svg>
              </Link>
            </div>
          </div>
        )}

        {/* Topo taisyklės — sekcija žemiau pagrindinio body, pilnas reglamentas. */}
        {data.entries.length > 0 && (
          <section className="tcv-rules">
            <h2 className="tcv-rules-title">Topo taisyklės</h2>
            <div className="tcv-rules-grid">
              <div className="tcv-rule-card">
                <div className="tcv-rule-num" style={{ background: accent.hex }}>1</div>
                <div>
                  <h3>Atsinaujinimas</h3>
                  <p>Topas perskaičiuojamas <strong>kiekvieną {topType === 'lt_top30' ? 'šeštadienį' : 'sekmadienį'} 15:00</strong>. Nauja savaitė startuoja iš karto.</p>
                </div>
              </div>
              <div className="tcv-rule-card">
                <div className="tcv-rule-num" style={{ background: accent.hex }}>2</div>
                <div>
                  <h3>Balsų limitas</h3>
                  <p>Iki <strong>10 balsų</strong> vienai dainai per savaitę. Bendro savaitinio limito nėra.</p>
                </div>
              </div>
              <div className="tcv-rule-card">
                <div className="tcv-rule-num" style={{ background: accent.hex }}>3</div>
                <div>
                  <h3>Tik registruoti balsai</h3>
                  <p>Į topą skaičiuojami tik <strong>prisijungusių narių balsai</strong>. Anonimiški balsai matomi, bet pozicijų nekeičia.</p>
                </div>
              </div>
              <div className="tcv-rule-card">
                <div className="tcv-rule-num" style={{ background: accent.hex }}>4</div>
                <div>
                  <h3>Maksimum 12 savaičių</h3>
                  <p>Daina tope gali išbūti iki <strong>12 savaičių</strong>. Po to ji baigia sezoną — užleidžia vietą naujam.</p>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      {showSuggest && (
        <SuggestModal onClose={() => setShowSuggest(false)} topType={topType} />
      )}
    </>
  )
}
