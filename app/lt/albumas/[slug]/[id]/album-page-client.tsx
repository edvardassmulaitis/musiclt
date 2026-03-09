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
  const [coverMode, setCoverMode] = useState(true) // toggle: show cover or player

  useEffect(() => { setLoaded(true) }, [])

  const currentTrack = tracks[playingIdx]
  const currentVid = ytId(currentTrack?.video_url)
  const albumVid = ytId(album.video_url)
  const activeVid = currentVid || albumVid

  // Switch to player when track clicked
  const selectTrack = (i: number) => {
    setPlayingIdx(i)
    if (ytId(tracks[i]?.video_url) || albumVid) setCoverMode(false)
  }

  const maxPop = tracks.length
  const popScore = (t: Track) => Math.min(1, (maxPop - t.position + 1) / maxPop + (t.is_single ? 0.3 : 0))

  const T = {
    bg:          dk ? '#080c12'                : '#f0f4fa',
    bgSurface:   dk ? 'rgba(255,255,255,.028)' : 'rgba(255,255,255,.88)',
    bgHover:     dk ? 'rgba(255,255,255,.032)' : 'rgba(0,0,0,.032)',
    bgActive:    dk ? 'rgba(249,115,22,.07)'   : 'rgba(249,115,22,.07)',
    border:      dk ? 'rgba(255,255,255,.07)'  : 'rgba(0,0,0,.09)',
    borderSub:   dk ? 'rgba(255,255,255,.04)'  : 'rgba(0,0,0,.055)',
    text:        dk ? '#f0f2f5'                : '#0f1a2e',
    textSec:     dk ? '#b0bdd4'                : '#3a5a80',
    textMuted:   dk ? '#7a9bb8'                : '#8899aa',
    textFaint:   dk ? '#4a6888'                : '#bbc8d8',
    coverBg:     dk ? '#111822'                : '#dde6f2',
    trackText:   dk ? '#dce8f5'                : '#1a2a40',
    trackFeat:   dk ? '#6889a8'                : '#6a85a0',
    trackNum:    dk ? '#4a6888'                : 'rgba(0,0,0,.22)',
    trackLinkC:  dk ? '#4a6888'                : 'rgba(0,0,0,.18)',
    popBg:       dk ? 'rgba(255,255,255,.055)' : 'rgba(0,0,0,.07)',
    dykBg:       dk ? 'rgba(249,115,22,.04)'   : 'rgba(249,115,22,.06)',
    dykBdr:      dk ? 'rgba(249,115,22,.13)'   : 'rgba(249,115,22,.2)',
    dykText:     dk ? '#8aadcc'                : '#5a7898',
    dykSrc:      dk ? '#4a6888'                : '#99aabb',
    cmtInput:    dk ? 'rgba(255,255,255,.05)'  : 'rgba(0,0,0,.04)',
    cmtBdr:      dk ? 'rgba(255,255,255,.08)'  : 'rgba(0,0,0,.1)',
    simCoverBdr: dk ? 'rgba(255,255,255,.07)'  : 'rgba(0,0,0,.08)',
    simTitle:    dk ? '#9cb5d0'                : '#3a5a80',
    simMeta:     dk ? '#4a6888'                : '#99aabb',
    linkBtn:     dk ? 'rgba(255,255,255,.06)'  : 'rgba(0,0,0,.05)',
    linkBdr:     dk ? 'rgba(255,255,255,.1)'   : 'rgba(0,0,0,.1)',
    linkText:    dk ? '#b0bdd4'                : '#3a5a80',
    subBdr:      dk ? 'rgba(255,255,255,.055)' : 'rgba(0,0,0,.07)',
  }

  const card: React.CSSProperties = {
    background: T.bgSurface,
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

  return (
    <div style={{ background: T.bg, color: T.text, fontFamily: "'DM Sans',system-ui,sans-serif", WebkitFontSmoothing: 'antialiased', minHeight: '100vh' }}>

      {/* ══ GRID: hero-left (2fr) | tracklist-right (3fr) ══ */}
      <div className="ab-grid" style={{ maxWidth: 1400, margin: '0 auto', padding: '14px 20px 60px', display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 14, alignItems: 'start' }}>

        {/* ════ LEFT: Sticky album hero + player ════ */}
        <div style={{ position: 'sticky', top: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Main hero card */}
          <div style={card}>

            {/* Cover / Player toggle area */}
            <div style={{ position: 'relative', background: '#000', overflow: 'hidden' }}>

              {/* Blurred cover always behind */}
              {album.cover_image_url && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
                  <img src={album.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(.15) saturate(1.8) blur(0px)', transform: 'scale(1)', display: 'block' }} />
                </div>
              )}

              {/* Cover image (square) */}
              <div style={{ position: 'relative', zIndex: 1, aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'opacity .3s', opacity: coverMode ? 1 : 0, pointerEvents: coverMode ? 'auto' : 'none', position: 'absolute' as any, inset: 0 }}>
                {album.cover_image_url
                  ? <img src={album.cover_image_url} alt={album.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.coverBg, fontSize: 64 }}>💿</div>
                }
                {/* Play button overlay */}
                {activeVid && (
                  <button onClick={() => setCoverMode(false)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,.0)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onMouseEnter={e => { (e.currentTarget.querySelector('.play-btn') as HTMLElement).style.opacity = '1' }}
                    onMouseLeave={e => { (e.currentTarget.querySelector('.play-btn') as HTMLElement).style.opacity = '0' }}
                  >
                    <div className="play-btn" style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(249,115,22,.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: '#fff', opacity: 0, transition: 'opacity .2s', backdropFilter: 'blur(4px)' }}>▶</div>
                  </button>
                )}
              </div>

              {/* YouTube player */}
              <div style={{ position: 'relative', zIndex: 1, aspectRatio: '1', transition: 'opacity .3s', opacity: coverMode ? 0 : 1, pointerEvents: coverMode ? 'none' : 'auto' }}>
                {activeVid ? (
                  <iframe key={activeVid} src={`https://www.youtube.com/embed/${activeVid}?rel=0`} allow="autoplay; encrypted-media" allowFullScreen style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: dk ? '#0a0e17' : '#e0e8f4' }}>
                    <div style={{ fontSize: 32, opacity: .15 }}>▶</div>
                    <div style={{ fontSize: 12, color: T.textFaint }}>Vaizdo įrašas nepriskirtas</div>
                  </div>
                )}
              </div>

              {/* Toggle pill — bottom right */}
              {activeVid && (
                <button onClick={() => setCoverMode(v => !v)} style={{ position: 'absolute', bottom: 10, right: 10, zIndex: 10, display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,.12)', color: 'rgba(255,255,255,.75)', cursor: 'pointer', fontFamily: 'Outfit, sans-serif', transition: 'all .15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,.75)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,.55)')}>
                  {coverMode ? '▶ Grotuvas' : '🖼 Viršelis'}
                </button>
              )}
            </div>

            {/* Album info below image */}
            <div style={{ padding: '14px 16px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.12em', color: '#f97316', fontFamily: 'Outfit, sans-serif' }}>{album.type}</span>
                    {album.is_upcoming && <span style={{ fontSize: 8, fontWeight: 800, padding: '1px 6px', borderRadius: 999, background: 'rgba(249,115,22,.18)', border: '1px solid rgba(249,115,22,.3)', color: '#f97316' }}>Greitai</span>}
                  </div>
                  <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(16px,2vw,24px)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-.025em', color: dk ? '#fff' : '#0f1a2e', margin: '0 0 5px', wordBreak: 'break-word' }}>{album.title}</h1>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <Link href={`/atlikejai/${artist.slug}`} style={{ fontSize: 14, fontWeight: 700, color: '#f97316', textDecoration: 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = '.75')}
                      onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>{artist.name}
                    </Link>
                    {album.dateFormatted && <>
                      <span style={{ color: T.textFaint, fontSize: 11 }}>·</span>
                      <span style={{ fontSize: 11, color: T.textMuted }}>{album.dateFormatted}</span>
                    </>}
                  </div>
                </div>
              </div>

              {/* Stats row */}
              <div style={{ display: 'flex', gap: 14, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.subBdr}` }}>
                {[
                  { l: 'Dainos', v: tracks.length.toString() },
                  { l: 'Trukmė', v: `~${Math.round(tracks.length * 3.5)} min` },
                ].map(s => (
                  <div key={s.l}>
                    <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 16, fontWeight: 800, color: dk ? '#fff' : '#0f1a2e', lineHeight: 1 }}>{s.v}</div>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: T.textMuted, marginTop: 3 }}>{s.l}</div>
                  </div>
                ))}
                {/* Now playing */}
                {currentTrack && !coverMode && (
                  <div style={{ marginLeft: 'auto', minWidth: 0, textAlign: 'right' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#f97316', marginBottom: 2 }}>▶ Groja</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: T.textSec, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>{currentTrack.title}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 7, padding: '0 14px 14px' }}>
              <button onClick={() => setLiked(!liked)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 34, borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `1px solid ${liked ? 'rgba(249,115,22,.4)' : T.linkBdr}`, background: liked ? 'rgba(249,115,22,.15)' : T.linkBtn, color: liked ? '#f97316' : T.linkText, transition: 'all .15s', fontFamily: 'Outfit, sans-serif' }}>
                {liked ? '♥' : '♡'} {likes + (liked ? 1 : 0)}
              </button>
              <Link href={`/atlikejai/${artist.slug}`} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 34, borderRadius: 999, fontSize: 11, fontWeight: 700, border: `1px solid ${T.linkBdr}`, background: T.linkBtn, color: T.linkText, textDecoration: 'none', fontFamily: 'Outfit, sans-serif' }}>← Atlikėjas</Link>
              <button style={{ width: 34, height: 34, borderRadius: 999, border: `1px solid ${T.linkBdr}`, background: T.linkBtn, color: T.linkText, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>↗</button>
            </div>
          </div>

          {/* Ar žinojai */}
          <div style={{ ...card, background: T.dykBg, border: `1px solid ${T.dykBdr}` }}>
            <div style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: '#f97316', fontFamily: 'Outfit, sans-serif', marginBottom: 7 }}>💡 Ar žinojai?</div>
              <p style={{ fontSize: 12, color: T.dykText, lineHeight: 1.75, margin: 0 }}>Informacija apie šį albumą bus rodoma automatiškai iš Wikipedia. Administratorius gali keisti šį tekstą admin panelėje.</p>
              <div style={{ fontSize: 9, color: T.dykSrc, marginTop: 6 }}>Šaltinis: Wikipedia · Adminas gali keisti</div>
            </div>
          </div>

        </div>{/* end sticky left */}

        {/* ════ RIGHT: Tracklist + sidebar cards ════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Tracklist card */}
          <div style={card}>
            <div style={cardHead}>
              Dainos
              <span style={{ fontSize: 9, fontWeight: 400, color: T.textFaint, textTransform: 'none', letterSpacing: 0 }}>{tracks.length} {tracks.length === 1 ? 'daina' : tracks.length < 10 ? 'dainos' : 'dainų'}</span>
            </div>
            {tracks.length === 0
              ? <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: T.textFaint }}>Dainų nėra</div>
              : tracks.map((t, i) => {
                const pop = popScore(t)
                const isPlaying = playingIdx === i
                return (
                  <div key={t.id} onClick={() => selectTrack(i)}
                    style={{ padding: '9px 14px 6px', borderBottom: i < tracks.length - 1 ? `1px solid ${T.borderSub}` : 'none', cursor: 'pointer', background: isPlaying ? T.bgActive : 'transparent', transition: 'background .1s' }}
                    onMouseEnter={e => { if (!isPlaying) (e.currentTarget as HTMLDivElement).style.background = T.bgHover }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = isPlaying ? T.bgActive : 'transparent' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 18, textAlign: 'center', fontSize: 11, flexShrink: 0, fontFamily: 'Outfit, sans-serif', color: isPlaying ? '#f97316' : T.trackNum, fontWeight: isPlaying ? 700 : 400 }}>
                        {isPlaying ? '▶' : t.position}
                      </span>
                      <div style={{ width: 32, height: 32, borderRadius: 5, flexShrink: 0, overflow: 'hidden', background: T.coverBg }}>
                        {album.cover_image_url
                          ? <img src={album.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>🎵</div>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: isPlaying ? '#f97316' : T.trackText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                          {t.title}
                          {t.featuring.length > 0 && <span style={{ fontWeight: 400, color: T.trackFeat }}> su {t.featuring.join(', ')}</span>}
                        </span>
                        {t.is_new && <span style={{ fontSize: 7, fontWeight: 800, padding: '1px 4px', borderRadius: 3, background: 'rgba(249,115,22,.12)', color: '#f97316', border: '1px solid rgba(249,115,22,.18)', flexShrink: 0 }}>NEW</span>}
                        {t.is_single && <span style={{ fontSize: 7, fontWeight: 800, padding: '1px 4px', borderRadius: 3, background: T.bgHover, color: T.textMuted, border: `1px solid ${T.borderSub}`, flexShrink: 0 }}>S</span>}
                      </div>
                      <Link href={`/lt/daina/${t.slug}/${t.id}/`} onClick={e => e.stopPropagation()}
                        style={{ fontSize: 11, color: T.trackLinkC, textDecoration: 'none', padding: '2px 5px', borderRadius: 4, flexShrink: 0, transition: '.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#f97316'; e.currentTarget.style.background = 'rgba(249,115,22,.08)' }}
                        onMouseLeave={e => { e.currentTarget.style.color = T.trackLinkC; e.currentTarget.style.background = 'transparent' }}
                      >→</Link>
                    </div>
                    <div style={{ paddingLeft: 60, paddingTop: 4 }}>
                      <div style={{ height: 2, background: T.popBg, borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 2, background: 'linear-gradient(90deg, rgba(249,115,22,.85), rgba(249,115,22,.2))', width: `${Math.round(pop * 100)}%`, transition: 'width .4s ease' }} />
                      </div>
                    </div>
                  </div>
                )
              })
            }
          </div>

          {/* Discussions */}
          <div style={card}>
            <div style={cardHead}>Diskusijos <span style={{ fontSize: 9, fontWeight: 400, color: T.textFaint, textTransform: 'none', letterSpacing: 0 }}>0</span></div>
            <div style={{ padding: '12px 14px' }}>
              <div style={{ display: 'flex', gap: 7, marginBottom: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: 'rgba(249,115,22,.15)', border: '1px solid rgba(249,115,22,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#f97316', fontFamily: 'Outfit, sans-serif' }}>{artist.name[0]}</div>
                <input placeholder="Rašyk komentarą…" style={{ flex: 1, height: 30, borderRadius: 999, padding: '0 12px', fontSize: 11, background: T.cmtInput, border: `1px solid ${T.cmtBdr}`, color: T.textSec, outline: 'none', fontFamily: "'DM Sans', sans-serif" }} />
                <button style={{ height: 30, padding: '0 12px', borderRadius: 999, background: '#f97316', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0, fontFamily: 'Outfit, sans-serif' }}>Siųsti</button>
              </div>
              <div style={{ fontSize: 11, color: T.textFaint, textAlign: 'center', padding: '4px 0' }}>Būk pirmas — palik komentarą!</div>
            </div>
          </div>

          {/* Related news */}
          {relatedNews.length > 0 && (
            <div style={card}>
              <div style={cardHead}>Naujienos <Link href={`/atlikejai/${artist.slug}`} style={{ fontSize: 9, fontWeight: 700, color: '#f97316', textDecoration: 'none', textTransform: 'none', letterSpacing: 0 }}>Visos →</Link></div>
              <div>
                {relatedNews.map((n, i) => (
                  <Link key={n.id} href={`/news/${n.slug}`} style={{ display: 'flex', gap: 9, padding: '9px 12px', borderBottom: i < relatedNews.length - 1 ? `1px solid ${T.borderSub}` : 'none', textDecoration: 'none' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = '.8')}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = '1')}>
                    {n.image_small_url
                      ? <img src={n.image_small_url} style={{ width: 38, height: 38, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} alt="" />
                      : <div style={{ width: 38, height: 38, borderRadius: 6, flexShrink: 0, background: T.coverBg }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: T.textSec, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as any}>{n.title}</div>
                      <div style={{ fontSize: 9, color: T.textMuted, marginTop: 2 }}>{new Date(n.published_at).toLocaleDateString('lt-LT')}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Other albums */}
          {otherAlbums.length > 0 && (
            <div style={card}>
              <div style={cardHead}>Kiti {artist.name} albumai <Link href={`/atlikejai/${artist.slug}`} style={{ fontSize: 9, fontWeight: 700, color: '#f97316', textDecoration: 'none', textTransform: 'none', letterSpacing: 0 }}>Visi →</Link></div>
              <div style={{ display: 'flex', gap: 8, padding: '10px 12px', overflowX: 'auto', scrollbarWidth: 'none' }}>
                {otherAlbums.map(a => (
                  <Link key={a.id} href={`/lt/albumas/${a.slug}/${a.id}/`} style={{ flexShrink: 0, width: 84, textDecoration: 'none' }}>
                    {a.cover_image_url
                      ? <img src={a.cover_image_url} alt={a.title} style={{ width: 84, height: 84, borderRadius: 9, objectFit: 'cover', display: 'block', border: `1px solid ${T.simCoverBdr}`, marginBottom: 5 }} />
                      : <div style={{ width: 84, height: 84, borderRadius: 9, background: T.coverBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 5 }}>💿</div>}
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
                  <Link key={a.id} href={`/lt/albumas/${a.slug}/${a.id}/`} style={{ flexShrink: 0, width: 84, textDecoration: 'none' }}>
                    {a.cover_image_url
                      ? <img src={a.cover_image_url} alt={a.title} style={{ width: 84, height: 84, borderRadius: 9, objectFit: 'cover', display: 'block', border: `1px solid ${T.simCoverBdr}`, marginBottom: 5 }} />
                      : <div style={{ width: 84, height: 84, borderRadius: 9, background: T.coverBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 5 }}>🎵</div>}
                    <div style={{ fontSize: 10, fontWeight: 600, color: T.simTitle, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</div>
                    <div style={{ fontSize: 9, color: T.simMeta, marginTop: 1 }}>{a.artists?.name} · {a.year}</div>
                  </Link>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      <style>{`
        @media(max-width: 900px) {
          .ab-grid { grid-template-columns: 1fr !important; padding: 12px 14px 48px !important; }
          .ab-grid > div:first-child { position: static !important; }
        }
      `}</style>
    </div>
  )
}
