'use client'
// app/lt/daina/[slug]/[id]/track-page-client.tsx
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useSite } from '@/components/SiteContext'

// ── Types ────────────────────────────────────────────────────────────────────

type Track = {
  id: number
  slug: string
  title: string
  type: string
  video_url: string | null
  spotify_id: string | null
  release_date: string | null
  lyrics: string | null
  chords: string | null
  description: string | null
  show_player: boolean
  is_new: boolean
  featuring: Artist[]
}

type Artist = {
  id: number
  slug: string
  name: string
  cover_image_url: string | null
}

type Album = {
  id: number
  slug: string
  title: string
  year?: number
  cover_image_url: string | null
  type: string
}

type LyricComment = {
  id: number
  line_index: number
  author: string
  avatar_letter: string
  text: string
  likes: number
  created_at: string
}

type Version = {
  id: number
  slug: string
  title: string
  type: string
  video_url: string | null
}

type Props = {
  track: Track
  artist: Artist
  albums: Album[]           // albums this track appears in
  versions: Version[]       // other versions / remixes
  likes: number
  lyricComments: LyricComment[]
  trivia: string | null     // Wikipedia-sourced trivia
  relatedTracks: Track[]    // other tracks by same artist
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function ytId(url?: string | null) {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  return m ? m[1] : null
}

function formatReleaseDate(d: string | null): string | null {
  if (!d) return null
  const date = new Date(d)
  if (isNaN(date.getTime())) return d
  const months = ['sausio','vasario','kovo','balandžio','gegužės','birželio',
    'liepos','rugpjūčio','rugsėjo','spalio','lapkričio','gruodžio']
  return `${date.getFullYear()} m. ${months[date.getMonth()]} ${date.getDate()} d.`
}

// Parse lyrics into lines, preserving blank lines as section breaks
function parseLyrics(raw: string): Array<{ text: string; isBlank: boolean; index: number }> {
  let idx = 0
  return raw.split('\n').map(line => ({
    text: line.trim(),
    isBlank: line.trim() === '',
    index: line.trim() === '' ? -1 : idx++,
  }))
}

// Parse chord notation into structured display
function parseChords(raw: string): string[] {
  return raw.split('\n').filter(l => l.trim())
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function MusicIcon({ size = 16, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
    </svg>
  )
}

function HeartIcon({ filled, size = 14 }: { filled?: boolean; size?: number }) {
  return filled
    ? <svg width={size} height={size} viewBox="0 0 24 24" fill="#f97316"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
    : <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"/></svg>
}

function GuitarIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M19.59 3c-.96 0-1.86.37-2.54 1.05L14 7.1C12.45 6.39 10.6 6.6 9.26 7.93L3 14.19l.71.71-1.42 1.41 1.42 1.41 1.06-1.06.7.71-1.41 1.41 1.41 1.41 1.41-1.41.71.71-1.06 1.06 1.42 1.41 1.41-1.41.71.71-1.06 1.06 1.41 1.41L16.07 15c1.33-1.33 1.54-3.19.82-4.73l3.06-3.06C20.63 6.53 21 5.63 21 4.66 21 3.74 20.26 3 19.59 3zM15 15l-5-5 1.41-1.41 5 5L15 15z"/>
    </svg>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TrackPageClient({
  track, artist, albums, versions, likes, lyricComments, trivia, relatedTracks
}: Props) {
  const { dk } = useSite()

  const [liked, setLiked] = useState(false)
  const [activeTab, setActiveTab] = useState<'lyrics' | 'chords'>('lyrics')
  const [selectedLine, setSelectedLine] = useState<number | null>(null)
  const [commentDraft, setCommentDraft] = useState('')
  const [localComments, setLocalComments] = useState<LyricComment[]>(lyricComments)
  const [showAllVersions, setShowAllVersions] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const commentInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setLoaded(true) }, [])

  const vid = ytId(track.video_url)
  const hasLyrics = !!track.lyrics?.trim()
  const hasChords = !!track.chords?.trim()
  const lyricLines = hasLyrics ? parseLyrics(track.lyrics!) : []
  const chordLines = hasChords ? parseChords(track.chords!) : []
  const dateStr = formatReleaseDate(track.release_date)
  const primaryAlbum = albums[0] ?? null

  // Group lyric comments by line index
  const commentsByLine = localComments.reduce<Record<number, LyricComment[]>>((acc, c) => {
    if (!acc[c.line_index]) acc[c.line_index] = []
    acc[c.line_index].push(c)
    return acc
  }, {})

  const handleLineClick = (lineIdx: number) => {
    if (!hasLyrics) return
    setSelectedLine(prev => prev === lineIdx ? null : lineIdx)
    setTimeout(() => commentInputRef.current?.focus(), 50)
  }

  const handleCommentSubmit = () => {
    if (!commentDraft.trim() || selectedLine === null) return
    const newComment: LyricComment = {
      id: Date.now(),
      line_index: selectedLine,
      author: artist.name[0], // placeholder
      avatar_letter: 'M',
      text: commentDraft.trim(),
      likes: 0,
      created_at: new Date().toISOString(),
    }
    setLocalComments(prev => [...prev, newComment])
    setCommentDraft('')
    setSelectedLine(null)
  }

  // ── Colour tokens ──────────────────────────────────────────────────────────
  const T = {
    bg:          dk ? '#080c12' : '#eef2f8',
    bgCard:      dk ? '#0e1520' : '#ffffff',
    bgHover:     dk ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.03)',
    bgActive:    dk ? 'rgba(249,115,22,.08)'   : 'rgba(249,115,22,.07)',
    border:      dk ? 'rgba(255,255,255,.07)'  : 'rgba(0,0,0,.08)',
    borderSub:   dk ? 'rgba(255,255,255,.045)' : 'rgba(0,0,0,.06)',
    text:        dk ? '#f0f2f5' : '#0f1a2e',
    textSec:     dk ? '#b0bdd4' : '#3a5a80',
    textMuted:   dk ? '#7a9bb8' : '#6a85a0',
    textFaint:   dk ? '#4a6888' : '#aabbd0',
    coverBg:     dk ? '#1a2535' : '#dde6f2',
    coverAreaBg: dk ? '#121c28' : '#f0f5ff',
    subBdr:      dk ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.07)',
    dykBg:       dk ? '#0f1a10' : '#fff8f2',
    dykBdr:      dk ? 'rgba(249,115,22,.18)' : 'rgba(249,115,22,.25)',
    dykText:     dk ? '#8aadcc' : '#5a6878',
    cmtInput:    dk ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.04)',
    cmtBdr:      dk ? 'rgba(255,255,255,.1)'  : 'rgba(0,0,0,.1)',
    lyricLine:   dk ? '#dce8f5' : '#1a2a40',
    lyricHover:  dk ? 'rgba(249,115,22,.06)'  : 'rgba(249,115,22,.05)',
    lyricSel:    dk ? 'rgba(249,115,22,.13)'  : 'rgba(249,115,22,.10)',
    chordName:   dk ? '#f97316' : '#ea6a00',
    chordBg:     dk ? 'rgba(249,115,22,.10)'  : 'rgba(249,115,22,.08)',
    tabActive:   dk ? '#f97316' : '#f97316',
    tabInactive: dk ? '#4a6888' : '#aabbd0',
    versionBg:   dk ? '#0b1420' : '#f5f8ff',
  }

  const card: React.CSSProperties = {
    background: T.bgCard,
    border: `1px solid ${T.border}`,
    borderRadius: 16,
    overflow: 'hidden',
  }

  const cardHead: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px', borderBottom: `1px solid ${T.subBdr}`,
    fontSize: 11, fontWeight: 700, color: dk ? '#c8d8ec' : '#1a2a40',
    fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase', letterSpacing: '.08em',
  }

  // ── Sub-components ────────────────────────────────────────────────────────

  // Track info card (top-left)
  const TrackInfoCard = () => (
    <div style={card}>
      <div style={{ background: T.coverAreaBg, padding: 14, display: 'flex', gap: 14, alignItems: 'flex-start', position: 'relative', opacity: loaded ? 1 : 0, transition: 'opacity .4s' }}>
        {/* Like button top-right */}
        <button
          onClick={() => setLiked(v => !v)}
          style={{ position: 'absolute', top: 10, right: 12, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: `1px solid ${liked ? 'rgba(249,115,22,.4)' : T.border}`, background: liked ? 'rgba(249,115,22,.12)' : 'rgba(255,255,255,.06)', color: liked ? '#f97316' : T.textMuted, transition: 'all .15s', fontFamily: 'Outfit, sans-serif' }}
        >
          <HeartIcon filled={liked} size={12} /> {likes + (liked ? 1 : 0)}
        </button>

        {/* Album cover */}
        <div style={{ flexShrink: 0, width: 100, height: 100, borderRadius: 12, overflow: 'hidden', boxShadow: dk ? '0 10px 32px rgba(0,0,0,.7)' : '0 6px 24px rgba(0,0,0,.2)', background: T.coverBg }}>
          {primaryAlbum?.cover_image_url
            ? <img src={primaryAlbum.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🎵</div>}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0, paddingRight: 44 }}>
          <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.12em', color: '#f97316', fontFamily: 'Outfit, sans-serif', marginBottom: 3 }}>
            {track.type || 'Daina'}
            {track.is_new && <span style={{ marginLeft: 6, fontSize: 8, padding: '1px 6px', borderRadius: 999, background: 'rgba(249,115,22,.18)', border: '1px solid rgba(249,115,22,.3)', color: '#f97316' }}>NEW</span>}
          </div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(15px,2vw,20px)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-.025em', color: dk ? '#fff' : '#0f1a2e', margin: '0 0 5px', wordBreak: 'break-word' }}>{track.title}</h1>
          <Link href={`/atlikejai/${artist.slug}`} style={{ fontSize: 13, fontWeight: 700, color: '#f97316', textDecoration: 'none', display: 'block', marginBottom: 2 }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '.75')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
            {artist.name}
          </Link>
          {track.featuring.length > 0 && (
            <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 2 }}>
              su {track.featuring.map((f, i) => (
                <span key={f.id}>{i > 0 && ', '}<Link href={`/atlikejai/${f.slug}`} style={{ color: T.textSec, textDecoration: 'none', fontWeight: 600 }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#f97316')}
                  onMouseLeave={e => (e.currentTarget.style.color = T.textSec)}>{f.name}</Link></span>
              ))}
            </div>
          )}
          {dateStr && <div style={{ fontSize: 11, color: T.textMuted }}>{dateStr}</div>}
        </div>
      </div>

      {/* Album chip(s) */}
      {albums.length > 0 && (
        <div style={{ padding: '10px 14px', display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: `1px solid ${T.subBdr}` }}>
          {albums.map(a => (
            <Link key={a.id} href={`/lt/albumas/${a.slug}/${a.id}/`}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px 5px 6px', borderRadius: 999, background: T.bgHover, border: `1px solid ${T.borderSub}`, textDecoration: 'none', transition: 'border-color .15s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(249,115,22,.35)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = T.borderSub)}>
              {a.cover_image_url
                ? <img src={a.cover_image_url} style={{ width: 22, height: 22, borderRadius: 5, objectFit: 'cover' }} alt="" />
                : <div style={{ width: 22, height: 22, borderRadius: 5, background: T.coverBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>💿</div>}
              <span style={{ fontSize: 11, fontWeight: 600, color: T.textSec }}>{a.title}</span>
              {a.year && <span style={{ fontSize: 10, color: T.textFaint }}>{a.year}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  )

  // YouTube player card
  const PlayerCard = () => {
    if (!vid && !track.show_player) return null
    return (
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 13px 8px', borderBottom: `1px solid ${T.subBdr}` }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <MusicIcon size={15} color="#fff" />
          </div>
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: dk ? '#c8d8ec' : '#1a2a40', fontFamily: 'Outfit, sans-serif' }}>Klausyk</span>
        </div>
        {vid ? (
          <iframe src={`https://www.youtube.com/embed/${vid}?rel=0`} allow="autoplay; encrypted-media" allowFullScreen
            style={{ width: '100%', aspectRatio: '16/9', border: 'none', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.coverAreaBg }}>
            <div style={{ fontSize: 11, color: T.textFaint }}>Vaizdo įrašas nepriskirtas</div>
          </div>
        )}
        {/* Spotify embed */}
        {track.spotify_id && (
          <iframe
            src={`https://open.spotify.com/embed/track/${track.spotify_id}?utm_source=generator&theme=${dk ? 0 : 1}`}
            style={{ width: '100%', height: 80, border: 'none', display: 'block', borderTop: `1px solid ${T.subBdr}` }}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          />
        )}
      </div>
    )
  }

  // Description / trivia card
  const TriviaCard = () => {
    if (!track.description && !trivia) return null
    return (
      <div style={{ ...card, background: T.dykBg, border: `1px solid ${T.dykBdr}` }}>
        <div style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: '#f97316', fontFamily: 'Outfit, sans-serif', marginBottom: 7, display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="#f97316"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            Ar žinojai?
          </div>
          <p style={{ fontSize: 12, color: T.dykText, lineHeight: 1.75, margin: 0 }}>
            {track.description || trivia || 'Informacija apie šią dainą bus rodoma automatiškai iš Wikipedia.'}
          </p>
          <div style={{ fontSize: 9, color: T.textFaint, marginTop: 6 }}>Šaltinis: Wikipedia · Adminas gali keisti</div>
        </div>
      </div>
    )
  }

  // Versions / remixes card
  const VersionsCard = () => {
    if (versions.length === 0) return null
    const visible = showAllVersions ? versions : versions.slice(0, 4)
    return (
      <div style={card}>
        <div style={cardHead}>
          Versijos ir remixai
          <span style={{ fontSize: 9, fontWeight: 400, color: T.textFaint, textTransform: 'none', letterSpacing: 0 }}>{versions.length}</span>
        </div>
        {visible.map((v, i) => (
          <Link key={v.id} href={`/lt/daina/${v.slug}/${v.id}/`}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: i < visible.length - 1 ? `1px solid ${T.borderSub}` : 'none', textDecoration: 'none', transition: 'background .1s' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = T.bgHover)}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: ytId(v.video_url) ? 'rgba(249,115,22,.12)' : T.coverBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${ytId(v.video_url) ? 'rgba(249,115,22,.25)' : T.borderSub}` }}>
              {ytId(v.video_url)
                ? <svg width="9" height="9" viewBox="0 0 10 10" fill="#f97316"><polygon points="2,1 9,5 2,9"/></svg>
                : <MusicIcon size={11} color={T.textFaint} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.textSec, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.title}</div>
              <div style={{ fontSize: 10, color: T.textFaint }}>{v.type}</div>
            </div>
            <span style={{ fontSize: 10, color: T.textFaint }}>→</span>
          </Link>
        ))}
        {versions.length > 4 && (
          <button onClick={() => setShowAllVersions(v => !v)}
            style={{ width: '100%', padding: '9px', background: 'transparent', border: 'none', borderTop: `1px solid ${T.borderSub}`, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: T.textMuted, fontFamily: 'Outfit, sans-serif' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#f97316')}
            onMouseLeave={e => (e.currentTarget.style.color = T.textMuted)}>
            {showAllVersions ? '↑ Mažiau' : `Visos ${versions.length} versijos ↓`}
          </button>
        )}
      </div>
    )
  }

  // Discussions card (album page style)
  const DiscussionsCard = () => (
    <div style={card}>
      <div style={cardHead}>Diskusijos <span style={{ fontSize: 9, fontWeight: 400, color: T.textFaint, textTransform: 'none', letterSpacing: 0 }}>{localComments.filter(c => c.line_index === -1).length || 0}</span></div>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', gap: 7, marginBottom: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: 'rgba(249,115,22,.15)', border: '1px solid rgba(249,115,22,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#f97316', fontFamily: 'Outfit, sans-serif' }}>{artist.name[0]}</div>
          <input placeholder="Rašyk komentarą…" style={{ flex: 1, height: 30, borderRadius: 999, padding: '0 12px', fontSize: 11, background: T.cmtInput, border: `1px solid ${T.cmtBdr}`, color: T.text, outline: 'none', fontFamily: "'DM Sans', sans-serif" }} />
          <button style={{ height: 30, padding: '0 12px', borderRadius: 999, background: '#f97316', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0, fontFamily: 'Outfit, sans-serif' }}>Siųsti</button>
        </div>
        <div style={{ fontSize: 11, color: T.textFaint, textAlign: 'center', padding: '4px 0' }}>Būk pirmas — palik komentarą!</div>
      </div>
    </div>
  )

  // ── Lyrics panel with inline line comments ────────────────────────────────
  const LyricsPanel = () => {
    if (!hasLyrics) return (
      <div style={{ padding: 32, textAlign: 'center', color: T.textFaint, fontSize: 13 }}>
        Žodžiai dar nepridėti
      </div>
    )

    return (
      <div style={{ padding: '4px 0 8px' }}>
        {lyricLines.map((line, i) => {
          if (line.isBlank) return <div key={i} style={{ height: 14 }} />

          const lineComments = commentsByLine[line.index] ?? []
          const isSelected = selectedLine === line.index
          const hasComments = lineComments.length > 0

          return (
            <div key={i}>
              {/* Lyric line — clickable to comment */}
              <div
                onClick={() => handleLineClick(line.index)}
                style={{
                  padding: '5px 18px',
                  cursor: 'pointer',
                  background: isSelected ? T.lyricSel : 'transparent',
                  borderLeft: isSelected ? '3px solid #f97316' : '3px solid transparent',
                  transition: 'all .12s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
                onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = T.lyricHover }}
                onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
              >
                <span style={{ fontSize: 14, lineHeight: 1.65, color: isSelected ? T.text : T.lyricLine, fontWeight: isSelected ? 600 : 400, flex: 1 }}>
                  {line.text}
                </span>
                {hasComments && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#f97316', background: 'rgba(249,115,22,.12)', border: '1px solid rgba(249,115,22,.2)', borderRadius: 999, padding: '1px 6px', flexShrink: 0, fontFamily: 'Outfit, sans-serif' }}>
                    {lineComments.length}
                  </span>
                )}
                {!hasComments && (
                  <span className="ab-lyric-hint" style={{ fontSize: 9, color: T.textFaint, opacity: 0, transition: 'opacity .15s', flexShrink: 0 }}>
                    💬
                  </span>
                )}
              </div>

              {/* Inline comments under this line */}
              {hasComments && (
                <div style={{ margin: '2px 18px 6px 21px', borderLeft: `2px solid rgba(249,115,22,.2)`, paddingLeft: 12 }}>
                  {lineComments.map(c => (
                    <div key={c.id} style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: `1px solid ${T.borderSub}` }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: 'rgba(249,115,22,.15)', border: '1px solid rgba(249,115,22,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#f97316', fontFamily: 'Outfit, sans-serif' }}>{c.avatar_letter}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: T.textSec, marginBottom: 1 }}>{c.author}</div>
                        <div style={{ fontSize: 11, color: T.dykText, lineHeight: 1.5 }}>{c.text}</div>
                      </div>
                      <div style={{ fontSize: 9, color: T.textFaint, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
                        ♥ {c.likes}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Comment input when this line is selected */}
              {isSelected && (
                <div style={{ margin: '4px 18px 8px 21px', display: 'flex', gap: 7, alignItems: 'center' }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: 'rgba(249,115,22,.15)', border: '1px solid rgba(249,115,22,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#f97316' }}>M</div>
                  <input
                    ref={commentInputRef}
                    value={commentDraft}
                    onChange={e => setCommentDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCommentSubmit() }}
                    placeholder={`Komentaras prie „${line.text.slice(0, 28)}${line.text.length > 28 ? '…' : ''}"…`}
                    style={{ flex: 1, height: 28, borderRadius: 999, padding: '0 10px', fontSize: 11, background: T.cmtInput, border: `1px solid rgba(249,115,22,.35)`, color: T.text, outline: 'none', fontFamily: "'DM Sans', sans-serif" }}
                  />
                  <button onClick={handleCommentSubmit}
                    style={{ height: 28, padding: '0 10px', borderRadius: 999, background: '#f97316', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                    →
                  </button>
                  <button onClick={() => setSelectedLine(null)}
                    style={{ height: 28, padding: '0 8px', borderRadius: 999, background: 'transparent', border: `1px solid ${T.borderSub}`, color: T.textMuted, fontSize: 11, cursor: 'pointer' }}>
                    ✕
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // ── Chords panel ──────────────────────────────────────────────────────────
  const ChordsPanel = () => {
    if (!hasChords) return (
      <div style={{ padding: 32, textAlign: 'center', color: T.textFaint, fontSize: 13 }}>
        Akordai dar nepridėti
      </div>
    )

    return (
      <div style={{ padding: '12px 18px' }}>
        <div style={{ marginBottom: 10, fontSize: 11, color: T.textMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
          <GuitarIcon size={13} color={T.textMuted} />
          Akordai ir žodžiai
        </div>
        <pre style={{ fontFamily: "'DM Mono', 'Fira Mono', monospace", fontSize: 13, lineHeight: 1.8, color: T.lyricLine, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {chordLines.map((line, i) => {
            // Lines with only chords (like "Am  G  F  C") — highlight chord tokens
            const isChordLine = /^[A-G][#bm]?(maj|min|aug|dim|sus|add|M)?[0-9]?(\s+[A-G][#bm]?(maj|min|aug|dim|sus|add|M)?[0-9]?)*\s*$/.test(line)
            if (isChordLine) {
              return (
                <div key={i} style={{ marginBottom: 2 }}>
                  {line.split(/(\s+)/).map((token, j) =>
                    token.trim() ? (
                      <span key={j} style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 5, background: T.chordBg, color: T.chordName, fontWeight: 700, marginRight: 6, fontSize: 12 }}>{token}</span>
                    ) : <span key={j}>{token}</span>
                  )}
                </div>
              )
            }
            return <div key={i} style={{ color: T.lyricLine }}>{line || ' '}</div>
          })}
        </pre>
      </div>
    )
  }

  // ── Lyrics/Chords card with tab switcher ──────────────────────────────────
  const LyricsChordsCard = () => (
    <div style={card}>
      {/* Tab header */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${T.subBdr}`, padding: '0 14px' }}>
        {(['lyrics', 'chords'] as const).map(tab => {
          const label = tab === 'lyrics' ? 'Žodžiai' : 'Akordai'
          const icon = tab === 'lyrics'
            ? <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M3 18h12v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
            : <GuitarIcon size={12} />
          const isActive = activeTab === tab
          return (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '11px 14px 10px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: isActive ? 800 : 600, color: isActive ? '#f97316' : T.tabInactive, borderBottom: isActive ? '2px solid #f97316' : '2px solid transparent', marginBottom: -1, transition: 'all .15s', fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase', letterSpacing: '.07em' }}>
              {icon} {label}
            </button>
          )
        })}
        {/* Hint text */}
        {activeTab === 'lyrics' && hasLyrics && (
          <span style={{ marginLeft: 'auto', fontSize: 9, color: T.textFaint, fontStyle: 'italic' }}>
            Spustelk eilutę, kad komentuotum
          </span>
        )}
      </div>

      {activeTab === 'lyrics' ? <LyricsPanel /> : <ChordsPanel />}
    </div>
  )

  // ── Related tracks card ───────────────────────────────────────────────────
  const RelatedCard = () => {
    if (relatedTracks.length === 0) return null
    return (
      <div style={card}>
        <div style={cardHead}>Kitos {artist.name} dainos</div>
        {relatedTracks.slice(0, 6).map((t, i) => (
          <Link key={t.id} href={`/lt/daina/${t.slug}/${t.id}/`}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: i < Math.min(relatedTracks.length, 6) - 1 ? `1px solid ${T.borderSub}` : 'none', textDecoration: 'none', transition: 'background .1s' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = T.bgHover)}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
            <div style={{ width: 30, height: 30, borderRadius: 6, background: T.coverBg, flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>
              {albums[0]?.cover_image_url
                ? <img src={albums[0].cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : '🎵'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.textSec, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
            </div>
            {ytId(t.video_url) && (
              <div style={{ width: 18, height: 18, borderRadius: 4, background: 'rgba(249,115,22,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="7" height="7" viewBox="0 0 10 10" fill="#f97316"><polygon points="2,1 9,5 2,9"/></svg>
              </div>
            )}
          </Link>
        ))}
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: T.bg, color: T.text, fontFamily: "'DM Sans',system-ui,sans-serif", WebkitFontSmoothing: 'antialiased', minHeight: '100vh' }}>

      {/* ══ DESKTOP ══ 40/60 split, same as album page */}
      <div className="tr-desktop" style={{ maxWidth: 1400, margin: '0 auto', padding: '14px 20px 60px', display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 14, alignItems: 'start' }}>

        {/* LEFT sidebar */}
        <div style={{ position: 'sticky', top: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TrackInfoCard />
          <PlayerCard />
          <TriviaCard />
          <VersionsCard />
          <DiscussionsCard />
        </div>

        {/* RIGHT: Lyrics / Chords + related */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <LyricsChordsCard />
          <RelatedCard />
        </div>
      </div>

      {/* ══ MOBILE ══ */}
      <div className="tr-mobile" style={{ display: 'none', padding: '12px 14px 56px', flexDirection: 'column', gap: 12 }}>
        <TrackInfoCard />
        <PlayerCard />
        <LyricsChordsCard />
        <TriviaCard />
        <VersionsCard />
        <DiscussionsCard />
        <RelatedCard />
      </div>

      <style>{`
        @media(max-width: 860px) {
          .tr-desktop { display: none !important; }
          .tr-mobile  { display: flex !important; }
        }
        div:hover .ab-lyric-hint { opacity: 1 !important; }
      `}</style>
    </div>
  )
}
