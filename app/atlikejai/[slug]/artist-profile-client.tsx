'use client'
import { useState, useEffect } from 'react'
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
const FLAGS: Record<string, string> = { 'Lietuva': '🇱🇹', 'Latvija': '🇱🇻', 'Estija': '🇪🇪', 'Lenkija': '🇵🇱', 'Vokietija': '🇩🇪', 'Prancūzija': '🇫🇷', 'Italija': '🇮🇹', 'Ispanija': '🇪🇸', 'Didžioji Britanija': '🇬🇧', 'JAV': '🇺🇸', 'Kanada': '🇨🇦', 'Australija': '🇦🇺', 'Japonija': '🇯🇵', 'Švedija': '🇸🇪', 'Norvegija': '🇳🇴', 'Danija': '🇩🇰', 'Suomija': '🇫🇮', 'Airija': '🇮🇪', 'Olandija': '🇳🇱', 'Rusija': '🇷🇺', 'Ukraina': '🇺🇦' }
const SOC: Record<string, { l: string; c: string; d: string }> = {
  spotify: { l: 'Spotify', c: '#1DB954', d: 'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.52 17.34c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.1-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.64 1.32.42.18.48.66.3 1.02z' },
  youtube: { l: 'YouTube', c: '#FF0000', d: 'M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.55A3.02 3.02 0 0 0 .5 6.19 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14c1.88.55 9.38.55 9.38.55s7.5 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.81zM9.54 15.57V8.43L15.82 12l-6.28 3.57z' },
  instagram: { l: 'Instagram', c: '#E1306C', d: 'M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.97.24 2.44.41.61.24 1.05.52 1.51.98.46.46.74.9.98 1.51.17.47.36 1.27.41 2.44.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.24 1.97-.41 2.44a4.08 4.08 0 0 1-.98 1.51 4.08 4.08 0 0 1-1.51.98c-.47.17-1.27.36-2.44.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.97-.24-2.44-.41a4.08 4.08 0 0 1-1.51-.98 4.08 4.08 0 0 1-.98-1.51c-.17-.47-.36-1.27-.41-2.44C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85C2.28 6 2.47 5.2 2.64 4.73c.24-.61.52-1.05.98-1.51a4.08 4.08 0 0 1 1.51-.98c.47-.17 1.27-.36 2.44-.41C8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.78.3-1.44.71-2.1 1.37A5.88 5.88 0 0 0 .63 4.14C.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.3.78.71 1.44 1.37 2.1a5.88 5.88 0 0 0 2.14 1.37c.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a6.2 6.2 0 0 0 3.51-3.47c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.88 5.88 0 0 0-1.37-2.14A5.88 5.88 0 0 0 19.86.63C19.1.33 18.22.13 16.95.07 15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8z' },
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
      <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(249,115,22,.15)" /><stop offset="100%" stopColor="rgba(249,115,22,0)" /></linearGradient></defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill="url(#sg)" />
      <polyline points={pts} fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinejoin="round" />
      <text x="0" y={h + 9} fill="rgba(255,255,255,.25)" fontSize="7" fontFamily="var(--fd)" fontWeight="700">{data[0].year}</text>
      <text x={w} y={h + 9} fill="rgba(255,255,255,.25)" fontSize="7" fontFamily="var(--fd)" fontWeight="700" textAnchor="end">{data[data.length - 1].year}</text>
    </svg>
  )
}

function MusicRow({ label, list, playingId, onPlay }: { label: string; list: Track[]; playingId: number | null; onPlay: (id: number) => void }) {
  const [idx, setIdx] = useState(0)
  if (!list.length) return null
  const cur = list[idx]; const vid = yt(cur?.video_url)
  return (
    <div className="ap-mr">
      {label && <div className="ap-mr-lbl">{label}</div>}
      <div className="ap-mr-box">
        <div className="ap-mr-vid">
          {playingId === cur?.id && vid
            ? <iframe src={`https://www.youtube.com/embed/${vid}?autoplay=1&rel=0`} allow="autoplay;encrypted-media" allowFullScreen />
            : <div className="ap-mr-th" onClick={() => vid && onPlay(cur.id)}>
              {vid ? <img src={`https://img.youtube.com/vi/${vid}/hqdefault.jpg`} alt="" /> : <div className="ap-mr-noth" />}
              {vid && <div className="ap-mr-ply"><div className="ap-mr-pb"><svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg></div></div>}
            </div>}
          <div className="ap-mr-cur">{cur.title}</div>
        </div>
        <div className="ap-mr-pl">
          {list.map((t, i) => {
            const v = yt(t.video_url); const th = t.cover_url || (v ? `https://img.youtube.com/vi/${v}/default.jpg` : null)
            return (
              <div key={t.id} className={`ap-pl${idx === i ? ' ap-pla' : ''}`} onClick={() => { setIdx(i); onPlay(-1) }}>
                <span className="ap-pln">{i + 1}</span>
                {th ? <img src={th} className="ap-pli" alt="" /> : <div className="ap-pli ap-plni">♪</div>}
                <div className="ap-plx"><div className="ap-plnm">{t.title}</div></div>
                {v && <div className="ap-plp"><svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg></div>}
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
      <div className="ap-gal">{photos.slice(0, 10).map((p, i) => (
        <div key={i} className={`ap-gc${i === 0 ? ' ap-gcb' : ''}`} onClick={() => setLb(i)}><img src={p.url} alt={p.caption || ''} /><div className="ap-gco" /></div>
      ))}</div>
      {lb !== null && <div className="ap-lb" onClick={() => setLb(null)}>
        <button className="ap-lbx" onClick={e => { e.stopPropagation(); setLb(null) }}>✕</button>
        {lb > 0 && <button className="ap-lba ap-lbp" onClick={e => { e.stopPropagation(); setLb(lb - 1) }}>‹</button>}
        <div className="ap-lbm" onClick={e => e.stopPropagation()}><img src={photos[lb].url} alt="" />{photos[lb].caption && <p>{photos[lb].caption}</p>}</div>
        {lb < photos.length - 1 && <button className="ap-lba ap-lbn" onClick={e => { e.stopPropagation(); setLb(lb + 1) }}>›</button>}
        <div className="ap-lbc">{lb + 1}/{photos.length}</div>
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

  return (
    <>
      <style>{CSS}</style>
      <div className="ap-pg">
        {/* ═══ HERO — cinematic full-bleed ═══ */}
        <div className="ap-hero">
          {heroImage ? (
            <div className="ap-hero-img"><img src={heroImage} alt="" /></div>
          ) : artist.cover_image_url ? (
            <div className="ap-hero-img ap-hero-img-blur"><img src={artist.cover_image_url} alt="" /></div>
          ) : (
            <div className="ap-hero-img ap-hero-fb" />
          )}
          <div className="ap-hero-g1" />
          <div className="ap-hero-g2" />
          <div className={`ap-hero-ct${loaded ? ' ap-hero-in' : ''}`}>
            <div className="ap-hero-main">
              <h1 className="ap-hero-nm">{flag && <span className="ap-hero-fl">{flag}</span>}{artist.name}{artist.is_verified && <span className="ap-hero-vf"><svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg></span>}</h1>
              <div className="ap-hero-row">
                <div className="ap-hero-tags">{genres.map(g => <span key={g.id} className="ap-ht">{g.name}</span>)}</div>
                <button className="ap-hero-lk"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>{likes > 0 ? likes : '0'}</button>
                {solo && members.map(m => <Link key={m.id} href={`/atlikejai/${m.slug}`} className="ap-hero-mem">{m.cover_image_url ? <img src={m.cover_image_url} alt="" /> : <span className="ap-hmfb">{m.name[0]}</span>}<span>{m.name}</span></Link>)}
              </div>
            </div>
            {chartData.length > 5 && <div className="ap-hero-ch"><div className="ap-hcl">Populiarumas</div><Spark data={chartData} /></div>}
          </div>
        </div>

        <div className="ap-ct">
          {/* Events */}
          {events.length > 0 && <section className="ap-s"><div className="ap-st">Artimiausi renginiai</div>
            <div className="ap-evr">{events.map((e: any) => { const d = new Date(e.event_date); const sy = d.getFullYear() !== yr; return (
              <div key={e.id} className="ap-evc"><div className="ap-evd"><div className="ap-evm">{d.toLocaleDateString('lt-LT', { month: 'long' })}{sy ? `, ${d.getFullYear()}` : ''}</div><div className="ap-evdy">{d.getDate()}</div></div><div className="ap-evi"><div className="ap-evt">{e.title}</div><div className="ap-evv">{e.venues?.name || e.venue_custom || ''}{e.venues?.city ? `, ${e.venues.city}` : ''}</div></div></div>
            ) })}</div>
          </section>}

          {/* Music */}
          {(topVideos.length > 0 || newTracks.length > 0) && <section className="ap-s"><div className="ap-st">Muzika</div>
            {hasNewMusic && newTracks.length > 0 && <MusicRow label="Nauja muzika" list={newTracks.slice(0, 6)} playingId={pid} onPlay={setPid} />}
            {topVideos.length > 0 && <MusicRow label={hasNewMusic ? 'Populiariausia' : ''} list={topVideos} playingId={pid} onPlay={setPid} />}
          </section>}

          {/* Discography — albumai su nuorodomis */}
          {albums.length > 0 && <section className="ap-s"><div className="ap-st">Diskografija · {albums.length}</div>
            {atypes.length > 1 && <div className="ap-dfr">{['all', ...atypes].map(t => <button key={t} className={`ap-dft${df === t ? ' ap-dfa' : ''}`} onClick={() => setDf(t)}>{t === 'all' ? 'Visi' : t}</button>)}</div>}
            <div className="ap-dg">{fAlbums.map(a => (
              <Link key={a.id} href={`/lt/albumas/${a.slug}/${a.id}/`} className="ap-dc">
                <div className="ap-dcv">
                  {a.cover_image_url ? <img src={a.cover_image_url} alt={a.title} /> : <div className="ap-dcn">💿</div>}
                  {aType(a) !== 'Albumas' && <span className="ap-dct">{aType(a)}</span>}
                </div>
                <div className="ap-dci"><div className="ap-dctt">{a.title}</div><div className="ap-dcy">{a.year || '—'}</div></div>
              </Link>
            ))}</div>
          </section>}

          {/* Bio + News */}
          {(hasBio || news.length > 0) && <section className="ap-s"><div className="ap-tc">
            <div>
              <div className="ap-bch">{active && <div className="ap-bc"><span className="ap-bcv">{active}</span><span className="ap-bcl">Aktyvumas</span></div>}{solo && age && <div className="ap-bc"><span className="ap-bcv">{age} m.</span><span className="ap-bcl">Amžius</span></div>}{artist.country && <div className="ap-bc"><span className="ap-bcv">{flag} {artist.country}</span><span className="ap-bcl">Šalis</span></div>}{albums.length > 0 && <div className="ap-bc"><span className="ap-bcv">{albums.length}</span><span className="ap-bcl">Albumai</span></div>}{tracks.length > 0 && <div className="ap-bc"><span className="ap-bcv">{tracks.length}+</span><span className="ap-bcl">Dainos</span></div>}</div>
              {hasBio && <><div className="ap-st">Apie</div><div className="ap-bio" dangerouslySetInnerHTML={{ __html: artist.description }} /></>}
              {links.length > 0 && <div className="ap-sr2">{links.map(l => { const p = SOC[l.platform]; return <a key={l.platform} href={l.url} target="_blank" rel="noopener" className="ap-sc">{p && <svg viewBox="0 0 24 24" fill={p.c} width="13" height="13"><path d={p.d} /></svg>}<span>{p?.l || l.platform}</span></a> })}{artist.website && <a href={artist.website} target="_blank" rel="noopener" className="ap-sc"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13" style={{ color: '#5e7290' }}><circle cx="12" cy="12" r="10" /></svg><span>Svetainė</span></a>}</div>}
              {!solo && members.length > 0 && <div style={{ marginTop: 16 }}><div className="ap-st">Nariai · {members.length}</div><div className="ap-mmr">{members.map(m => <Link key={m.id} href={`/atlikejai/${m.slug}`} className="ap-mm">{m.cover_image_url ? <img src={m.cover_image_url} alt={m.name} className="ap-mmi" /> : <div className="ap-mmi ap-mmni">{m.name[0]}</div>}<div><div className="ap-mmn">{m.name}</div><div className="ap-mmy">{m.member_from ? `${m.member_from}–${m.member_until || 'dabar'}` : ''}</div></div></Link>)}</div></div>}
            </div>
            <div>{news.length > 0 && <div className="ap-cd"><div className="ap-st" style={{ marginBottom: 6 }}>Naujienos</div>{news.map(n => <Link key={n.id} href={`/news/${n.slug}`} className="ap-ni">{n.image_small_url ? <img src={n.image_small_url} className="ap-nii" alt="" /> : <div className="ap-nii" />}<div><div className="ap-nit">{n.title}</div><div className="ap-nid">{new Date(n.published_at).toLocaleDateString('lt-LT')}</div></div></Link>)}</div>}</div>
          </div></section>}

          {/* Gallery */}
          {photos.length > 0 && <section className="ap-s"><div className="ap-st">Galerija · {photos.length}</div><Gallery photos={photos} /></section>}

          {/* Discussions */}
          <section className="ap-s"><div className="ap-st">Diskusijos</div><div className="ap-de"><div className="ap-det">Dar nėra diskusijų apie {artist.name}</div><div className="ap-des">Būk pirmas — pradėk diskusiją!</div><button className="ap-deb">+ Nauja diskusija</button></div></section>

          {/* Similar */}
          {similar.length > 0 && <section className="ap-s ap-slast"><div className="ap-st">Panaši muzika</div><div className="ap-smr">{similar.map((a: any) => <Link key={a.id} href={`/atlikejai/${a.slug}`} className="ap-smc">{a.cover_image_url ? <img src={a.cover_image_url} alt={a.name} className="ap-smi" /> : <div className="ap-smi ap-smni">{a.name[0]}</div>}<div className="ap-smn">{a.name}</div></Link>)}</div></section>}
        </div>
      </div>
    </>
  )
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=DM+Sans:ital,wght@0,400;0,500;0,700;1,400&display=swap');

.ap-pg{background:#080c12;color:#f0f2f5;font-family:'DM Sans',system-ui,sans-serif;-webkit-font-smoothing:antialiased;min-height:100vh}
.ap-ct{max-width:1400px;margin:0 auto;padding:0 24px}
.ap-s{padding-top:24px}.ap-slast{padding-bottom:48px}
.ap-st{font-family:'Outfit',system-ui,sans-serif;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.14em;color:#334058;margin-bottom:12px;display:flex;align-items:center;gap:10px}.ap-st::after{content:'';flex:1;height:1px;background:rgba(255,255,255,.06)}

/* ═══ HERO ═══ */
.ap-hero{position:relative;height:380px;overflow:hidden}
.ap-hero-img{position:absolute;inset:0}
.ap-hero-img img{width:100%;height:100%;object-fit:cover;object-position:center 20%;display:block;animation:apHeroZoom 20s ease-in-out infinite alternate}
.ap-hero-img-blur img{filter:blur(40px) brightness(.2) saturate(1.3);transform:scale(1.4);animation:none}
.ap-hero-fb{position:absolute;inset:0;background:linear-gradient(135deg,#0f1825 0%,#080c12 50%,rgba(249,115,22,.03) 100%)}
@keyframes apHeroZoom{0%{transform:scale(1)}100%{transform:scale(1.05)}}
.ap-hero-g1{position:absolute;inset:0;background:linear-gradient(to top,#080c12 0%,rgba(8,12,18,.85) 30%,rgba(8,12,18,.4) 60%,rgba(8,12,18,.2) 100%)}
.ap-hero-g2{position:absolute;inset:0;background:linear-gradient(to right,rgba(8,12,18,.6) 0%,transparent 50%)}
.ap-hero-ct{position:relative;max-width:1400px;margin:0 auto;height:100%;display:flex;align-items:flex-end;justify-content:space-between;padding:0 24px 28px;gap:20px;opacity:0;transform:translateY(12px);transition:opacity .6s,transform .6s}
.ap-hero-in{opacity:1;transform:translateY(0)}
.ap-hero-main{flex:1;min-width:0}
.ap-hero-nm{font-family:'Outfit',system-ui,sans-serif;font-size:clamp(2rem,5vw,3.5rem);font-weight:900;line-height:1.05;letter-spacing:-.04em;color:#fff;margin-bottom:10px;text-shadow:0 2px 20px rgba(0,0,0,.4)}
.ap-hero-fl{margin-right:6px;font-size:.65em;vertical-align:middle}
.ap-hero-vf{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;background:#3b82f6;border-radius:50%;margin-left:6px;vertical-align:middle}
.ap-hero-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.ap-hero-tags{display:contents}
.ap-ht{font-size:10px;font-weight:700;color:rgba(255,255,255,.7);background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:100px;padding:3px 10px;font-family:'Outfit',system-ui,sans-serif;backdrop-filter:blur(4px)}
.ap-hero-lk{display:inline-flex;align-items:center;gap:4px;padding:5px 12px;border-radius:100px;border:1px solid rgba(249,115,22,.25);font-size:11px;font-weight:800;cursor:pointer;font-family:'Outfit',system-ui,sans-serif;background:rgba(249,115,22,.1);color:#f97316;transition:.2s;backdrop-filter:blur(4px)}.ap-hero-lk:hover{background:rgba(249,115,22,.2)}.ap-hero-lk svg{width:11px;height:11px}
.ap-hero-mem{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:100px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.06);text-decoration:none;font-size:10px;font-weight:700;color:#fff;font-family:'Outfit',system-ui,sans-serif;backdrop-filter:blur(4px);transition:.2s}.ap-hero-mem:hover{background:rgba(255,255,255,.12)}
.ap-hero-mem img{width:18px;height:18px;border-radius:50%;object-fit:cover}.ap-hmfb{width:18px;height:18px;border-radius:50%;background:rgba(255,255,255,.1);display:inline-flex;align-items:center;justify-content:center;font-size:7px}
.ap-hero-ch{background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px 12px 2px;backdrop-filter:blur(8px);flex-shrink:0}
.ap-hcl{font-size:7px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,.25);font-family:'Outfit',system-ui,sans-serif;margin-bottom:2px}

/* Events */
.ap-evr{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}.ap-evr::-webkit-scrollbar{display:none}
.ap-evc{flex-shrink:0;display:flex;gap:12px;align-items:center;border-radius:12px;border:1px solid rgba(249,115,22,.12);background:rgba(249,115,22,.03);padding:14px 18px;cursor:pointer;transition:.2s;min-width:220px}.ap-evc:hover{border-color:rgba(249,115,22,.22);background:rgba(249,115,22,.06)}
.ap-evd{text-align:center;min-width:40px;background:rgba(249,115,22,.1);border-radius:8px;padding:5px 4px}
.ap-evm{font-size:9px;font-weight:700;color:#f97316;text-transform:capitalize;line-height:1.2}
.ap-evdy{font-size:20px;font-weight:900;color:#fff;font-family:'Outfit',system-ui,sans-serif;line-height:1}
.ap-evi{flex:1;min-width:0}.ap-evt{font-size:13px;font-weight:700;color:#fff;line-height:1.2}.ap-evv{font-size:11px;color:#b0bdd4;margin-top:2px}

/* Music */
.ap-mr{margin-bottom:14px}
.ap-mr-lbl{font-family:'Outfit',system-ui,sans-serif;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:#f97316;margin-bottom:6px}
.ap-mr-box{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.25)}
.ap-mr-vid{background:#000}.ap-mr-vid iframe{width:100%;aspect-ratio:16/9;border:none;display:block}
.ap-mr-th{position:relative;aspect-ratio:16/9;overflow:hidden;cursor:pointer}.ap-mr-th img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s}.ap-mr-th:hover img{transform:scale(1.03)}
.ap-mr-noth{width:100%;aspect-ratio:16/9;background:#111}
.ap-mr-ply{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.ap-mr-pb{width:48px;height:48px;border-radius:50%;background:rgba(249,115,22,.85);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(249,115,22,.35);transition:.15s}.ap-mr-th:hover .ap-mr-pb{transform:scale(1.1)}
.ap-mr-cur{padding:7px 12px;font-size:12px;font-weight:800;color:#f0f2f5;background:rgba(249,115,22,.03);border-top:1px solid rgba(249,115,22,.04)}
.ap-mr-pl{max-height:340px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.05) transparent}
.ap-pl{display:flex;align-items:center;gap:8px;padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);cursor:pointer;transition:.12s}.ap-pl:last-child{border-bottom:none}.ap-pl:hover{background:rgba(255,255,255,.03)}
.ap-pla{background:rgba(249,115,22,.05)!important}
.ap-pln{width:16px;font-size:10px;font-weight:600;color:#334058;text-align:center;flex-shrink:0;font-family:'Outfit',system-ui,sans-serif}.ap-pla .ap-pln{color:#f97316}
.ap-pli{width:34px;height:34px;border-radius:4px;object-fit:cover;flex-shrink:0;background:#111822}.ap-plni{display:flex;align-items:center;justify-content:center;font-size:10px;color:rgba(255,255,255,.05)}
.ap-plx{flex:1;min-width:0}.ap-plnm{font-size:12px;font-weight:700;color:#b0bdd4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ap-pla .ap-plnm{color:#f97316}
.ap-plp{width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;color:#334058;flex-shrink:0}.ap-pla .ap-plp{background:#f97316;color:#fff}

/* Discography */
.ap-dfr{display:flex;gap:3px;margin-bottom:10px;flex-wrap:wrap}
.ap-dft{padding:3px 9px;border-radius:100px;font-size:9px;font-weight:700;border:1px solid rgba(255,255,255,.06);background:none;color:#334058;cursor:pointer;font-family:'Outfit',system-ui,sans-serif;transition:.2s}.ap-dft:hover{color:#f0f2f5}.ap-dfa{background:#f97316;border-color:#f97316;color:#fff}
.ap-dg{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px}
.ap-dc{border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.02);transition:.2s;cursor:pointer;text-decoration:none;display:block}.ap-dc:hover{transform:translateY(-2px);border-color:rgba(255,255,255,.1)}
.ap-dcv{aspect-ratio:1;background:#111822;overflow:hidden;position:relative}.ap-dcv img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s}.ap-dc:hover .ap-dcv img{transform:scale(1.04)}
.ap-dcn{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:14px;color:rgba(255,255,255,.03)}
.ap-dct{position:absolute;top:4px;right:4px;font-size:7px;font-weight:800;text-transform:uppercase;padding:2px 4px;border-radius:2px;background:rgba(0,0,0,.6);color:#b0bdd4}
.ap-dci{padding:7px 8px}.ap-dctt{font-family:'Outfit',system-ui,sans-serif;font-size:11px;font-weight:700;color:#f0f2f5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ap-dcy{font-size:10px;color:#b0bdd4;margin-top:2px;font-weight:600}

/* Bio */
.ap-tc{display:grid;grid-template-columns:1fr 320px;gap:28px;align-items:start}
.ap-bch{display:inline-flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;padding:8px 12px;border-radius:8px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06)}
.ap-bc{display:flex;flex-direction:column;min-width:50px}.ap-bcv{font-family:'Outfit',system-ui,sans-serif;font-size:12px;font-weight:800;color:#f0f2f5}.ap-bcl{font-size:7px;font-weight:700;color:#5e7290;text-transform:uppercase;letter-spacing:.05em;margin-top:1px}
.ap-bio{color:#b0bdd4!important;font-size:14px;line-height:1.85}.ap-bio *{color:inherit!important;font-family:inherit!important;font-size:inherit!important}.ap-bio p{margin-bottom:10px}.ap-bio a{color:#f97316!important;text-decoration:underline}.ap-bio b,.ap-bio strong{color:#f0f2f5!important;font-weight:700}
.ap-sr2{display:flex;flex-wrap:wrap;gap:4px;margin-top:12px}
.ap-sc{display:inline-flex;align-items:center;gap:4px;padding:4px 9px;border-radius:100px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.02);text-decoration:none;transition:.2s;font-family:'Outfit',system-ui,sans-serif}.ap-sc:hover{background:rgba(255,255,255,.05);transform:translateY(-1px)}.ap-sc span{font-size:9px;font-weight:700;color:#b0bdd4}
.ap-mmr{display:flex;flex-wrap:wrap;gap:6px}
.ap-mm{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:5px 9px;text-decoration:none;transition:.2s}.ap-mm:hover{border-color:rgba(255,255,255,.1)}
.ap-mmi{width:26px;height:26px;border-radius:50%;object-fit:cover;flex-shrink:0;background:#111822}.ap-mmni{display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:900;color:rgba(255,255,255,.05);font-family:'Outfit',system-ui,sans-serif}
.ap-mmn{font-size:10px;font-weight:700;color:#f0f2f5}.ap-mmy{font-size:8px;color:#5e7290}
.ap-cd{border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.02);padding:10px;margin-bottom:8px}
.ap-ni{display:flex;gap:7px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.03);text-decoration:none;transition:opacity .15s}.ap-ni:last-child{border-bottom:none}.ap-ni:hover{opacity:.8}
.ap-nii{width:36px;height:36px;border-radius:5px;object-fit:cover;flex-shrink:0;background:#111822}.ap-nit{font-size:10px;font-weight:700;color:#b0bdd4;line-height:1.25}.ap-nid{font-size:8px;color:#5e7290;margin-top:1px}

/* Gallery */
.ap-gal{display:flex;flex-wrap:wrap;gap:3px;border-radius:10px;overflow:hidden}
.ap-gc{position:relative;height:170px;flex:1 1 200px;max-width:33%;overflow:hidden;cursor:zoom-in}.ap-gcb{flex:2 1 400px;max-width:50%;height:340px}
.ap-gc img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s}.ap-gc:hover img{transform:scale(1.04)}
.ap-gco{position:absolute;inset:0;background:rgba(0,0,0,0);transition:.2s}.ap-gc:hover .ap-gco{background:rgba(0,0,0,.15)}
.ap-lb{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.95);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center}
.ap-lbm{max-width:90vw;max-height:90vh;display:flex;flex-direction:column;align-items:center}.ap-lbm img{max-width:100%;max-height:82vh;object-fit:contain;border-radius:4px}.ap-lbm p{font-size:10px;color:rgba(255,255,255,.25);margin-top:5px}
.ap-lbx{position:absolute;top:12px;right:16px;background:rgba(255,255,255,.08);border:none;color:rgba(255,255,255,.5);font-size:14px;cursor:pointer;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.ap-lba{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.05);border:none;color:rgba(255,255,255,.4);font-size:26px;cursor:pointer;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center}.ap-lbp{left:8px}.ap-lbn{right:8px}
.ap-lbc{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);font-size:9px;color:rgba(255,255,255,.15);font-weight:600}

.ap-de{border:1px dashed rgba(255,255,255,.06);border-radius:10px;padding:24px;text-align:center}.ap-det{font-size:12px;font-weight:700;color:#5e7290;margin-bottom:2px}.ap-des{font-size:10px;color:#334058}
.ap-deb{margin-top:8px;padding:6px 16px;border-radius:100px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.02);color:#b0bdd4;font-size:10px;font-weight:700;cursor:pointer;font-family:'Outfit',system-ui,sans-serif;transition:.2s}.ap-deb:hover{background:rgba(255,255,255,.05)}
.ap-smr{display:flex;gap:10px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}.ap-smr::-webkit-scrollbar{display:none}
.ap-smc{flex-shrink:0;width:86px;text-align:center;text-decoration:none;transition:.2s}.ap-smc:hover{transform:translateY(-2px)}
.ap-smi{width:60px;height:60px;border-radius:50%;object-fit:cover;margin:0 auto 4px;border:2px solid rgba(255,255,255,.06);background:#111822}.ap-smni{display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:900;color:rgba(255,255,255,.04);font-family:'Outfit',system-ui,sans-serif}
.ap-smn{font-size:9px;font-weight:700;color:#b0bdd4}

@media(max-width:1024px){.ap-mr-box{grid-template-columns:1fr}.ap-tc{grid-template-columns:1fr}.ap-gc{max-width:50%}.ap-gcb{max-width:100%}.ap-hero{height:320px}}
@media(max-width:640px){.ap-dg{grid-template-columns:repeat(2,1fr)}.ap-gc{max-width:100%;height:140px}.ap-gcb{height:200px}.ap-hero{height:280px}.ap-hero-nm{font-size:1.8rem}}
`
