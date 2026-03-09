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
  const [expanded, setExpanded] = useState(false)

  useEffect(() => { setLoaded(true) }, [])

  const currentTrack = tracks[playingIdx]
  const currentVid = ytId(currentTrack?.video_url)
  const albumVid = ytId(album.video_url)
  const activeVid = currentVid || albumVid

  const VISIBLE = 5
  const visibleTracks = expanded ? tracks : tracks.slice(0, VISIBLE)
  const hasMore = tracks.length > VISIBLE

  const maxPop = tracks.length
  const popScore = (t: Track) => Math.min(1, (maxPop - t.position + 1) / maxPop + (t.is_single ? 0.3 : 0))

  // FIX 1: Album info bg — solid colors, no weird semi-transparent blur that reads badly on light
  // Dark: dark navy card. Light: white card. No blurred image bg.
  const T = {
    bg:          dk ? '#080c12'                : '#eef2f8',
    // Card uses solid background — more readable on both modes
    bgCard:      dk ? '#0e1520'                : '#ffffff',
    bgSurface:   dk ? '#131d2a'                : '#f7faff',
    bgHover:     dk ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.035)',
    bgActive:    dk ? 'rgba(249,115,22,.08)'   : 'rgba(249,115,22,.08)',
    border:      dk ? 'rgba(255,255,255,.07)'  : 'rgba(0,0,0,.08)',
    borderSub:   dk ? 'rgba(255,255,255,.045)' : 'rgba(0,0,0,.06)',
    text:        dk ? '#f0f2f5'                : '#0f1a2e',
    textSec:     dk ? '#b0bdd4'                : '#3a5a80',
    textMuted:   dk ? '#7a9bb8'                : '#7a90a8',
    textFaint:   dk ? '#4a6888'                : '#aabbd0',
    coverBg:     dk ? '#1a2535'                : '#dde6f2',
    trackText:   dk ? '#dce8f5'                : '#1a2a40',
    trackFeat:   dk ? '#6889a8'                : '#6a85a0',
    trackNum:    dk ? '#4a6888'                : '#b0c0d4',
    trackLinkC:  dk ? '#4a6888'                : '#b0c0d4',
    // FIX 4: pop bar bg — visible in both modes
    popBg:       dk ? '#1e2d40'                : '#dde6f2',
    popFill:     dk ? 'rgba(249,115,22,.8)'    : '#f97316',
    dykBg:       dk ? '#0f1d14'                : '#fff8f2',
    dykBdr:      dk ? 'rgba(249,115,22,.18)'   : 'rgba(249,115,22,.25)',
    dykText:     dk ? '#8aadcc'                : '#5a6878',
    dykSrc:      dk ? '#4a6888'                : '#99aabb',
    cmtInput:    dk ? 'rgba(255,255,255,.06)'  : 'rgba(0,0,0,.04)',
    cmtBdr:      dk ? 'rgba(255,255,255,.1)'   : 'rgba(0,0,0,.1)',
    simCoverBdr: dk ? 'rgba(255,255,255,.07)'  : 'rgba(0,0,0,.08)',
    simTitle:    dk ? '#9cb5d0'                : '#2a4a6a',
    simMeta:     dk ? '#4a6888'                : '#8899aa',
    linkBtn:     dk ? 'rgba(255,255,255,.07)'  : 'rgba(0,0,0,.06)',
    linkBdr:     dk ? 'rgba(255,255,255,.1)'   : 'rgba(0,0,0,.12)',
    linkText:    dk ? '#b0bdd4'                : '#3a5a80',
    subBdr:      dk ? 'rgba(255,255,255,.06)'  : 'rgba(0,0,0,.07)',
    // Cover header area bg — subtle tint behind the cover+title row
    coverAreaBg: dk ? '#121c28'                : '#f0f5ff',
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

  return (
    <div style={{ background: T.bg, color: T.text, fontFamily: "'DM Sans',system-ui,sans-serif", WebkitFontSmoothing: 'antialiased', minHeight: '100vh' }}>

      <div className="ab-grid" style={{ maxWidth: 1400, margin: '0 auto', padding: '14px 20px 60px', display: 'grid', gridTemplateColumns: '340px 1fr', gap: 14, alignItems: 'start' }}>

        {/* ════ LEFT: sticky sidebar ════ */}
        <div className="ab-sidebar" style={{ position: 'sticky', top: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* ── Album info card ── */}
          <div className="ab-card-info" style={card}>
            {/* Cover + info row — solid bg, no blurred image */}
            <div style={{ background: T.coverAreaBg, padding: '16px', display: 'flex', gap: 14, alignItems: 'center', opacity: loaded ? 1 : 0, transform: loaded ? 'none' : 'translateY(6px)', transition: 'opacity .4s, transform .4s' }}>
              {/* Cover */}
              <div style={{ flexShrink: 0, width: 88, height: 88, borderRadius: 11, overflow: 'hidden', boxShadow: dk ? '0 8px 28px rgba(0,0,0,.7)' : '0 6px 20px rgba(0,0,0,.18)', background: T.coverBg }}>
                {album.cover_image_url
                  ? <img src={album.cover_image_url} alt={album.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>💿</div>}
              </div>
              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.12em', color: '#f97316', fontFamily: 'Outfit, sans-serif' }}>{album.type}</span>
                  {album.is_upcoming && <span style={{ fontSize: 8, fontWeight: 800, padding: '1px 6px', borderRadius: 999, background: 'rgba(249,115,22,.18)', border: '1px solid rgba(249,115,22,.3)', color: '#f97316' }}>Greitai</span>}
                </div>
                <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(15px,1.6vw,20px)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-.025em', color: dk ? '#fff' : '#0f1a2e', margin: '0 0 5px', wordBreak: 'break-word' }}>{album.title}</h1>
                <Link href={`/atlikejai/${artist.slug}`} style={{ fontSize: 13, fontWeight: 700, color: '#f97316', textDecoration: 'none', display: 'block', marginBottom: 6 }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '.75')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>{artist.name}
                </Link>
                {/* date + like inline */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {album.dateFormatted && <div style={{ fontSize: 11, color: T.textMuted }}>{album.dateFormatted}</div>}
                  <button onClick={() => setLiked(!liked)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: `1px solid ${liked ? 'rgba(249,115,22,.4)' : T.linkBdr}`, background: liked ? 'rgba(249,115,22,.12)' : T.linkBtn, color: liked ? '#f97316' : T.textMuted, transition: 'all .15s', fontFamily: 'Outfit, sans-serif' }}>
                    {liked ? '♥' : '♡'} {likes + (liked ? 1 : 0)}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── YouTube player (merged with tracklist on mobile) ── */}
          <div className="ab-card-yt" style={card}>
            {currentTrack && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 13px 7px', borderBottom: `1px solid ${T.subBdr}`, gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentTrack.title}</div>
                  <div style={{ fontSize: 10, color: T.textMuted }}>{artist.name}{currentTrack.featuring.length > 0 && ` su ${currentTrack.featuring.join(', ')}`}</div>
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '.06em', flexShrink: 0 }}>YouTube</span>
              </div>
            )}
            {activeVid ? (
              <iframe key={activeVid} src={`https://www.youtube.com/embed/${activeVid}?rel=0`} allow="autoplay; encrypted-media" allowFullScreen style={{ width: '100%', aspectRatio: '16/9', border: 'none', display: 'block' }} />
            ) : (
              <div style={{ width: '100%', aspectRatio: '16/9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, background: T.coverAreaBg }}>
                <div style={{ fontSize: 28, opacity: .2 }}>▶</div>
                <div style={{ fontSize: 11, color: T.textFaint }}>Vaizdo įrašas nepriskirtas</div>
              </div>
            )}
          </div>

          {/* ── Ar žinojai ── */}
          <div className="ab-card-dyk" style={{ ...card, background: T.dykBg, border: `1px solid ${T.dykBdr}` }}>
            <div style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: '#f97316', fontFamily: 'Outfit, sans-serif', marginBottom: 7, display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="#f97316" style={{ flexShrink: 0 }}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                Ar žinojai?
              </div>
              <p style={{ fontSize: 12, color: T.dykText, lineHeight: 1.75, margin: 0 }}>Informacija apie šį albumą bus rodoma automatiškai iš Wikipedia. Administratorius gali keisti šį tekstą admin panelėje.</p>
              <div style={{ fontSize: 9, color: T.dykSrc, marginTop: 6 }}>Šaltinis: Wikipedia · Adminas gali keisti</div>
            </div>
          </div>

          {/* ── Discussions ── */}
          <div className="ab-card-cmt" style={card}>
            <div style={cardHead}>Diskusijos <span style={{ fontSize: 9, fontWeight: 400, color: T.textFaint, textTransform: 'none', letterSpacing: 0 }}>0</span></div>
            <div style={{ padding: '12px 14px' }}>
              <div style={{ display: 'flex', gap: 7, marginBottom: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: 'rgba(249,115,22,.15)', border: '1px solid rgba(249,115,22,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#f97316', fontFamily: 'Outfit, sans-serif' }}>{artist.name[0]}</div>
                <input placeholder="Rašyk komentarą…" style={{ flex: 1, height: 30, borderRadius: 999, padding: '0 12px', fontSize: 11, background: T.cmtInput, border: `1px solid ${T.cmtBdr}`, color: T.text, outline: 'none', fontFamily: "'DM Sans', sans-serif" }} />
                <button style={{ height: 30, padding: '0 12px', borderRadius: 999, background: '#f97316', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0, fontFamily: 'Outfit, sans-serif' }}>Siųsti</button>
              </div>
              <div style={{ fontSize: 11, color: T.textFaint, textAlign: 'center', padding: '4px 0' }}>Būk pirmas — palik komentarą!</div>
            </div>
          </div>

          {/* ── Related news ── */}
          {relatedNews.length > 0 && (
            <div className="ab-card-news" style={card}>
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

          {/* ── Other albums ── */}
          {otherAlbums.length > 0 && (
            <div className="ab-card-other" style={card}>
              <div style={cardHead}>Kiti {artist.name} albumai <Link href={`/atlikejai/${artist.slug}`} style={{ fontSize: 9, fontWeight: 700, color: '#f97316', textDecoration: 'none', textTransform: 'none', letterSpacing: 0 }}>Visi →</Link></div>
              <div style={{ display: 'flex', gap: 8, padding: '10px 12px', overflowX: 'auto', scrollbarWidth: 'none' }}>
                {otherAlbums.map(a => (
                  <Link key={a.id} href={`/lt/albumas/${a.slug}/${a.id}/`} style={{ flexShrink: 0, width: 80, textDecoration: 'none' }}>
                    {a.cover_image_url
                      ? <img src={a.cover_image_url} alt={a.title} style={{ width: 80, height: 80, borderRadius: 9, objectFit: 'cover', display: 'block', border: `1px solid ${T.simCoverBdr}`, marginBottom: 5 }} />
                      : <div style={{ width: 80, height: 80, borderRadius: 9, background: T.coverBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, marginBottom: 5 }}>💿</div>}
                    <div style={{ fontSize: 10, fontWeight: 600, color: T.simTitle, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</div>
                    <div style={{ fontSize: 9, color: T.simMeta, marginTop: 1 }}>{a.year}</div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* ── Similar albums ── */}
          {similarAlbums.length > 0 && (
            <div className="ab-card-sim" style={card}>
              <div style={cardHead}>Panaši muzika</div>
              <div style={{ display: 'flex', gap: 8, padding: '10px 12px', overflowX: 'auto', scrollbarWidth: 'none' }}>
                {similarAlbums.map((a: any) => (
                  <Link key={a.id} href={`/lt/albumas/${a.slug}/${a.id}/`} style={{ flexShrink: 0, width: 80, textDecoration: 'none' }}>
                    {a.cover_image_url
                      ? <img src={a.cover_image_url} alt={a.title} style={{ width: 80, height: 80, borderRadius: 9, objectFit: 'cover', display: 'block', border: `1px solid ${T.simCoverBdr}`, marginBottom: 5 }} />
                      : <div style={{ width: 80, height: 80, borderRadius: 9, background: T.coverBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, marginBottom: 5 }}>🎵</div>}
                    <div style={{ fontSize: 10, fontWeight: 600, color: T.simTitle, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</div>
                    <div style={{ fontSize: 9, color: T.simMeta, marginTop: 1 }}>{a.artists?.name} · {a.year}</div>
                  </Link>
                ))}
              </div>
            </div>
          )}

        </div>{/* end left sidebar */}

        {/* ════ RIGHT: Tracklist ════ */}
        <div className="ab-tracklist" style={card}>
          <div style={cardHead}>
            <span className="tracklist-title">{expanded ? 'Dainos' : 'Top dainos'}</span>
          </div>

          {tracks.length === 0
            ? <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: T.textFaint }}>Dainų nėra</div>
            : <>
              {visibleTracks.map((t, i) => {
                const pop = popScore(t)
                const isPlaying = playingIdx === i
                return (
                  <div key={t.id}
                    onClick={() => setPlayingIdx(i)}
                    style={{ padding: '9px 16px 7px', borderBottom: `1px solid ${T.borderSub}`, cursor: 'pointer', background: isPlaying ? T.bgActive : 'transparent', transition: 'background .1s' }}
                    onMouseEnter={e => { if (!isPlaying) (e.currentTarget as HTMLDivElement).style.background = T.bgHover }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = isPlaying ? T.bgActive : 'transparent' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {/* FIX 5: no separate play icon — number column only, orange when playing */}
                      <span style={{
                        width: 20, textAlign: 'center', fontSize: 11, flexShrink: 0,
                        fontFamily: 'Outfit, sans-serif',
                        color: isPlaying ? '#f97316' : T.trackNum,
                        fontWeight: isPlaying ? 800 : 400,
                      }}>
                        {t.position}
                      </span>
                      {/* Thumb */}
                      <div style={{ width: 34, height: 34, borderRadius: 6, flexShrink: 0, overflow: 'hidden', background: T.coverBg, position: 'relative' }}>
                        {album.cover_image_url
                          ? <img src={album.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>🎵</div>}
                        {/* FIX 5: tiny orange dot on thumb when playing instead of old ▶ icon */}
                        {isPlaying && (
                          <div style={{ position: 'absolute', inset: 0, background: 'rgba(249,115,22,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />
                          </div>
                        )}
                      </div>
                      {/* Title */}
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 13, fontWeight: isPlaying ? 700 : 600, color: isPlaying ? '#f97316' : T.trackText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                          {t.title}
                          {t.featuring.length > 0 && <span style={{ fontWeight: 400, color: T.trackFeat }}> su {t.featuring.join(', ')}</span>}
                        </span>
                        {t.is_new && <span style={{ fontSize: 7, fontWeight: 800, padding: '1px 4px', borderRadius: 3, background: 'rgba(249,115,22,.12)', color: '#f97316', border: '1px solid rgba(249,115,22,.2)', flexShrink: 0 }}>NEW</span>}
                        {t.is_single && <span style={{ fontSize: 7, fontWeight: 800, padding: '1px 4px', borderRadius: 3, background: T.bgHover, color: T.textMuted, border: `1px solid ${T.borderSub}`, flexShrink: 0 }}>S</span>}
                      </div>
                      <Link href={`/lt/daina/${t.slug}/${t.id}/`} onClick={e => e.stopPropagation()}
                        style={{ fontSize: 11, color: T.trackLinkC, textDecoration: 'none', padding: '2px 5px', borderRadius: 4, flexShrink: 0, transition: '.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#f97316'; e.currentTarget.style.background = 'rgba(249,115,22,.08)' }}
                        onMouseLeave={e => { e.currentTarget.style.color = T.trackLinkC; e.currentTarget.style.background = 'transparent' }}
                      >→</Link>
                    </div>
                    {/* FIX 4: pop bar — sits inside track bg, not floating */}
                    <div style={{ marginLeft: 64, marginTop: 5, height: 2, background: T.popBg, borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 2, background: T.popFill, width: `${Math.round(pop * 100)}%`, transition: 'width .4s ease' }} />
                    </div>
                  </div>
                )
              })}

              {/* FIX 3: expand/collapse button */}
              {hasMore && (
                <button
                  onClick={() => setExpanded(v => !v)}
                  style={{ width: '100%', padding: '11px 16px', background: 'transparent', border: 'none', borderTop: `1px solid ${T.borderSub}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: T.textMuted, fontFamily: 'Outfit, sans-serif', transition: 'color .15s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#f97316')}
                  onMouseLeave={e => (e.currentTarget.style.color = T.textMuted)}
                >
                  {expanded
                    ? <>↑ Rodyti mažiau</>
                    : <>Visos {tracks.length} dainų ↓</>}
                </button>
              )}
            </>
          }
        </div>

      </div>

      <style>{`
        @media(max-width: 860px) {
          .ab-grid {
            grid-template-columns: 1fr !important;
            padding: 12px 14px 48px !important;
            display: flex !important;
            flex-direction: column !important;
          }
          .ab-sidebar { position: static !important; order: 1; }
          .ab-tracklist { order: 2; }
        }
        /* On mobile, sidebar children reorder: album info → player → tracklist → rest */
        @media(max-width: 860px) {
          .ab-sidebar { display: contents !important; }
          .ab-card-info  { order: 1; }
          .ab-card-yt    { order: 2; }
          .ab-card-dyk   { order: 4; }
          .ab-card-cmt   { order: 5; }
          .ab-card-news  { order: 6; }
          .ab-card-other { order: 7; }
          .ab-card-sim   { order: 8; }
          .ab-tracklist  { order: 3; }
        }
      `}</style>
    </div>
  )
}
