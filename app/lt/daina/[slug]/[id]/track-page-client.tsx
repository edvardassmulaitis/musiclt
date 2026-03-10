'use client'
// app/lt/daina/[slug]/[id]/track-page-client.tsx
import { useState, useRef, useEffect, useCallback, memo, useMemo } from 'react'
import Link from 'next/link'
import { useSite } from '@/components/SiteContext'

// ── Types ──────────────────────────────────────────────────────────────────────

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
  id: number; selection_start: number; selection_end: number
  selected_text: string; type: 'like' | 'comment'; text: string
  likes: number; created_at: string
}
type Version = { id: number; slug: string; title: string; type: string; video_url: string | null }
type Props = {
  track: Track; artist: Artist; albums: Album[]
  versions: Version[]; likes: number
  lyricComments: LyricReaction[]; trivia: string | null
  relatedTracks: Track[]
  aiInterpretation?: string | null

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
const XIcon = ({ s = 14 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
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
}: Props) {
  const { dk } = useSite()

  // ── State ──────────────────────────────────────────────────────────────────
  const [liked, setLiked] = useState(false)
  const [tab, setTab] = useState<'lyrics' | 'chords'>('lyrics')
  const [showAllV, setShowAllV] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Reactions — initialise from server props; refreshed on mount via API
  const [reactions, setReactions] = useState<LyricReaction[]>(initialReactions)

  // Side panel
  const [panel, setPanel] = useState<{ text: string; start: number; end: number } | null>(null)
  const [panelTab, setPanelTab] = useState<'react' | 'share'>('react')
  const [saving, setSaving] = useState(false)
  const commentInputRef = useRef<HTMLTextAreaElement>(null)

  // Tooltip
  const [tip, setTip] = useState<{ x: number; y: number; rxns: LyricReaction[] } | null>(null)

  // AI
  const [aiText, setAiText] = useState<string | null>(aiInterpretation ?? null)

  const [aiLoad, setAiLoad] = useState(false)
  const [aiErr, setAiErr] = useState(false)

  // Flag: true when mousedown was on existing mark span
  const wasMarkClick = useRef(false)

  const log = (msg: string) => console.log(`[DBG] ${new Date().toISOString().slice(11,23)} ${msg}`)

  useEffect(() => { setLoaded(true) }, [])

  // Refresh reactions on mount with full logging
  useEffect(() => {
    log(`MOUNT track.id=${track.id} initialReactions.length=${initialReactions.length}`)
    fetch(`/api/tracks/${track.id}/lyric-comments`)
      .then(r => {
        log(`GET status=${r.status}`)
        return r.json()
      })
      .then((data: unknown) => {
        log(`GET data=${JSON.stringify(data).slice(0,150)}`)
        if (Array.isArray(data)) {
          setReactions(data)
          log(`setReactions count=${data.length}`)
        } else {
          log(`ERROR not array: ${typeof data}`)
        }
      })
      .catch((e: unknown) => log(`FETCH ERR: ${String(e)}`))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id])

  // ── Close panel on outside click ──────────────────────────────────────────
  useEffect(() => {
    if (!panel) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Element
      if (!t.closest('[data-panel]') && !t.closest('[data-lyrics]')) {
        setPanel(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [panel])

  // ── Derived ────────────────────────────────────────────────────────────────
  const vid = ytId(track.video_url)
  const hasLyrics = !!track.lyrics?.trim()
  const hasChords = !!track.chords?.trim()
  const dateStr = fmtDate(track.release_date)
  const primaryAlbum = albums[0] ?? null

  // Group reactions by "start-end" key
  const byRange = useMemo(() => {
    const m = new Map<string, LyricReaction[]>()
    for (const r of reactions) {
      const k = `${r.selection_start}-${r.selection_end}`
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(r)
    }
    return m
  }, [reactions])

  // ── Colours ────────────────────────────────────────────────────────────────
  const T = useMemo(() => ({
    bg:        dk ? '#080c12' : '#eef2f8',
    card:      dk ? '#0e1520' : '#ffffff',
    border:    dk ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)',
    subBdr:    dk ? 'rgba(255,255,255,.055)' : 'rgba(0,0,0,.07)',
    bgHov:     dk ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.03)',
    bgAct:     dk ? 'rgba(249,115,22,.08)' : 'rgba(249,115,22,.07)',
    coverBg:   dk ? '#1a2535' : '#dde6f2',
    infoBg:    dk ? '#121c28' : '#f0f5ff',
    dykBg:     dk ? '#0f1a10' : '#fff8f2',
    dykBdr:    dk ? 'rgba(249,115,22,.18)' : 'rgba(249,115,22,.22)',
    text:      dk ? '#f0f2f5' : '#0f1a2e',
    sec:       dk ? '#b0bdd4' : '#3a5a80',
    muted:     dk ? '#7a9bb8' : '#6a85a0',
    faint:     dk ? '#4a6888' : '#aabbd0',
    lyric:     dk ? '#c8daf0' : '#1a2a40',
    mark:      dk ? 'rgba(249,115,22,.22)' : 'rgba(249,115,22,.16)',
    inpBg:     dk ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.04)',
    inpBdr:    dk ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.1)',
    chBg:      dk ? 'rgba(249,115,22,.1)' : 'rgba(249,115,22,.08)',
    ch:        dk ? '#f97316' : '#ea6a00',
    panelBg:   dk ? '#0a1220' : '#ffffff',
  }), [dk])

  const cardStyle: React.CSSProperties = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, overflow: 'hidden' }
  const headStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px', borderBottom: `1px solid ${T.subBdr}`,
    fontSize: 11, fontWeight: 700, color: dk ? '#c8d8ec' : '#1a2a40',
    fontFamily: 'Outfit,sans-serif', textTransform: 'uppercase', letterSpacing: '.08em',
  }

  // ── Lyric selection → open panel ──────────────────────────────────────────
  const onMouseUp = useCallback(() => {
    if (wasMarkClick.current) { wasMarkClick.current = false; return }
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) return
    const text = sel.toString().trim()
    if (text.length < 3) return
    const full = track.lyrics ?? ''
    const start = full.indexOf(text)
    if (start === -1) return
    const end = start + text.length
    setPanel({ text, start, end })
    setPanelTab('react')
    sel.removeAllRanges()
  }, [track.lyrics])

  // ── Save like ──────────────────────────────────────────────────────────────
  const doLike = useCallback(async () => {
    if (!panel || saving) return
    const p = { ...panel }
    log(`doLike start="${p.text.slice(0,30)}" start=${p.start} end=${p.end}`)
    setSaving(true)
    setPanel(null)

    const temp: LyricReaction = {
      id: Date.now(), selection_start: p.start, selection_end: p.end,
      selected_text: p.text, type: 'like', text: '', likes: 0,
      created_at: new Date().toISOString(),
    }
    setReactions(prev => { log(`optimistic add, prev.length=${prev.length}`); return [...prev, temp] })

    try {
      const postRes = await fetch(`/api/tracks/${track.id}/lyric-comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_text: p.text, selection_start: p.start, selection_end: p.end, type: 'like', text: '' }),
      })
      const postData = await postRes.json()
      log(`POST status=${postRes.status} body=${JSON.stringify(postData).slice(0,80)}`)
      const fresh = await fetch(`/api/tracks/${track.id}/lyric-comments`)
      const freshData: LyricReaction[] = await fresh.json()
      log(`SYNC after like count=${freshData.length}`)
      if (Array.isArray(freshData)) setReactions(freshData)
    } catch (e) { log(`doLike ERR: ${String(e)}`) }

    setSaving(false)
  }, [panel, saving, track.id])

  // ── Save comment ───────────────────────────────────────────────────────────
  const doComment = useCallback(async () => {
    if (!panel || saving) return
    const text = commentInputRef.current?.value.trim() ?? ''
    if (!text) return
    const p = { ...panel }
    log(`doComment text="${text.slice(0,30)}"`)
    setSaving(true)
    setPanel(null)
    if (commentInputRef.current) commentInputRef.current.value = ''

    const temp: LyricReaction = {
      id: Date.now(), selection_start: p.start, selection_end: p.end,
      selected_text: p.text, type: 'comment', text, likes: 0,
      created_at: new Date().toISOString(),
    }
    setReactions(prev => { log(`optimistic comment, prev.length=${prev.length}`); return [...prev, temp] })

    try {
      const postRes = await fetch(`/api/tracks/${track.id}/lyric-comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_text: p.text, selection_start: p.start, selection_end: p.end, type: 'comment', text }),
      })
      const postData = await postRes.json()
      log(`POST status=${postRes.status} body=${JSON.stringify(postData).slice(0,80)}`)
      const fresh = await fetch(`/api/tracks/${track.id}/lyric-comments`)
      const freshData: LyricReaction[] = await fresh.json()
      log(`SYNC after comment count=${freshData.length}`)
      if (Array.isArray(freshData)) setReactions(freshData)
    } catch (e) { log(`doComment ERR: ${String(e)}`) }

    setSaving(false)
  }, [panel, saving, track.id])

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

  // ── Render lyrics with reaction highlights ────────────────────────────────
  const renderLyrics = useCallback(() => {
    const full = track.lyrics ?? ''
    if (byRange.size === 0) return <>{full}</>

    // Build sorted list of marked ranges
    const ranges: { start: number; end: number; key: string }[] = []
    byRange.forEach((_, key) => {
      const [s, e] = key.split('-').map(Number)
      if (!isNaN(s) && !isNaN(e) && e > s && e <= full.length) {
        ranges.push({ start: s, end: e, key })
      }
    })
    ranges.sort((a, b) => a.start - b.start)

    const parts: React.ReactNode[] = []
    let pos = 0
    for (const r of ranges) {
      if (r.start < pos) continue // overlapping — skip
      // Plain text before this range
      if (r.start > pos) parts.push(<span key={`plain-${pos}`}>{full.slice(pos, r.start)}</span>)

      const rxns = byRange.get(r.key)!
      const nLikes = rxns.filter(x => x.type === 'like').length
      const nComments = rxns.filter(x => x.type === 'comment').length
      const markedText = full.slice(r.start, r.end)

      parts.push(
        <span key={r.key}
          style={{
            background: T.mark,
            borderRadius: 3,
            borderBottom: '2px solid rgba(249,115,22,.55)',
            paddingBottom: 1,
            cursor: 'pointer',
          }}
          onMouseEnter={e => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            setTip({ x: rect.left + rect.width / 2, y: rect.top + window.scrollY - 10, rxns })
          }}
          onMouseLeave={() => setTip(null)}
          // Mark as "mark click" before mouseUp fires
          data-mark="1"
          onPointerDown={() => { wasMarkClick.current = true }}
          onClick={() => {
            setPanel({ text: markedText, start: r.start, end: r.end })
            setPanelTab('react')
          }}
        >
          {markedText}
          {(nLikes > 0 || nComments > 0) && (
            <sup style={{ fontSize: 8, color: '#f97316', fontWeight: 800, marginLeft: 1, verticalAlign: 'super' }}>
              {nLikes > 0 ? `♥${nLikes}` : ''}{nComments > 0 ? ` 💬${nComments}` : ''}
            </sup>
          )}
        </span>
      )
      pos = r.end
    }
    if (pos < full.length) parts.push(<span key="plain-end">{full.slice(pos)}</span>)
    return <>{parts}</>
  }, [track.lyrics, byRange, T.mark])

  // ── Panel reactions for current selection ──────────────────────────────────
  const panelRxns = panel ? (byRange.get(`${panel.start}-${panel.end}`) ?? []) : []

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════

  // ── Cards ──────────────────────────────────────────────────────────────────

  const TrackInfoCard = () => (
    <div style={cardStyle}>
      <div style={{ background: T.infoBg, padding: 14, position: 'relative', opacity: loaded ? 1 : 0, transition: 'opacity .35s' }}>
        <button onClick={() => setLiked(v => !v)}
          style={{ position: 'absolute', top: 10, right: 12, zIndex: 2, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `1px solid ${liked ? 'rgba(249,115,22,.4)' : T.border}`, background: liked ? 'rgba(249,115,22,.12)' : 'rgba(255,255,255,.04)', color: liked ? '#f97316' : T.muted, fontFamily: 'Outfit,sans-serif', whiteSpace: 'nowrap' }}>
          {liked ? '♥' : '♡'} {initialLikes + (liked ? 1 : 0)}
        </button>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', paddingRight: 76 }}>
          <div style={{ flexShrink: 0, width: 100, height: 100, borderRadius: 12, overflow: 'hidden', boxShadow: dk ? '0 10px 32px rgba(0,0,0,.7)' : '0 6px 24px rgba(0,0,0,.2)', background: T.coverBg }}>
            {primaryAlbum?.cover_image_url
              ? <img src={primaryAlbum.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              : artist.cover_image_url
                ? <img src={artist.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🎵</div>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.12em', color: '#f97316', fontFamily: 'Outfit,sans-serif', marginBottom: 3 }}>
              {track.type === 'normal' ? 'Daina' : (track.type || 'Daina')}
              {track.is_new && <span style={{ marginLeft: 6, fontSize: 8, padding: '1px 6px', borderRadius: 999, background: 'rgba(249,115,22,.18)', border: '1px solid rgba(249,115,22,.3)', color: '#f97316' }}>NEW</span>}
            </div>
            <h1 style={{ fontFamily: 'Outfit,sans-serif', fontSize: 'clamp(15px,2vw,20px)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-.025em', color: dk ? '#fff' : '#0f1a2e', margin: '0 0 5px', wordBreak: 'break-word' }}>{track.title}</h1>
            <Link href={`/atlikejai/${artist.slug}`} style={{ fontSize: 13, fontWeight: 700, color: '#f97316', textDecoration: 'none', display: 'block', marginBottom: 2 }}>{artist.name}</Link>
            {track.featuring.length > 0 && (
              <div style={{ fontSize: 11, color: T.muted, marginBottom: 2 }}>
                su {track.featuring.map((f, i) => (
                  <span key={f.id}>{i > 0 && ', '}
                    <Link href={`/atlikejai/${f.slug}`} style={{ color: T.sec, textDecoration: 'none', fontWeight: 600 }}>{f.name}</Link>
                  </span>
                ))}
              </div>
            )}
            {dateStr && <div style={{ fontSize: 11, color: T.muted }}>{dateStr}</div>}
          </div>
        </div>
      </div>
      {albums.length > 0 && (
        <div style={{ padding: '10px 14px', display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: `1px solid ${T.subBdr}` }}>
          <span style={{ fontSize: 10, color: T.faint, alignSelf: 'center', fontFamily: 'Outfit,sans-serif', textTransform: 'uppercase', letterSpacing: '.06em' }}>Albumas</span>
          {albums.map(a => (
            <Link key={a.id} href={`/lt/albumas/${a.slug}/${a.id}/`}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px 5px 6px', borderRadius: 999, background: T.bgHov, border: `1px solid ${T.border}`, textDecoration: 'none' }}>
              {a.cover_image_url
                ? <img src={a.cover_image_url} style={{ width: 22, height: 22, borderRadius: 5, objectFit: 'cover' }} alt="" />
                : <div style={{ width: 22, height: 22, borderRadius: 5, background: T.coverBg }} />}
              <span style={{ fontSize: 11, fontWeight: 600, color: T.sec }}>{a.title}</span>
              {a.year && <span style={{ fontSize: 10, color: T.faint }}>{a.year}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  )

  // PlayerCard stable with useMemo
  const PlayerCard = useMemo(() => {
    if (!vid && !track.show_player) return null
    return (
      <div style={{ ...cardStyle }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 13px 8px', borderBottom: `1px solid ${T.subBdr}` }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MusicIcon s={15} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: dk ? '#c8d8ec' : '#1a2a40', fontFamily: 'Outfit,sans-serif' }}>Klausyk</span>
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

  const AICard = () => {
    if (!track.show_ai_interpretation) return null
    return (
      <div style={cardStyle}>
        <div style={headStyle}>
          <span>✦ AI interpretacija</span>
          {!aiText && <span style={{ fontSize: 9, fontWeight: 400, color: T.faint, textTransform: 'none', letterSpacing: 0 }}>beta</span>}
        </div>
        <div style={{ padding: 14 }}>
          {!aiText && !aiLoad && !aiErr && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '4px 0' }}>
              <p style={{ fontSize: 12, color: T.muted, textAlign: 'center', margin: 0, lineHeight: 1.6 }}>
                Claude perskaitys žodžius ir sukurs interpretaciją bei abstraktų paveikslėlį, perteikiantį dainos nuotaiką.
              </p>
              <button onClick={doAI}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 999, background: 'rgba(249,115,22,.12)', border: '1px solid rgba(249,115,22,.35)', color: '#f97316', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit,sans-serif' }}>
                ✦ Generuoti
              </button>
            </div>
          )}
          {aiLoad && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '12px 0', color: T.muted, fontSize: 12 }}>
              <span style={{ animation: 'spin 1.2s linear infinite', display: 'inline-block', fontSize: 20, color: '#f97316' }}>✦</span>
              Claude analizuoja žodžius…
            </div>
          )}
          {aiErr && (
            <div style={{ fontSize: 12, color: T.muted, textAlign: 'center', padding: '6px 0' }}>
              Nepavyko. <button onClick={doAI} style={{ color: '#f97316', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Bandyti dar kartą</button>
            </div>
          )}
          {aiText && (
            <div>
              <div style={{ fontSize: 13, color: dk ? '#8aadcc' : '#5a6878', lineHeight: 1.85 }}>
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
      <div style={{ ...cardStyle, background: T.dykBg, border: `1px solid ${T.dykBdr}` }}>
        <div style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: '#f97316', fontFamily: 'Outfit,sans-serif', marginBottom: 7 }}>★ Ar žinojai?</div>
          <p style={{ fontSize: 12, color: dk ? '#8aadcc' : '#5a6878', lineHeight: 1.75, margin: 0 }}>{track.description || trivia}</p>
        </div>
      </div>
    )
  }

  const VersionsCard = () => {
    if (versions.length === 0) return null
    const vis = showAllV ? versions : versions.slice(0, 4)
    return (
      <div style={cardStyle}>
        <div style={headStyle}>Versijos ir remixai <span style={{ fontSize: 9, fontWeight: 400, color: T.faint, textTransform: 'none', letterSpacing: 0 }}>{versions.length}</span></div>
        {vis.map((v, i) => (
          <Link key={v.id} href={`/lt/daina/${v.slug}/${v.id}/`}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: i < vis.length - 1 ? `1px solid ${T.subBdr}` : 'none', textDecoration: 'none' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = T.bgHov)}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: ytId(v.video_url) ? 'rgba(249,115,22,.12)' : T.coverBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${ytId(v.video_url) ? 'rgba(249,115,22,.2)' : T.border}` }}>
              {ytId(v.video_url) ? <svg width="9" height="9" viewBox="0 0 10 10" fill="#f97316"><polygon points="2,1 9,5 2,9"/></svg> : <MusicIcon s={11} c={T.faint} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.sec, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.title}</div>
              <div style={{ fontSize: 10, color: T.faint }}>{v.type === 'normal' ? 'Daina' : v.type}</div>
            </div>
            <span style={{ fontSize: 10, color: T.faint }}>→</span>
          </Link>
        ))}
        {versions.length > 4 && (
          <button onClick={() => setShowAllV(x => !x)}
            style={{ width: '100%', padding: 9, background: 'transparent', border: 'none', borderTop: `1px solid ${T.subBdr}`, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: T.muted, fontFamily: 'Outfit,sans-serif' }}>
            {showAllV ? '↑ Mažiau' : `Visos ${versions.length} versijos ↓`}
          </button>
        )}
      </div>
    )
  }

  const DiscussionsCard = () => (
    <div style={cardStyle}>
      <div style={headStyle}>Diskusijos</div>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', gap: 7, marginBottom: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: 'rgba(249,115,22,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#f97316', fontFamily: 'Outfit,sans-serif' }}>{artist.name[0]}</div>
          <input placeholder="Rašyk komentarą…" style={{ flex: 1, height: 30, borderRadius: 999, padding: '0 12px', fontSize: 11, background: T.inpBg, border: `1px solid ${T.inpBdr}`, color: T.text, outline: 'none' }} />
          <button style={{ height: 30, padding: '0 12px', borderRadius: 999, background: '#f97316', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit,sans-serif' }}>Siųsti</button>
        </div>
        <div style={{ fontSize: 11, color: T.faint, textAlign: 'center' }}>Būk pirmas — palik komentarą!</div>
      </div>
    </div>
  )

  const RelatedCard = () => {
    if (relatedTracks.length === 0) return null
    return (
      <div style={cardStyle}>
        <div style={headStyle}>Kitos {artist.name} dainos</div>
        {relatedTracks.slice(0, 6).map((t, i) => (
          <Link key={t.id} href={`/lt/daina/${t.slug}/${t.id}/`}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: i < 5 ? `1px solid ${T.subBdr}` : 'none', textDecoration: 'none' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = T.bgHov)}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
            <div style={{ width: 30, height: 30, borderRadius: 6, background: T.coverBg, flexShrink: 0, overflow: 'hidden' }}>
              {artist.cover_image_url && <img src={artist.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.sec, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
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
      {/* Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${T.subBdr}`, padding: '0 14px' }}>
        {(['lyrics', 'chords'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '11px 12px 10px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: tab === t ? 800 : 600, color: tab === t ? '#f97316' : T.faint, borderBottom: tab === t ? '2px solid #f97316' : '2px solid transparent', marginBottom: -1, fontFamily: 'Outfit,sans-serif', textTransform: 'uppercase', letterSpacing: '.07em' }}>
            {t === 'lyrics'
              ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M3 18h12v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg> Dainos tekstas</>
              : <><GuitarIcon s={11} /> Akordai</>}
          </button>
        ))}
        {tab === 'lyrics' && hasLyrics && (
          <span style={{ marginLeft: 'auto', fontSize: 9, color: T.faint, fontStyle: 'italic' }}>Pažymėk tekstą</span>
        )}
      </div>

      {/* Lyrics content */}
      {tab === 'lyrics' && (
        !hasLyrics
          ? <div style={{ padding: 32, textAlign: 'center', color: T.faint, fontSize: 13 }}>Dainos tekstas dar nepridėtas</div>
          : (
            <div data-lyrics style={{ position: 'relative', padding: '16px 18px', userSelect: 'text', cursor: 'text' }}
              onMouseUp={onMouseUp}>
              {/* Hover tooltip */}
              {tip && (
                <div style={{ position: 'fixed', left: tip.x, top: tip.y, transform: 'translate(-50%, -100%)', zIndex: 200, background: '#111827', border: '1px solid rgba(249,115,22,.3)', borderRadius: 10, padding: '8px 12px', maxWidth: 220, boxShadow: '0 8px 24px rgba(0,0,0,.5)', pointerEvents: 'none' }}>
                  <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'rgba(255,255,255,.8)' }}>
                    {tip.rxns.filter(r => r.type === 'like').length > 0 && <span style={{ color: '#f97316', fontWeight: 700 }}>♥ {tip.rxns.filter(r => r.type === 'like').length}</span>}
                    {tip.rxns.filter(r => r.type === 'comment').length > 0 && <span>💬 {tip.rxns.filter(r => r.type === 'comment').length}</span>}
                  </div>
                  {tip.rxns.filter(r => r.type === 'comment').slice(0, 3).map(c => (
                    <div key={c.id} style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', marginTop: 4 }}>{c.text}</div>
                  ))}
                </div>
              )}
              <pre style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 15, lineHeight: 2.1, color: T.lyric, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {renderLyrics()}
              </pre>
            </div>
          )
      )}

      {/* Chords content */}
      {tab === 'chords' && (
        !hasChords
          ? <div style={{ padding: 32, textAlign: 'center', color: T.faint, fontSize: 13 }}>Akordai dar nepridėti</div>
          : (
            <div style={{ padding: '12px 18px' }}>
              <div style={{ marginBottom: 10, fontSize: 11, color: T.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
                <GuitarIcon c={T.muted} /> Akordai ir žodžiai
              </div>
              <pre style={{ fontFamily: "'DM Mono','Fira Mono',monospace", fontSize: 13, lineHeight: 1.9, color: T.lyric, margin: 0, whiteSpace: 'pre-wrap' }}>
                {(track.chords ?? '').split('\n').map((line, i) => {
                  const isChord = /^[A-G][#bm]?(maj|min|aug|dim|sus|add|M)?[0-9]?(\s+[A-G][#bm]?(maj|min|aug|dim|sus|add|M)?[0-9]?)*\s*$/.test(line)
                  if (isChord) return (
                    <div key={i} style={{ marginBottom: 2 }}>
                      {line.split(/(\s+)/).map((tok, j) => tok.trim()
                        ? <span key={j} style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 5, background: T.chBg, color: T.ch, fontWeight: 700, marginRight: 4, fontSize: 12 }}>{tok}</span>
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
  // MAIN RETURN
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ background: T.bg, color: T.text, fontFamily: "'DM Sans',system-ui,sans-serif", WebkitFontSmoothing: 'antialiased', minHeight: '100vh' }}>

      {/* ── Side panel ─────────────────────────────────────────────────────── */}
      {panel && (
        <div data-panel
          style={{ position: 'fixed', top: 0, right: 0, width: 320, height: '100vh', background: T.panelBg, borderLeft: `1px solid ${T.border}`, boxShadow: '-12px 0 40px rgba(0,0,0,.22)', zIndex: 150, display: 'flex', flexDirection: 'column', animation: 'slideIn .2s ease' }}>

          {/* Header */}
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.subBdr}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: T.muted, fontFamily: 'Outfit,sans-serif' }}>Pažymėta vieta</span>
            <button onClick={() => setPanel(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.faint, padding: 4, borderRadius: 6, display: 'flex' }}>
              <XIcon s={16} />
            </button>
          </div>

          {/* Quote */}
          <div style={{ margin: '14px 16px 0', padding: '12px 14px', background: dk ? 'rgba(249,115,22,.06)' : 'rgba(249,115,22,.05)', border: '1px solid rgba(249,115,22,.2)', borderLeft: '3px solid rgba(249,115,22,.6)', borderRadius: '0 10px 10px 0' }}>
            <p style={{ fontSize: 13, color: T.text, fontStyle: 'italic', lineHeight: 1.65, margin: 0 }}>
              „{panel.text.length > 140 ? panel.text.slice(0, 140) + '…' : panel.text}"
            </p>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${T.subBdr}`, padding: '0 16px', marginTop: 12 }}>
            {(['react', 'share'] as const).map(t => (
              <button key={t} onClick={() => setPanelTab(t)}
                style={{ padding: '9px 12px 8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: panelTab === t ? 800 : 600, color: panelTab === t ? '#f97316' : T.faint, borderBottom: panelTab === t ? '2px solid #f97316' : '2px solid transparent', marginBottom: -1, fontFamily: 'Outfit,sans-serif', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                {t === 'react' ? 'Reagavimas' : 'Dalintis'}
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{ flex: 1, padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {panelTab === 'react' && (
              <>
                {/* Existing reactions */}
                {panelRxns.length > 0 && (
                  <div style={{ padding: '10px 12px', borderRadius: 10, background: T.bgAct, border: '1px solid rgba(249,115,22,.2)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.faint, textTransform: 'uppercase', letterSpacing: '.07em', fontFamily: 'Outfit,sans-serif', marginBottom: 7 }}>Esamos reakcijos</div>
                    {panelRxns.filter(r => r.type === 'like').length > 0 && (
                      <div style={{ fontSize: 12, color: '#f97316', fontWeight: 700, marginBottom: 4 }}>♥ {panelRxns.filter(r => r.type === 'like').length} patinka</div>
                    )}
                    {panelRxns.filter(r => r.type === 'comment').map(c => (
                      <div key={c.id} style={{ fontSize: 12, color: T.sec, padding: '4px 0', borderTop: `1px solid ${T.subBdr}` }}>💬 {c.text}</div>
                    ))}
                  </div>
                )}

                {/* Like button */}
                <button onClick={doLike} disabled={saving}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, background: 'rgba(249,115,22,.08)', border: '1px solid rgba(249,115,22,.22)', cursor: saving ? 'wait' : 'pointer', width: '100%', textAlign: 'left' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(249,115,22,.14)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(249,115,22,.08)')}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(249,115,22,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18 }}>♥</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#f97316', fontFamily: 'Outfit,sans-serif' }}>Patinka šita vieta</div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>Pažymėk kaip mėgstamą</div>
                  </div>
                </button>

                {/* Comment */}
                <div style={{ borderRadius: 12, background: T.bgHov, border: `1px solid ${T.subBdr}`, overflow: 'hidden', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: 'Outfit,sans-serif' }}>💬 Komentuoti</div>
                  <textarea ref={commentInputRef}
                    placeholder="Tavo mintys apie šią vietą…"
                    rows={3}
                    style={{ width: '100%', borderRadius: 10, padding: '9px 12px', fontSize: 12, background: T.inpBg, border: `1px solid ${T.inpBdr}`, color: T.text, outline: 'none', resize: 'none', fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box', lineHeight: 1.55 }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'rgba(249,115,22,.5)')}
                    onBlur={e => (e.currentTarget.style.borderColor = T.inpBdr)}
                  />
                  <button onClick={doComment} disabled={saving}
                    style={{ padding: '8px 16px', borderRadius: 999, background: '#f97316', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit,sans-serif', alignSelf: 'flex-end' }}>
                    Išsaugoti
                  </button>
                </div>
              </>
            )}

            {panelTab === 'share' && (
              <>
                <div style={{ background: dk ? '#080c12' : '#f0f5ff', border: '1px solid rgba(249,115,22,.2)', borderRadius: 12, padding: 16 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.65, margin: '0 0 12px', fontStyle: 'italic' }}>
                    „{panel.text.length > 120 ? panel.text.slice(0, 120) + '…' : panel.text}"
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {primaryAlbum?.cover_image_url && <img src={primaryAlbum.cover_image_url} style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover' }} alt="" />}
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.text }}>{track.title}</div>
                      <div style={{ fontSize: 9, color: '#f97316' }}>{artist.name}</div>
                    </div>
                    <div style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 800, color: T.faint, fontFamily: 'Outfit,sans-serif' }}>music.lt</div>
                  </div>
                </div>
                <button
                  onClick={() => { navigator.clipboard.writeText(`„${panel.text}"\n\n— ${track.title}, ${artist.name}\nmusic.lt`); setPanel(null) }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px 16px', borderRadius: 12, background: 'rgba(249,115,22,.1)', border: '1px solid rgba(249,115,22,.3)', color: '#f97316', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit,sans-serif' }}>
                  📋 Kopijuoti citatą
                </button>
              </>
            )}
          </div>
        </div>
      )}


            {/* ── Desktop ────────────────────────────────────────────────────────── */}
      <div className="tr-desk" style={{ maxWidth: 1400, margin: '0 auto', padding: '14px 20px 60px', display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 14, alignItems: 'start' }}>
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

      {/* ── Mobile ─────────────────────────────────────────────────────────── */}
      <div className="tr-mob" style={{ display: 'none', padding: '12px 14px 56px', flexDirection: 'column', gap: 12 }}>
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
        @media(max-width:860px){.tr-desk{display:none!important}.tr-mob{display:flex!important}}
        ::selection{background:rgba(249,115,22,.25)}
        @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
        @keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
      `}</style>
    </div>
  )
}
