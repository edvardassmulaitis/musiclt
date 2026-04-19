'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

type Genre = { id: number; name: string }
type Album = { id: number; slug: string; title: string; year?: number; cover_image_url?: string; type_studio?: boolean; type_ep?: boolean; type_single?: boolean; type_live?: boolean; type_compilation?: boolean; type_remix?: boolean; type_soundtrack?: boolean; type_demo?: boolean }
type Track = { id: number; slug: string; title: string; type?: string; video_url?: string; cover_url?: string }
type Member = { id: number; slug: string; name: string; cover_image_url?: string; member_from?: number; member_until?: number }
type ChartPt = { year: number; value: number }
type Props = {
  artist: any; heroImage: string | null; genres: Genre[]; links: { platform: string; url: string }[]; photos: { url: string; caption?: string }[]
  albums: Album[]; tracks: Track[]; members: Member[]; followers: number; likeCount: number
  news: any[]; events: any[]; similar: any[]; newTracks: Track[]; topVideos: Track[]; chartData: ChartPt[]; hasNewMusic: boolean
}

const yt = (u?: string | null) => { if (!u) return null; const m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/); return m ? m[1] : null }
const aType = (a: Album) => { if (a.type_ep) return 'EP'; if (a.type_single) return 'Singlas'; if (a.type_live) return 'Live'; if (a.type_compilation) return 'Rinkinys'; if (a.type_remix) return 'Remix'; if (a.type_soundtrack) return 'OST'; if (a.type_demo) return 'Demo'; return 'Albumas' }
const FLAGS: Record<string, string> = { 'Lietuva': '🇱🇹', 'Latvija': '🇱🇻', 'Estija': '🇪🇪', 'Lenkija': '🇵🇱', 'Vokietija': '🇩🇪', 'Prancūzija': '🇫🇷', 'Italija': '🇮🇹', 'Ispanija': '🇪🇸', 'Didžioji Britanija': '🇬🇧', 'JAV': '🇺🇸', 'Kanada': '🇨🇦', 'Australija': '🇦🇺', 'Japonija': '🇯🇵', 'Švedija': '🇸🇪', 'Norvegija': '🇳🇴', 'Danija': '🇩🇰', 'Suomija': '🇫🇮', 'Airija': '🇮🇪', 'Olandija': '🇳🇱', 'Rusija': '🇷🇺', 'Ukraina': '🇺🇦' }
const SOC: Record<string, { l: string; c: string; d: string }> = {
  spotify: { l: 'Spotify', c: '#1DB954', d: 'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.52 17.34c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.1-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.64 1.32.42.18.48.66.3 1.02z' },
  youtube: { l: 'YouTube', c: '#FF0000', d: 'M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.55A3.02 3.02 0 0 0 .5 6.19 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14c1.88.55 9.38.55 9.38.55s7.5 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.81zM9.54 15.57V8.43L15.82 12l-6.28 3.57z' },
  tiktok: { l: 'TikTok', c: '#00f2ea', d: 'M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.96-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z' },
  facebook: { l: 'Facebook', c: '#1877F2', d: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z' },
  twitter: { l: 'X', c: '#fff', d: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' },
  soundcloud: { l: 'SoundCloud', c: '#FF5500', d: 'M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.27-2.154c-.009-.06-.05-.1-.084-.1z' },
}

function Spark({ data, w = 130, h = 28 }: { data: ChartPt[]; w?: number; h?: number }) {
  if (data.length < 3) return null
  const max = Math.max(...data.map(d => d.value)); const min = Math.min(...data.map(d => d.value)); const r = max - min || 1
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * w},${h - ((d.value - min) / r) * (h - 4) - 2}`).join(' ')
  return (
    <svg width={w} height={h + 10} viewBox={`0 0 ${w} ${h + 10}`} style={{ display: 'block' }}>
      <defs><linearGradient id="ap-sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(249,115,22,.15)" /><stop offset="100%" stopColor="rgba(249,115,22,0)" /></linearGradient></defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill="url(#ap-sg)" />
      <polyline points={pts} fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinejoin="round" />
      <text x="0" y={h + 9} fill="var(--text-faint)" fontSize="7" fontFamily="Outfit,sans-serif" fontWeight="700">{data[0].year}</text>
      <text x={w} y={h + 9} fill="var(--text-faint)" fontSize="7" fontFamily="Outfit,sans-serif" fontWeight="700" textAnchor="end">{data[data.length - 1].year}</text>
    </svg>
  )
}

function MusicRow({ label, list, playingId, onPlay }: { label: string; list: Track[]; playingId: number | null; onPlay: (id: number) => void }) {
  const [idx, setIdx] = useState(0)
  if (!list.length) return null
  const cur = list[idx]; const vid = yt(cur?.video_url)
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <div style={{ fontFamily: 'Outfit,sans-serif', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.12em', color: '#f97316', marginBottom: 6 }}>{label}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,5fr) minmax(0,7fr)', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border-default)', background: 'var(--player-bg)' }}>
        <div style={{ background: '#000' }}>
          {playingId === cur?.id && vid
            ? <iframe src={`https://www.youtube.com/embed/${vid}?autoplay=1&rel=0`} allow="autoplay;encrypted-media" allowFullScreen style={{ width: '100%', aspectRatio: '16/9', border: 'none', display: 'block' }} />
            : <div style={{ position: 'relative', aspectRatio: '16/9', overflow: 'hidden', cursor: 'pointer' }} onClick={() => vid && onPlay(cur.id)}>
              {vid ? <img src={`https://img.youtube.com/vi/${vid}/hqdefault.jpg`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <div style={{ width: '100%', aspectRatio: '16/9', background: '#111' }} />}
              {vid && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(249,115,22,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(249,115,22,.35)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
                </div>
              </div>}
            </div>}
          <div style={{ padding: '7px 12px', fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', background: 'rgba(249,115,22,.03)', borderTop: '1px solid rgba(249,115,22,.04)' }}>{cur.title}</div>
        </div>
        <div style={{ maxHeight: 340, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'var(--border-default) transparent' }}>
          {list.map((t, i) => {
            const v = yt(t.video_url); const th = t.cover_url || (v ? `https://img.youtube.com/vi/${v}/default.jpg` : null)
            const active = idx === i
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', background: active ? 'var(--playlist-active-bg)' : 'transparent', transition: '.12s' }}
                onClick={() => { setIdx(i); onPlay(-1) }}>
                <span style={{ width: 16, fontSize: 10, fontWeight: 600, color: active ? '#f97316' : 'var(--text-faint)', textAlign: 'center', flexShrink: 0, fontFamily: 'Outfit,sans-serif' }}>{i + 1}</span>
                {th ? <img src={th} style={{ width: 34, height: 34, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} alt="" /> : <div style={{ width: 34, height: 34, borderRadius: 4, flexShrink: 0, background: 'var(--cover-placeholder)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--text-faint)' }}>♪</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: active ? '#f97316' : 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                </div>
                {v && <div style={{ width: 24, height: 24, borderRadius: '50%', background: active ? '#f97316' : 'var(--cover-placeholder)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: active ? '#fff' : 'var(--text-faint)', flexShrink: 0 }}>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                </div>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Gallery({ photos }: { photos: { url: string; caption?: string }[] }) {
  const [lb, setLb] = useState<number | null>(null)
  if (!photos.length) return null
  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, borderRadius: 10, overflow: 'hidden' }}>
        {photos.slice(0, 10).map((p, i) => (
          <div key={i} style={{ position: 'relative', height: i === 0 ? 340 : 170, flex: i === 0 ? '2 1 400px' : '1 1 200px', maxWidth: i === 0 ? '50%' : '33%', overflow: 'hidden', cursor: 'zoom-in' }} onClick={() => setLb(i)}>
            <img src={p.url} alt={p.caption || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform .3s' }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')} />
          </div>
        ))}
      </div>
      {lb !== null && <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.95)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setLb(null)}>
        <button onClick={e => { e.stopPropagation(); setLb(null) }} style={{ position: 'absolute', top: 12, right: 16, background: 'rgba(255,255,255,.08)', border: 'none', color: 'rgba(255,255,255,.5)', fontSize: 14, cursor: 'pointer', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        {lb > 0 && <button onClick={e => { e.stopPropagation(); setLb(lb - 1) }} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,.05)', border: 'none', color: 'rgba(255,255,255,.4)', fontSize: 26, cursor: 'pointer', width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>}
        <div style={{ maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
          <img src={photos[lb].url} alt="" style={{ maxWidth: '100%', maxHeight: '82vh', objectFit: 'contain', borderRadius: 4 }} />
          {photos[lb].caption && <p style={{ fontSize: 10, color: 'rgba(255,255,255,.25)', marginTop: 5 }}>{photos[lb].caption}</p>}
        </div>
        {lb < photos.length - 1 && <button onClick={e => { e.stopPropagation(); setLb(lb + 1) }} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,.05)', border: 'none', color: 'rgba(255,255,255,.4)', fontSize: 26, cursor: 'pointer', width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>}
        <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', fontSize: 9, color: 'rgba(255,255,255,.15)', fontWeight: 600 }}>{lb + 1}/{photos.length}</div>
      </div>}
    </>
  )
}

export default function ArtistProfileClient({
  artist, heroImage, genres, links, photos, albums, tracks, members, followers, likeCount, news, events, similar, newTracks, topVideos, chartData, hasNewMusic
}: Props) {
  const [pid, setPid] = useState<number | null>(null)
  const [df, setDf] = useState('all')
  const [loaded, setLoaded] = useState(false)
  useEffect(() => { setLoaded(true) }, [])

  const flag = FLAGS[artist.country] || (artist.country ? '🌍' : '')
  const hasBio = artist.description?.trim().length > 10
  const solo = artist.type === 'solo'
  const age = solo && artist.birth_date ? Math.floor((Date.now() - new Date(artist.birth_date).getTime()) / 31557600000) : null
  const active = artist.active_from ? `${artist.active_from}–${artist.active_until || 'dabar'}` : null
  const likes = likeCount + followers
  const atypes = [...new Set(albums.map(aType))]
  const fAlbums = df === 'all' ? albums : albums.filter(a => aType(a) === df)
  const yr = new Date().getFullYear()

  const ST: React.CSSProperties = { fontFamily: 'Outfit,sans-serif', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.14em', color: 'var(--section-label)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }

  return (
    <div style={{ background: 'var(--bg-body)', color: 'var(--text-primary)', fontFamily: "'DM Sans',system-ui,sans-serif", WebkitFontSmoothing: 'antialiased', minHeight: '100vh', transition: 'background .2s, color .2s' }}>

      {/* ═══ HERO ═══ */}
      <div style={{ position: 'relative', height: 380, overflow: 'hidden' }}>
        {heroImage ? (
          <div style={{ position: 'absolute', inset: 0 }}>
            <img src={heroImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: artist.cover_image_position || 'center 20%', display: 'block', animation: 'apHeroZoom 20s ease-in-out infinite alternate' }} />
          </div>
        ) : artist.cover_image_url ? (
          <div style={{ position: 'absolute', inset: 0 }}>
            <img src={artist.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(40px) brightness(.2) saturate(1.3)', transform: 'scale(1.4)', display: 'block' }} />
          </div>
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, var(--bg-body) 0%, var(--bg-body) 100%)' }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'var(--hero-gradient-v)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'var(--hero-gradient-h)' }} />
        <div style={{ position: 'relative', maxWidth: 1400, margin: '0 auto', height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 24px 28px', gap: 20, opacity: loaded ? 1 : 0, transform: loaded ? 'none' : 'translateY(12px)', transition: 'opacity .6s, transform .6s' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontFamily: 'Outfit,sans-serif', fontSize: 'clamp(2rem,5vw,3.5rem)', fontWeight: 900, lineHeight: 1.05, letterSpacing: '-.04em', color: 'var(--hero-name)', marginBottom: 10, textShadow: '0 2px 20px rgba(0,0,0,.4)', margin: '0 0 10px' }}>
              {flag && <span style={{ marginRight: 6, fontSize: '.65em', verticalAlign: 'middle' }}>{flag}</span>}
              {artist.name}
              {artist.is_verified && <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, background: '#3b82f6', borderRadius: '50%', marginLeft: 6, verticalAlign: 'middle' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg></span>}
            </h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              {genres.map(g => <span key={g.id} style={{ fontSize: 10, fontWeight: 700, color: 'var(--hero-tag-text)', background: 'var(--hero-tag-bg)', border: '1px solid var(--hero-tag-border)', borderRadius: 100, padding: '3px 10px', fontFamily: 'Outfit,sans-serif', backdropFilter: 'blur(4px)' }}>{g.name}</span>)}
              <button style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 100, border: '1px solid rgba(249,115,22,.25)', fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: 'Outfit,sans-serif', background: 'rgba(249,115,22,.1)', color: '#f97316' }}>
                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 11, height: 11 }}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                {likes > 0 ? likes : '0'}
              </button>
              {solo && members.map(m => (
                <Link key={m.id} href={`/atlikejai/${m.slug}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 100, border: '1px solid var(--hero-tag-border)', background: 'var(--hero-tag-bg)', textDecoration: 'none', fontSize: 10, fontWeight: 700, color: 'var(--hero-name)', fontFamily: 'Outfit,sans-serif', backdropFilter: 'blur(4px)' }}>
                  {m.cover_image_url ? <img src={m.cover_image_url} alt="" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }} /> : <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--hero-tag-bg)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 7 }}>{m.name[0]}</span>}
                  <span>{m.name}</span>
                </Link>
              ))}
            </div>
          </div>
          {chartData.length > 5 && (
            <div style={{ background: 'var(--hero-chip-bg)', border: '1px solid var(--hero-chip-border)', borderRadius: 10, padding: '8px 12px 2px', backdropFilter: 'blur(8px)', flexShrink: 0 }}>
              <div style={{ fontSize: 7, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--text-faint)', fontFamily: 'Outfit,sans-serif', marginBottom: 2 }}>Populiarumas</div>
              <Spark data={chartData} />
            </div>
          )}
        </div>
        <style>{`@keyframes apHeroZoom{0%{transform:scale(1)}100%{transform:scale(1.05)}}`}</style>
      </div>

      {/* ═══ CONTENT ═══ */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 24px' }}>

        {/* Events */}
        {events.length > 0 && (
          <section style={{ paddingTop: 24 }}>
            <div style={ST}>Artimiausi renginiai<span style={{ flex: 1, height: 1, background: 'var(--section-line)' }} /></div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none' }}>
              {events.map((e: any) => {
                const d = new Date(e.event_date); const sy = d.getFullYear() !== yr
                return (
                  <div key={e.id} style={{ flexShrink: 0, display: 'flex', gap: 12, alignItems: 'center', borderRadius: 12, border: '1px solid rgba(249,115,22,.12)', background: 'rgba(249,115,22,.03)', padding: '14px 18px', cursor: 'pointer', minWidth: 220 }}>
                    <div style={{ textAlign: 'center', minWidth: 40, background: 'rgba(249,115,22,.1)', borderRadius: 8, padding: '5px 4px' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#f97316', textTransform: 'capitalize', lineHeight: 1.2 }}>{d.toLocaleDateString('lt-LT', { month: 'long' })}{sy ? `, ${d.getFullYear()}` : ''}</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--hero-name)', fontFamily: 'Outfit,sans-serif', lineHeight: 1 }}>{d.getDate()}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--hero-name)', lineHeight: 1.2 }}>{e.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{e.venues?.name || e.venue_custom || ''}{e.venues?.city ? `, ${e.venues.city}` : ''}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Music */}
        {(topVideos.length > 0 || newTracks.length > 0) && (
          <section style={{ paddingTop: 24 }}>
            <div style={ST}>Muzika<span style={{ flex: 1, height: 1, background: 'var(--section-line)' }} /></div>
            {hasNewMusic && newTracks.length > 0 && <MusicRow label="Nauja muzika" list={newTracks.slice(0, 6)} playingId={pid} onPlay={setPid} />}
            {topVideos.length > 0 && <MusicRow label={hasNewMusic ? 'Populiariausia' : ''} list={topVideos} playingId={pid} onPlay={setPid} />}
          </section>
        )}

        {/* Discography */}
        {albums.length > 0 && (
          <section style={{ paddingTop: 24 }}>
            <div style={ST}>Diskografija · {albums.length}<span style={{ flex: 1, height: 1, background: 'var(--section-line)' }} /></div>
            {atypes.length > 1 && (
              <div style={{ display: 'flex', gap: 3, marginBottom: 10, flexWrap: 'wrap' }}>
                {['all', ...atypes].map(t => (
                  <button key={t} onClick={() => setDf(t)} style={{ padding: '3px 9px', borderRadius: 100, fontSize: 9, fontWeight: 700, border: `1px solid ${df === t ? '#f97316' : 'var(--border-default)'}`, background: df === t ? '#f97316' : 'transparent', color: df === t ? '#fff' : 'var(--text-faint)', cursor: 'pointer', fontFamily: 'Outfit,sans-serif', transition: '.2s' }}>
                    {t === 'all' ? 'Visi' : t}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 8 }}>
              {fAlbums.map(a => (
                <Link key={a.id} href={`/lt/albumas/${a.slug}/${a.id}/`} style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-default)', background: 'var(--card-bg)', textDecoration: 'none', display: 'block', transition: '.2s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-default)' }}>
                  <div style={{ aspectRatio: '1', background: 'var(--cover-placeholder)', overflow: 'hidden', position: 'relative' }}>
                    {a.cover_image_url ? <img src={a.cover_image_url} alt={a.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'var(--text-faint)' }}>💿</div>}
                    {aType(a) !== 'Albumas' && <span style={{ position: 'absolute', top: 4, right: 4, fontSize: 7, fontWeight: 800, textTransform: 'uppercase', padding: '2px 4px', borderRadius: 2, background: 'rgba(0,0,0,.6)', color: '#b0bdd4' }}>{aType(a)}</span>}
                  </div>
                  <div style={{ padding: '7px 8px' }}>
                    <div style={{ fontFamily: 'Outfit,sans-serif', fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2, fontWeight: 600 }}>{a.year || '—'}</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Bio + News */}
        {(hasBio || news.length > 0) && (
          <section style={{ paddingTop: 24 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 28, alignItems: 'start' }}>
              <div>
                <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,.02)', border: '1px solid var(--border-default)' }}>
                  {active && <div style={{ display: 'flex', flexDirection: 'column', minWidth: 50 }}><span style={{ fontFamily: 'Outfit,sans-serif', fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>{active}</span><span style={{ fontSize: 7, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 1 }}>Aktyvumas</span></div>}
                  {solo && age && <div style={{ display: 'flex', flexDirection: 'column', minWidth: 50 }}><span style={{ fontFamily: 'Outfit,sans-serif', fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>{age} m.</span><span style={{ fontSize: 7, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 1 }}>Amžius</span></div>}
                  {artist.country && <div style={{ display: 'flex', flexDirection: 'column', minWidth: 50 }}><span style={{ fontFamily: 'Outfit,sans-serif', fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>{flag} {artist.country}</span><span style={{ fontSize: 7, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 1 }}>Šalis</span></div>}
                  {albums.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', minWidth: 50 }}><span style={{ fontFamily: 'Outfit,sans-serif', fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>{albums.length}</span><span style={{ fontSize: 7, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 1 }}>Albumai</span></div>}
                  {tracks.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', minWidth: 50 }}><span style={{ fontFamily: 'Outfit,sans-serif', fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>{tracks.length}+</span><span style={{ fontSize: 7, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 1 }}>Dainos</span></div>}
                </div>
                {hasBio && <>
                  <div style={ST}>Apie<span style={{ flex: 1, height: 1, background: 'var(--section-line)' }} /></div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.85 }} dangerouslySetInnerHTML={{ __html: artist.description }} />
                </>}
                {links.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 12 }}>
                    {links.map(l => { const p = SOC[l.platform]; return (
                      <a key={l.platform} href={l.url} target="_blank" rel="noopener" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 100, border: '1px solid var(--border-default)', background: 'var(--card-bg)', textDecoration: 'none' }}>
                        {p && <svg viewBox="0 0 24 24" fill={p.c} width="13" height="13"><path d={p.d} /></svg>}
                        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'Outfit,sans-serif' }}>{p?.l || l.platform}</span>
                      </a>
                    )})}
                    {artist.website && (
                      <a href={artist.website} target="_blank" rel="noopener" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 100, border: '1px solid var(--border-default)', background: 'var(--card-bg)', textDecoration: 'none' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" width="13" height="13"><circle cx="12" cy="12" r="10" /></svg>
                        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'Outfit,sans-serif' }}>Svetainė</span>
                      </a>
                    )}
                  </div>
                )}
                {!solo && members.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={ST}>Nariai · {members.length}<span style={{ flex: 1, height: 1, background: 'var(--section-line)' }} /></div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {members.map(m => (
                        <Link key={m.id} href={`/atlikejai/${m.slug}`} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--card-bg)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '5px 9px', textDecoration: 'none' }}>
                          {m.cover_image_url ? <img src={m.cover_image_url} alt={m.name} style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} /> : <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--cover-placeholder)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 900, color: 'var(--text-faint)', flexShrink: 0 }}>{m.name[0]}</div>}
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-primary)' }}>{m.name}</div>
                            <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>{m.member_from ? `${m.member_from}–${m.member_until || 'dabar'}` : ''}</div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div>
                {news.length > 0 && (
                  <div style={{ borderRadius: 10, border: '1px solid var(--border-default)', background: 'var(--card-bg)', padding: 10 }}>
                    <div style={{ ...ST, marginBottom: 6 }}>Naujienos<span style={{ flex: 1, height: 1, background: 'var(--section-line)' }} /></div>
                    {news.map((n, i) => (
                      <Link key={n.id} href={`/news/${n.slug}`} style={{ display: 'flex', gap: 7, padding: '5px 0', borderBottom: i < news.length - 1 ? '1px solid var(--border-subtle)' : 'none', textDecoration: 'none' }}
                        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = '.8')}
                        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = '1')}>
                        {n.image_small_url ? <img src={n.image_small_url} style={{ width: 36, height: 36, borderRadius: 5, objectFit: 'cover', flexShrink: 0 }} alt="" /> : <div style={{ width: 36, height: 36, borderRadius: 5, flexShrink: 0, background: 'var(--cover-placeholder)' }} />}
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.25 }}>{n.title}</div>
                          <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 1 }}>{new Date(n.published_at).toLocaleDateString('lt-LT')}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Gallery */}
        {photos.length > 0 && (
          <section style={{ paddingTop: 24 }}>
            <div style={ST}>Galerija · {photos.length}<span style={{ flex: 1, height: 1, background: 'var(--section-line)' }} /></div>
            <Gallery photos={photos} />
          </section>
        )}

        {/* Discussions */}
        <section style={{ paddingTop: 24 }}>
          <div style={ST}>Diskusijos<span style={{ flex: 1, height: 1, background: 'var(--section-line)' }} /></div>
          <div style={{ border: '1px dashed var(--border-default)', borderRadius: 10, padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 2 }}>Dar nėra diskusijų apie {artist.name}</div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>Būk pirmas — pradėk diskusiją!</div>
            <button style={{ marginTop: 8, padding: '6px 16px', borderRadius: 100, border: '1px solid var(--border-default)', background: 'var(--card-bg)', color: 'var(--text-secondary)', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit,sans-serif' }}>+ Nauja diskusija</button>
          </div>
        </section>

        {/* Similar */}
        {similar.length > 0 && (
          <section style={{ paddingTop: 24, paddingBottom: 48 }}>
            <div style={ST}>Panaši muzika<span style={{ flex: 1, height: 1, background: 'var(--section-line)' }} /></div>
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollbarWidth: 'none' }}>
              {similar.map((a: any) => (
                <Link key={a.id} href={`/atlikejai/${a.slug}`} style={{ flexShrink: 0, width: 86, textAlign: 'center', textDecoration: 'none' }}>
                  {a.cover_image_url
                    ? <img src={a.cover_image_url} alt={a.name} style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover', margin: '0 auto 4px', border: '2px solid var(--border-default)', display: 'block' }} />
                    : <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--cover-placeholder)', margin: '0 auto 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: 'var(--text-faint)', fontFamily: 'Outfit,sans-serif' }}>{a.name[0]}</div>}
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-secondary)' }}>{a.name}</div>
                </Link>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  )
}
