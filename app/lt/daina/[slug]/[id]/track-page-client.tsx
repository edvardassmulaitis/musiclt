'use client'
// app/lt/daina/[slug]/[id]/track-page-client.tsx
import { useState, useEffect, useCallback, memo, useMemo } from 'react'
import Link from 'next/link'
import LegacyLikesPanel, { type LegacyLikeUser } from '@/components/LegacyLikesPanel'
import ScoreCard from '@/components/ScoreCard'
import { LikePill } from '@/components/LikePill'
import { proxyImg } from '@/lib/img-proxy'
import EntityCommentsBlock from '@/components/EntityCommentsBlock'
import LyricsWithReactions from '@/components/LyricsWithReactions'
import DropBar from '@/components/DropBar'
import { formatArtistList } from '@/lib/format-artists'

// ── Types ──────────────────────────────────────────────────────────────────────

type Artist = { id: number; slug: string; name: string; cover_image_url: string | null }
type Track = {
  id: number; slug: string; title: string; type: string
  video_url: string | null; spotify_id: string | null; release_date: string | null
  lyrics: string | null; chords: string | null; description: string | null
  show_player: boolean; is_new: boolean; featuring: Artist[]
  show_ai_interpretation: boolean
  score?: number | null; score_breakdown?: any
  peak_chart_position?: number | null; certifications?: any
}
type Album = { id: number; slug: string; title: string; year?: number; cover_image_url: string | null; type: string }
type LyricReaction = {
  id: number; selection_start: number; selection_end: number
  selected_text: string; type: 'like' | 'comment'; text: string
  likes: number; created_at: string
}
type Version = { id: number; slug: string; title: string; type: string; video_url: string | null }
type EntityComment = {
  legacy_id: number
  author_username: string | null
  author_avatar_url: string | null
  created_at: string | null
  content_html: string | null
  content_text: string | null
  like_count: number
}
type Props = {
  track: Track; artist: Artist; albums: Album[]
  versions: Version[]; likes: number
  lyricComments: LyricReaction[]; trivia: string | null
  relatedTracks: Track[]
  aiInterpretation?: string | null
  isLegacy?: boolean
  legacyLikes?: { count: number; users: LegacyLikeUser[] }
  /** Music.lt komentarai prie šios dainos (entity_comments lentelė). */
  entityComments?: EntityComment[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function ytId(url?: string | null) {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  return m ? m[1] : null
}
function fmtDate(d: string | null): string | null {
  if (!d) return null
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return d
  const mo = ['sausio','vasario','kovo','balandžio','gegužės','birželio','liepos','rugpjūčio','rugsėjo','spalio','lapkričio','gruodžio']
  return `${dt.getFullYear()} m. ${mo[dt.getMonth()]} ${dt.getDate()} d.`
}

// ── Icons ──────────────────────────────────────────────────────────────────────

const MusicIcon = ({ s = 16, c = '#fff' }: { s?: number; c?: string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill={c}><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
)
const GuitarIcon = ({ s = 13, c = 'currentColor' }: { s?: number; c?: string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill={c}><path d="M19.59 3c-.96 0-1.86.37-2.54 1.05L14 7.1C12.45 6.39 10.6 6.6 9.26 7.93L3 14.19l.71.71-1.42 1.41 1.42 1.41 1.06-1.06.7.71-1.41 1.41 1.41 1.41 1.41-1.41.71.71-1.06 1.06 1.41 1.41L16.07 15c1.33-1.33 1.54-3.19.82-4.73l3.06-3.06C20.63 6.53 21 5.63 21 4.66 21 3.74 20.26 3 19.59 3zM15 15l-5-5 1.41-1.41 5 5L15 15z"/></svg>
)
// ── Stable sub-components (never re-mount) ─────────────────────────────────────

const YoutubeEmbed = memo(({ videoId }: { videoId: string }) => (
  <iframe src={`https://www.youtube.com/embed/${videoId}?rel=0`}
    allow="autoplay; encrypted-media" allowFullScreen
    style={{ width: '100%', aspectRatio: '16/9', border: 'none', display: 'block' }} />
))
YoutubeEmbed.displayName = 'YoutubeEmbed'

// AI image with loading state — separate memo so it never re-mounts
// No external image service needed — AI image feature removed for now

// ── Main component ─────────────────────────────────────────────────────────────

export default function TrackPageClient({
  track, artist, albums, versions, likes: initialLikes,
  lyricComments: initialReactions, trivia, relatedTracks,
  aiInterpretation,
  isLegacy = false,
  legacyLikes,
  entityComments = [],
}: Props) {
  const hasLegacyLikes = !!legacyLikes && legacyLikes.count > 0

  // ── State ──────────────────────────────────────────────────────────────────
  const [liked, setLiked] = useState(false)
  const [tab, setTab] = useState<'lyrics' | 'chords'>('lyrics')
  const [showAllV, setShowAllV] = useState(false)
  const [loaded, setLoaded] = useState(false)
  // Mobile tab toggle — kaip artist'o modal'e: tarp lyrics ir comments,
  // kad nereikėtų stacked column'ų vienoj per kitą screen'e.
  const [mobileTab, setMobileTab] = useState<'lyrics' | 'comments'>('lyrics')

  // Likers modal — universal'us pop-over visiems entity types (comment / track /
  // album / post). Atidaromas paspaudus ant ♥N badge'o.
  const [likersModalEntity, setLikersModalEntity] = useState<{ type: string; id: number; label: string } | null>(null)
  const [likersModalUsers, setLikersModalUsers] = useState<Array<{ user_username: string; user_rank: string | null; user_avatar_url: string | null }> | null>(null)
  useEffect(() => {
    if (!likersModalEntity) { setLikersModalUsers(null); return }
    setLikersModalUsers(null)
    fetch(`/api/likes/${likersModalEntity.type}/${likersModalEntity.id}`)
      .then(r => r.json())
      .then(d => setLikersModalUsers(d.users || []))
      .catch(() => setLikersModalUsers([]))
  }, [likersModalEntity])

  // AI
  const [aiText, setAiText] = useState<string | null>(aiInterpretation ?? null)
  const [aiLoad, setAiLoad] = useState(false)
  const [aiErr, setAiErr] = useState(false)

  useEffect(() => { setLoaded(true) }, [])

  // ── Derived ────────────────────────────────────────────────────────────────
  const vid = ytId(track.video_url)
  const hasLyrics = !!track.lyrics?.trim()
  const hasChords = !!track.chords?.trim()
  const dateStr = fmtDate(track.release_date)
  const primaryAlbum = albums[0] ?? null

  // ── CSS Variables are used instead of inline theme object ──────────────────
  // All theme colors are now defined in globals.css with [data-theme] attribute
  // This keeps the component logic clean and theme management centralized

  const cardStyle: React.CSSProperties = { background: 'var(--card-surface)', border: '1px solid var(--card-border-default)', borderRadius: 16, overflow: 'hidden' }
  const headStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px', borderBottom: '1px solid var(--card-border-subtle)',
    fontSize: 11, fontWeight: 700, color: 'var(--head-text)',
    fontFamily: 'Outfit,sans-serif', textTransform: 'uppercase', letterSpacing: '.08em',
  }

  // ── AI generation ──────────────────────────────────────────────────────────
  const doAI = useCallback(async () => {
    if (!hasLyrics || aiLoad) return
    setAiLoad(true); setAiErr(false); setAiText(null); 
    try {
      const res = await fetch(`/api/tracks/${track.id}/ai-interpretation`, { method: 'POST' })
      if (!res.ok) throw new Error()
      const d = await res.json()
      setAiText(d.interpretation ?? null)
      
    } catch { setAiErr(true) }
    setAiLoad(false)
  }, [hasLyrics, aiLoad, track.id])

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════

  // ── Cards ──────────────────────────────────────────────────────────────────

  const TrackInfoCard = () => (
    <div style={cardStyle}>
      <div style={{ background: 'var(--cover-area-bg)', padding: 14, position: 'relative', opacity: loaded ? 1 : 0, transition: 'opacity .35s' }}>
        {/* Like pill — heart toggle'ina vartotojo like'ą, count atidaro
            modal'ą su visais user'iais kuriems patiko (kaip artist page'e). */}
        <div style={{ position: 'absolute', top: 10, right: 12, zIndex: 2 }}>
          <LikePill
            likes={initialLikes + (liked ? 1 : 0)}
            selfLiked={liked}
            onToggle={() => setLiked(v => !v)}
            onOpenModal={() => setLikersModalEntity({ type: 'track', id: track.id, label: 'dainą' })}
            variant="surface"
          />
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', paddingRight: 76 }}>
          {/* Profile thumb. Iteracijų istorija: 100x100 (per didelis, upscale
              artifact'ai) → 72x72 (vis dar matosi pixelation) → 56x56. Music.lt
              cover/avatar dažnai 60-80px source → bet kas <60px display'inant
              GUARANTUOJA, kad nevyksta upscale, todėl natūralus rendering'as.
              Be filter — smaller box nereikalauja smoothing'o. */}
          <div style={{ flexShrink: 0, width: 56, height: 56, borderRadius: 10, overflow: 'hidden', boxShadow: '0 6px 18px rgba(0,0,0,.5)', background: 'var(--cover-placeholder)', position: 'relative' }}>
            {(() => {
              // Priority: newest galerijos foto > primary album cover > artist legacy thumb.
              // Galerijos foto dažniausiai didesnės rezoliucijos nei legacy thumb,
              // todėl matomas mažas profile thumb atrodo aštresnis.
              const thumbSrc = (artist as any).profile_thumb_url || primaryAlbum?.cover_image_url || artist.cover_image_url || null
              return thumbSrc ? (
                <img
                  src={proxyImg(thumbSrc)}
                  alt=""
                  style={{
                    width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                    imageRendering: 'auto',
                  }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🎵</div>
              )
            })()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.12em', color: '#f97316', fontFamily: 'Outfit,sans-serif', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span>{track.type === 'normal' ? 'Daina' : (track.type || 'Daina')}</span>
              {track.is_new && <span style={{ fontSize: 8, padding: '1px 6px', borderRadius: 999, background: 'rgba(249,115,22,.18)', border: '1px solid rgba(249,115,22,.3)', color: '#f97316' }}>NEW</span>}
              {/* archive label removed */}
            </div>
            <h1 style={{ fontFamily: 'Outfit,sans-serif', fontSize: 'clamp(15px,2vw,20px)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-.025em', color: 'var(--text-primary)', margin: '0 0 5px', wordBreak: 'break-word' }}>{track.title}</h1>
            {/* Atlikėjų sąrašas — bendra LT formatavimo logika su modal'u
                (komos tarp ne-paskutinių, „ir" prieš paskutinį). Vienas
                šaltinis: lib/format-artists. */}
            <div style={{ fontSize: 13, marginBottom: 2, lineHeight: 1.3 }}>
              {formatArtistList(
                { id: artist.id, slug: artist.slug, name: artist.name },
                track.featuring,
              )}
            </div>
            {dateStr && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{dateStr}</div>}
          </div>
        </div>
      </div>
      {albums.length > 0 && (
        <div style={{ padding: '10px 14px', display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--card-border-subtle)' }}>
          <span style={{ fontSize: 10, color: 'var(--text-faint)', alignSelf: 'center', fontFamily: 'Outfit,sans-serif', textTransform: 'uppercase', letterSpacing: '.06em' }}>Albumas</span>
          {albums.map(a => (
            <Link key={a.id} href={`/albumai/${artist.slug}-${a.slug}-${a.id}`}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px 5px 6px', borderRadius: 999, background: 'var(--card-hover-bg)', border: '1px solid var(--card-border-default)', textDecoration: 'none' }}>
              {a.cover_image_url
                ? <img src={proxyImg(a.cover_image_url)} style={{ width: 22, height: 22, borderRadius: 5, objectFit: 'cover' }} alt="" />
                : <div style={{ width: 22, height: 22, borderRadius: 5, background: 'var(--cover-placeholder)' }} />}
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>{a.title}</span>
              {a.year && <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{a.year}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  )

  // YT video availability probe — bandom hqdefault.jpg dimensijas. YT
  // unavailable video grąžina 120x90 generic placeholder, live video —
  // 480x360 thumbnail. null = nepatikrinta, true = OK, false = unavailable.
  const [vidAvailable, setVidAvailable] = useState<boolean | null>(null)
  useEffect(() => {
    if (!vid) { setVidAvailable(null); return }
    setVidAvailable(null)
    const img = new Image()
    img.onload = () => {
      // hqdefault size: live = 480x360, unavailable = 120x90
      setVidAvailable(img.naturalWidth >= 200)
    }
    img.onerror = () => setVidAvailable(false)
    img.src = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`
  }, [vid])

  // PlayerCard stable with useMemo
  const PlayerCard = useMemo(() => {
    const showVideo = vid && vidAvailable !== false  // hide if known dead
    if (!showVideo && !track.show_player) return null
    return (
      <div style={{ ...cardStyle }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 13px 8px', borderBottom: 'var(--card-border-subtle)' }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MusicIcon s={15} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--head-text)', fontFamily: 'Outfit,sans-serif' }}>Klausyk</span>
        </div>
        {showVideo && <YoutubeEmbed videoId={vid!} />}
        {track.spotify_id && (
          <iframe src={`https://open.spotify.com/embed/track/${track.spotify_id}?utm_source=generator&theme=0`}
            style={{ width: '100%', height: 80, border: 'none', display: 'block', borderTop: '1px solid var(--card-border-subtle)' }}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" />
        )}
      </div>
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vid, vidAvailable, track.spotify_id, track.show_player])

  const AICard = () => {
    if (!track.show_ai_interpretation) return null
    return (
      <div style={cardStyle}>
        <div style={headStyle}>
          <span>✦ AI interpretacija</span>
          {!aiText && <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--text-faint)', textTransform: 'none', letterSpacing: 0 }}>beta</span>}
        </div>
        <div style={{ padding: 14 }}>
          {!aiText && !aiLoad && !aiErr && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '4px 0' }}>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', margin: 0, lineHeight: 1.6 }}>
                Claude perskaitys žodžius ir sukurs interpretaciją bei abstraktų paveikslėlį, perteikiantį dainos nuotaiką.
              </p>
              <button onClick={doAI}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 999, background: 'rgba(249,115,22,.12)', border: '1px solid rgba(249,115,22,.35)', color: '#f97316', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit,sans-serif' }}>
                ✦ Generuoti
              </button>
            </div>
          )}
          {aiLoad && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '12px 0', color: 'var(--text-muted)', fontSize: 12 }}>
              <span style={{ animation: 'spin 1.2s linear infinite', display: 'inline-block', fontSize: 20, color: '#f97316' }}>✦</span>
              Claude analizuoja žodžius…
            </div>
          )}
          {aiErr && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '6px 0' }}>
              Nepavyko. <button onClick={doAI} style={{ color: '#f97316', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Bandyti dar kartą</button>
            </div>
          )}
          {aiText && (
            <div>
              <div style={{ fontSize: 13, color: 'var(--dyk-text)', lineHeight: 1.85 }}>
                {aiText.split('\n\n').filter(p => p.trim()).map((p, i) => (
                  <p key={i} style={{ margin: i > 0 ? '12px 0 0' : 0 }}>{p.trim()}</p>
                ))}
              </div>

            </div>
          )}
        </div>
      </div>
    )
  }

  const TriviaCard = () => {
    if (!track.description && !trivia) return null
    return (
      <div style={{ ...cardStyle, background: 'var(--dyk-bg)', border: '1px solid var(--dyk-border)' }}>
        <div style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: '#f97316', fontFamily: 'Outfit,sans-serif', marginBottom: 7 }}>★ Ar žinojai?</div>
          <p style={{ fontSize: 12, color: 'var(--dyk-text)', lineHeight: 1.75, margin: 0 }}>{track.description || trivia}</p>
        </div>
      </div>
    )
  }

  const VersionsCard = () => {
    if (versions.length === 0) return null
    const vis = showAllV ? versions : versions.slice(0, 4)
    return (
      <div style={cardStyle}>
        <div style={headStyle}>Versijos ir remixai <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--text-faint)', textTransform: 'none', letterSpacing: 0 }}>{versions.length}</span></div>
        {vis.map((v, i) => (
          <Link key={v.id} href={`/dainos/${artist.slug}-${v.slug}-${v.id}`}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: i < vis.length - 1 ? '1px solid var(--card-border-subtle)' : 'none', textDecoration: 'none' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--card-hover-bg)')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: ytId(v.video_url) ? 'rgba(249,115,22,.12)' : 'var(--cover-placeholder)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${ytId(v.video_url) ? 'rgba(249,115,22,.2)' : 'var(--card-border-default)'}` }}>
              {ytId(v.video_url) ? <svg width="9" height="9" viewBox="0 0 10 10" fill="#f97316"><polygon points="2,1 9,5 2,9"/></svg> : <MusicIcon s={11} c="var(--text-faint)" />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.title}</div>
              <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>{v.type === 'normal' ? 'Daina' : v.type}</div>
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>→</span>
          </Link>
        ))}
        {versions.length > 4 && (
          <button onClick={() => setShowAllV(x => !x)}
            style={{ width: '100%', padding: 9, background: 'transparent', border: 'none', borderTop: '1px solid var(--card-border-subtle)', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'Outfit,sans-serif' }}>
            {showAllV ? '↑ Mažiau' : `Visos ${versions.length} versijos ↓`}
          </button>
        )}
      </div>
    )
  }

  // Diskusijų sekcija — naudojam unifikuotą EntityCommentsBlock (track modal,
  // album page taip pat). Komponentas pats fetch'ina modern + legacy
  // komentarus, palaiko like'us, replies, music attachments.
  const DiscussionsCard = () => (
    <div style={cardStyle}>
      <div style={{ padding: '14px 14px 12px' }}>
        <EntityCommentsBlock
          entityType="track"
          entityId={track.id}
          title="Komentarai"
        />
      </div>
    </div>
  )

  const RelatedCard = () => {
    if (relatedTracks.length === 0) return null
    return (
      <div style={cardStyle}>
        <div style={headStyle}>Kitos {artist.name} dainos</div>
        {relatedTracks.slice(0, 6).map((t, i) => (
          <Link key={t.id} href={`/dainos/${artist.slug}-${t.slug}-${t.id}`}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: i < 5 ? '1px solid var(--card-border-subtle)' : 'none', textDecoration: 'none' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--card-hover-bg)')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
            <div style={{ width: 30, height: 30, borderRadius: 6, background: 'var(--cover-placeholder)', flexShrink: 0, overflow: 'hidden' }}>
              {artist.cover_image_url && <img src={proxyImg(artist.cover_image_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
            </div>
            {ytId(t.video_url) && (
              <div style={{ width: 18, height: 18, borderRadius: 4, background: 'rgba(249,115,22,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="7" height="7" viewBox="0 0 10 10" fill="#f97316"><polygon points="2,1 9,5 2,9"/></svg>
              </div>
            )}
          </Link>
        ))}
      </div>
    )
  }

  // ── Lyrics ─────────────────────────────────────────────────────────────────
  const LyricsCard = () => (
    <div style={cardStyle}>
      {/* Tabs — Akordai tabas rodomas TIK jei yra akordų. Anksčiau buvo
          rodomas su "Akordai dar nepridėti" empty state, bet vis tiek
          užimdavo vietą. */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--card-border-subtle)', padding: '0 14px' }}>
        {(['lyrics', 'chords'] as const).filter(t => t === 'lyrics' || hasChords).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '11px 12px 10px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: tab === t ? 800 : 600, color: tab === t ? '#f97316' : 'var(--text-faint)', borderBottom: tab === t ? '2px solid #f97316' : '2px solid transparent', marginBottom: -1, fontFamily: 'Outfit,sans-serif', textTransform: 'uppercase', letterSpacing: '.07em' }}>
            {t === 'lyrics'
              ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M3 18h12v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg> Dainos tekstas</>
              : <><GuitarIcon s={11} /> Akordai</>}
          </button>
        ))}
        {tab === 'lyrics' && hasLyrics && (
          <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-faint)', fontStyle: 'italic' }}>Pažymėk tekstą</span>
        )}
      </div>

      {/* Lyrics content — naudojam unifikuotą LyricsWithReactions (tas pats
          komponentas veikia track modal'e, čia, ir bus visur kur reikia
          reaguoti į konkrečias dainos eilutes). */}
      {tab === 'lyrics' && (
        !hasLyrics
          ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>Dainos tekstas dar nepridėtas</div>
          : (
            <div style={{ position: 'relative', padding: '16px 18px' }}>
              <LyricsWithReactions trackId={track.id} lyrics={track.lyrics ?? ''} />
            </div>
          )
      )}

      {/* Chords content */}
      {tab === 'chords' && (
        !hasChords
          ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>Akordai dar nepridėti</div>
          : (
            <div style={{ padding: '12px 18px' }}>
              <div style={{ marginBottom: 10, fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <GuitarIcon c="var(--text-muted)" /> Akordai ir žodžiai
              </div>
              <pre style={{ fontFamily: "'DM Mono','Fira Mono',monospace", fontSize: 13, lineHeight: 1.9, color: 'var(--lyric-text)', margin: 0, whiteSpace: 'pre-wrap' }}>
                {(track.chords ?? '').split('\n').map((line, i) => {
                  const isChord = /^[A-G][#bm]?(maj|min|aug|dim|sus|add|M)?[0-9]?(\s+[A-G][#bm]?(maj|min|aug|dim|sus|add|M)?[0-9]?)*\s*$/.test(line)
                  if (isChord) return (
                    <div key={i} style={{ marginBottom: 2 }}>
                      {line.split(/(\s+)/).map((tok, j) => tok.trim()
                        ? <span key={j} style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 5, background: 'var(--chord-bg)', color: 'var(--chord-text)', fontWeight: 700, marginRight: 4, fontSize: 12 }}>{tok}</span>
                        : <span key={j}>{tok}</span>)}
                    </div>
                  )
                  return <div key={i}>{line || ' '}</div>
                })}
              </pre>
            </div>
          )
      )}
    </div>
  )

  // ══════════════════════════════════════════════════════════════════════════
  // MAIN RETURN — modal-style layout for the standalone track page.
  // Idėja: pati struktūra atitiktu artist'o TrackInfoModal'ą — top bar pilnu
  // ilgiu su thumb + title + LikePill + DropBar + meta + actions, paskui
  // 3-col body (lyrics | comments | player+related) wide desktop'e, 2-col
  // (lyrics | comments) viduriniam desktop'e, mobile'e tab toggle tarp lyrics
  // ir comments. Vientisas vizualinis flow per modal ir page.
  // ══════════════════════════════════════════════════════════════════════════

  // Pageload helper - main artist + featuring formatted as a single line
  const artistLine = formatArtistList(
    { id: artist.id, slug: artist.slug, name: artist.name },
    track.featuring,
  )
  const hasMobileTabs = hasLyrics  // tabs only matter when we have content for both
  const trackTypeLabel = track.type === 'normal' ? 'Daina' : (track.type || 'Daina')

  return (
    <div className="min-h-screen bg-[var(--bg-surface)] text-[var(--text-primary)]" style={{ fontFamily: "'DM Sans',system-ui,sans-serif", WebkitFontSmoothing: 'antialiased' }}>

      {/* ── TOP BAR — pilnu viewport pločio, modal-style ─────────────────── */}
      <div className="flex items-center gap-3 border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3 sm:px-5">
        {/* Back arrow — vieta, kur modal'e būtų X. Iš track page useris
            grįžta į ankstesnį puslapį (artist'ą, paiešką, atradimus). */}
        <Link
          href={`/atlikejai/${artist.slug}`}
          aria-label="Grįžti pas atlikėją"
          title={`Grįžti pas ${artist.name}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
        >
          <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        {/* Artist thumb */}
        {(() => {
          const thumbSrc = (artist as any).profile_thumb_url || primaryAlbum?.cover_image_url || artist.cover_image_url || null
          return thumbSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={proxyImg(thumbSrc)}
              alt={artist.name}
              referrerPolicy="no-referrer"
              style={{ objectPosition: 'center top' }}
              className="hidden h-11 w-11 shrink-0 rounded-xl border border-[var(--border-subtle)] object-cover sm:block"
            />
          ) : null
        })()}
        {/* Identity cluster — title + featured + LikePill + DropBar */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-['Outfit',sans-serif] text-[16px] font-extrabold leading-tight text-[var(--text-primary)] sm:text-[17px]">
              {track.title}
            </span>
            {track.is_new && (
              <span className="inline-flex items-center rounded-full border border-[rgba(249,115,22,0.3)] bg-[rgba(249,115,22,0.18)] px-2 py-0.5 font-['Outfit',sans-serif] text-[9px] font-extrabold uppercase tracking-wider text-[var(--accent-orange)]">
                NEW
              </span>
            )}
            <LikePill
              likes={initialLikes + (liked ? 1 : 0)}
              selfLiked={liked}
              onToggle={() => setLiked(v => !v)}
              onOpenModal={() => setLikersModalEntity({ type: 'track', id: track.id, label: 'dainą' })}
              variant="surface"
            />
            <DropBar trackId={track.id} compact />
          </div>
          <div className="mt-0.5 truncate text-[12px] sm:text-[12.5px]">
            <span className="text-[var(--text-faint)]">{trackTypeLabel} · </span>
            {artistLine}
          </div>
        </div>
        {/* Meta cluster — data + albumai. Slepiasi siauresniam ekrane. */}
        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          {dateStr && (
            <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-1.5 font-['Outfit',sans-serif] text-[12px] font-extrabold text-[var(--text-primary)]">
              {dateStr}
            </span>
          )}
          {albums.slice(0, 2).map(a => (
            <Link
              key={a.id}
              href={`/albumai/${artist.slug}-${a.slug}-${a.id}`}
              title={a.title}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] py-0.5 pl-1 pr-2.5 no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
            >
              <span className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-[var(--cover-placeholder)]">
                {a.cover_image_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={proxyImg(a.cover_image_url)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                  : null}
              </span>
              <span className="max-w-[140px] truncate font-['Outfit',sans-serif] text-[11.5px] font-extrabold text-[var(--text-primary)]">{a.title}</span>
            </Link>
          ))}
          {albums.length > 2 && (
            <span
              title={albums.slice(2).map(a => a.title).join(', ')}
              className="inline-flex h-9 shrink-0 items-center rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 font-['Outfit',sans-serif] text-[11.5px] font-extrabold text-[var(--text-muted)]"
            >+{albums.length - 2}</span>
          )}
        </div>
        {/* Admin score — kai turim score, mažas chip'as šalia meta. Kiti
            useriai šito nemato (ScoreCard pats handle'ina admin gating). */}
        {track.score !== null && track.score !== undefined && (
          <div className="hidden xl:block">
            <ScoreCard entityType="track" score={track.score} breakdown={track.score_breakdown} compact />
          </div>
        )}
      </div>

      {/* ── Mobile tab strip ─────────────────────────────────────────────── */}
      {hasMobileTabs && (
        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-1.5 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileTab('lyrics')}
            className={[
              "relative flex items-center gap-1.5 px-1 py-1.5 font-['Outfit',sans-serif] text-[12px] font-bold transition-colors",
              mobileTab === 'lyrics'
                ? 'text-[var(--accent-orange)] after:absolute after:inset-x-0 after:-bottom-[6px] after:h-[2px] after:bg-[var(--accent-orange)]'
                : 'text-[var(--text-muted)]',
            ].join(' ')}
          >
            Tekstas
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('comments')}
            className={[
              "relative flex items-center gap-1.5 px-1 py-1.5 font-['Outfit',sans-serif] text-[12px] font-bold transition-colors",
              mobileTab === 'comments'
                ? 'text-[var(--accent-orange)] after:absolute after:inset-x-0 after:-bottom-[6px] after:h-[2px] after:bg-[var(--accent-orange)]'
                : 'text-[var(--text-muted)]',
            ].join(' ')}
          >
            Komentarai
          </button>
        </div>
      )}

      {/* ── Mobile inline player — kaip modal'e, virš tabs/turinio ──────── */}
      {vid && (
        <div className="aspect-video w-full bg-black lg:hidden">
          <iframe
            key={`mobile-track-${vid}`}
            src={`https://www.youtube.com/embed/${vid}?playsinline=1&rel=0&modestbranding=1&iv_load_policy=3`}
            title={`${track.title} — ${artist.name}`}
            className="h-full w-full"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      )}

      {/* ── Body — desktop 3-col / tablet 2-col / mobile single ─────────── */}
      <div className={[
        'mx-auto w-full max-w-[1600px]',
        // 1024-1279 (lg only): 2 col grid (lyrics + comments)
        // 1280+ (xl): 3 col grid (lyrics + comments + player/related)
        // <1024 (mobile): single col with tab toggle
        'grid grid-cols-1',
        hasLyrics
          ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]'
          : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]',
        'lg:divide-x lg:divide-[var(--border-subtle)]',
      ].join(' ')}>

        {/* Lyrics col — desktop'e visada matoma; mobile'e tik kai tab='lyrics'.
            Be lyrics — pati skiltis nesirenderinama, bet komentarai užima
            visą plotą per kitą col grid'ą aukščiau. */}
        {hasLyrics && (
          <div className={[
            'min-h-0 px-5 py-5',
            mobileTab === 'lyrics' ? 'block' : 'hidden lg:block',
          ].join(' ')}>
            <div className="mb-4 flex items-baseline gap-2">
              <div className="font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Dainos tekstas
              </div>
              <span className="font-['Outfit',sans-serif] text-[9px] font-extrabold uppercase tracking-wider text-[var(--accent-orange)]">
                pažymėk → reaguok
              </span>
              {hasChords && (
                <button
                  type="button"
                  onClick={() => setTab(tab === 'lyrics' ? 'chords' : 'lyrics')}
                  className="ml-auto inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-2 py-0.5 font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                >
                  <GuitarIcon s={9} /> {tab === 'lyrics' ? 'Akordai' : 'Tekstas'}
                </button>
              )}
            </div>
            {tab === 'lyrics' ? (
              <LyricsWithReactions trackId={track.id} lyrics={track.lyrics ?? ''} compact />
            ) : (
              <pre style={{ fontFamily: "'DM Mono','Fira Mono',monospace", fontSize: 13, lineHeight: 1.9, color: 'var(--lyric-text)', margin: 0, whiteSpace: 'pre-wrap' }}>
                {(track.chords ?? '').split('\n').map((line, i) => {
                  const isChord = /^[A-G][#bm]?(maj|min|aug|dim|sus|add|M)?[0-9]?(\s+[A-G][#bm]?(maj|min|aug|dim|sus|add|M)?[0-9]?)*\s*$/.test(line)
                  if (isChord) return (
                    <div key={i} style={{ marginBottom: 2 }}>
                      {line.split(/(\s+)/).map((tok, j) => tok.trim()
                        ? <span key={j} style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 5, background: 'var(--chord-bg)', color: 'var(--chord-text)', fontWeight: 700, marginRight: 4, fontSize: 12 }}>{tok}</span>
                        : <span key={j}>{tok}</span>)}
                    </div>
                  )
                  return <div key={i}>{line || ' '}</div>
                })}
              </pre>
            )}
          </div>
        )}

        {/* Comments col */}
        <div className={[
          'min-h-0 px-5 py-5',
          mobileTab === 'comments' ? 'block' : 'hidden lg:block',
        ].join(' ')}>
          <EntityCommentsBlock
            entityType="track"
            entityId={track.id}
            compact
            title="Komentarai"
          />
        </div>

        {/* Player + Daugiau col — tik xl (≥1280px). Mobile'e player'is
            jau virš body'jo (lg:hidden). */}
        <div className="hidden min-h-0 flex-col gap-4 px-5 py-5 xl:flex">
          {vid ? (
            <div>
              <div className="mb-2 font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Klausyti
              </div>
              <div className="aspect-video w-full overflow-hidden rounded-xl bg-black shadow-[0_18px_40px_-12px_rgba(0,0,0,0.5)]">
                <iframe
                  key={`desktop-track-${vid}`}
                  src={`https://www.youtube.com/embed/${vid}?playsinline=1&rel=0&modestbranding=1&iv_load_policy=3`}
                  title={`${track.title} — ${artist.name}`}
                  className="h-full w-full"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                />
              </div>
              {track.spotify_id && (
                <iframe
                  src={`https://open.spotify.com/embed/track/${track.spotify_id}?utm_source=generator&theme=0`}
                  className="mt-2 block w-full"
                  style={{ height: 80, border: 'none' }}
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                />
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-elevated)] py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--card-bg)] ring-1 ring-[var(--border-subtle)]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--text-muted)]">
                  <path d="M23 7l-7 5 7 5V7z" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
              </div>
              <div className="font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Vaizdo įrašo nėra
              </div>
            </div>
          )}

          {/* Daugiau iš artist'o — kortelės kaip modal'e */}
          {relatedTracks.length > 0 && (
            <div>
              <div className="mb-2 font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Daugiau
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
                {relatedTracks.filter(t => ytId(t.video_url)).map(t => {
                  const tvid = ytId(t.video_url)
                  const thumb = tvid ? `https://i.ytimg.com/vi/${tvid}/mqdefault.jpg` : null
                  return (
                    <Link
                      key={t.id}
                      href={`/dainos/${artist.slug}-${t.slug}-${t.id}`}
                      title={t.title}
                      className="group flex w-[180px] shrink-0 flex-col gap-1.5 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--card-bg)] p-1.5 no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
                    >
                      <div className="aspect-video w-full overflow-hidden rounded bg-black">
                        {thumb && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
                        )}
                      </div>
                      <div className="px-1">
                        <div className="truncate font-['Outfit',sans-serif] text-[12px] font-extrabold text-[var(--text-primary)]">{t.title}</div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {/* AI / Trivia / Versions — kompaktiški card'ai dešinėje. Žemiau
              video, kad nebūtų per daug informacijos top'e. */}
          <AICard />
          <TriviaCard />
          <VersionsCard />
        </div>

      </div>

      {/* ── Mobile-only ekstra (po main flow) — AI, Trivia, Versions, Daugiau */}
      <div className="flex flex-col gap-3 px-4 pb-12 pt-4 lg:hidden">
        <AICard />
        <TriviaCard />
        <VersionsCard />
        {relatedTracks.length > 0 && (
          <div>
            <div className="mb-2 font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Daugiau
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
              {relatedTracks.filter(t => ytId(t.video_url)).map(t => {
                const tvid = ytId(t.video_url)
                const thumb = tvid ? `https://i.ytimg.com/vi/${tvid}/mqdefault.jpg` : null
                return (
                  <Link
                    key={t.id}
                    href={`/dainos/${artist.slug}-${t.slug}-${t.id}`}
                    title={t.title}
                    className="group flex w-[160px] shrink-0 flex-col gap-1.5 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--card-bg)] p-1.5 no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
                  >
                    <div className="aspect-video w-full overflow-hidden rounded bg-black">
                      {thumb && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="px-1">
                      <div className="truncate font-['Outfit',sans-serif] text-[12px] font-extrabold text-[var(--text-primary)]">{t.title}</div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Likers modal — universal'us pop-over visiems entity types */}
      {likersModalEntity && (
        <div
          onClick={() => setLikersModalEntity(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--bg-surface)', borderRadius: 16, maxWidth: 520, width: '100%', maxHeight: '80vh', overflow: 'auto', border: '1px solid var(--border-default)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ fontFamily: 'Outfit,sans-serif', fontSize: 13, fontWeight: 800 }}>
                Patiko {likersModalEntity.label}
                {likersModalUsers && <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontSize: 11 }}>({likersModalUsers.length})</span>}
              </div>
              <button onClick={() => setLikersModalEntity(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: '12px 18px' }}>
              {likersModalUsers === null ? (
                <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-faint)' }}>Kraunama…</div>
              ) : likersModalUsers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-faint)' }}>Nėra žinomų užliejusių (likers nebuvo importuoti)</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                  {likersModalUsers.map(u => (
                    <div key={u.user_username} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 6, borderRadius: 8, background: 'var(--card-hover-bg)' }}>
                      {u.user_avatar_url ? (
                        <img src={proxyImg(u.user_avatar_url)} alt="" style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: 'rgba(99,102,241,.18)', color: '#818cf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, fontFamily: 'Outfit,sans-serif' }}>{u.user_username.charAt(0).toUpperCase()}</div>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.user_username}</div>
                        {u.user_rank && <div style={{ fontSize: 10, color: 'var(--text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.user_rank}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media(max-width:860px){.tr-desk{display:none!important}.tr-mob{display:flex!important}}
        ::selection{background:rgba(249,115,22,.25)}
        @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
        @keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes fadeIn{from{opacity:0;transform:translateX(-50%) translateY(4px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
      `}</style>
    </div>
  )
}
