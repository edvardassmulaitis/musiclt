'use client'
// app/lt/daina/[slug]/[id]/track-page-client.tsx
import { useState, useRef, useEffect, useCallback, memo, useMemo } from 'react'
import Link from 'next/link'
import { useSite } from '@/components/SiteContext'

// ── Types ─────────────────────────────────────────────────────────────────────

type Artist = { id: number; slug: string; name: string; cover_image_url: string | null }

type Track = {
  id: number; slug: string; title: string; type: string
  video_url: string | null; spotify_id: string | null; release_date: string | null
  lyrics: string | null; chords: string | null; description: string | null
  show_player: boolean; is_new: boolean; featuring: Artist[]
  show_ai_interpretation: boolean
}

type Album = { id: number; slug: string; title: string; year?: number; cover_image_url: string | null; type: string }

type LyricComment = {
  id: number; selection_start: number; selection_end: number
  selected_text: string; author: string; avatar_letter: string
  text: string; likes: number; created_at: string
}

type Version = { id: number; slug: string; title: string; type: string; video_url: string | null }

type Props = {
  track: Track; artist: Artist; albums: Album[]
  versions: Version[]; likes: number
  lyricComments: LyricComment[]; trivia: string | null
  relatedTracks: Track[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ytId(url?: string | null) {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  return m ? m[1] : null
}

function formatReleaseDate(d: string | null): string | null {
  if (!d) return null
  const date = new Date(d)
  if (isNaN(date.getTime())) return d
  const months = ['sausio','vasario','kovo','balandžio','gegužės','birželio','liepos','rugpjūčio','rugsėjo','spalio','lapkričio','gruodžio']
  return `${date.getFullYear()} m. ${months[date.getMonth()]} ${date.getDate()} d.`
}

function parseChords(raw: string): string[] { return raw.split('\n').filter(l => l.trim()) }

// ── Icons ─────────────────────────────────────────────────────────────────────

function MusicIcon({ size = 16, color = '#fff' }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
}
function GuitarIcon({ size = 13, color = 'currentColor' }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M19.59 3c-.96 0-1.86.37-2.54 1.05L14 7.1C12.45 6.39 10.6 6.6 9.26 7.93L3 14.19l.71.71-1.42 1.41 1.42 1.41 1.06-1.06.7.71-1.41 1.41 1.41 1.41 1.41-1.41.71.71-1.06 1.06 1.41 1.41L16.07 15c1.33-1.33 1.54-3.19.82-4.73l3.06-3.06C20.63 6.53 21 5.63 21 4.66 21 3.74 20.26 3 19.59 3zM15 15l-5-5 1.41-1.41 5 5L15 15z"/></svg>
}

const YoutubeEmbed = memo(function YoutubeEmbed({ videoId }: { videoId: string }) {
  return (
    <iframe
      src={`https://www.youtube.com/embed/${videoId}?rel=0`}
      allow="autoplay; encrypted-media"
      allowFullScreen
      style={{ width: '100%', aspectRatio: '16/9', border: 'none', display: 'block' }}
    />
  )
})

// ── Main Component ─────────────────────────────────────────────────────────────

export default function TrackPageClient({
  track, artist, albums, versions, likes, lyricComments: initialComments,
  trivia, relatedTracks,
}: Props) {
  const { dk } = useSite()

  const [liked, setLiked] = useState(false)
  const [activeTab, setActiveTab] = useState<'lyrics' | 'chords'>('lyrics')
  const [comments, setComments] = useState<LyricComment[]>(initialComments)
  const [showAllVersions, setShowAllVersions] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // AI
  const [aiText, setAiText] = useState<string | null>(null)
  const [aiImage, setAiImage] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState(false)

  // Share quote overlay
  const [shareQuote, setShareQuote] = useState<string | null>(null)

  // Lyric selection
  const [selectionPopup, setSelectionPopup] = useState<{
    x: number; y: number; text: string; start: number; end: number
  } | null>(null)
  const [commentingOn, setCommentingOn] = useState<{
    text: string; start: number; end: number
  } | null>(null)
  const [commentDraft, setCommentDraft] = useState('')
  const lyricsRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setLoaded(true) }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (selectionPopup && !(e.target as Element).closest('.lyric-popup')) {
        setSelectionPopup(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [selectionPopup])

  const vid = ytId(track.video_url)
  const hasLyrics = !!track.lyrics?.trim()
  const hasChords = !!track.chords?.trim()
  const dateStr = formatReleaseDate(track.release_date)
  const primaryAlbum = albums[0] ?? null

  const handleLyricsMouseUp = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      setSelectionPopup(null)
      return
    }
    const text = sel.toString().trim()
    if (text.length < 3) return

    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()

    const fullText = track.lyrics || ''
    const start = fullText.indexOf(text)
    const end = start + text.length

    // Position popup above selection, clamped to viewport
    const popupW = 280
    const x = Math.min(Math.max(rect.left + rect.width / 2, popupW / 2 + 8), window.innerWidth - popupW / 2 - 8)
    const y = rect.top + window.scrollY - 12

    setSelectionPopup({ x, y, text, start: Math.max(0, start), end })
  }, [track.lyrics])

  const startCommenting = () => {
    if (!selectionPopup) return
    setCommentingOn({ text: selectionPopup.text, start: selectionPopup.start, end: selectionPopup.end })
    setSelectionPopup(null)
    window.getSelection()?.removeAllRanges()
  }

  const submitComment = async () => {
    if (!commentDraft.trim() || !commentingOn) return
    const newComment: LyricComment = {
      id: Date.now(),
      selection_start: commentingOn.start,
      selection_end: commentingOn.end,
      selected_text: commentingOn.text,
      author: 'Aš',
      avatar_letter: 'A',
      text: commentDraft.trim(),
      likes: 0,
      created_at: new Date().toISOString(),
    }
    setComments(prev => [...prev, newComment])
    setCommentDraft('')
    setCommentingOn(null)
    try {
      await fetch(`/api/tracks/${track.id}/lyric-comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_text: commentingOn.text,
          selection_start: commentingOn.start,
          selection_end: commentingOn.end,
          text: newComment.text,
        }),
      })
    } catch { /* ignore */ }
  }

  const startSharing = () => {
    if (!selectionPopup) return
    setShareQuote(selectionPopup.text)
    setSelectionPopup(null)
    window.getSelection()?.removeAllRanges()
  }

  const generateAI = async () => {
    if (!hasLyrics || aiLoading) return
    setAiLoading(true)
    setAiError(false)
    setAiText(null)
    setAiImage(null)
    try {
      // Step 1: Generate text interpretation
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1200,
          system: `Tu esi muzikos kritikas ir lyrikų interpretatorius. Atsakyk TIKTAI lietuviškai. Būk įžvalgus, nuoširdus, poetiškas — ne akademiškas. Neminėk dainos pavadinimo ar atlikėjo pirmame sakinyje. Atsakyk JSON formatu: { "interpretation": "3 paragrafai apie dainą", "image_prompt": "English prompt for abstract art image that captures the emotional essence of this song, 10-15 words, no text, no people" }`,
          messages: [{
            role: 'user',
            content: `Daina: "${track.title}" — ${artist.name}\n\nŽodžiai:\n${track.lyrics}\n\nSugeneruok interpretaciją ir image prompt.`,
          }],
        }),
      })
      const data = await res.json()
      const raw = data.content?.find((b: any) => b.type === 'text')?.text ?? ''
      const clean = raw.replace(/```json|```/g, '').trim()
      try {
        const parsed = JSON.parse(clean)
        setAiText(parsed.interpretation ?? raw)
        // Step 2: Generate image via Pollinations (free, no key needed)
        if (parsed.image_prompt) {
          const prompt = encodeURIComponent(parsed.image_prompt + ', abstract art, cinematic, no text')
          setAiImage(`https://image.pollinations.ai/prompt/${prompt}?width=800&height=400&nologo=true&seed=${track.id}`)
        }
      } catch {
        setAiText(raw)
      }
    } catch {
      setAiError(true)
    } finally {
      setAiLoading(false)
    }
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
    lyricText:   dk ? '#d0e0f0' : '#1a2a40',
    lyricMark:   dk ? 'rgba(249,115,22,.25)'  : 'rgba(249,115,22,.18)',
    chordBg:     dk ? 'rgba(249,115,22,.10)'  : 'rgba(249,115,22,.08)',
    chordName:   dk ? '#f97316' : '#ea6a00',
  }

  const card: React.CSSProperties = { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16, overflow: 'hidden' }
  const cardHead: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px', borderBottom: `1px solid ${T.subBdr}`,
    fontSize: 11, fontWeight: 700, color: dk ? '#c8d8ec' : '#1a2a40',
    fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase', letterSpacing: '.08em',
  }

  const renderLyricsWithHighlights = () => {
    const text = track.lyrics || ''
    if (comments.length === 0) return <span>{text}</span>
    const ranges = comments.map(c => ({ start: c.selection_start, end: c.selection_end, id: c.id }))
    const parts: React.ReactNode[] = []
    let pos = 0
    const sorted = [...ranges].sort((a, b) => a.start - b.start)
    for (const r of sorted) {
      if (r.start > pos) parts.push(<span key={`t${pos}`}>{text.slice(pos, r.start)}</span>)
      if (r.start < r.end && r.start >= pos) {
        parts.push(
          <mark key={`m${r.id}`} style={{ background: T.lyricMark, color: 'inherit', borderRadius: 3, cursor: 'pointer', borderBottom: '1.5px solid rgba(249,115,22,.6)' }}>
            {text.slice(r.start, r.end)}
          </mark>
        )
        pos = r.end
      }
    }
    if (pos < text.length) parts.push(<span key="tend">{text.slice(pos)}</span>)
    return <>{parts}</>
  }

  // ── Sub-components ─────────────────────────────────────────────────────────

  const TrackInfoCard = () => (
    <div style={card}>
      <div style={{ background: T.coverAreaBg, padding: 14, display: 'flex', gap: 14, alignItems: 'flex-start', position: 'relative', opacity: loaded ? 1 : 0, transition: 'opacity .4s' }}>
        <button onClick={() => setLiked(v => !v)}
          style={{ position: 'absolute', top: 10, right: 12, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: `1px solid ${liked ? 'rgba(249,115,22,.4)' : T.border}`, background: liked ? 'rgba(249,115,22,.12)' : 'rgba(255,255,255,.06)', color: liked ? '#f97316' : T.textMuted, transition: 'all .15s', fontFamily: 'Outfit, sans-serif' }}>
          {liked ? '♥' : '♡'} {likes + (liked ? 1 : 0)}
        </button>
        <div style={{ flexShrink: 0, width: 100, height: 100, borderRadius: 12, overflow: 'hidden', boxShadow: dk ? '0 10px 32px rgba(0,0,0,.7)' : '0 6px 24px rgba(0,0,0,.2)', background: T.coverBg }}>
          {primaryAlbum?.cover_image_url
            ? <img src={primaryAlbum.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🎵</div>}
        </div>
        <div style={{ flex: 1, minWidth: 0, paddingRight: 44 }}>
          <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.12em', color: '#f97316', fontFamily: 'Outfit, sans-serif', marginBottom: 3 }}>
            {track.type || 'Daina'}
            {track.is_new && <span style={{ marginLeft: 6, fontSize: 8, padding: '1px 6px', borderRadius: 999, background: 'rgba(249,115,22,.18)', border: '1px solid rgba(249,115,22,.3)', color: '#f97316' }}>NEW</span>}
          </div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(15px,2vw,20px)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-.025em', color: dk ? '#fff' : '#0f1a2e', margin: '0 0 5px', wordBreak: 'break-word' }}>{track.title}</h1>
          <Link href={`/atlikejai/${artist.slug}`} style={{ fontSize: 13, fontWeight: 700, color: '#f97316', textDecoration: 'none', display: 'block', marginBottom: 2 }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '.75')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>{artist.name}</Link>
          {track.featuring.length > 0 && (
            <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 2 }}>
              su {track.featuring.map((f, i) => (
                <span key={f.id}>{i > 0 && ', '}
                  <Link href={`/atlikejai/${f.slug}`} style={{ color: T.textSec, textDecoration: 'none', fontWeight: 600 }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#f97316')}
                    onMouseLeave={e => (e.currentTarget.style.color = T.textSec)}>{f.name}</Link>
                </span>
              ))}
            </div>
          )}
          {dateStr && <div style={{ fontSize: 11, color: T.textMuted }}>{dateStr}</div>}
        </div>
      </div>
      {albums.length > 0 && (
        <div style={{ padding: '10px 14px', display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: `1px solid ${T.subBdr}` }}>
          <span style={{ fontSize: 10, color: T.textFaint, alignSelf: 'center', fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase', letterSpacing: '.06em' }}>Albumas</span>
          {albums.map(a => (
            <Link key={a.id} href={`/lt/albumas/${a.slug}/${a.id}/`}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px 5px 6px', borderRadius: 999, background: T.bgHover, border: `1px solid ${T.borderSub}`, textDecoration: 'none', transition: 'border-color .15s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(249,115,22,.35)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = T.borderSub)}>
              {a.cover_image_url
                ? <img src={a.cover_image_url} style={{ width: 22, height: 22, borderRadius: 5, objectFit: 'cover' }} alt="" />
                : <div style={{ width: 22, height: 22, borderRadius: 5, background: T.coverBg }} />}
              <span style={{ fontSize: 11, fontWeight: 600, color: T.textSec }}>{a.title}</span>
              {a.year && <span style={{ fontSize: 10, color: T.textFaint }}>{a.year}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  )

  // Stable player — won't remount on state changes
  const PlayerCard = useMemo(() => {
    if (!vid && !track.show_player) return null
    return (
      <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 13px 8px', borderBottom: `1px solid ${T.subBdr}` }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MusicIcon size={15} color="#fff" />
          </div>
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: dk ? '#c8d8ec' : '#1a2a40', fontFamily: 'Outfit, sans-serif' }}>Klausyk</span>
        </div>
        {vid && <YoutubeEmbed videoId={vid} />}
        {track.spotify_id && (
          <iframe src={`https://open.spotify.com/embed/track/${track.spotify_id}?utm_source=generator&theme=${dk ? 0 : 1}`}
            style={{ width: '100%', height: 80, border: 'none', display: 'block', borderTop: `1px solid ${T.subBdr}` }}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" />
        )}
      </div>
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vid, track.spotify_id, track.show_player])

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
            {track.description || trivia}
          </p>
        </div>
      </div>
    )
  }

  // AI Card — interpretation + generated image
  const AICard = () => {
    if (!hasLyrics || !track.show_ai_interpretation) return null
    return (
      <div style={card}>
        <div style={cardHead}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13 }}>✦</span> AI interpretacija
          </span>
          {!aiText && <span style={{ fontSize: 9, fontWeight: 400, color: T.textFaint, textTransform: 'none', letterSpacing: 0 }}>beta</span>}
        </div>
        <div style={{ padding: 14 }}>
          {!aiText && !aiLoading && !aiError && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '8px 0' }}>
              <p style={{ fontSize: 12, color: T.textMuted, textAlign: 'center', margin: 0, lineHeight: 1.6 }}>
                Claude perskaitys žodžius ir sukurs interpretaciją bei abstraktų paveikslėlį, perteikiantį dainos nuotaiką.
              </p>
              <button onClick={generateAI}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 999, background: 'rgba(249,115,22,.12)', border: '1px solid rgba(249,115,22,.35)', color: '#f97316', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', transition: 'all .15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(249,115,22,.2)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(249,115,22,.12)' }}>
                <span style={{ fontSize: 14 }}>✦</span> Generuoti interpretaciją
              </button>
            </div>
          )}
          {aiLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '12px 0', color: T.textMuted, fontSize: 12 }}>
              <span style={{ animation: 'spin 1.2s linear infinite', display: 'inline-block', fontSize: 20, color: '#f97316' }}>✦</span>
              Claude analizuoja žodžius…
            </div>
          )}
          {aiError && (
            <div style={{ fontSize: 12, color: T.textMuted, textAlign: 'center', padding: '8px 0' }}>
              Nepavyko sugeneruoti. <button onClick={generateAI} style={{ color: '#f97316', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Bandyti dar kartą</button>
            </div>
          )}
          {aiText && (
            <div>
              {/* Generated image */}
              {aiImage && (
                <div style={{ marginBottom: 14, borderRadius: 10, overflow: 'hidden', border: `1px solid ${T.borderSub}` }}>
                  <img src={aiImage} alt="AI vizualizacija" style={{ width: '100%', display: 'block', objectFit: 'cover' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                </div>
              )}
              <div style={{ fontSize: 9, color: '#f97316', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', fontFamily: 'Outfit, sans-serif', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span>✦</span> Sugeneruota Claude
              </div>
              <p style={{ fontSize: 13, color: T.dykText, lineHeight: 1.85, margin: 0, whiteSpace: 'pre-wrap' }}>{aiText}</p>
              <button onClick={() => { setAiText(null); setAiImage(null) }}
                style={{ marginTop: 12, background: 'none', border: 'none', color: T.textFaint, fontSize: 10, cursor: 'pointer', padding: 0 }}>
                ↺ Generuoti iš naujo
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  const ShareQuoteOverlay = () => {
    if (!shareQuote) return null
    const displayQuote = shareQuote.length > 120 ? shareQuote.slice(0, 120) + '…' : shareQuote
    const shareText = `„${displayQuote}"\n\n— ${track.title}, ${artist.name}\nmusic.lt`
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        onClick={() => setShareQuote(null)}>
        <div onClick={e => e.stopPropagation()}
          style={{ background: dk ? '#0e1520' : '#fff', border: `1px solid ${T.border}`, borderRadius: 20, padding: 24, maxWidth: 420, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,.5)' }}>
          <div style={{ background: dk ? '#080c12' : '#f0f5ff', border: `1px solid rgba(249,115,22,.2)`, borderRadius: 14, padding: '20px 20px 16px', marginBottom: 16, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 8, left: 14, fontSize: 48, color: 'rgba(249,115,22,.12)', fontFamily: 'Georgia, serif', lineHeight: 1 }}>"</div>
            <p style={{ fontSize: 15, fontWeight: 600, color: T.text, lineHeight: 1.7, margin: '0 0 14px', fontStyle: 'italic', position: 'relative' }}>„{displayQuote}"</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {primaryAlbum?.cover_image_url && <img src={primaryAlbum.cover_image_url} style={{ width: 28, height: 28, borderRadius: 5, objectFit: 'cover' }} alt="" />}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{track.title}</div>
                <div style={{ fontSize: 10, color: '#f97316' }}>{artist.name}</div>
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800, color: T.textFaint, fontFamily: 'Outfit, sans-serif' }}>music.lt</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={() => { navigator.clipboard.writeText(shareText); setShareQuote(null) }}
              style={{ padding: '10px 16px', borderRadius: 10, background: 'rgba(249,115,22,.12)', border: '1px solid rgba(249,115,22,.3)', color: '#f97316', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
              📋 Kopijuoti tekstą
            </button>
            <button onClick={() => { window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`, '_blank'); setShareQuote(null) }}
              style={{ padding: '10px 16px', borderRadius: 10, background: T.bgHover, border: `1px solid ${T.borderSub}`, color: T.textSec, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
              𝕏 Dalintis X
            </button>
            <button onClick={() => setShareQuote(null)}
              style={{ padding: '8px', background: 'none', border: 'none', color: T.textFaint, fontSize: 11, cursor: 'pointer' }}>Atšaukti</button>
          </div>
        </div>
      </div>
    )
  }

  const VersionsCard = () => {
    if (versions.length === 0) return null
    const visible = showAllVersions ? versions : versions.slice(0, 4)
    return (
      <div style={card}>
        <div style={cardHead}>Versijos ir remixai <span style={{ fontSize: 9, fontWeight: 400, color: T.textFaint, textTransform: 'none', letterSpacing: 0 }}>{versions.length}</span></div>
        {visible.map((v, i) => (
          <Link key={v.id} href={`/lt/daina/${v.slug}/${v.id}/`}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: i < visible.length - 1 ? `1px solid ${T.borderSub}` : 'none', textDecoration: 'none' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = T.bgHover)}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: ytId(v.video_url) ? 'rgba(249,115,22,.12)' : T.coverBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${ytId(v.video_url) ? 'rgba(249,115,22,.25)' : T.borderSub}` }}>
              {ytId(v.video_url) ? <svg width="9" height="9" viewBox="0 0 10 10" fill="#f97316"><polygon points="2,1 9,5 2,9"/></svg> : <MusicIcon size={11} color={T.textFaint} />}
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

  const DiscussionsCard = () => (
    <div style={card}>
      <div style={cardHead}>Diskusijos</div>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', gap: 7, marginBottom: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: 'rgba(249,115,22,.15)', border: '1px solid rgba(249,115,22,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#f97316', fontFamily: 'Outfit, sans-serif' }}>{artist.name[0]}</div>
          <input placeholder="Rašyk komentarą…" style={{ flex: 1, height: 30, borderRadius: 999, padding: '0 12px', fontSize: 11, background: T.cmtInput, border: `1px solid ${T.cmtBdr}`, color: T.text, outline: 'none', fontFamily: "'DM Sans', sans-serif" }} />
          <button style={{ height: 30, padding: '0 12px', borderRadius: 999, background: '#f97316', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Siųsti</button>
        </div>
        <div style={{ fontSize: 11, color: T.textFaint, textAlign: 'center' }}>Būk pirmas — palik komentarą!</div>
      </div>
    </div>
  )

  const RelatedCard = () => {
    if (relatedTracks.length === 0) return null
    return (
      <div style={card}>
        <div style={cardHead}>Kitos {artist.name} dainos</div>
        {relatedTracks.slice(0, 6).map((t, i) => (
          <Link key={t.id} href={`/lt/daina/${t.slug}/${t.id}/`}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: i < 5 ? `1px solid ${T.borderSub}` : 'none', textDecoration: 'none' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = T.bgHover)}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
            <div style={{ width: 30, height: 30, borderRadius: 6, background: T.coverBg, flexShrink: 0, overflow: 'hidden' }}>
              {primaryAlbum?.cover_image_url ? <img src={primaryAlbum.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.textSec, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
            </div>
            {ytId(t.video_url) && <div style={{ width: 18, height: 18, borderRadius: 4, background: 'rgba(249,115,22,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="7" height="7" viewBox="0 0 10 10" fill="#f97316"><polygon points="2,1 9,5 2,9"/></svg>
            </div>}
          </Link>
        ))}
      </div>
    )
  }

  // ── Lyric selection popup ──────────────────────────────────────────────────
  const SelectionPopup = () => {
    if (!selectionPopup) return null
    return (
      <div className="lyric-popup" style={{
        position: 'fixed',
        left: selectionPopup.x,
        top: selectionPopup.y,
        transform: 'translate(-50%, -100%)',
        zIndex: 100,
        background: '#111827',
        border: '1px solid rgba(249,115,22,.4)',
        borderRadius: 14,
        padding: '12px 14px',
        width: 280,
        boxShadow: '0 16px 48px rgba(0,0,0,.7)',
      }}>
        {/* Quote */}
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.65)', fontStyle: 'italic', lineHeight: 1.6, marginBottom: 12, paddingLeft: 10, borderLeft: '2px solid rgba(249,115,22,.6)' }}>
          „{selectionPopup.text.length > 80 ? selectionPopup.text.slice(0, 80) + '…' : selectionPopup.text}"
        </div>
        {/* Action row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6 }}>
          <button onMouseDown={e => {
            e.preventDefault(); e.stopPropagation()
            const newC: LyricComment = { id: Date.now(), selection_start: selectionPopup.start, selection_end: selectionPopup.end, selected_text: selectionPopup.text, author: 'Aš', avatar_letter: '♥', text: '', likes: 1, created_at: new Date().toISOString() }
            setComments(prev => [...prev, newC]); setSelectionPopup(null); window.getSelection()?.removeAllRanges()
          }} style={{ padding: '8px 6px', borderRadius: 9, background: 'rgba(249,115,22,.18)', border: '1px solid rgba(249,115,22,.4)', color: '#f97316', fontSize: 13, cursor: 'pointer', fontWeight: 800, fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="#f97316"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            Patinka
          </button>
          <button onMouseDown={e => { e.preventDefault(); e.stopPropagation(); startCommenting() }}
            style={{ padding: '8px 6px', borderRadius: 9, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', color: 'rgba(255,255,255,.75)', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
            Komentaras
          </button>
          <button onMouseDown={e => { e.preventDefault(); e.stopPropagation(); startSharing() }}
            style={{ padding: '8px 10px', borderRadius: 9, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', color: 'rgba(255,255,255,.6)', fontSize: 14, cursor: 'pointer' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>
          </button>
        </div>
        {/* Arrow */}
        <div style={{ position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%) rotate(45deg)', width: 8, height: 8, background: '#111827', border: '1px solid rgba(249,115,22,.4)', borderTop: 'none', borderLeft: 'none' }} />
      </div>
    )
  }

  const LyricsPanel = () => {
    if (!hasLyrics) return <div style={{ padding: 32, textAlign: 'center', color: T.textFaint, fontSize: 13 }}>Dainos tekstas dar nepridėtas</div>
    const commentList = comments.filter(c => c.selection_start >= 0)
    return (
      <div>
        <div ref={lyricsRef} onMouseUp={handleLyricsMouseUp} style={{ padding: '16px 18px', userSelect: 'text', cursor: 'text' }}>
          <SelectionPopup />
          <pre style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, lineHeight: 2.1, color: T.lyricText, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {renderLyricsWithHighlights()}
          </pre>
        </div>
        {commentList.length > 0 && (
          <div style={{ borderTop: `1px solid ${T.subBdr}`, padding: '10px 18px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.textFaint, textTransform: 'uppercase', letterSpacing: '.08em', fontFamily: 'Outfit, sans-serif', marginBottom: 8 }}>Pažymėtos vietos</div>
            {commentList.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, padding: '6px 10px', borderRadius: 8, background: T.bgHover, border: `1px solid ${T.borderSub}` }}>
                <span style={{ fontSize: 12, color: c.avatar_letter === '♥' ? '#f97316' : T.textMuted, flexShrink: 0 }}>{c.avatar_letter}</span>
                <span style={{ fontSize: 12, color: T.textSec, fontStyle: 'italic', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>„{c.selected_text}"</span>
                {c.text && c.avatar_letter !== '♥' && <span style={{ fontSize: 11, color: T.textMuted, flexShrink: 0 }}>— {c.text}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const ChordsPanel = () => {
    if (!hasChords) return <div style={{ padding: 32, textAlign: 'center', color: T.textFaint, fontSize: 13 }}>Akordai dar nepridėti</div>
    const lines = parseChords(track.chords!)
    return (
      <div style={{ padding: '12px 18px' }}>
        <div style={{ marginBottom: 10, fontSize: 11, color: T.textMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
          <GuitarIcon color={T.textMuted} /> Akordai ir žodžiai
        </div>
        <pre style={{ fontFamily: "'DM Mono', 'Fira Mono', monospace", fontSize: 13, lineHeight: 1.9, color: T.lyricText, margin: 0, whiteSpace: 'pre-wrap' }}>
          {lines.map((line, i) => {
            const isChordLine = /^[A-G][#bm]?(maj|min|aug|dim|sus|add|M)?[0-9]?(\s+[A-G][#bm]?(maj|min|aug|dim|sus|add|M)?[0-9]?)*\s*$/.test(line)
            if (isChordLine) return (
              <div key={i} style={{ marginBottom: 2 }}>
                {line.split(/(\s+)/).map((tok, j) => tok.trim()
                  ? <span key={j} style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 5, background: T.chordBg, color: T.chordName, fontWeight: 700, marginRight: 6, fontSize: 12 }}>{tok}</span>
                  : <span key={j}>{tok}</span>)}
              </div>
            )
            return <div key={i}>{line || ' '}</div>
          })}
        </pre>
      </div>
    )
  }

  const LyricsCard = () => {
    return (
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${T.subBdr}`, padding: '0 14px' }}>
          {([
            { id: 'lyrics', label: 'Dainos tekstas', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M3 18h12v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg> },
            { id: 'chords', label: 'Akordai', icon: <GuitarIcon size={11} /> },
          ] as const).map(tab => {
            const isActive = activeTab === tab.id
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '11px 12px 10px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: isActive ? 800 : 600, color: isActive ? '#f97316' : T.textFaint, borderBottom: isActive ? '2px solid #f97316' : '2px solid transparent', marginBottom: -1, transition: 'all .15s', fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase', letterSpacing: '.07em' }}>
                {tab.icon} {tab.label}
              </button>
            )
          })}
          {activeTab === 'lyrics' && hasLyrics && (
            <span style={{ marginLeft: 'auto', fontSize: 9, color: T.textFaint, fontStyle: 'italic' }}>Pažymėk tekstą</span>
          )}
        </div>
        {/* Comment input — outside LyricsPanel to prevent remount */}
        {activeTab === 'lyrics' && commentingOn && (
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${T.subBdr}`, background: T.bgActive, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, color: T.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>💬 prie: <em style={{ color: T.text, fontWeight: 600 }}>„{commentingOn.text.slice(0, 40)}{commentingOn.text.length > 40 ? '…' : ''}"</em></span>
              <button onMouseDown={e => { e.preventDefault(); setCommentingOn(null); setCommentDraft('') }} style={{ background: 'none', border: 'none', color: T.textFaint, cursor: 'pointer', fontSize: 13 }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 7 }}>
              <input autoFocus value={commentDraft} onChange={e => setCommentDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitComment() }}
                placeholder="Tavo komentaras…"
                style={{ flex: 1, height: 32, borderRadius: 999, padding: '0 12px', fontSize: 12, background: T.cmtInput, border: `1px solid rgba(249,115,22,.4)`, color: T.text, outline: 'none', fontFamily: "'DM Sans', sans-serif" }}
              />
              <button onMouseDown={e => { e.preventDefault(); submitComment() }} style={{ height: 32, padding: '0 14px', borderRadius: 999, background: '#f97316', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Siųsti</button>
            </div>
          </div>
        )}
        {activeTab === 'lyrics' && <LyricsPanel />}
        {activeTab === 'chords' && <ChordsPanel />}
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: T.bg, color: T.text, fontFamily: "'DM Sans',system-ui,sans-serif", WebkitFontSmoothing: 'antialiased', minHeight: '100vh' }}>
      <ShareQuoteOverlay />

      {/* ══ DESKTOP ══ */}
      <div className="tr-desktop" style={{ maxWidth: 1400, margin: '0 auto', padding: '14px 20px 60px', display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 14, alignItems: 'start' }}>
        <div style={{ position: 'sticky', top: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TrackInfoCard />
          {PlayerCard}
          <AICard />
          <TriviaCard />
          <VersionsCard />
          <DiscussionsCard />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <LyricsCard />
          <RelatedCard />
        </div>
      </div>

      {/* ══ MOBILE ══ */}
      <div className="tr-mobile" style={{ display: 'none', padding: '12px 14px 56px', flexDirection: 'column', gap: 12 }}>
        <TrackInfoCard />
        {PlayerCard}
        <LyricsCard />
        <AICard />
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
        ::selection { background: rgba(249,115,22,.25); }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
