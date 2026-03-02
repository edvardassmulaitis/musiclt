'use client'
import { useState } from 'react'
import Link from 'next/link'
import { HeaderAuth } from '@/components/HeaderAuth'

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
const FLAGS: Record<string, string> = { 'Lietuva': '🇱🇹', 'Latvija': '🇱🇻', 'Estija': '🇪🇪', 'Lenkija': '🇵🇱', 'Vokietija': '🇩🇪', 'Prancūzija': '🇫🇷', 'Italija': '🇮🇹', 'Ispanija': '🇪🇸', 'Olandija': '🇳🇱', 'Švedija': '🇸🇪', 'Norvegija': '🇳🇴', 'Danija': '🇩🇰', 'Suomija': '🇫🇮', 'Airija': '🇮🇪', 'Didžioji Britanija': '🇬🇧', 'JAV': '🇺🇸', 'Kanada': '🇨🇦', 'Australija': '🇦🇺', 'Japonija': '🇯🇵', 'Rusija': '🇷🇺', 'Ukraina': '🇺🇦' }
const SOC: Record<string, { l: string; c: string; d: string }> = {
  spotify: { l: 'Spotify', c: '#1DB954', d: 'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.52 17.34c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.1-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.64 1.32.42.18.48.66.3 1.02z' },
  youtube: { l: 'YouTube', c: '#FF0000', d: 'M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.55A3.02 3.02 0 0 0 .5 6.19 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14c1.88.55 9.38.55 9.38.55s7.5 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.81zM9.54 15.57V8.43L15.82 12l-6.28 3.57z' },
  instagram: { l: 'Instagram', c: '#E1306C', d: 'M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.97.24 2.44.41.61.24 1.05.52 1.51.98.46.46.74.9.98 1.51.17.47.36 1.27.41 2.44.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.24 1.97-.41 2.44a4.08 4.08 0 0 1-.98 1.51 4.08 4.08 0 0 1-1.51.98c-.47.17-1.27.36-2.44.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.97-.24-2.44-.41a4.08 4.08 0 0 1-1.51-.98 4.08 4.08 0 0 1-.98-1.51c-.17-.47-.36-1.27-.41-2.44C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85C2.28 6 2.47 5.2 2.64 4.73c.24-.61.52-1.05.98-1.51a4.08 4.08 0 0 1 1.51-.98c.47-.17 1.27-.36 2.44-.41C8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.78.3-1.44.71-2.1 1.37A5.88 5.88 0 0 0 .63 4.14C.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.3.78.71 1.44 1.37 2.1a5.88 5.88 0 0 0 2.14 1.37c.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a6.2 6.2 0 0 0 3.51-3.47c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.88 5.88 0 0 0-1.37-2.14A5.88 5.88 0 0 0 19.86.63C19.1.33 18.22.13 16.95.07 15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8z' },
  tiktok: { l: 'TikTok', c: '#00f2ea', d: 'M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.96-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z' },
  facebook: { l: 'Facebook', c: '#1877F2', d: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z' },
  twitter: { l: 'X', c: '#fff', d: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' },
  soundcloud: { l: 'SoundCloud', c: '#FF5500', d: 'M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.27-2.154c-.009-.06-.05-.1-.084-.1z' },
  bandcamp: { l: 'Bandcamp', c: '#629aa9', d: 'M0 18.75l7.437-13.5H24l-7.438 13.5H0z' },
}

function Spark({ data, w = 130, h = 28 }: { data: ChartPt[]; w?: number; h?: number }) {
  if (data.length < 3) return null
  const max = Math.max(...data.map(d => d.value)); const min = Math.min(...data.map(d => d.value)); const r = max - min || 1
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * w},${h - ((d.value - min) / r) * (h - 4) - 2}`).join(' ')
  return (
    <svg width={w} height={h + 10} viewBox={`0 0 ${w} ${h + 10}`}>
      <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(249,115,22,.15)" /><stop offset="100%" stopColor="rgba(249,115,22,0)" /></linearGradient></defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill="url(#sg)" />
      <polyline points={pts} fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinejoin="round" />
      <text x="0" y={h + 9} fill="rgba(255,255,255,.2)" fontSize="7" fontFamily="var(--fd)" fontWeight="700">{data[0].year}</text>
      <text x={w} y={h + 9} fill="rgba(255,255,255,.2)" fontSize="7" fontFamily="var(--fd)" fontWeight="700" textAnchor="end">{data[data.length - 1].year}</text>
    </svg>
  )
}

function MusicRow({ label, tracks: list, playingId, onPlay }: { label: string; tracks: Track[]; playingId: number | null; onPlay: (id: number) => void }) {
  const [idx, setIdx] = useState(0)
  if (!list.length) return null
  const cur = list[idx]; const vid = yt(cur?.video_url)
  return (
    <div className="mr">
      {label && <div className="mr-lbl">{label}</div>}
      <div className="mr-box">
        <div className="mr-vid">
          {playingId === cur?.id && vid
            ? <iframe src={`https://www.youtube.com/embed/${vid}?autoplay=1&rel=0`} allow="autoplay;encrypted-media" allowFullScreen />
            : <div className="mr-th" onClick={() => vid && onPlay(cur.id)}>
              {vid ? <img src={`https://img.youtube.com/vi/${vid}/hqdefault.jpg`} alt={cur.title} /> : <div className="mr-noth" />}
              {vid && <div className="mr-ply"><div className="mr-pbtn"><svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg></div></div>}
            </div>}
          <div className="mr-cur">{cur.title}</div>
        </div>
        <div className="mr-pl">
          {list.map((t, i) => {
            const v = yt(t.video_url); const th = t.cover_url || (v ? `https://img.youtube.com/vi/${v}/default.jpg` : null)
            return (
              <div key={t.id} className={`pl-r${idx === i ? ' pl-on' : ''}`} onClick={() => { setIdx(i); onPlay(-1) }}>
                <span className="pl-n">{i + 1}</span>
                {th ? <img src={th} className="pl-img" alt="" /> : <div className="pl-img pl-ni">♪</div>}
                <div className="pl-info"><div className="pl-name">{t.title}</div></div>
                {v && <div className="pl-play"><svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg></div>}
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
      <div className="gal">{photos.slice(0, 10).map((p, i) => (
        <div key={i} className={`gc${i === 0 ? ' gc-big' : ''}`} onClick={() => setLb(i)}>
          <img src={p.url} alt={p.caption || ''} /><div className="gc-ov" />
        </div>
      ))}</div>
      {lb !== null && <div className="lb" onClick={() => setLb(null)}>
        <button className="lb-x" onClick={e => { e.stopPropagation(); setLb(null) }}>✕</button>
        {lb > 0 && <button className="lb-a lb-p" onClick={e => { e.stopPropagation(); setLb(lb - 1) }}>‹</button>}
        <div className="lb-m" onClick={e => e.stopPropagation()}><img src={photos[lb].url} alt="" />{photos[lb].caption && <p>{photos[lb].caption}</p>}</div>
        {lb < photos.length - 1 && <button className="lb-a lb-n" onClick={e => { e.stopPropagation(); setLb(lb + 1) }}>›</button>}
        <div className="lb-ct">{lb + 1}/{photos.length}</div>
      </div>}
    </>
  )
}

export default function ArtistProfileClient({
  artist, heroImage, genres, links, photos, albums, tracks, members, followers, likeCount, news, events, similar, newTracks, topVideos, chartData, hasNewMusic
}: Props) {
  const [playingId, setPlayingId] = useState<number | null>(null)
  const [discFilter, setDiscFilter] = useState('all')

  const flag = FLAGS[artist.country] || (artist.country ? '🌍' : '')
  const hasBio = artist.description && artist.description.trim().length > 10
  const isSolo = artist.type === 'solo'
  const age = isSolo && artist.birth_date ? Math.floor((Date.now() - new Date(artist.birth_date).getTime()) / 31557600000) : null
  const activeYears = artist.active_from ? `${artist.active_from}–${artist.active_until || 'dabar'}` : null
  const totalLikes = likeCount + followers
  const albumTypes = [...new Set(albums.map(aType))]
  const filteredAlbums = discFilter === 'all' ? albums : albums.filter(a => aType(a) === discFilter)
  const now = new Date(); const thisYear = now.getFullYear()

  return (
    <>
      <style>{styles}</style>
      <div className="pg">
        <header className="hd"><div className="hd-w">
          <Link href="/" className="logo"><b>music</b><i>.lt</i></Link>
          <div className="srch"><input placeholder="Ieškok atlikėjų, albumų, dainų…" /></div>
          <nav className="nav">{['Topai', 'Muzika', 'Renginiai', 'Atlikėjai', 'Bendruomenė'].map(n => <a key={n} href="/" className={n === 'Atlikėjai' ? 'on' : ''}>{n}</a>)}</nav>
          <HeaderAuth />
        </div></header>

        {/* ═══ HERO — immersive, full image visible ═══ */}
        <div className="hero-wrap">
          {heroImage ? (
            <>
              <div className="hero-bgblur"><img src={heroImage} alt="" /></div>
              <div className="hero-photo"><div className="hero-photo-fade" /><img src={heroImage} alt={artist.name} /></div>
            </>
          ) : artist.cover_image_url ? (
            <div className="hero-bgblur"><img src={artist.cover_image_url} alt="" /></div>
          ) : (
            <div className="hero-fb" />
          )}
          <div className="hero">
            <div className="hero-left">
              <div className="hero-title-row">
                <h1 className="hero-name">
                  {flag && <span className="hero-flag">{flag}</span>}
                  {artist.name}
                  {artist.is_verified && <span className="vf"><svg width="10" height="10" viewBox="0 0 24 24" fill="#fff"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg></span>}
                </h1>
                <button className="hlike">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                  {totalLikes > 0 ? totalLikes : '0'}
                </button>
              </div>
              <div className="hero-tags">
                {genres.map(g => <span key={g.id} className="htag">{g.name}</span>)}
              </div>
              {isSolo && members.length > 0 && (
                <div className="hero-mems">
                  {members.map(m => (
                    <Link key={m.id} href={`/atlikejai/${m.slug}`} className="hmem">
                      {m.cover_image_url ? <img src={m.cover_image_url} alt={m.name} /> : <span className="hmem-fb">{m.name[0]}</span>}
                      <span>{m.name}</span>
                    </Link>
                  ))}
                </div>
              )}
              {chartData.length > 5 && (
                <div className="hero-chart">
                  <div className="hch-lbl">Populiarumas</div>
                  <Spark data={chartData} />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="content">
          {/* ═══ EVENTS ═══ */}
          {events.length > 0 && (
            <section className="sec">
              <div className="sec-t">Artimiausi renginiai</div>
              <div className="ev-row">{events.map((e: any) => {
                const d = new Date(e.event_date); const yr = d.getFullYear(); const showYear = yr !== thisYear
                return (
                  <div key={e.id} className="ev-c">
                    <div className="ev-dd">
                      <div className="ev-mo">{d.toLocaleDateString('lt-LT', { month: 'long' })}{showYear ? `, ${yr}` : ''}</div>
                      <div className="ev-day">{d.getDate()}</div>
                    </div>
                    <div className="ev-info">
                      <div className="ev-t">{e.title}</div>
                      <div className="ev-v">{e.venues?.name || e.venue_custom || ''}{e.venues?.city ? `, ${e.venues.city}` : ''}</div>
                    </div>
                  </div>
                )
              })}</div>
            </section>
          )}

          {/* ═══ MUSIC — always two rows if data exists ═══ */}
          {(topVideos.length > 0 || newTracks.length > 0) && (
            <section className="sec">
              <div className="sec-t">Muzika</div>
              {hasNewMusic && newTracks.length > 0 && (
                <MusicRow label="Nauja muzika" tracks={newTracks.slice(0, 6)} playingId={playingId} onPlay={setPlayingId} />
              )}
              {topVideos.length > 0 && (
                <MusicRow label={hasNewMusic ? 'Populiariausia visa laikų' : ''} tracks={topVideos} playingId={playingId} onPlay={setPlayingId} />
              )}
            </section>
          )}

          {/* ═══ DISCOGRAPHY ═══ */}
          {albums.length > 0 && (
            <section className="sec">
              <div className="sec-t">Diskografija · {albums.length}</div>
              {albumTypes.length > 1 && <div className="df-row"><button className={`df${discFilter === 'all' ? ' df-on' : ''}`} onClick={() => setDiscFilter('all')}>Visi</button>{albumTypes.map(t => <button key={t} className={`df${discFilter === t ? ' df-on' : ''}`} onClick={() => setDiscFilter(t)}>{t}</button>)}</div>}
              <div className="disc-g">{filteredAlbums.map(a => (
                <div key={a.id} className="dc">
                  <div className="dc-cv">{a.cover_image_url ? <img src={a.cover_image_url} alt={a.title} /> : <div className="dc-no">💿</div>}{aType(a) !== 'Albumas' && <span className="dc-tp">{aType(a)}</span>}</div>
                  <div className="dc-i"><div className="dc-t">{a.title}</div><div className="dc-y">{a.year || '—'}</div></div>
                </div>
              ))}</div>
            </section>
          )}

          {/* ═══ BIO (overview inline) + NEWS sidebar ═══ */}
          {(hasBio || news.length > 0) && (
            <section className="sec">
              <div className="two-col">
                <div>
                  {/* Overview chips inline before bio */}
                  <div className="bio-row-top">
                    <div className="bio-chips">
                      {activeYears && <div className="bch"><span className="bch-v">{activeYears}</span><span className="bch-l">Aktyvumas</span></div>}
                      {isSolo && age && <div className="bch"><span className="bch-v">{age} m.</span><span className="bch-l">Amžius</span></div>}
                      {artist.country && <div className="bch"><span className="bch-v">{flag} {artist.country}</span><span className="bch-l">Šalis</span></div>}
                      {albums.length > 0 && <div className="bch"><span className="bch-v">{albums.length}</span><span className="bch-l">Albumai</span></div>}
                      {tracks.length > 0 && <div className="bch"><span className="bch-v">{tracks.length}+</span><span className="bch-l">Dainos</span></div>}
                    </div>
                  </div>
                  {hasBio && <><div className="sec-t">Apie</div><div className="bio" dangerouslySetInnerHTML={{ __html: artist.description }} /></>}
                  {links.length > 0 && (
                    <div className="soc-row">{links.map(l => { const p = SOC[l.platform]; return (
                      <a key={l.platform} href={l.url} target="_blank" rel="noopener" className="soc-a">{p && <svg viewBox="0 0 24 24" fill={p.c} width="13" height="13"><path d={p.d} /></svg>}<span>{p?.l || l.platform}</span></a>
                    ) })}{artist.website && <a href={artist.website} target="_blank" rel="noopener" className="soc-a"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13" style={{ color: '#5e7290' }}><circle cx="12" cy="12" r="10" /></svg><span>Svetainė</span></a>}</div>
                  )}
                  {!isSolo && members.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <div className="sec-t">Nariai · {members.length}</div>
                      <div className="mem-row">{members.map(m => (
                        <Link key={m.id} href={`/atlikejai/${m.slug}`} className="mem">
                          {m.cover_image_url ? <img src={m.cover_image_url} alt={m.name} className="mem-img" /> : <div className="mem-img mem-ni">{m.name[0]}</div>}
                          <div><div className="mem-name">{m.name}</div><div className="mem-yr">{m.member_from ? `${m.member_from}–${m.member_until || 'dabar'}` : ''}</div></div>
                        </Link>
                      ))}</div>
                    </div>
                  )}
                </div>
                <div>
                  {news.length > 0 && <div className="card"><div className="sec-t" style={{ marginBottom: 6 }}>Naujienos</div>{news.map(n => (
                    <Link key={n.id} href={`/news/${n.slug}`} className="ni">
                      {n.image_small_url ? <img src={n.image_small_url} className="ni-img" alt="" /> : <div className="ni-img" />}
                      <div><div className="ni-t">{n.title}</div><div className="ni-d">{new Date(n.published_at).toLocaleDateString('lt-LT')}</div></div>
                    </Link>
                  ))}</div>}
                </div>
              </div>
            </section>
          )}

          {/* ═══ GALLERY ═══ */}
          {photos.length > 0 && <section className="sec"><div className="sec-t">Galerija · {photos.length}</div><Gallery photos={photos} /></section>}

          {/* ═══ DISCUSSIONS ═══ */}
          <section className="sec">
            <div className="sec-t">Diskusijos</div>
            <div className="disc-empty"><div className="de-t">Dar nėra diskusijų apie {artist.name}</div><div className="de-s">Būk pirmas — pradėk diskusiją!</div><button className="de-btn">+ Nauja diskusija</button></div>
          </section>

          {/* ═══ SIMILAR ═══ */}
          {similar.length > 0 && (
            <section className="sec sec-last">
              <div className="sec-t">Panaši muzika</div>
              <div className="sim-row">{similar.map((a: any) => (
                <Link key={a.id} href={`/atlikejai/${a.slug}`} className="sim-c">
                  {a.cover_image_url ? <img src={a.cover_image_url} alt={a.name} className="sim-img" /> : <div className="sim-img sim-ni">{a.name[0]}</div>}
                  <div className="sim-n">{a.name}</div>
                </Link>
              ))}</div>
            </section>
          )}
        </div>
      </div>
    </>
  )
}

const styles = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=DM+Sans:ital,wght@0,400;0,500;0,700;1,400&display=swap');
:root{--bg:#090d13;--bg2:#111822;--t:#f0f2f5;--t2:#b0bdd4;--t3:#5e7290;--t4:#334058;--bd:rgba(255,255,255,.06);--or:#f97316;--fd:'Outfit',system-ui,sans-serif;--fb:'DM Sans',system-ui,sans-serif}
*{box-sizing:border-box;margin:0;padding:0}
.pg{background:var(--bg);color:var(--t);font-family:var(--fb);-webkit-font-smoothing:antialiased;min-height:100vh}
.content{max-width:1400px;margin:0 auto;padding:0 24px}
.sec{padding-top:24px}.sec-last{padding-bottom:48px}
.sec-t{font-family:var(--fd);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.14em;color:var(--t4);margin-bottom:12px;display:flex;align-items:center;gap:10px}.sec-t::after{content:'';flex:1;height:1px;background:var(--bd)}

/* Header */
.hd{position:sticky;top:0;z-index:50;background:rgba(9,13,19,.94);backdrop-filter:blur(20px);border-bottom:1px solid rgba(255,255,255,.03)}
.hd-w{max-width:1400px;margin:0 auto;padding:0 24px;height:52px;display:flex;align-items:center;gap:18px}
.logo{font-family:var(--fd);font-size:20px;font-weight:900;letter-spacing:-.03em;text-decoration:none}.logo b{color:#f2f4f8}.logo i{color:#fb923c;font-style:normal}
.srch{flex:1;max-width:360px;height:32px;border-radius:100px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.06);display:flex;align-items:center;overflow:hidden}
.srch input{flex:1;padding:0 14px;font-size:12px;background:none;border:none;outline:none;color:var(--t2);font-family:var(--fb)}.srch input::placeholder{color:var(--t4)}
.nav{display:flex;gap:1px;margin-left:auto}.nav a{padding:4px 10px;font-size:11px;font-weight:600;color:var(--t3);border-radius:4px;text-decoration:none;font-family:var(--fd);transition:.15s}.nav a:hover{color:var(--t);background:rgba(255,255,255,.04)}.nav a.on{color:var(--or)}

/* ═══ HERO — immersive, image fully visible ═══ */
.hero-wrap{position:relative;height:340px;overflow:hidden;background:var(--bg)}
.hero-bgblur{position:absolute;inset:0;overflow:hidden}.hero-bgblur img{width:100%;height:100%;object-fit:cover;filter:blur(60px) brightness(.15) saturate(1.2);transform:scale(1.5)}
.hero-photo{position:absolute;right:0;top:0;bottom:0;width:65%;display:flex;align-items:center;justify-content:flex-end}
.hero-photo img{max-width:100%;max-height:100%;object-fit:contain;display:block}
.hero-photo-fade{position:absolute;left:0;top:0;bottom:0;width:120px;background:linear-gradient(to right,var(--bg),transparent);z-index:1}
.hero-fb{position:absolute;inset:0;background:linear-gradient(135deg,#0f1825,#090d13)}
.hero{position:relative;max-width:1400px;margin:0 auto;height:100%;display:flex;align-items:flex-end;padding:0 24px 24px;z-index:2}
.hero-left{max-width:480px}

.hero-title-row{display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap}
.hero-name{font-family:var(--fd);font-size:clamp(1.5rem,3.5vw,2.4rem);font-weight:900;line-height:1.1;letter-spacing:-.04em;color:#fff;flex:1;min-width:0}
.hero-flag{margin-right:4px;font-size:.7em}
.vf{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;background:#3b82f6;border-radius:50%;margin-left:4px;vertical-align:middle}
.hlike{display:inline-flex;align-items:center;gap:3px;padding:5px 11px;border-radius:100px;border:1px solid rgba(249,115,22,.2);font-size:11px;font-weight:800;cursor:pointer;font-family:var(--fd);background:rgba(249,115,22,.08);color:var(--or);transition:.2s;flex-shrink:0}.hlike:hover{background:rgba(249,115,22,.16)}.hlike svg{width:11px;height:11px}

.hero-tags{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}
.htag{font-size:9px;font-weight:700;color:var(--t2);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);border-radius:100px;padding:2px 8px;font-family:var(--fd)}
.hero-mems{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}
.hmem{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:100px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);text-decoration:none;font-size:10px;font-weight:700;color:var(--t);font-family:var(--fd);transition:.2s}.hmem:hover{background:rgba(255,255,255,.08)}
.hmem img{width:18px;height:18px;border-radius:50%;object-fit:cover}.hmem-fb{width:18px;height:18px;border-radius:50%;background:var(--bg2);display:inline-flex;align-items:center;justify-content:center;font-size:7px;color:rgba(255,255,255,.06)}

.hero-chart{margin-top:6px}
.hch-lbl{font-size:7px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--t4);font-family:var(--fd);margin-bottom:1px}

/* ═══ EVENTS — bigger cards, readable ═══ */
.ev-row{display:flex;gap:10px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}.ev-row::-webkit-scrollbar{display:none}
.ev-c{flex-shrink:0;display:flex;gap:12px;align-items:center;border-radius:12px;border:1px solid rgba(249,115,22,.12);background:rgba(249,115,22,.03);padding:14px 18px;cursor:pointer;transition:.2s;min-width:240px}
.ev-c:hover{border-color:rgba(249,115,22,.22);background:rgba(249,115,22,.06)}
.ev-dd{text-align:center;min-width:44px;background:rgba(249,115,22,.1);border-radius:8px;padding:6px 4px}
.ev-mo{font-size:9px;font-weight:700;color:var(--or);text-transform:capitalize;line-height:1.2}
.ev-day{font-size:22px;font-weight:900;color:#fff;font-family:var(--fd);line-height:1}
.ev-info{flex:1;min-width:0}
.ev-t{font-size:13px;font-weight:700;color:#fff;line-height:1.25}
.ev-v{font-size:11px;color:var(--t2);margin-top:2px}

/* ═══ MUSIC ROW ═══ */
.mr{margin-bottom:14px}
.mr-lbl{font-family:var(--fd);font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:var(--or);margin-bottom:6px}
.mr-box{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);border-radius:10px;overflow:hidden;border:1px solid var(--bd);background:rgba(0,0,0,.25)}
.mr-vid{background:#000;display:flex;flex-direction:column}
.mr-vid iframe{width:100%;aspect-ratio:16/9;border:none;display:block}
.mr-th{position:relative;aspect-ratio:16/9;overflow:hidden;cursor:pointer}.mr-th img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s}.mr-th:hover img{transform:scale(1.03)}
.mr-noth{width:100%;aspect-ratio:16/9;background:#111}
.mr-ply{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.mr-pbtn{width:48px;height:48px;border-radius:50%;background:rgba(249,115,22,.85);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(249,115,22,.3);transition:.15s}.mr-th:hover .mr-pbtn{transform:scale(1.08)}
.mr-cur{padding:7px 12px;font-size:12px;font-weight:800;color:var(--t);background:rgba(249,115,22,.03);border-top:1px solid rgba(249,115,22,.04)}
.mr-pl{max-height:340px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.06) transparent}
.pl-r{display:flex;align-items:center;gap:8px;padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);cursor:pointer;transition:.12s}.pl-r:last-child{border-bottom:none}.pl-r:hover{background:rgba(255,255,255,.03)}
.pl-on{background:rgba(249,115,22,.05)!important}
.pl-n{width:16px;font-size:10px;font-weight:600;color:var(--t4);text-align:center;flex-shrink:0;font-family:var(--fd)}.pl-on .pl-n{color:var(--or)}
.pl-img{width:34px;height:34px;border-radius:4px;object-fit:cover;flex-shrink:0;background:var(--bg2)}.pl-ni{display:flex;align-items:center;justify-content:center;font-size:10px;color:rgba(255,255,255,.05)}
.pl-info{flex:1;min-width:0}.pl-name{font-size:12px;font-weight:700;color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pl-on .pl-name{color:var(--or)}
.pl-play{width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;color:var(--t4);flex-shrink:0}.pl-on .pl-play{background:var(--or);color:#fff}

/* ═══ DISC — year contrast fixed ═══ */
.df-row{display:flex;gap:3px;margin-bottom:10px;flex-wrap:wrap}
.df{padding:3px 9px;border-radius:100px;font-size:9px;font-weight:700;border:1px solid var(--bd);background:none;color:var(--t4);cursor:pointer;font-family:var(--fd);transition:.2s}.df:hover{color:var(--t)}.df-on{background:var(--or);border-color:var(--or);color:#fff}
.disc-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px}
.dc{border-radius:8px;overflow:hidden;border:1px solid var(--bd);background:rgba(255,255,255,.02);transition:.2s;cursor:pointer}.dc:hover{transform:translateY(-2px);border-color:rgba(255,255,255,.1)}
.dc-cv{aspect-ratio:1;background:var(--bg2);overflow:hidden;position:relative}.dc-cv img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s}.dc:hover .dc-cv img{transform:scale(1.04)}
.dc-no{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:14px;color:rgba(255,255,255,.03)}
.dc-tp{position:absolute;top:4px;right:4px;font-size:7px;font-weight:800;text-transform:uppercase;padding:2px 4px;border-radius:2px;background:rgba(0,0,0,.6);color:var(--t2)}
.dc-i{padding:7px 8px}
.dc-t{font-family:var(--fd);font-size:11px;font-weight:700;color:var(--t);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dc-y{font-size:10px;color:var(--t2);margin-top:2px;font-weight:600}

/* ═══ BIO + NEWS ═══ */
.two-col{display:grid;grid-template-columns:1fr 320px;gap:28px;align-items:start}
.bio-row-top{margin-bottom:12px}
.bio-chips{display:inline-flex;flex-wrap:wrap;gap:6px;padding:8px 12px;border-radius:8px;background:rgba(255,255,255,.02);border:1px solid var(--bd)}
.bch{display:flex;flex-direction:column;min-width:50px}.bch-v{font-family:var(--fd);font-size:12px;font-weight:800;color:var(--t)}.bch-l{font-size:7px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-top:1px}
.bio{color:var(--t2)!important;font-size:14px;line-height:1.85}
.bio *{color:inherit!important;font-family:inherit!important;font-size:inherit!important}
.bio p{margin-bottom:10px}.bio a{color:var(--or)!important;text-decoration:underline}.bio b,.bio strong{color:var(--t)!important;font-weight:700}
.soc-row{display:flex;flex-wrap:wrap;gap:4px;margin-top:12px}
.soc-a{display:inline-flex;align-items:center;gap:4px;padding:4px 9px;border-radius:100px;border:1px solid var(--bd);background:rgba(255,255,255,.02);text-decoration:none;transition:.2s;font-family:var(--fd)}.soc-a:hover{background:rgba(255,255,255,.05);transform:translateY(-1px)}.soc-a span{font-size:9px;font-weight:700;color:var(--t2)}
.mem-row{display:flex;flex-wrap:wrap;gap:6px}
.mem{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.02);border:1px solid var(--bd);border-radius:8px;padding:5px 9px;text-decoration:none;transition:.2s}.mem:hover{border-color:rgba(255,255,255,.1)}
.mem-img{width:26px;height:26px;border-radius:50%;object-fit:cover;flex-shrink:0;background:var(--bg2)}.mem-ni{display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:900;color:rgba(255,255,255,.05);font-family:var(--fd)}
.mem-name{font-size:10px;font-weight:700;color:var(--t)}.mem-yr{font-size:8px;color:var(--t3)}
.card{border-radius:10px;border:1px solid var(--bd);background:rgba(255,255,255,.02);padding:10px;margin-bottom:8px}
.ni{display:flex;gap:7px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.03);text-decoration:none;transition:opacity .15s}.ni:last-child{border-bottom:none}.ni:hover{opacity:.8}
.ni-img{width:36px;height:36px;border-radius:5px;object-fit:cover;flex-shrink:0;background:var(--bg2)}.ni-t{font-size:10px;font-weight:700;color:var(--t2);line-height:1.25}.ni-d{font-size:8px;color:var(--t3);margin-top:1px}

/* ═══ GALLERY ═══ */
.gal{display:flex;flex-wrap:wrap;gap:3px;border-radius:10px;overflow:hidden}
.gc{position:relative;height:170px;flex:1 1 200px;max-width:33%;overflow:hidden;cursor:zoom-in}
.gc-big{flex:2 1 400px;max-width:50%;height:340px}
.gc img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s}.gc:hover img{transform:scale(1.04)}
.gc-ov{position:absolute;inset:0;background:rgba(0,0,0,0);transition:.2s}.gc:hover .gc-ov{background:rgba(0,0,0,.15)}
.lb{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.95);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center}
.lb-m{max-width:90vw;max-height:90vh;display:flex;flex-direction:column;align-items:center}.lb-m img{max-width:100%;max-height:82vh;object-fit:contain;border-radius:4px}.lb-m p{font-size:10px;color:rgba(255,255,255,.25);margin-top:5px}
.lb-x{position:absolute;top:12px;right:16px;background:rgba(255,255,255,.08);border:none;color:rgba(255,255,255,.5);font-size:14px;cursor:pointer;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.lb-a{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.05);border:none;color:rgba(255,255,255,.4);font-size:26px;cursor:pointer;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center}.lb-p{left:8px}.lb-n{right:8px}
.lb-ct{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);font-size:9px;color:rgba(255,255,255,.15);font-weight:600}

/* Bottom sections */
.disc-empty{border:1px dashed var(--bd);border-radius:10px;padding:24px;text-align:center}
.de-t{font-size:12px;font-weight:700;color:var(--t3);margin-bottom:2px}.de-s{font-size:10px;color:var(--t4)}
.de-btn{margin-top:8px;padding:6px 16px;border-radius:100px;border:1px solid var(--bd);background:rgba(255,255,255,.02);color:var(--t2);font-size:10px;font-weight:700;cursor:pointer;font-family:var(--fd);transition:.2s}.de-btn:hover{background:rgba(255,255,255,.05)}
.sim-row{display:flex;gap:10px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}.sim-row::-webkit-scrollbar{display:none}
.sim-c{flex-shrink:0;width:86px;text-align:center;text-decoration:none;transition:.2s}.sim-c:hover{transform:translateY(-2px)}
.sim-img{width:60px;height:60px;border-radius:50%;object-fit:cover;margin:0 auto 4px;border:2px solid var(--bd);background:var(--bg2)}.sim-ni{display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:900;color:rgba(255,255,255,.04);font-family:var(--fd)}
.sim-n{font-size:9px;font-weight:700;color:var(--t2)}

@media(max-width:1024px){
  .hero-wrap{height:auto;min-height:280px}
  .hero-photo{position:relative;width:100%;height:200px;justify-content:center}
  .hero-photo-fade{display:none}
  .hero{flex-direction:column;align-items:flex-start;padding:16px 24px}
  .hero-left{max-width:100%}
  .mr-box{grid-template-columns:1fr}
  .two-col{grid-template-columns:1fr}
  .srch{display:none}
  .gc{max-width:50%}.gc-big{max-width:100%}
}
@media(max-width:640px){
  .nav{display:none}
  .disc-g{grid-template-columns:repeat(2,1fr)}
  .gc{max-width:100%;height:140px}.gc-big{height:200px}
  .hero-left{padding:12px 16px}
}
`
