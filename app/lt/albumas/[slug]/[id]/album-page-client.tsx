'use client'
// app/lt/albumas/[slug]/[id]/album-page-client.tsx
import { useState, useEffect } from 'react'
import Link from 'next/link'
import LegacyLikesPanel, { LegacyBadge, type LegacyLikeUser } from '@/components/LegacyLikesPanel'
import ScoreCard from '@/components/ScoreCard'

type Track = {
  id: number; slug: string; title: string; type: string
  video_url: string | null; is_new: boolean; is_single: boolean
  position: number; featuring: string[]
  // top comment on this track (pre-fetched server-side, optional)
  topComment?: { author: string; text: string; likes: number } | null
}
type Album = {
  id: number; slug: string; title: string; type: string
  year?: number; month?: number; day?: number; dateFormatted: string | null
  cover_image_url: string | null; video_url: string | null
  show_player: boolean; is_upcoming: boolean
  type_studio?: boolean
  score?: number | null; score_breakdown?: any
  peak_chart_position?: number | null; certifications?: any
}
type Artist = { id: number; slug: string; name: string; cover_image_url: string | null }
type SimpleAlbum = { id: number; slug: string; title: string; year?: number; cover_image_url?: string; type: string }
type NewsItem = { id: number; slug: string; title: string; image_small_url: string | null; published_at: string }

type Props = {
  album: Album; artist: Artist; tracks: Track[]
  otherAlbums: SimpleAlbum[]; similarAlbums: any[]
  likes: number; relatedNews?: NewsItem[]
  isLegacy?: boolean
  legacyLikes?: { count: number; users: LegacyLikeUser[] }
}

function ytId(url?: string | null) {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  return m ? m[1] : null
}

function formatDate(dateFormatted: string | null, year?: number, month?: number, day?: number): string | null {
  if (!year) return dateFormatted
  const months = ['sausio','vasario','kovo','balandžio','gegužės','birželio','liepos','rugpjūčio','rugsėjo','spalio','lapkričio','gruodžio']
  if (month && day) return `${year} m. ${months[month - 1]} ${day} d.`
  if (month) return `${year} m. ${months[month - 1]}`
  return `${year} m.`
}

function MusicIcon({ size = 16, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
    </svg>
  )
}

export default function AlbumPageClient({ album, artist, tracks, otherAlbums, similarAlbums, likes, relatedNews = [], isLegacy = false, legacyLikes }: Props) {
  const [playingIdx, setPlayingIdx] = useState(-1)
  const [liked, setLiked] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => { setLoaded(true) }, [])

  const firstTrackWithVideo = tracks.findIndex(t => ytId(t.video_url) !== null)
  const effectiveIdx = playingIdx >= 0 ? playingIdx : (firstTrackWithVideo >= 0 ? firstTrackWithVideo : -1)
  const currentTrack = effectiveIdx >= 0 ? tracks[effectiveIdx] : null
  const currentVid = ytId(currentTrack?.video_url)
  const albumVid = ytId(album.video_url)
  const activeVid = currentVid || albumVid

  const VISIBLE = 5
  // Jei visų tracks position vienoda (import'e praradom originalią tvarką),
  // UI neturi rodyti klaidinančių numerių — vietoj to sortinam pagal įrašymo
  // eilę (tracks.id) ir rodom disc icon'ą. Importo side pataisa bus kitam thread'e.
  const positionsUnknown = tracks.length > 1 && tracks.every(t => t.position === tracks[0].position)
  const sortedTracks = positionsUnknown
    ? [...tracks].sort((a, b) => a.id - b.id)
    : [...tracks].sort((a, b) => a.position - b.position)
  const mobileVisible = expanded ? sortedTracks : sortedTracks.slice(0, VISIBLE)
  const hasMore = tracks.length > VISIBLE

  const hasLegacyLikes = !!legacyLikes && legacyLikes.count > 0

  const maxPop = tracks.length
  const popScore = (t: Track) => Math.min(1, (maxPop - t.position + 1) / maxPop + (t.is_single ? 0.3 : 0))

  const dateStr = formatDate(album.dateFormatted, album.year, album.month, album.day)
  const albumTypeLabel = album.type_studio ? 'Studijinis albumas' : album.type

  const card: React.CSSProperties = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-default)',
    borderRadius: 16,
    overflow: 'hidden',
  }

  const cardHead: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px', borderBottom: '1px solid var(--sub-border)',
    fontSize: 11, fontWeight: 700, color: 'var(--text-primary)',
    fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase', letterSpacing: '.08em',
  }

  const LikeBtn = () => (
    <button
      onClick={() => setLiked(v => !v)}
      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0, border: `1px solid ${liked ? 'rgba(249,115,22,.4)' : 'var(--link-btn-border)'}`, background: liked ? 'rgba(249,115,22,.12)' : 'var(--link-btn-bg)', color: liked ? '#f97316' : 'var(--text-muted)', transition: 'all .15s', fontFamily: 'Outfit, sans-serif' }}
    >
      {liked ? '♥' : '♡'} {likes + (liked ? 1 : 0)}
    </button>
  )

  const AlbumInfoCard = ({ coverSize = 110 }: { coverSize?: number }) => (
    <div style={card}>
      <div style={{ background: 'var(--cover-area-bg)', padding: '14px', display: 'flex', gap: 14, alignItems: 'center', opacity: loaded ? 1 : 0, transition: 'opacity .4s', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 10, right: 12 }}><LikeBtn /></div>
        <div style={{ flexShrink: 0, width: coverSize, height: coverSize, borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-card)', background: 'var(--cover-placeholder)' }}>
          {album.cover_image_url
            ? <img src={album.cover_image_url} alt={album.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>💿</div>}
        </div>
        <div style={{ flex: 1, minWidth: 0, paddingRight: 48 }}>
          <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.12em', color: '#f97316', fontFamily: 'Outfit, sans-serif', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span>{albumTypeLabel}</span>
            {album.is_upcoming && <span style={{ fontSize: 8, padding: '1px 6px', borderRadius: 999, background: 'rgba(249,115,22,.18)', border: '1px solid rgba(249,115,22,.3)', color: '#f97316' }}>Greitai</span>}
            {/* archive label removed */}
          </div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(16px,2vw,20px)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-.025em', color: 'var(--text-primary)', margin: '0 0 5px', wordBreak: 'break-word' }}>{album.title}</h1>
          <Link href={`/atlikejai/${artist.slug}`} style={{ fontSize: 13, fontWeight: 700, color: '#f97316', textDecoration: 'none', display: 'block', marginBottom: 4 }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '.75')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>{artist.name}
          </Link>
          {dateStr && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{dateStr}</div>}
        </div>
      </div>
    </div>
  )

  const PlayerCard = () => (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 13px 8px', borderBottom: '1px solid var(--sub-border)' }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <MusicIcon size={15} color="#fff" />
        </div>
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif' }}>Albumo muzika</span>
      </div>
      {activeVid ? (
        <iframe key={activeVid} src={`https://www.youtube.com/embed/${activeVid}?rel=0`} allow="autoplay; encrypted-media" allowFullScreen style={{ width: '100%', aspectRatio: '16/9', border: 'none', display: 'block' }} />
      ) : (
        <div style={{ width: '100%', aspectRatio: '16/9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'var(--cover-area-bg)' }}>
          <div style={{ opacity: .2 }}><MusicIcon size={28} color="var(--text-primary)" /></div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Vaizdo įrašas nepriskirtas</div>
        </div>
      )}
    </div>
  )

  // ── TrackRow ─────────────────────────────────────────
  // desktop=true  →  A-variant pop bar (border-bottom coloured by popularity)
  //                   title is a Link to track page, thumb click plays video
  // desktop=false →  mobile: floating pop bar under row (existing style)
  const TrackRow = ({ t, isPlaying, desktop = false }: { t: Track; isPlaying: boolean; desktop?: boolean }) => {
    const hasOwnVideo = !!ytId(t.video_url)
    const canPlay = hasOwnVideo || !!albumVid

    // rankRatio: 1.0 = most popular (position 1), 0.0 = least popular (last)
    const rankRatio = tracks.length > 1
      ? (tracks.length - t.position) / (tracks.length - 1)
      : 1
    // Pop bar: fixed 80px track, fill width = rankRatio * 80px
    const popBarFill = Math.round(rankRatio * 100)

    const titleCol = isPlaying ? '#f97316' : 'var(--text-primary)'
    const numCol   = isPlaying ? '#f97316' : 'var(--text-secondary)'

    return (
      <div
        style={{
          padding: desktop ? '0 16px 0 18px' : '9px 16px 7px',
          borderBottom: '1px solid var(--border-subtle)',
          background: isPlaying ? 'var(--bg-active)' : 'transparent',
          transition: 'background .1s',
          minHeight: desktop ? 52 : undefined,
          display: desktop ? 'flex' : 'block',
          alignItems: desktop ? 'center' : undefined,
          gap: desktop ? 10 : undefined,
          cursor: desktop && canPlay ? 'pointer' : 'default',
        }}
        onClick={desktop && canPlay ? () => setPlayingIdx(tracks.indexOf(t)) : undefined}
        onMouseEnter={e => { if (!isPlaying) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = isPlaying ? 'var(--bg-active)' : 'transparent' }}
      >
        {/* ── desktop layout ── */}
        {desktop ? (
          <>
            {/* Position number — arba disc icon jei originali tvarka prarasta */}
            {positionsUnknown ? (
              <span style={{ width: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: numCol, opacity: isPlaying ? 1 : 0.55 }} title="Originalios tvarkos nėra">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="9" />
                  <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
                </svg>
              </span>
            ) : (
              <span style={{ width: 22, textAlign: 'center', fontSize: 11, flexShrink: 0, fontFamily: 'Outfit, sans-serif', color: numCol, fontWeight: isPlaying ? 800 : 400 }}>
                {t.position}
              </span>
            )}

            {/* Thumbnail — purely decorative on desktop */}
            <div style={{ width: 34, height: 34, borderRadius: 6, flexShrink: 0, overflow: 'hidden', background: 'var(--cover-placeholder)', position: 'relative' }}>
              {album.cover_image_url
                ? <img src={album.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>🎵</div>}
              {isPlaying && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(249,115,22,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
                </div>
              )}
              {/* Own-video badge */}
              {!isPlaying && hasOwnVideo && (
                <div style={{ position: 'absolute', bottom: 2, right: 2, width: 12, height: 12, borderRadius: 3, background: 'rgba(249,115,22,.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <svg width="5" height="5" viewBox="0 0 10 10" fill="#fff"><polygon points="2,1 9,5 2,9"/></svg>
                </div>
              )}
            </div>

            {/* Title + comment */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <Link
                href={`/lt/daina/${t.slug}/${t.id}/`}
                style={{ fontSize: 13, fontWeight: isPlaying ? 700 : 600, color: titleCol, textDecoration: 'none', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                onMouseEnter={e => { if (!isPlaying) e.currentTarget.style.color = '#f97316' }}
                onMouseLeave={e => { if (!isPlaying) e.currentTarget.style.color = titleCol }}
              >
                {t.title}
                {t.featuring.length > 0 && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> su {t.featuring.join(', ')}</span>}
              </Link>
              {t.topComment ? (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 1 }}>
                  <span style={{ fontSize: 10, color: 'var(--comment-quote)', fontStyle: 'italic', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', flex: 1 }}>„{t.topComment.text}"</span>
                  <span style={{ fontSize: 9, color: 'var(--comment-author)', flexShrink: 0 }}>— {t.topComment.author}</span>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>♥ {t.topComment.likes}</span>
                </div>
              ) : (
                <div style={{ marginTop: 1, fontSize: 10, color: 'var(--text-faint)', fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Būk pirmas — palik komentarą…
                </div>
              )}
            </div>

            {/* Badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              {t.is_new && <span style={{ fontSize: 7, fontWeight: 800, padding: '1px 4px', borderRadius: 3, background: 'rgba(249,115,22,.12)', color: '#f97316', border: '1px solid rgba(249,115,22,.2)' }}>NEW</span>}
              {t.is_single && <span style={{ fontSize: 7, fontWeight: 800, padding: '1px 4px', borderRadius: 3, background: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>S</span>}
            </div>

            {/* Pop bar */}
            <div style={{ width: 80, flexShrink: 0, height: 3, borderRadius: 2, background: 'var(--popup-bg)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 2, background: 'var(--popup-fill)', width: `${popBarFill}%`, transition: 'width .4s ease' }} />
            </div>

            {/* Play button — only when canPlay, always ▶ (no pause state) */}
            {canPlay ? (
              <button
                onClick={e => { e.stopPropagation(); setPlayingIdx(tracks.indexOf(t)) }}
                style={{
                  width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                  background: isPlaying ? 'rgba(249,115,22,.15)' : 'transparent',
                  border: `1.5px solid ${isPlaying ? '#f97316' : 'var(--border-subtle)'}`,
                  color: isPlaying ? '#f97316' : 'var(--text-muted)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all .15s', padding: 0,
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#f97316'; e.currentTarget.style.color = '#f97316'; e.currentTarget.style.background = 'rgba(249,115,22,.08)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = isPlaying ? '#f97316' : 'var(--border-subtle)'; e.currentTarget.style.color = isPlaying ? '#f97316' : 'var(--text-muted)'; e.currentTarget.style.background = isPlaying ? 'rgba(249,115,22,.15)' : 'transparent' }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><polygon points="2,1 9,5 2,9"/></svg>
              </button>
            ) : (
              <div style={{ width: 30, flexShrink: 0 }} />
            )}
          </>
        ) : (
          /* ── mobile layout (unchanged) ── */
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {positionsUnknown ? (
                <span style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: numCol, opacity: isPlaying ? 1 : 0.55 }} title="Originalios tvarkos nėra">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="12" cy="12" r="9" />
                    <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
                  </svg>
                </span>
              ) : (
                <span style={{ width: 20, textAlign: 'center', fontSize: 11, flexShrink: 0, fontFamily: 'Outfit, sans-serif', color: numCol, fontWeight: isPlaying ? 800 : 400 }}>
                  {t.position}
                </span>
              )}
              <div
                onClick={canPlay ? () => setPlayingIdx(tracks.indexOf(t)) : undefined}
                style={{ width: 36, height: 36, borderRadius: 7, flexShrink: 0, overflow: 'hidden', background: 'var(--cover-placeholder)', position: 'relative', cursor: canPlay ? 'pointer' : 'default' }}
              >
                {album.cover_image_url
                  ? <img src={album.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>🎵</div>}
                {isPlaying && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(249,115,22,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />
                  </div>
                )}
                {!isPlaying && hasOwnVideo && (
                  <div style={{ position: 'absolute', bottom: 2, right: 2, width: 12, height: 12, borderRadius: 3, background: 'rgba(249,115,22,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="6" height="6" viewBox="0 0 10 10" fill="#fff"><polygon points="2,1 9,5 2,9"/></svg>
                  </div>
                )}
              </div>
              <span
                onClick={canPlay ? () => setPlayingIdx(tracks.indexOf(t)) : undefined}
                style={{ fontSize: 13, fontWeight: isPlaying ? 700 : 600, color: titleCol, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, cursor: canPlay ? 'pointer' : 'default' }}
              >
                {t.title}
                {t.featuring.length > 0 && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> su {t.featuring.join(', ')}</span>}
              </span>
              {t.is_new && <span style={{ fontSize: 7, fontWeight: 800, padding: '1px 4px', borderRadius: 3, background: 'rgba(249,115,22,.12)', color: '#f97316', border: '1px solid rgba(249,115,22,.2)', flexShrink: 0 }}>NEW</span>}
              <Link href={`/lt/daina/${t.slug}/${t.id}/`}
                onClick={e => e.stopPropagation()}
                style={{ fontSize: 11, color: 'var(--track-link-color)', textDecoration: 'none', padding: '2px 5px', borderRadius: 4, flexShrink: 0 }}
                onMouseEnter={e => { e.currentTarget.style.color = '#f97316'; e.currentTarget.style.background = 'rgba(249,115,22,.08)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--track-link-color)'; e.currentTarget.style.background = 'transparent' }}
              >→</Link>
            </div>
            <div style={{ marginLeft: 66, marginTop: 5, height: 2, background: 'var(--popup-bg)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 2, background: 'var(--popup-fill)', width: `${popBarFill}%`, transition: 'width .4s ease' }} />
            </div>
          </>
        )}
      </div>
    )
  }

  const DesktopTrackList = () => (
    <>
      {sortedTracks.map(t => {
        const idx = tracks.indexOf(t)
        return <TrackRow key={t.id} t={t} isPlaying={effectiveIdx === idx} desktop={true} />
      })}
    </>
  )

  const MobileTrackList = () => (
    <>
      {mobileVisible.map(t => {
        const idx = tracks.indexOf(t)
        return <TrackRow key={t.id} t={t} isPlaying={effectiveIdx === idx} desktop={false} />
      })}
      {hasMore && (
        <button
          onClick={() => setExpanded(v => !v)}
          style={{ width: '100%', padding: '11px 16px', background: 'transparent', border: 'none', borderTop: '1px solid var(--border-subtle)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif', transition: 'color .15s' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#f97316')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          {expanded ? <>↑ Rodyti mažiau</> : <>Visos {tracks.length} dainų ↓</>}
        </button>
      )}
    </>
  )

  const SidebarExtras = () => (
    <>
      <div style={{ ...card, background: 'var(--dyk-bg)', border: '1px solid var(--dyk-border)' }}>
        <div style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: '#f97316', fontFamily: 'Outfit, sans-serif', marginBottom: 7, display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="#f97316" style={{ flexShrink: 0 }}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            Ar žinojai?
          </div>
          <p style={{ fontSize: 12, color: 'var(--dyk-text)', lineHeight: 1.75, margin: 0 }}>Informacija apie šį albumą bus rodoma automatiškai iš Wikipedia. Administratorius gali keisti šį tekstą admin panelėje.</p>
          <div style={{ fontSize: 9, color: 'var(--dyk-source)', marginTop: 6 }}>Šaltinis: Wikipedia · Adminas gali keisti</div>
        </div>
      </div>
      <div style={card}>
        <div style={cardHead}>Diskusijos <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--text-faint)', textTransform: 'none', letterSpacing: 0 }}>0</span></div>
        <div style={{ padding: '12px 14px' }}>
          <div style={{ display: 'flex', gap: 7, marginBottom: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: 'rgba(249,115,22,.15)', border: '1px solid rgba(249,115,22,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#f97316', fontFamily: 'Outfit, sans-serif' }}>{artist.name[0]}</div>
            <input placeholder="Rašyk komentarą…" style={{ flex: 1, height: 30, borderRadius: 999, padding: '0 12px', fontSize: 11, background: 'var(--comment-input-bg)', border: '1px solid var(--comment-border)', color: 'var(--text-primary)', outline: 'none', fontFamily: "'DM Sans', sans-serif" }} />
            <button style={{ height: 30, padding: '0 12px', borderRadius: 999, background: '#f97316', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0, fontFamily: 'Outfit, sans-serif' }}>Siųsti</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', textAlign: 'center', padding: '4px 0' }}>Būk pirmas — palik komentarą!</div>
        </div>
      </div>
      {relatedNews.length > 0 && (
        <div style={card}>
          <div style={cardHead}>Naujienos <Link href={`/atlikejai/${artist.slug}`} style={{ fontSize: 9, fontWeight: 700, color: '#f97316', textDecoration: 'none', textTransform: 'none', letterSpacing: 0 }}>Visos →</Link></div>
          <div>
            {relatedNews.map((n, i) => (
              <Link key={n.id} href={`/news/${n.slug}`} style={{ display: 'flex', gap: 9, padding: '9px 12px', borderBottom: i < relatedNews.length - 1 ? '1px solid var(--border-subtle)' : 'none', textDecoration: 'none' }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = '.8')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = '1')}>
                {n.image_small_url ? <img src={n.image_small_url} style={{ width: 38, height: 38, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} alt="" /> : <div style={{ width: 38, height: 38, borderRadius: 6, flexShrink: 0, background: 'var(--cover-placeholder)' }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as any}>{n.title}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{new Date(n.published_at).toLocaleDateString('lt-LT')}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
      {otherAlbums.length > 0 && (
        <div style={card}>
          <div style={cardHead}>Kiti {artist.name} albumai <Link href={`/atlikejai/${artist.slug}`} style={{ fontSize: 9, fontWeight: 700, color: '#f97316', textDecoration: 'none', textTransform: 'none', letterSpacing: 0 }}>Visi →</Link></div>
          <div style={{ display: 'flex', gap: 8, padding: '10px 12px', overflowX: 'auto', scrollbarWidth: 'none' }}>
            {otherAlbums.map(a => (
              <Link key={a.id} href={`/lt/albumas/${a.slug}/${a.id}/`} style={{ flexShrink: 0, width: 80, textDecoration: 'none' }}>
                {a.cover_image_url ? <img src={a.cover_image_url} alt={a.title} style={{ width: 80, height: 80, borderRadius: 9, objectFit: 'cover', display: 'block', border: '1px solid var(--similar-cover-border)', marginBottom: 5 }} /> : <div style={{ width: 80, height: 80, borderRadius: 9, background: 'var(--cover-placeholder)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, marginBottom: 5 }}>💿</div>}
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--similar-title)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</div>
                <div style={{ fontSize: 9, color: 'var(--similar-meta)', marginTop: 1 }}>{a.year}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
      {similarAlbums.length > 0 && (
        <div style={card}>
          <div style={cardHead}>Panaši muzika</div>
          <div style={{ display: 'flex', gap: 8, padding: '10px 12px', overflowX: 'auto', scrollbarWidth: 'none' }}>
            {similarAlbums.map((a: any) => (
              <Link key={a.id} href={`/lt/albumas/${a.slug}/${a.id}/`} style={{ flexShrink: 0, width: 80, textDecoration: 'none' }}>
                {a.cover_image_url ? <img src={a.cover_image_url} alt={a.title} style={{ width: 80, height: 80, borderRadius: 9, objectFit: 'cover', display: 'block', border: '1px solid var(--similar-cover-border)', marginBottom: 5 }} /> : <div style={{ width: 80, height: 80, borderRadius: 9, background: 'var(--cover-placeholder)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, marginBottom: 5 }}>🎵</div>}
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--similar-title)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</div>
                <div style={{ fontSize: 9, color: 'var(--similar-meta)', marginTop: 1 }}>{a.artists?.name} · {a.year}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  )

  return (
    <div style={{ background: 'var(--bg-body)', color: 'var(--text-primary)', fontFamily: "'DM Sans',system-ui,sans-serif", WebkitFontSmoothing: 'antialiased', minHeight: '100vh' }}>

      {/* ══ DESKTOP ══ 40/60 split */}
      <div className="ab-desktop" style={{ maxWidth: 1400, margin: '0 auto', padding: '14px 20px 60px', display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 14, alignItems: 'start' }}>
        <div style={{ position: 'sticky', top: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <AlbumInfoCard coverSize={100} />
          {album.score !== null && album.score !== undefined && (
            <ScoreCard entityType="album" score={album.score} breakdown={album.score_breakdown} />
          )}
          <PlayerCard />
          <SidebarExtras />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div style={card}>
            <div style={cardHead}>
              <span>Dainos {tracks.length > 0 && <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--text-faint)', textTransform: 'none', letterSpacing: 0, marginLeft: 6 }}>{tracks.length}</span>}</span>
              {positionsUnknown && tracks.length > 0 && (
                <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>
                  Tvarka nenurodyta
                </span>
              )}
            </div>
            {tracks.length === 0
              ? <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: 'var(--text-faint)' }}>Dainų nėra</div>
              : <DesktopTrackList />
            }
          </div>
          {hasLegacyLikes && legacyLikes && (
            <LegacyLikesPanel
              count={legacyLikes.count}
              users={legacyLikes.users}
              entityLabel={`vartotojų patiko „${album.title}"`}
              maxUsers={30}
            />
          )}
        </div>
      </div>

      {/* ══ MOBILE ══ */}
      <div className="ab-mobile" style={{ display: 'none', padding: '12px 14px 56px', flexDirection: 'column', gap: 12 }}>
        <AlbumInfoCard coverSize={100} />
        {album.score !== null && album.score !== undefined && (
          <ScoreCard entityType="album" score={album.score} breakdown={album.score_breakdown} />
        )}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 13px 8px', borderBottom: '1px solid var(--sub-border)' }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <MusicIcon size={15} color="#fff" />
            </div>
            <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif' }}>Albumo muzika</span>
          </div>
          {activeVid ? (
            <iframe key={activeVid} src={`https://www.youtube.com/embed/${activeVid}?rel=0`} allow="autoplay; encrypted-media" allowFullScreen style={{ width: '100%', aspectRatio: '16/9', border: 'none', display: 'block' }} />
          ) : (
            <div style={{ width: '100%', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cover-area-bg)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Vaizdo įrašas nepriskirtas</div>
            </div>
          )}
          <div style={{ ...cardHead, borderTop: '1px solid var(--sub-border)' }}>
            <span>{expanded ? 'Dainos' : 'Top dainos'}</span>
            {positionsUnknown && tracks.length > 0 && (
              <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>
                · tvarka nenurodyta
              </span>
            )}
          </div>
          {tracks.length === 0
            ? <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--text-faint)' }}>Dainų nėra</div>
            : <MobileTrackList />
          }
        </div>
        {hasLegacyLikes && legacyLikes && (
          <LegacyLikesPanel
            count={legacyLikes.count}
            users={legacyLikes.users}
            entityLabel={`vartotojų patiko „${album.title}"`}
            maxUsers={30}
          />
        )}
        <SidebarExtras />
      </div>

      <style>{`
        @media(max-width: 860px) {
          .ab-desktop { display: none !important; }
          .ab-mobile  { display: flex !important; }
        }
        /* Thumb hover — show play overlay */
        .ab-thumb:hover .ab-play-overlay { opacity: 1 !important; }
      `}</style>
    </div>
  )
}
