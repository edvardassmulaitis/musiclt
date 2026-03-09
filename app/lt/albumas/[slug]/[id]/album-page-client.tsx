'use client'
// app/lt/albumas/[slug]/[id]/album-page-client.tsx
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSite } from '@/components/SiteContext'

type Track = {
  id: number; slug: string; title: string; type: string
  video_url: string | null; is_new: boolean; is_single: boolean
  position: number; featuring: string[]
}
type Album = {
  id: number; slug: string; title: string; type: string
  year?: number; month?: number; day?: number; dateFormatted: string | null
  cover_image_url: string | null; video_url: string | null
  show_player: boolean; is_upcoming: boolean
}
type Artist = { id: number; slug: string; name: string; cover_image_url: string | null }
type SimpleAlbum = { id: number; slug: string; title: string; year?: number; cover_image_url?: string; type: string }

type NewsItem = { id: number; slug: string; title: string; image_small_url: string | null; published_at: string }

type Props = {
  album: Album; artist: Artist; tracks: Track[]
  otherAlbums: SimpleAlbum[]; similarAlbums: any[]
  likes: number; relatedNews?: NewsItem[]
}

function ytId(url?: string | null) {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  return m ? m[1] : null
}

export default function AlbumPageClient({ album, artist, tracks, otherAlbums, similarAlbums, likes, relatedNews = [] }: Props) {
  const { dk } = useSite()
  const [playingIdx, setPlayingIdx] = useState(0)
  const [liked, setLiked] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => { setLoaded(true) }, [])

  const currentTrack = tracks[playingIdx]
  const currentVid = ytId(currentTrack?.video_url)
  const albumVid = ytId(album.video_url)
  const activeVid = currentVid || albumVid

  const maxPop = tracks.length
  const popScore = (t: Track) => {
    const base = (maxPop - t.position + 1) / maxPop
    return Math.min(1, base + (t.is_single ? 0.3 : 0))
  }

  // Theme tokens
  const T = {
    bg:         dk ? '#080c12' : '#f0f4fa',
    bgSurface:  dk ? 'rgba(255,255,255,.025)' : 'rgba(255,255,255,.85)',
    bgHover:    dk ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.03)',
    bgActive:   dk ? 'rgba(249,115,22,.07)' : 'rgba(249,115,22,.07)',
    border:     dk ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.09)',
    borderSub:  dk ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.06)',
    text:       dk ? '#f0f2f5' : '#0f1a2e',
    textSec:    dk ? '#b0bdd4' : '#3a5a80',
    textMuted:  dk ? '#6889a8' : '#8899aa',
    textFaint:  dk ? '#334058' : '#bbc8d8',
    coverBg:    dk ? '#111822' : '#e0e8f2',
    trackNum:   dk ? 'rgba(255,255,255,.2)' : 'rgba(0,0,0,.25)',
    trackText:  dk ? 'rgba(255,255,255,.82)' : '#1a2a40',
    trackFeat:  dk ? 'rgba(255,255,255,.4)' : '#6a85a0',
    popBg:      dk ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)',
    popVal:     dk ? 'rgba(255,255,255,.15)' : 'rgba(0,0,0,.2)',
    dykBg:      dk ? 'rgba(249,115,22,.04)' : 'rgba(249,115,22,.05)',
    dykBdr:     dk ? 'rgba(249,115,22,.12)' : 'rgba(249,115,22,.18)',
    dykText:    dk ? 'rgba(255,255,255,.45)' : '#5a7898',
    dykSrc:     dk ? 'rgba(255,255,255,.18)' : '#99aabb',
    cmtInput:   dk ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.04)',
    cmtBdr:     dk ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.1)',
    cmtText:    dk ? 'rgba(255,255,255,.7)' : '#3a5a80',
    simCoverBg: dk ? 'rgba(255,255,255,.05)' : '#e0e8f2',
    simCoverBdr:dk ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)',
    simTitle:   dk ? 'rgba(255,255,255,.6)' : '#3a5a80',
    simMeta:    dk ? 'rgba(255,255,255,.24)' : '#99aabb',
    linkBtn:    dk ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.05)',
    linkBdr:    dk ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.1)',
    linkText:   dk ? 'rgba(255,255,255,.7)' : '#3a5a80',
    cardHead:   dk ? 'rgba(255,255,255,.75)' : '#1a2a40',
    cardHdBdr:  dk ? 'rgba(255,255,255,.055)' : 'rgba(0,0,0,.07)',
    nowBdr:     dk ? 'rgba(255,255,255,.055)' : 'rgba(0,0,0,.07)',
    trackLinkC: dk ? 'rgba(255,255,255,.2)' : 'rgba(0,0,0,.2)',
  }

  const card = {
    background: T.bgSurface,
    border: `1px solid ${T.border}`,
    borderRadius: 16,
    overflow: 'hidden' as const,
  }

  const cardHead = {
    display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const,
    padding: '10px 14px', borderBottom: `1px solid ${T.cardHdBdr}`,
    fontSize: 11, fontWeight: 700, color: T.cardHead,
    fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase' as const,
    letterSpacing: '.08em',
  }

  return (
    <div style={{ background: T.bg, color: T.text, fontFamily: "'DM Sans',system-ui,sans-serif", WebkitFontSmoothing: 'antialiased', minHeight: '100vh', transition: 'background .2s, color .2s' }}>

      {/* ══ ALBUM HEADER — compact, no hero ══ */}
      <div style={{
        borderBottom: `1px solid ${T.border}`,
        background: dk
          ? 'linear-gradient(to bottom, rgba(8,12,18,1) 0%, rgba(8,12,18,.95) 100%)'
          : 'linear-gradient(to bottom, #f0f4fa 0%, rgba(240,244,250,.95) 100%)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* subtle blurred bg */}
        {album.cover_image_url && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden' }}>
            <img src={album.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: dk ? 'brightness(.12) saturate(1.3) blur(32px)' : 'brightness(.9) saturate(.8) blur(40px)', transform: 'scale(1.1)', display: 'block' }} />
          </div>
        )}
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1400, margin: '0 auto', padding: '20px 24px', display: 'flex', gap: 18, alignItems: 'center', opacity: loaded ? 1 : 0, transform: loaded ? 'none' : 'translateY(8px)', transition: 'opacity .5s, transform .5s' }}>

          {/* Cover */}
          {album.cover_image_url
            ? <img src={album.cover_image_url} alt={album.title} style={{ width: 80, height: 80, borderRadius: 10, objectFit: 'cover', display: 'block', flexShrink: 0, boxShadow: '0 8px 28px rgba(0,0,0,.5)' }} />
            : <div style={{ width: 80, height: 80, borderRadius: 10, flexShrink: 0, background: T.coverBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>💿</div>
          }

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: '#f97316', fontFamily: 'Outfit, sans-serif' }}>{album.type}</span>
              {album.is_upcoming && <span style={{ fontSize: 8, fontWeight: 800, padding: '1px 7px', borderRadius: 999, background: 'rgba(249,115,22,.15)', border: '1px solid rgba(249,115,22,.3)', color: '#f97316' }}>Greitai</span>}
            </div>
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(16px,3vw,26px)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-.02em', color: dk ? '#fff' : '#0f1a2e', margin: '0 0 4px', wordBreak: 'break-word' }}>{album.title}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Link href={`/atlikejai/${artist.slug}`} style={{ fontSize: 13, fontWeight: 700, color: '#f97316', textDecoration: 'none' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '.75')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                {artist.name}
              </Link>
              {album.dateFormatted && <><span style={{ color: T.textFaint, fontSize: 11 }}>·</span><span style={{ fontSize: 11, color: T.textMuted }}>{album.dateFormatted}</span></>}
              {tracks.length > 0 && <><span style={{ color: T.textFaint, fontSize: 11 }}>·</span><span style={{ fontSize: 11, color: T.textMuted }}>{tracks.length} {tracks.length === 1 ? 'daina' : tracks.length < 10 ? 'dainos' : 'dainų'}</span></>}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <button
              onClick={() => setLiked(!liked)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, border: `1px solid ${liked ? 'rgba(249,115,22,.4)' : T.linkBdr}`, background: liked ? 'rgba(249,115,22,.15)' : T.linkBtn, color: liked ? '#f97316' : T.linkText, cursor: 'pointer', transition: 'all .15s', fontFamily: 'Outfit, sans-serif' }}>
              {liked ? '♥' : '♡'} {likes + (liked ? 1 : 0)}
            </button>
            <button style={{ width: 32, height: 32, borderRadius: 999, border: `1px solid ${T.linkBdr}`, background: T.linkBtn, color: T.linkText, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s' }}>↗</button>
            <Link href={`/atlikejai/${artist.slug}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700, border: `1px solid ${T.linkBdr}`, background: T.linkBtn, color: T.linkText, textDecoration: 'none', fontFamily: 'Outfit, sans-serif' }}>
              ← Atlikėjas
            </Link>
          </div>
        </div>
      </div>

      {/* ══ MAIN CONTENT — 50/50 split ══ */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '16px 24px 60px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}
        className="ab-grid">

        {/* ── LEFT: Player + Tracklist ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          <div style={card}>
            {/* Video player */}
            <div style={{ background: '#000', position: 'relative' }}>
              {activeVid ? (
                <iframe
                  key={activeVid}
                  src={`https://www.youtube.com/embed/${activeVid}?rel=0`}
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                  style={{ width: '100%', aspectRatio: '16/9', border: 'none', display: 'block' }}
                />
              ) : (
                <div style={{ width: '100%', aspectRatio: '16/9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, background: dk ? '#080c12' : '#e8eef8' }}>
                  <div style={{ fontSize: 32, opacity: .2 }}>▶</div>
                  <div style={{ fontSize: 11, color: T.textFaint }}>Vaizdo įrašas nepriskirtas</div>
                </div>
              )}
            </div>

            {/* Now playing bar */}
            {currentTrack && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: `1px solid ${T.nowBdr}`, gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentTrack.title}</div>
                  <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>
                    {artist.name}{currentTrack.featuring.length > 0 && ` su ${currentTrack.featuring.join(', ')}`}
                  </div>
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#f97316', textTransform: 'uppercase', letterSpacing: '.06em', flexShrink: 0 }}>▶ Groja</div>
              </div>
            )}

            {/* Tracklist */}
            <div>
              {tracks.length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', fontSize: 12, color: T.textFaint }}>Dainų nėra</div>
              )}
              {tracks.map((t, i) => {
                const pop = popScore(t)
                const isPlaying = playingIdx === i
                return (
                  <div
                    key={t.id}
                    onClick={() => setPlayingIdx(i)}
                    style={{ padding: '7px 12px 5px', borderBottom: i < tracks.length - 1 ? `1px solid ${T.borderSub}` : 'none', cursor: 'pointer', background: isPlaying ? T.bgActive : 'transparent', transition: 'background .1s' }}
                    onMouseEnter={e => { if (!isPlaying) (e.currentTarget as HTMLElement).style.background = T.bgHover }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isPlaying ? T.bgActive : 'transparent' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {/* Num */}
                      <span style={{ width: 16, textAlign: 'center', fontSize: 10, flexShrink: 0, fontFamily: 'Outfit, sans-serif', color: isPlaying ? '#f97316' : T.trackNum, fontWeight: isPlaying ? 700 : 400 }}>
                        {isPlaying ? '▶' : t.position}
                      </span>
                      {/* Thumb */}
                      <div style={{ width: 28, height: 28, borderRadius: 4, flexShrink: 0, overflow: 'hidden', background: T.coverBg }}>
                        {album.cover_image_url
                          ? <img src={album.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>🎵</div>}
                      </div>
                      {/* Title */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: isPlaying ? '#f97316' : T.trackText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                            {t.title}
                            {t.featuring.length > 0 && <span style={{ fontWeight: 400, color: T.trackFeat }}> su {t.featuring.join(', ')}</span>}
                          </span>
                          {t.is_new && <span style={{ fontSize: 7, fontWeight: 800, padding: '1px 4px', borderRadius: 3, background: 'rgba(249,115,22,.12)', color: '#f97316', border: '1px solid rgba(249,115,22,.18)', flexShrink: 0 }}>NEW</span>}
                          {t.is_single && <span style={{ fontSize: 7, fontWeight: 800, padding: '1px 4px', borderRadius: 3, background: dk ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.06)', color: T.textMuted, border: `1px solid ${T.borderSub}`, flexShrink: 0 }}>S</span>}
                        </div>
                      </div>
                      {/* Link arrow */}
                      <Link
                        href={`/lt/daina/${t.slug}/${t.id}/`}
                        onClick={e => e.stopPropagation()}
                        style={{ fontSize: 10, color: T.trackLinkC, textDecoration: 'none', padding: '2px 4px', borderRadius: 3, flexShrink: 0, transition: '.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#f97316'; e.currentTarget.style.background = 'rgba(249,115,22,.08)' }}
                        onMouseLeave={e => { e.currentTarget.style.color = T.trackLinkC; e.currentTarget.style.background = 'transparent' }}
                      >→</Link>
                    </div>
                    {/* Popularity bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 0 0 52px' }}>
                      <div style={{ flex: 1, height: 2, background: T.popBg, borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 2, background: 'linear-gradient(90deg, rgba(249,115,22,.9), rgba(249,115,22,.3))', width: `${Math.round(pop * 100)}%`, transition: 'width .4s ease' }} />
                      </div>
                      <span style={{ fontSize: 8, color: T.popVal, width: 24, textAlign: 'right', fontFamily: 'Outfit, sans-serif' }}>{Math.round(pop * 100)}%</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

        </div>

        {/* ── RIGHT: Info, DYK, Discussions, Similar, Other ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Album info card */}
          <div style={card}>
            <div style={cardHead}>Albumo informacija</div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Stats row */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {[
                  { l: 'Tipas', v: album.type },
                  { l: 'Metai', v: album.year?.toString() || '—' },
                  { l: 'Dainos', v: tracks.length.toString() },
                  { l: 'Laikas', v: `~${Math.round(tracks.length * 3.5)} min.` },
                ].map(s => (
                  <div key={s.l} style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 800, color: T.text }}>{s.v}</span>
                    <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: T.textMuted, marginTop: 1 }}>{s.l}</span>
                  </div>
                ))}
              </div>
              {/* Artist */}
              <Link href={`/atlikejai/${artist.slug}`} style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', padding: '8px', borderRadius: 8, background: T.bgHover, border: `1px solid ${T.borderSub}`, marginTop: 2 }}>
                {artist.cover_image_url
                  ? <img src={artist.cover_image_url} alt={artist.name} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  : <div style={{ width: 36, height: 36, borderRadius: '50%', background: T.coverBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: T.textFaint, fontFamily: 'Outfit, sans-serif', flexShrink: 0 }}>{artist.name[0]}</div>}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{artist.name}</div>
                  <div style={{ fontSize: 10, color: '#f97316', marginTop: 1 }}>Visi albumai →</div>
                </div>
              </Link>
            </div>
          </div>

          {/* Ar žinojai */}
          <div style={{ ...card, background: T.dykBg, border: `1px solid ${T.dykBdr}` }}>
            <div style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: '#f97316', fontFamily: 'Outfit, sans-serif', marginBottom: 7 }}>💡 Ar žinojai?</div>
              <p style={{ fontSize: 12, color: T.dykText, lineHeight: 1.7, margin: 0 }}>
                Informacija apie šį albumą bus rodoma automatiškai iš Wikipedia. Administratorius gali keisti šį tekstą admin panelėje.
              </p>
              <div style={{ fontSize: 9, color: T.dykSrc, marginTop: 6 }}>Šaltinis: Wikipedia · Adminas gali keisti</div>
            </div>
          </div>

          {/* Discussions */}
          <div style={card}>
            <div style={cardHead}>
              Diskusijos
              <span style={{ fontSize: 9, fontWeight: 400, color: T.textFaint }}>0</span>
            </div>
            <div style={{ padding: '12px 14px' }}>
              {/* Comment input */}
              <div style={{ display: 'flex', gap: 7, marginBottom: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: 'rgba(249,115,22,.15)', border: '1px solid rgba(249,115,22,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#f97316', fontFamily: 'Outfit, sans-serif' }}>{artist.name[0]}</div>
                <input
                  placeholder="Rašyk komentarą…"
                  style={{ flex: 1, height: 30, borderRadius: 999, padding: '0 12px', fontSize: 11, background: T.cmtInput, border: `1px solid ${T.cmtBdr}`, color: T.cmtText, outline: 'none', fontFamily: "'DM Sans', sans-serif" }}
                />
                <button style={{ height: 30, padding: '0 12px', borderRadius: 999, background: '#f97316', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0, fontFamily: 'Outfit, sans-serif' }}>Siųsti</button>
              </div>
              <div style={{ fontSize: 11, color: T.textFaint, textAlign: 'center', padding: '6px 0' }}>Būk pirmas — palik komentarą!</div>
            </div>
          </div>

          {/* Related news */}
          {relatedNews.length > 0 && (
            <div style={card}>
              <div style={cardHead}>
                Naujienos
                <Link href={`/atlikejai/${artist.slug}`} style={{ fontSize: 9, fontWeight: 700, color: '#f97316', textDecoration: 'none', textTransform: 'none', letterSpacing: 0 }}>Visos →</Link>
              </div>
              <div>
                {relatedNews.map((n, i) => (
                  <Link key={n.id} href={`/news/${n.slug}`} style={{ display: 'flex', gap: 9, padding: '9px 12px', borderBottom: i < relatedNews.length - 1 ? `1px solid ${T.borderSub}` : 'none', textDecoration: 'none', transition: 'opacity .15s' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = '.8')}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = '1')}>
                    {n.image_small_url
                      ? <img src={n.image_small_url} style={{ width: 38, height: 38, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} alt="" />
                      : <div style={{ width: 38, height: 38, borderRadius: 6, flexShrink: 0, background: T.coverBg }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.textSec, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as any}>{n.title}</div>
                      <div style={{ fontSize: 9, color: T.textMuted, marginTop: 2 }}>{new Date(n.published_at).toLocaleDateString('lt-LT')}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Other albums by artist */}
          {otherAlbums.length > 0 && (
            <div style={card}>
              <div style={cardHead}>
                Kiti {artist.name} albumai
                <Link href={`/atlikejai/${artist.slug}`} style={{ fontSize: 9, fontWeight: 700, color: '#f97316', textDecoration: 'none', textTransform: 'none', letterSpacing: 0 }}>Visi →</Link>
              </div>
              <div style={{ display: 'flex', gap: 8, padding: '10px 12px', overflowX: 'auto', scrollbarWidth: 'none' }}>
                {otherAlbums.map(a => (
                  <Link key={a.id} href={`/lt/albumas/${a.slug}/${a.id}/`} style={{ flexShrink: 0, width: 80, textDecoration: 'none' }}>
                    {a.cover_image_url
                      ? <img src={a.cover_image_url} alt={a.title} style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover', display: 'block', border: `1px solid ${T.simCoverBdr}`, marginBottom: 5 }} />
                      : <div style={{ width: 80, height: 80, borderRadius: 8, background: T.simCoverBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, marginBottom: 5, border: `1px solid ${T.simCoverBdr}` }}>💿</div>}
                    <div style={{ fontSize: 10, fontWeight: 600, color: T.simTitle, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</div>
                    <div style={{ fontSize: 9, color: T.simMeta, marginTop: 1 }}>{a.year}</div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Similar albums */}
          {similarAlbums.length > 0 && (
            <div style={card}>
              <div style={cardHead}>Panaši muzika</div>
              <div style={{ display: 'flex', gap: 8, padding: '10px 12px', overflowX: 'auto', scrollbarWidth: 'none' }}>
                {similarAlbums.map((a: any) => (
                  <Link key={a.id} href={`/lt/albumas/${a.slug}/${a.id}/`} style={{ flexShrink: 0, width: 80, textDecoration: 'none' }}>
                    {a.cover_image_url
                      ? <img src={a.cover_image_url} alt={a.title} style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover', display: 'block', border: `1px solid ${T.simCoverBdr}`, marginBottom: 5 }} />
                      : <div style={{ width: 80, height: 80, borderRadius: 8, background: T.simCoverBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, marginBottom: 5 }}>🎵</div>}
                    <div style={{ fontSize: 10, fontWeight: 600, color: T.simTitle, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</div>
                    <div style={{ fontSize: 9, color: T.simMeta, marginTop: 1 }}>{a.artists?.name} · {a.year}</div>
                  </Link>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Responsive grid breakpoint */}
      <style>{`
        @media(max-width: 768px) {
          .ab-grid { grid-template-columns: 1fr !important; padding: 12px 14px 48px !important; }
        }
      `}</style>
    </div>
  )
}
