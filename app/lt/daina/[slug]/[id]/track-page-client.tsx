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

type LyricReaction = {
  id: number
  selection_start: number
  selection_end: number
  selected_text: string
  type: 'like' | 'comment'
  text: string
  likes: number
  created_at: string
}

type Version = { id: number; slug: string; title: string; type: string; video_url: string | null }

type Props = {
  track: Track; artist: Artist; albums: Album[]
  versions: Version[]; likes: number
  lyricComments: LyricReaction[]; trivia: string | null
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
function HeartIcon({ filled = false, size = 14 }: { filled?: boolean; size?: number }) {
  return filled
    ? <svg width={size} height={size} viewBox="0 0 24 24" fill="#f97316"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
    : <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"/></svg>
}
function ChatIcon({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>
}
function ShareIcon({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>
}
function XIcon({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
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
  const [reactions, setReactions] = useState<LyricReaction[]>(initialComments)
  const [showAllVersions, setShowAllVersions] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // AI
  const [aiText, setAiText] = useState<string | null>(null)
  const [aiImage, setAiImage] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState(false)

  // Side panel for lyric selection
  const [sidePanel, setSidePanel] = useState<{
    text: string; start: number; end: number
  } | null>(null)
  const [sidePanelTab, setSidePanelTab] = useState<'actions' | 'share'>('actions')
  const [commentDraft, setCommentDraft] = useState('')
  const [saving, setSaving] = useState(false)

  // Hover tooltip on marked text
  const [hoverTooltip, setHoverTooltip] = useState<{
    x: number; y: number; reactions: LyricReaction[]
  } | null>(null)

  // Share quote overlay
  const [shareQuote, setShareQuote] = useState<string | null>(null)

  const lyricsRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setLoaded(true) }, [])

  // Close side panel on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Element
      if (sidePanel && !t.closest('.lyric-side-panel') && !t.closest('.lyric-text-area')) {
        setSidePanel(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [sidePanel])

  const vid = ytId(track.video_url)
  const hasLyrics = !!track.lyrics?.trim()
  const hasChords = !!track.chords?.trim()
  const dateStr = formatReleaseDate(track.release_date)
  const primaryAlbum = albums[0] ?? null

  // Group reactions by selected_text range for highlights
  const reactionsByRange = useMemo(() => {
    const map = new Map<string, LyricReaction[]>()
    reactions.forEach(r => {
      const key = `${r.selection_start}-${r.selection_end}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    })
    return map
  }, [reactions])

  const handleLyricsMouseUp = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return
    const text = sel.toString().trim()
    if (text.length < 3) return

    const fullText = track.lyrics || ''
    const start = fullText.indexOf(text)
    const end = start + text.length

    setSidePanel({ text, start: Math.max(0, start), end })
    setSidePanelTab('actions')
    setCommentDraft('')
    window.getSelection()?.removeAllRanges()
  }, [track.lyrics])

  const saveLike = async () => {
    if (!sidePanel) return
    setSaving(true)
    const newR: LyricReaction = {
      id: Date.now(),
      selection_start: sidePanel.start,
      selection_end: sidePanel.end,
      selected_text: sidePanel.text,
      type: 'like',
      text: '',
      likes: 0,
      created_at: new Date().toISOString(),
    }
    setReactions(prev => [...prev, newR])
    try {
      await fetch(`/api/tracks/${track.id}/lyric-comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_text: sidePanel.text, selection_start: sidePanel.start, selection_end: sidePanel.end, type: 'like', text: '' }),
      })
    } catch { /* ignore */ }
    setSaving(false)
    setSidePanel(null)
  }

  const saveComment = async () => {
    if (!sidePanel || !commentDraft.trim()) return
    setSaving(true)
    const newR: LyricReaction = {
      id: Date.now(),
      selection_start: sidePanel.start,
      selection_end: sidePanel.end,
      selected_text: sidePanel.text,
      type: 'comment',
      text: commentDraft.trim(),
      likes: 0,
      created_at: new Date().toISOString(),
    }
    setReactions(prev => [...prev, newR])
    try {
      await fetch(`/api/tracks/${track.id}/lyric-comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_text: sidePanel.text, selection_start: sidePanel.start, selection_end: sidePanel.end, type: 'comment', text: commentDraft.trim() }),
      })
    } catch { /* ignore */ }
    setCommentDraft('')
    setSaving(false)
    setSidePanel(null)
  }

  const generateAI = async () => {
    if (!hasLyrics || aiLoading) return
    setAiLoading(true)
    setAiError(false)
    setAiText(null)
    setAiImage(null)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1200,
          system: `Tu esi muzikos kritikas ir lyrikų interpretatorius. Atsakyk TIKTAI lietuviškai. Būk įžvalgus, nuoširdus, poetiškas — ne akademiškas. Neminėk dainos pavadinimo ar atlikėjo pirmame sakinyje. Atsakyk TIKTAI JSON formatu be jokio kito teksto: { "interpretation": "2-3 paragrafai, kiekvienas per naują eilutę", "image_prompt": "abstract art, 10-15 words in English capturing the emotional essence, no people, no text" }`,
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
        if (parsed.image_prompt) {
          const prompt = encodeURIComponent(parsed.image_prompt + ', cinematic lighting, no text')
          setAiImage(`https://image.pollinations.ai/prompt/${prompt}?width=800&height=380&nologo=true&seed=${track.id}`)
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
    lyricText:   dk ? '#c8daf0' : '#1a2a40',
    lyricMark:   dk ? 'rgba(249,115,22,.22)'  : 'rgba(249,115,22,.15)',
    chordBg:     dk ? 'rgba(249,115,22,.10)'  : 'rgba(249,115,22,.08)',
    chordName:   dk ? '#f97316' : '#ea6a00',
    panelBg:     dk ? '#0d1623' : '#ffffff',
  }

  const card: React.CSSProperties = { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16, overflow: 'hidden' }
  const cardHead: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px', borderBottom: `1px solid ${T.subBdr}`,
    fontSize: 11, fontWeight: 700, color: dk ? '#c8d8ec' : '#1a2a40',
    fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase', letterSpacing: '.08em',
  }

  // Render lyrics with reaction highlights
  const renderLyricsWithHighlights = () => {
    const text = track.lyrics || ''
    if (reactionsByRange.size === 0) return <span>{text}</span>

    // Collect all unique ranges
    const ranges: Array<{ start: number; end: number; key: string }> = []
    reactionsByRange.forEach((_, key) => {
      const [s, e] = key.split('-').map(Number)
      if (!isNaN(s) && !isNaN(e) && e > s) ranges.push({ start: s, end: e, key })
    })
    ranges.sort((a, b) => a.start - b.start)

    const parts: React.ReactNode[] = []
    let pos = 0
    for (const r of ranges) {
      if (r.start < pos) continue
      if (r.start > pos) parts.push(<span key={`t${pos}`}>{text.slice(pos, r.start)}</span>)
      const rxns = reactionsByRange.get(r.key) ?? []
      const likeCount = rxns.filter(x => x.type === 'like').length
      const cmtCount = rxns.filter(x => x.type === 'comment').length
      parts.push(
        <span key={r.key}
          className="lyric-mark"
          style={{
            background: T.lyricMark,
            borderRadius: 3,
            cursor: 'pointer',
            borderBottom: '2px solid rgba(249,115,22,.55)',
            position: 'relative',
            paddingBottom: 1,
          }}
          onMouseEnter={e => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            setHoverTooltip({ x: rect.left + rect.width / 2, y: rect.bottom + window.scrollY + 6, reactions: rxns })
          }}
          onMouseLeave={() => setHoverTooltip(null)}
        >
          {text.slice(r.start, r.end)}
          <sup style={{ fontSize: 9, color: '#f97316', fontWeight: 800, marginLeft: 2, verticalAlign: 'super' }}>
            {likeCount > 0 && `♥${likeCount}`}{cmtCount > 0 && ` 💬${cmtCount}`}
          </sup>
        </span>
      )
      pos = r.end
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
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '6px 0' }}>
              <p style={{ fontSize: 12, color: T.textMuted, textAlign: 'center', margin: 0, lineHeight: 1.6 }}>
                Claude perskaitys žodžius ir sukurs interpretaciją bei abstraktų paveikslėlį, perteikiantį dainos nuotaiką.
              </p>
              <button onClick={generateAI}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 999, background: 'rgba(249,115,22,.12)', border: '1px solid rgba(249,115,22,.35)', color: '#f97316', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', transition: 'all .15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(249,115,22,.2)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(249,115,22,.12)' }}>
                <span style={{ fontSize: 14 }}>✦</span> Generuoti
              </button>
            </div>
          )}
          {aiLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '16px 0', color: T.textMuted, fontSize: 12 }}>
              <span style={{ animation: 'spin 1.2s linear infinite', display: 'inline-block', fontSize: 22, color: '#f97316' }}>✦</span>
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
              {aiImage && (
                <div style={{ marginBottom: 14, borderRadius: 10, overflow: 'hidden', border: `1px solid ${T.borderSub}`, background: T.coverBg }}>
                  <img src={aiImage} alt="AI vizualizacija" style={{ width: '100%', display: 'block', objectFit: 'cover', minHeight: 80 }}
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

  // ── Side panel (lyric reactions) ───────────────────────────────────────────
  const LyricSidePanel = () => {
    if (!sidePanel) return null
    const shareText = `„${sidePanel.text}"\n\n— ${track.title}, ${artist.name}\nmusic.lt`
    return (
      <div className="lyric-side-panel" style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: 320,
        height: '100vh',
        background: dk ? '#0d1623' : '#fff',
        borderLeft: `1px solid ${T.border}`,
        boxShadow: '-16px 0 48px rgba(0,0,0,.3)',
        zIndex: 150,
        display: 'flex',
        flexDirection: 'column',
        animation: 'slideInRight .2s ease',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.subBdr}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: T.textMuted, fontFamily: 'Outfit, sans-serif' }}>Pažymėta vieta</span>
          <button onClick={() => setSidePanel(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textFaint, padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}
            onMouseEnter={e => (e.currentTarget.style.background = T.bgHover)}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
            <XIcon size={16} />
          </button>
        </div>

        {/* Quote */}
        <div style={{ margin: '14px 16px', padding: '12px 14px', background: dk ? 'rgba(249,115,22,.06)' : 'rgba(249,115,22,.05)', border: `1px solid rgba(249,115,22,.2)`, borderLeft: '3px solid rgba(249,115,22,.7)', borderRadius: '0 10px 10px 0' }}>
          <p style={{ fontSize: 13, color: T.text, fontStyle: 'italic', lineHeight: 1.65, margin: 0 }}>
            „{sidePanel.text.length > 150 ? sidePanel.text.slice(0, 150) + '…' : sidePanel.text}"
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${T.subBdr}`, padding: '0 16px' }}>
          {(['actions', 'share'] as const).map(tab => (
            <button key={tab} onClick={() => setSidePanelTab(tab)}
              style={{ padding: '9px 12px 8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: sidePanelTab === tab ? 800 : 600, color: sidePanelTab === tab ? '#f97316' : T.textFaint, borderBottom: sidePanelTab === tab ? '2px solid #f97316' : '2px solid transparent', marginBottom: -1, fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              {tab === 'actions' ? 'Reagavimas' : 'Dalintis'}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, padding: 16, overflowY: 'auto' }}>
          {sidePanelTab === 'actions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Like */}
              <button onClick={saveLike} disabled={saving}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, background: 'rgba(249,115,22,.08)', border: '1px solid rgba(249,115,22,.25)', cursor: saving ? 'wait' : 'pointer', transition: 'all .15s', width: '100%', textAlign: 'left' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(249,115,22,.15)'; e.currentTarget.style.borderColor = 'rgba(249,115,22,.5)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(249,115,22,.08)'; e.currentTarget.style.borderColor = 'rgba(249,115,22,.25)' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(249,115,22,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <HeartIcon filled size={18} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#f97316', fontFamily: 'Outfit, sans-serif' }}>Patinka šita vieta</div>
                  <div style={{ fontSize: 11, color: T.textMuted, marginTop: 1 }}>Pažymėk kaip mėgstamą</div>
                </div>
              </button>

              {/* Comment */}
              <div style={{ borderRadius: 12, background: T.bgHover, border: `1px solid ${T.borderSub}`, overflow: 'hidden' }}>
                <div style={{ padding: '12px 14px 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: dk ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ChatIcon size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: 'Outfit, sans-serif' }}>Komentuoti</div>
                    <div style={{ fontSize: 11, color: T.textMuted, marginTop: 1 }}>Pasidalink mintimis</div>
                  </div>
                </div>
                <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <textarea
                    value={commentDraft}
                    onChange={e => setCommentDraft(e.target.value)}
                    placeholder="Tavo komentaras apie šią vietą…"
                    rows={3}
                    style={{ width: '100%', borderRadius: 10, padding: '9px 12px', fontSize: 12, background: T.cmtInput, border: `1px solid ${T.cmtBdr}`, color: T.text, outline: 'none', resize: 'none', fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', lineHeight: 1.55 }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'rgba(249,115,22,.5)')}
                    onBlur={e => (e.currentTarget.style.borderColor = T.cmtBdr)}
                  />
                  <button onClick={saveComment} disabled={!commentDraft.trim() || saving}
                    style={{ padding: '8px 16px', borderRadius: 999, background: commentDraft.trim() ? '#f97316' : 'rgba(249,115,22,.2)', border: 'none', color: commentDraft.trim() ? '#fff' : 'rgba(249,115,22,.4)', fontSize: 12, fontWeight: 700, cursor: commentDraft.trim() ? 'pointer' : 'not-allowed', fontFamily: 'Outfit, sans-serif', transition: 'all .15s', alignSelf: 'flex-end' }}>
                    Išsaugoti komentarą
                  </button>
                </div>
              </div>
            </div>
          )}

          {sidePanelTab === 'share' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Share card preview */}
              <div style={{ background: dk ? '#080c12' : '#f0f5ff', border: `1px solid rgba(249,115,22,.2)`, borderRadius: 12, padding: '16px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 6, left: 12, fontSize: 42, color: 'rgba(249,115,22,.1)', fontFamily: 'Georgia, serif', lineHeight: 1 }}>"</div>
                <p style={{ fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.65, margin: '0 0 12px', fontStyle: 'italic', position: 'relative' }}>
                  „{sidePanel.text.length > 120 ? sidePanel.text.slice(0, 120) + '…' : sidePanel.text}"
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {primaryAlbum?.cover_image_url && <img src={primaryAlbum.cover_image_url} style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover' }} alt="" />}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.text }}>{track.title}</div>
                    <div style={{ fontSize: 9, color: '#f97316' }}>{artist.name}</div>
                  </div>
                  <div style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 800, color: T.textFaint, fontFamily: 'Outfit, sans-serif' }}>music.lt</div>
                </div>
              </div>
              <button onClick={() => { navigator.clipboard.writeText(shareText); setSidePanel(null) }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px 16px', borderRadius: 12, background: 'rgba(249,115,22,.1)', border: '1px solid rgba(249,115,22,.3)', color: '#f97316', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                📋 Kopijuoti citată
              </button>
              <button onClick={() => { window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`, '_blank'); setSidePanel(null) }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px 16px', borderRadius: 12, background: T.bgHover, border: `1px solid ${T.borderSub}`, color: T.textSec, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                𝕏 Dalintis X (Twitter)
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Hover tooltip over marked lyrics
  const HoverTooltip = () => {
    if (!hoverTooltip) return null
    const { x, y, reactions: rxns } = hoverTooltip
    const likes = rxns.filter(r => r.type === 'like').length
    const comments = rxns.filter(r => r.type === 'comment')
    return (
      <div style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: 'translateX(-50%)',
        zIndex: 90,
        background: dk ? '#111827' : '#1a2535',
        border: '1px solid rgba(249,115,22,.3)',
        borderRadius: 10,
        padding: '8px 12px',
        maxWidth: 240,
        boxShadow: '0 8px 24px rgba(0,0,0,.5)',
        pointerEvents: 'none',
      }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: comments.length ? 6 : 0, fontSize: 11, color: 'rgba(255,255,255,.7)' }}>
          {likes > 0 && <span style={{ color: '#f97316', fontWeight: 700 }}>♥ {likes}</span>}
          {comments.length > 0 && <span>💬 {comments.length}</span>}
        </div>
        {comments.map((c, i) => (
          <div key={c.id} style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', paddingTop: i > 0 ? 4 : 0, borderTop: i > 0 ? '1px solid rgba(255,255,255,.08)' : 'none', marginTop: i > 0 ? 4 : 0 }}>
            {c.text}
          </div>
        ))}
      </div>
    )
  }

  const LyricsPanel = () => {
    if (!hasLyrics) return <div style={{ padding: 32, textAlign: 'center', color: T.textFaint, fontSize: 13 }}>Dainos tekstas dar nepridėtas</div>
    return (
      <div style={{ position: 'relative' }}>
        <div ref={lyricsRef} className="lyric-text-area" onMouseUp={handleLyricsMouseUp}
          style={{ padding: '16px 18px', userSelect: 'text', cursor: 'text', position: 'relative' }}>
          <HoverTooltip />
          <pre style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, lineHeight: 2.1, color: T.lyricText, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {renderLyricsWithHighlights()}
          </pre>
        </div>
        {reactions.length > 0 && (
          <div style={{ borderTop: `1px solid ${T.subBdr}`, padding: '8px 18px 12px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.textFaint, textTransform: 'uppercase', letterSpacing: '.08em', fontFamily: 'Outfit, sans-serif', marginBottom: 6 }}>
              {reactions.length} {reactions.length === 1 ? 'reakcija' : 'reakcijos'} į žodžius
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {/* Group by range */}
              {Array.from(reactionsByRange.entries()).map(([key, rxns]) => {
                const likes = rxns.filter(r => r.type === 'like').length
                const cmts = rxns.filter(r => r.type === 'comment').length
                const text = rxns[0]?.selected_text ?? ''
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px 4px 8px', borderRadius: 999, background: T.bgHover, border: `1px solid rgba(249,115,22,.2)`, fontSize: 11 }}>
                    <span style={{ color: T.textFaint, fontStyle: 'italic', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>„{text}"</span>
                    {likes > 0 && <span style={{ color: '#f97316', fontWeight: 700, fontSize: 10 }}>♥{likes}</span>}
                    {cmts > 0 && <span style={{ color: T.textMuted, fontSize: 10 }}>💬{cmts}</span>}
                  </div>
                )
              })}
            </div>
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
            <span style={{ marginLeft: 'auto', fontSize: 9, color: T.textFaint, fontStyle: 'italic' }}>
              {sidePanel ? '✏️ Atidarytas šoninis skydelis' : 'Pažymėk tekstą'}
            </span>
          )}
        </div>
        {activeTab === 'lyrics' && <LyricsPanel />}
        {activeTab === 'chords' && <ChordsPanel />}
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: T.bg, color: T.text, fontFamily: "'DM Sans',system-ui,sans-serif", WebkitFontSmoothing: 'antialiased', minHeight: '100vh' }}>
      <LyricSidePanel />

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
        @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .lyric-mark { transition: background .15s; }
        .lyric-mark:hover { background: rgba(249,115,22,.35) !important; }
      `}</style>
    </div>
  )
}
