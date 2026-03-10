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

type MoodVote = { emoji: string; label: string; count: number }

type Props = {
  track: Track; artist: Artist; albums: Album[]
  versions: Version[]; likes: number
  lyricComments: LyricComment[]; trivia: string | null
  relatedTracks: Track[]
  moodVotes?: MoodVote[]
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

function buildWordCloud(lyrics: string): Array<{ word: string; weight: number }> {
  const stopWords = new Set(['the','and','in','of','to','a','i','it','is','be','as','at','so','we','he','she','they','you','me','my','your','our','his','her','its','on','do','if','or','an','but','not','with','from','this','that','was','for','are','were','had','have','has','will','just','like','up','out','all','when','what','so','one','no','can','get','more','now','about','into','there','some','would','make','time','see','than','then','could','him','come','its','over','think','also','back','after','use','two','how','our','work','first','well','way','even','want','because','any','these','give','most','su','ir','kad','tai','dar','jau','ne','per','bet','man','tas','kaip'])
  const words = lyrics.toLowerCase().replace(/[^a-zA-ZąčęėįšųūžĄČĘĖĮŠŲŪŽ\s]/g, ' ').split(/\s+/)
  const freq: Record<string, number> = {}
  words.forEach(w => { if (w.length > 3 && !stopWords.has(w)) freq[w] = (freq[w] || 0) + 1 })
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 28)
  const max = sorted[0]?.[1] || 1
  return sorted.map(([word, count]) => ({ word, weight: count / max }))
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
  trivia, relatedTracks, moodVotes: initialMoodVotes
}: Props) {
  const { dk } = useSite()

  const [liked, setLiked] = useState(false)
  const [activeTab, setActiveTab] = useState<'lyrics' | 'chords' | 'cloud'>('lyrics')
  const [comments, setComments] = useState<LyricComment[]>(initialComments)
  const [showAllVersions, setShowAllVersions] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const [aiText, setAiText] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState(false)

  const [shareQuote, setShareQuote] = useState<string | null>(null)

  const [selectionPopup, setSelectionPopup] = useState<{
    x: number; y: number; text: string; start: number; end: number
  } | null>(null)
  const [commentingOn, setCommentingOn] = useState<{
    text: string; start: number; end: number
  } | null>(null)
  const [commentDraft, setCommentDraft] = useState('')
  const commentInputRef = useRef<HTMLInputElement>(null)
  const lyricsRef = useRef<HTMLDivElement>(null)

  const defaultMoods: MoodVote[] = [
    { emoji: '😢', label: 'Jaudinanti', count: 0 },
    { emoji: '🔥', label: 'Energinga', count: 0 },
    { emoji: '💕', label: 'Romantiška', count: 0 },
    { emoji: '😌', label: 'Raminanti', count: 0 },
    { emoji: '🤔', label: 'Mąstanti', count: 0 },
    { emoji: '🎉', label: 'Linksma', count: 0 },
  ]
  const [moods, setMoods] = useState<MoodVote[]>(initialMoodVotes?.length ? initialMoodVotes : defaultMoods)
  const [myMood, setMyMood] = useState<string | null>(null)

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
  const wordCloud = hasLyrics ? buildWordCloud(track.lyrics!) : []

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

    setSelectionPopup({
      x: rect.left + rect.width / 2,
      y: rect.top + window.scrollY - 8,
      text,
      start: Math.max(0, start),
      end,
    })
  }, [track.lyrics])

  const startCommenting = () => {
    if (!selectionPopup) return
    setCommentingOn({ text: selectionPopup.text, start: selectionPopup.start, end: selectionPopup.end })
    setSelectionPopup(null)
    window.getSelection()?.removeAllRanges()
    setTimeout(() => commentInputRef.current?.focus(), 80)
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
    } catch (e) { /* silently ignore */ }
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
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: `Tu esi muzikos kritikas ir lyrikų interpretatorius. Atsakyk TIKTAI lietuviškai. Būk įžvalgus, nuoširdus, poetiškas — ne akademiškas. Maksimaliai 3 trumpi paragrafai. Neminėk dainos pavadinimo ar atlikėjo pirmame sakinyje — tiesiog nerk į esmę.`,
          messages: [{
            role: 'user',
            content: `Daina: "${track.title}" — ${artist.name}\n\nŽodžiai:\n${track.lyrics}\n\nPapasakok trumpai ir įtaigiai: kokia yra šios dainos esminė žinutė ir emocija? Kas ją daro ypatinga ar universalia? Kokią patirtį ar jausmą ji perteikia klausytojui?`,
          }],
        }),
      })
      const data = await res.json()
      const text = data.content?.find((b: any) => b.type === 'text')?.text ?? null
      setAiText(text)
    } catch {
      setAiError(true)
    } finally {
      setAiLoading(false)
    }
  }

  const votesMood = (emoji: string) => {
    if (myMood === emoji) return
    setMoods(prev => prev.map(m =>
      m.emoji === emoji ? { ...m, count: m.count + 1 }
      : m.emoji === myMood ? { ...m, count: Math.max(0, m.count - 1) }
      : m
    ))
    setMyMood(emoji)
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

  // PlayerCard: stable via useMemo so YoutubeEmbed never remounts on state changes
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

  const MoodCard = () => {
    const total = moods.reduce((s, m) => s + m.count, 0)
    return (
      <div style={card}>
        <div style={cardHead}>Dainos nuotaika</div>
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 2 }}>Kaip tau atrodo ši daina?</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {moods.map(m => {
              const isVoted = myMood === m.emoji
              const pct = total > 0 ? Math.round((m.count / total) * 100) : 0
              return (
                <button key={m.emoji} onClick={() => votesMood(m.emoji)}
                  style={{ position: 'relative', padding: '8px 10px', borderRadius: 10, border: `1px solid ${isVoted ? 'rgba(249,115,22,.5)' : T.borderSub}`, background: isVoted ? 'rgba(249,115,22,.1)' : T.bgHover, cursor: 'pointer', textAlign: 'left', overflow: 'hidden', transition: 'all .15s' }}>
                  {myMood && <div style={{ position: 'absolute', inset: 0, background: isVoted ? 'rgba(249,115,22,.08)' : 'rgba(255,255,255,.02)', width: `${pct}%`, transition: 'width .4s ease', borderRadius: 'inherit' }} />}
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13 }}>{m.emoji} <span style={{ fontSize: 11, color: isVoted ? '#f97316' : T.textSec, fontWeight: isVoted ? 700 : 500 }}>{m.label}</span></span>
                    {myMood && <span style={{ fontSize: 10, color: isVoted ? '#f97316' : T.textFaint, fontFamily: 'Outfit, sans-serif', fontWeight: 700 }}>{pct}%</span>}
                  </div>
                </button>
              )
            })}
          </div>
          {myMood && <div style={{ fontSize: 10, color: T.textFaint, textAlign: 'center', marginTop: 2 }}>Balsavo {total} {total === 1 ? 'žmogus' : 'žmonės'}</div>}
        </div>
      </div>
    )
  }

  const TriviaCard = () => (
    <div style={{ ...card, background: T.dykBg, border: `1px solid ${T.dykBdr}` }}>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: '#f97316', fontFamily: 'Outfit, sans-serif', marginBottom: 7, display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="#f97316"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          Ar žinojai?
        </div>
        <p style={{ fontSize: 12, color: T.dykText, lineHeight: 1.75, margin: 0 }}>
          {track.description || trivia || 'Informacija apie šią dainą bus rodoma automatiškai iš Wikipedia. Administratorius gali keisti šį tekstą admin panelėje.'}
        </p>
        <div style={{ fontSize: 9, color: T.textFaint, marginTop: 6 }}>Šaltinis: Wikipedia · Adminas gali keisti</div>
      </div>
    </div>
  )

  const AICard = () => {
    if (!hasLyrics || !track.show_ai_interpretation) return null
    return (
      <div style={card}>
        <div style={cardHead}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13 }}>✦</span> AI interpretacija
          </span>
          {!aiText && (
            <span style={{ fontSize: 9, fontWeight: 400, color: T.textFaint, textTransform: 'none', letterSpacing: 0 }}>beta</span>
          )}
        </div>
        <div style={{ padding: '14px' }}>
          {!aiText && !aiLoading && !aiError && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '8px 0' }}>
              <p style={{ fontSize: 12, color: T.textMuted, textAlign: 'center', margin: 0, lineHeight: 1.6 }}>
                Claude perskaitys dainos žodžius ir papasakos, kokią žinutę ir emociją ši daina perteikia.
              </p>
              <button onClick={generateAI}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', borderRadius: 999, background: 'rgba(249,115,22,.12)', border: '1px solid rgba(249,115,22,.35)', color: '#f97316', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', transition: 'all .15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(249,115,22,.2)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(249,115,22,.12)' }}>
                <span style={{ fontSize: 14 }}>✦</span> Generuoti interpretaciją
              </button>
            </div>
          )}
          {aiLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', color: T.textMuted, fontSize: 12 }}>
              <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block', fontSize: 16 }}>✦</span>
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
              <div style={{ fontSize: 9, color: '#f97316', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', fontFamily: 'Outfit, sans-serif', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span>✦</span> Sugeneruota Claude
              </div>
              <p style={{ fontSize: 13, color: T.dykText, lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap' }}>{aiText}</p>
              <button onClick={() => setAiText(null)}
                style={{ marginTop: 10, background: 'none', border: 'none', color: T.textFaint, fontSize: 10, cursor: 'pointer', padding: 0 }}>
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
            <p style={{ fontSize: 15, fontWeight: 600, color: T.text, lineHeight: 1.7, margin: '0 0 14px', fontStyle: 'italic', position: 'relative' }}>
              „{displayQuote}"
            </p>
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
            <button
              onClick={() => { navigator.clipboard.writeText(shareText); setShareQuote(null) }}
              style={{ padding: '10px 16px', borderRadius: 10, background: 'rgba(249,115,22,.12)', border: '1px solid rgba(249,115,22,.3)', color: '#f97316', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
              📋 Kopijuoti tekstą
            </button>
            <button
              onClick={() => { window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`, '_blank'); setShareQuote(null) }}
              style={{ padding: '10px 16px', borderRadius: 10, background: T.bgHover, border: `1px solid ${T.borderSub}`, color: T.textSec, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
              𝕏 Dalintis X (Twitter)
            </button>
            <button onClick={() => setShareQuote(null)}
              style={{ padding: '8px', background: 'none', border: 'none', color: T.textFaint, fontSize: 11, cursor: 'pointer' }}>
              Atšaukti
            </button>
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

  const LyricsPanel = () => {
    if (!hasLyrics) return <div style={{ padding: 32, textAlign: 'center', color: T.textFaint, fontSize: 13 }}>Žodžiai dar nepridėti</div>

    const commentList = comments.filter(c => c.selection_start >= 0)

    return (
      <div>
        <div ref={lyricsRef} onMouseUp={handleLyricsMouseUp} style={{ position: 'relative', padding: '16px 18px', userSelect: 'text', cursor: 'text' }}>
          {selectionPopup && (
            <div className="lyric-popup" style={{
              position: 'fixed',
              left: Math.min(selectionPopup.x, window.innerWidth - 280),
              top: selectionPopup.y,
              transform: 'translateY(-100%)',
              zIndex: 100,
              background: dk ? '#151f2e' : '#1a2535',
              border: '1px solid rgba(249,115,22,.35)',
              borderRadius: 12,
              padding: '10px 12px',
              width: 260,
              boxShadow: '0 12px 40px rgba(0,0,0,.6)',
            }}>
              {/* Quote preview */}
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.75)', fontStyle: 'italic', lineHeight: 1.55, marginBottom: 10, borderLeft: '2px solid rgba(249,115,22,.5)', paddingLeft: 8, maxHeight: 72, overflow: 'hidden' }}>
                „{selectionPopup.text}"
              </div>
              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 6 }}>
                <button onMouseDown={e => { e.preventDefault(); e.stopPropagation()
                  const newC: LyricComment = { id: Date.now(), selection_start: selectionPopup.start, selection_end: selectionPopup.end, selected_text: selectionPopup.text, author: 'Aš', avatar_letter: '♥', text: '', likes: 1, created_at: new Date().toISOString() }
                  setComments(prev => [...prev, newC]); setSelectionPopup(null); window.getSelection()?.removeAllRanges()
                }} style={{ flex: 1, padding: '7px 4px', borderRadius: 8, background: 'rgba(249,115,22,.15)', border: '1px solid rgba(249,115,22,.3)', color: '#f97316', fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>
                  ♥ Patinka
                </button>
                <button onMouseDown={e => { e.preventDefault(); e.stopPropagation()
                  const newC: LyricComment = { id: Date.now(), selection_start: selectionPopup.start, selection_end: selectionPopup.end, selected_text: selectionPopup.text, author: 'Aš', avatar_letter: '🔖', text: '🔖', likes: 0, created_at: new Date().toISOString() }
                  setComments(prev => [...prev, newC]); setSelectionPopup(null); window.getSelection()?.removeAllRanges()
                }} style={{ flex: 1, padding: '7px 4px', borderRadius: 8, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)', color: 'rgba(255,255,255,.7)', fontSize: 13, cursor: 'pointer' }}>
                  🔖 Žymė
                </button>
                <button onMouseDown={e => { e.preventDefault(); e.stopPropagation(); startCommenting() }}
                  style={{ flex: 1, padding: '7px 4px', borderRadius: 8, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)', color: 'rgba(255,255,255,.7)', fontSize: 13, cursor: 'pointer' }}>
                  💬 Komentaras
                </button>
                <button onMouseDown={e => { e.preventDefault(); e.stopPropagation(); startSharing() }}
                  style={{ padding: '7px 8px', borderRadius: 8, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)', color: 'rgba(255,255,255,.7)', fontSize: 13, cursor: 'pointer' }}>
                  🔗
                </button>
              </div>
              {/* Arrow */}
              <div style={{ position: 'absolute', bottom: -5, left: 24, transform: 'rotate(45deg)', width: 8, height: 8, background: dk ? '#151f2e' : '#1a2535', border: '1px solid rgba(249,115,22,.35)', borderTop: 'none', borderLeft: 'none' }} />
            </div>
          )}

          <pre style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, lineHeight: 2, color: T.lyricText, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {renderLyricsWithHighlights()}
          </pre>
        </div>

        {commentList.length > 0 && (
          <div style={{ borderTop: `1px solid ${T.subBdr}`, padding: '12px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '.07em', fontFamily: 'Outfit, sans-serif', marginBottom: 10 }}>Reakcijos į žodžius</div>
            {commentList.map(c => {
              const isLike = c.avatar_letter === '♥'
              const isBookmark = c.avatar_letter === '🔖'
              const isReactionOnly = isLike || isBookmark
              return (
                <div key={c.id} style={{ display: 'flex', gap: 9, marginBottom: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: isLike ? 'rgba(249,115,22,.15)' : 'rgba(255,255,255,.07)', border: `1px solid ${isLike ? 'rgba(249,115,22,.3)' : 'rgba(255,255,255,.1)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>{c.avatar_letter}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: T.textFaint, marginBottom: isReactionOnly ? 0 : 2, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>„{c.selected_text.slice(0, 50)}{c.selected_text.length > 50 ? '…' : ''}"</div>
                    {!isReactionOnly && <div style={{ fontSize: 12, color: T.textSec }}>{c.text}</div>}
                  </div>
                  {isLike && <div style={{ fontSize: 10, color: '#f97316', fontWeight: 700 }}>♥</div>}
                  {isBookmark && <div style={{ fontSize: 10, color: T.textFaint }}>🔖</div>}
                  {!isReactionOnly && <div style={{ fontSize: 10, color: T.textFaint }}>♥ {c.likes}</div>}
                </div>
              )
            })}
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

  const WordCloudPanel = () => {
    if (wordCloud.length === 0) return <div style={{ padding: 32, textAlign: 'center', color: T.textFaint, fontSize: 13 }}>Žodžiai dar nepridėti</div>
    return (
      <div style={{ padding: '20px 18px', display: 'flex', flexWrap: 'wrap', gap: '8px 12px', alignItems: 'center', justifyContent: 'center', minHeight: 160 }}>
        {wordCloud.map(({ word, weight }) => {
          const size = Math.round(11 + weight * 20)
          const opacity = 0.45 + weight * 0.55
          const isTop = weight > 0.7
          return (
            <span key={word} style={{
              fontSize: size,
              fontWeight: weight > 0.5 ? 700 : 500,
              color: isTop ? '#f97316' : T.textSec,
              opacity,
              fontFamily: 'Outfit, sans-serif',
              letterSpacing: weight > 0.6 ? '-.02em' : 0,
              transition: 'opacity .2s',
              cursor: 'default',
              lineHeight: 1,
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={e => (e.currentTarget.style.opacity = String(opacity))}>
              {word}
            </span>
          )
        })}
      </div>
    )
  }

  const LyricsChordsCard = () => {
    return (
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${T.subBdr}`, padding: '0 14px' }}>
          {([
            { id: 'lyrics', label: 'Žodžiai', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M3 18h12v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg> },
            { id: 'chords', label: 'Akordai', icon: <GuitarIcon size={11} /> },
            { id: 'cloud',  label: 'Žodžių debesis', icon: <span style={{ fontSize: 10 }}>☁</span> },
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
            <span style={{ marginLeft: 'auto', fontSize: 9, color: T.textFaint, fontStyle: 'italic' }}>Pažymėk tekstą, kad komentuotum</span>
          )}
        </div>
        {/* Comment input — lives HERE (outside LyricsPanel) so input never remounts while typing */}
        {activeTab === 'lyrics' && commentingOn && (
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${T.subBdr}`, background: T.bgActive, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, color: T.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>💬 prie: <em style={{ color: T.text, fontWeight: 600 }}>„{commentingOn.text.slice(0, 40)}{commentingOn.text.length > 40 ? '…' : ''}"</em></span>
              <button onMouseDown={e => { e.preventDefault(); setCommentingOn(null); setCommentDraft('') }} style={{ background: 'none', border: 'none', color: T.textFaint, cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 7 }}>
              <input
                autoFocus
                value={commentDraft}
                onChange={e => setCommentDraft(e.target.value)}
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
        {activeTab === 'cloud'  && <WordCloudPanel />}
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
          { PlayerCard }
          <MoodCard />
          <AICard />
          <TriviaCard />
          <VersionsCard />
          <DiscussionsCard />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <LyricsChordsCard />
          <RelatedCard />
        </div>
      </div>

      {/* ══ MOBILE ══ */}
      <div className="tr-mobile" style={{ display: 'none', padding: '12px 14px 56px', flexDirection: 'column', gap: 12 }}>
        <TrackInfoCard />
        { PlayerCard }
        <LyricsChordsCard />
        <MoodCard />
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
