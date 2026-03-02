'use client'
import { useState } from 'react'
import Link from 'next/link'
import { HeaderAuth } from '@/components/HeaderAuth'

type Genre = { id: number; name: string }
type Album = { id: number; slug: string; title: string; year?: number; month?: number; cover_image_url?: string; type_studio?: boolean; type_ep?: boolean; type_single?: boolean; type_live?: boolean; type_compilation?: boolean; type_remix?: boolean; type_soundtrack?: boolean; type_demo?: boolean }
type Track = { id: number; slug: string; title: string; type?: string; video_url?: string; cover_url?: string; lyrics?: string }
type Member = { id: number; slug: string; name: string; cover_image_url?: string; member_from?: number; member_until?: number }
type ChartPt = { year: number; value: number }

type Props = {
  artist: any; heroImage: string | null; genres: Genre[]; links: { platform: string; url: string }[]; photos: { url: string; caption?: string }[]
  albums: Album[]; tracks: Track[]; members: Member[]; followers: number; likeCount: number
  news: any[]; events: any[]; similar: any[]; newTracks: Track[]; newAlbums: Album[]; topVideos: Track[]
  chartData: ChartPt[]; hasNewMusic: boolean
}

const yt = (u?: string | null) => { if (!u) return null; const m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/); return m ? m[1] : null }
const aType = (a: Album) => { if (a.type_ep) return 'EP'; if (a.type_single) return 'Singlas'; if (a.type_live) return 'Live'; if (a.type_compilation) return 'Rinkinys'; if (a.type_remix) return 'Remix'; if (a.type_soundtrack) return 'OST'; if (a.type_demo) return 'Demo'; return 'Albumas' }
const FLAGS: Record<string, string> = { 'Lietuva': '🇱🇹', 'Latvija': '🇱🇻', 'Estija': '🇪🇪', 'Lenkija': '🇵🇱', 'Vokietija': '🇩🇪', 'Prancūzija': '🇫🇷', 'Italija': '🇮🇹', 'Ispanija': '🇪🇸', 'Olandija': '🇳🇱', 'Švedija': '🇸🇪', 'Norvegija': '🇳🇴', 'Danija': '🇩🇰', 'Suomija': '🇫🇮', 'Airija': '🇮🇪', 'Didžioji Britanija': '🇬🇧', 'JAV': '🇺🇸', 'Kanada': '🇨🇦', 'Australija': '🇦🇺', 'Japonija': '🇯🇵' }
const SOC: Record<string, { l: string; c: string; d: string }> = {
  spotify: { l: 'Spotify', c: '#1DB954', d: 'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.52 17.34c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.1-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.64 1.32.42.18.48.66.3 1.02z' },
  youtube: { l: 'YouTube', c: '#FF0000', d: 'M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.55A3.02 3.02 0 0 0 .5 6.19 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14c1.88.55 9.38.55 9.38.55s7.5 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.81zM9.54 15.57V8.43L15.82 12l-6.28 3.57z' },
  instagram: { l: 'Instagram', c: '#E1306C', d: 'M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.97.24 2.44.41.61.24 1.05.52 1.51.98.46.46.74.9.98 1.51.17.47.36 1.27.41 2.44.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.24 1.97-.41 2.44a4.08 4.08 0 0 1-.98 1.51 4.08 4.08 0 0 1-1.51.98c-.47.17-1.27.36-2.44.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.97-.24-2.44-.41a4.08 4.08 0 0 1-1.51-.98 4.08 4.08 0 0 1-.98-1.51c-.17-.47-.36-1.27-.41-2.44C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.24-1.97.41-2.44.24-.61.52-1.05.98-1.51a4.08 4.08 0 0 1 1.51-.98c.47-.17 1.27-.36 2.44-.41C8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.78.3-1.44.71-2.1 1.37A5.88 5.88 0 0 0 .63 4.14C.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.3.78.71 1.44 1.37 2.1a5.88 5.88 0 0 0 2.14 1.37c.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a6.2 6.2 0 0 0 3.51-3.47c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.88 5.88 0 0 0-1.37-2.14A5.88 5.88 0 0 0 19.86.63C19.1.33 18.22.13 16.95.07 15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8z' },
  tiktok: { l: 'TikTok', c: '#00f2ea', d: 'M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.96-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z' },
  facebook: { l: 'Facebook', c: '#1877F2', d: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z' },
  twitter: { l: 'X', c: '#fff', d: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' },
  soundcloud: { l: 'SoundCloud', c: '#FF5500', d: 'M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.27-2.154c-.009-.06-.05-.1-.084-.1z' },
  bandcamp: { l: 'Bandcamp', c: '#629aa9', d: 'M0 18.75l7.437-13.5H24l-7.438 13.5H0z' },
}
const NAV = ['Topai', 'Muzika', 'Renginiai', 'Atlikėjai', 'Bendruomenė']

function Spark({ data, w = 180, h = 40 }: { data: ChartPt[]; w?: number; h?: number }) {
  if (data.length < 3) return null
  const max = Math.max(...data.map(d => d.value)); const min = Math.min(...data.map(d => d.value)); const r = max - min || 1
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * w},${h - ((d.value - min) / r) * (h - 6) - 3}`).join(' ')
  const first = data[0]; const last = data[data.length - 1]
  return (
    <div style={{ position: 'relative' }}>
      <svg width={w} height={h + 16} viewBox={`0 0 ${w} ${h + 16}`}>
        <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(249,115,22,.25)" /><stop offset="100%" stopColor="rgba(249,115,22,0)" /></linearGradient></defs>
        <polygon points={`0,${h} ${pts} ${w},${h}`} fill="url(#sg)" />
        <polyline points={pts} fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinejoin="round" />
        <text x="0" y={h + 12} fill="#334058" fontSize="8" fontFamily="var(--fd)" fontWeight="700">{first.year}</text>
        <text x={w} y={h + 12} fill="#334058" fontSize="8" fontFamily="var(--fd)" fontWeight="700" textAnchor="end">{last.year}</text>
      </svg>
    </div>
  )
}

function Gallery({ photos }: { photos: { url: string; caption?: string }[] }) {
  const [lb, setLb] = useState<number | null>(null); const [all, setAll] = useState(false)
  if (!photos.length) return null; const N = 7; const shown = all ? photos : photos.slice(0, N); const extra = photos.length - N
  return (
    <>
      <div className="gal">{shown.map((p, i) => (
        <div key={i} className={`gal-c${i === 0 ? ' gal-big' : ''}`} onClick={() => setLb(i)}>
          <img src={p.url} alt={p.caption || ''} />
          <div className="gal-ov"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg></div>
          {!all && i === N - 1 && extra > 0 && <div className="gal-more" onClick={e => { e.stopPropagation(); setAll(true) }}><span>+{extra}</span></div>}
        </div>
      ))}</div>
      {all && extra > 0 && <button className="gal-less" onClick={() => setAll(false)}>↑ Mažiau</button>}
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

// ── Video Card ──────────────────────────────────────────────────────────
function VideoCard({ track, isPlaying, onPlay }: { track: Track; isPlaying: boolean; onPlay: () => void }) {
  const v = yt(track.video_url); const th = track.cover_url || (v ? `https://img.youtube.com/vi/${v}/mqdefault.jpg` : null)
  return (
    <div className="vc">
      {isPlaying && v ? <iframe src={`https://www.youtube.com/embed/${v}?autoplay=1&rel=0`} allow="autoplay;encrypted-media" allowFullScreen className="vc-iframe" />
        : <div className="vc-thumb" onClick={onPlay}>{th ? <img src={th} alt={track.title} /> : <div className="vc-no" />}
          {v && <div className="vc-play"><div className="vc-btn"><svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg></div></div>}</div>}
      <div className="vc-info"><div className="vc-title">{track.title}</div></div>
    </div>
  )
}

export default function ArtistProfileClient({
  artist, heroImage, genres, links, photos, albums, tracks, members, followers, likeCount, news, events, similar, newTracks, newAlbums, topVideos, chartData, hasNewMusic
}: Props) {
  const [playingId, setPlayingId] = useState<number | null>(null)
  const [discFilter, setDiscFilter] = useState('all')
  const [musicTab, setMusicTab] = useState<'new' | 'top'>(hasNewMusic ? 'new' : 'top')

  const flag = FLAGS[artist.country] || (artist.country ? '🌍' : '')
  const hasBio = artist.description && artist.description.trim().length > 10
  const isSolo = artist.type === 'solo'
  const age = isSolo && artist.birth_date ? Math.floor((Date.now() - new Date(artist.birth_date).getTime()) / 31557600000) : null
  const activeYears = artist.active_from ? `${artist.active_from} – ${artist.active_until || 'dabar'}` : null
  const totalLikes = likeCount + followers
  const albumTypes = [...new Set(albums.map(aType))]
  const filteredAlbums = discFilter === 'all' ? albums : albums.filter(a => aType(a) === discFilter)
  const nextEvt = events[0] || null
  const curTracks = musicTab === 'new' ? [...newTracks, ...topVideos.filter(t => !newTracks.some(nt => nt.id === t.id))].slice(0, 8) : topVideos

  return (
    <>
      <style>{`
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=DM+Sans:ital,wght@0,400;0,500;0,700;1,400&display=swap');
:root{--bg:#090d13;--bg2:#111822;--t:#f0f2f5;--t2:#b0bdd4;--t3:#5e7290;--t4:#334058;--bd:rgba(255,255,255,.06);--bd2:rgba(255,255,255,.03);--or:#f97316;--bl:#3b82f6;--cd:rgba(255,255,255,.025);--fd:'Outfit',system-ui,sans-serif;--fb:'DM Sans',system-ui,sans-serif}
*{box-sizing:border-box}.pg{background:var(--bg);color:var(--t);font-family:var(--fb);-webkit-font-smoothing:antialiased;min-height:100vh}

/* Header */
.hd{position:sticky;top:0;z-index:50;background:rgba(9,13,19,.94);backdrop-filter:blur(20px);border-bottom:1px solid var(--bd2)}
.hd-i{max-width:1400px;margin:0 auto;padding:0 24px;height:54px;display:flex;align-items:center;gap:20px}
.hd-logo{font-family:var(--fd);font-size:21px;font-weight:900;letter-spacing:-.03em;text-decoration:none}.hd-logo b{color:#f2f4f8}.hd-logo i{color:#fb923c;font-style:normal}
.hd-s{flex:1;max-width:380px;height:34px;border-radius:100px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.07);overflow:hidden;display:flex;align-items:center}
.hd-s input{flex:1;padding:0 14px;font-size:12px;background:none;border:none;outline:none;color:var(--t2);font-family:var(--fb)}.hd-s input::placeholder{color:var(--t4)}
.hd-n{display:flex;gap:1px;margin-left:auto}.hd-n a{padding:5px 12px;font-size:11px;font-weight:600;color:var(--t3);border-radius:5px;text-decoration:none;font-family:var(--fd);transition:.15s}.hd-n a:hover{color:var(--t);background:rgba(255,255,255,.05)}.hd-n a.on{color:var(--or)}

/* HERO */
.hero{position:relative;overflow:hidden}
.hero-bg{position:absolute;inset:0}
.hero-bg>img{width:100%;height:100%;object-fit:cover;object-position:center 25%}
.hero-blur{position:absolute;inset:0}.hero-blur img{width:100%;height:100%;object-fit:cover;filter:blur(50px) brightness(.25) saturate(1.3);transform:scale(1.5)}
.hero-fb{position:absolute;inset:0;background:linear-gradient(135deg,#0f1825,#090d13 50%,rgba(249,115,22,.02))}
.hero-dim{position:absolute;inset:0;background:linear-gradient(to bottom,rgba(9,13,19,.1) 0%,rgba(9,13,19,.85) 70%,var(--bg) 100%)}
.hero-ct{position:relative;max-width:1400px;margin:0 auto;display:flex;align-items:flex-end;gap:0;min-height:380px;padding:0 24px 32px}
.hero.no-img .hero-ct{min-height:280px;padding-top:48px}

/* Hero left */
.hero-left{flex:1;min-width:0;padding-bottom:4px}
.hero-row1{display:flex;align-items:center;gap:6px;margin-bottom:6px}
.hero-flag{font-size:16px}
.hero-name{font-family:var(--fd);font-size:clamp(2rem,5vw,3.5rem);font-weight:900;line-height:1.05;letter-spacing:-.04em;color:#fff;margin-bottom:8px}
.hero-vf{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;background:var(--bl);border-radius:50%;margin-left:5px;vertical-align:middle}
.hero-tags{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px}
.hero-tag{font-size:10px;font-weight:700;color:var(--t2);background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.09);border-radius:100px;padding:3px 10px;font-family:var(--fd)}
.hero-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.hero-like{display:inline-flex;align-items:center;gap:4px;padding:6px 16px;border-radius:100px;border:1px solid rgba(249,115,22,.3);font-size:11px;font-weight:800;cursor:pointer;font-family:var(--fd);background:rgba(249,115,22,.12);color:var(--or);transition:.2s;backdrop-filter:blur(4px)}
.hero-like:hover{background:rgba(249,115,22,.22);border-color:rgba(249,115,22,.5)}
.hero-like svg{width:12px;height:12px}

/* Hero right: chart + event */
.hero-right{flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:10px;padding-bottom:4px}
.hero-chart{background:rgba(255,255,255,.03);border:1px solid var(--bd);border-radius:12px;padding:10px 14px 4px}
.hero-chart-lbl{font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--t4);font-family:var(--fd);margin-bottom:4px}
.hero-evt{background:rgba(249,115,22,.06);border:1px solid rgba(249,115,22,.15);border-radius:12px;padding:10px 14px;display:flex;gap:10px;align-items:center;max-width:260px;backdrop-filter:blur(4px)}
.hero-evt-badge{font-size:7px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--or);margin-bottom:2px;font-family:var(--fd)}
.he-d{text-align:center;min-width:34px}.he-mo{font-size:8px;font-weight:800;text-transform:uppercase;color:var(--or);letter-spacing:.05em}.he-day{font-size:15px;font-weight:900;color:#fff;font-family:var(--fd);line-height:1}
.he-t{font-size:11px;font-weight:700;color:var(--t);line-height:1.25}.he-v{font-size:9px;color:var(--t4);margin-top:1px}

/* Section */
.w{max-width:1400px;margin:0 auto;padding-left:24px;padding-right:24px}
.st{font-family:var(--fd);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.14em;color:var(--t4);margin-bottom:14px;display:flex;align-items:center;gap:10px}
.st::after{content:'';flex:1;height:1px;background:var(--bd)}

/* MUSIC TABS */
.mus{padding-top:28px}
.mus-tabs{display:flex;gap:2px;margin-bottom:16px}
.mus-tab{padding:6px 16px;border-radius:100px;font-size:11px;font-weight:800;border:1px solid var(--bd);background:none;color:var(--t3);cursor:pointer;font-family:var(--fd);transition:.2s}
.mus-tab:hover{color:var(--t)}.mus-tab.on{background:var(--or);border-color:var(--or);color:#fff}
.mus-layout{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.mus-featured{grid-column:1}
.mus-list{grid-column:2;display:grid;grid-template-columns:1fr 1fr;gap:8px;align-content:start}

/* Video card */
.vc{border-radius:10px;overflow:hidden;border:1px solid var(--bd);background:rgba(0,0,0,.3);transition:.2s;cursor:pointer}
.vc:hover{border-color:rgba(255,255,255,.1);box-shadow:0 8px 24px rgba(0,0,0,.3)}
.vc iframe,.vc-iframe{width:100%;aspect-ratio:16/9;border:none;display:block}
.vc-thumb{position:relative;aspect-ratio:16/9;overflow:hidden;background:#000}
.vc-thumb img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s}.vc-thumb:hover img{transform:scale(1.03)}
.vc-no{width:100%;height:100%;background:#111}
.vc-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.vc-btn{width:44px;height:44px;border-radius:50%;background:rgba(249,115,22,.85);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(249,115,22,.3);transition:.15s}
.vc-thumb:hover .vc-btn{transform:scale(1.08)}
.vc-info{padding:8px 10px}
.vc-title{font-size:11px;font-weight:700;color:var(--t);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mus-featured .vc{border-radius:14px}.mus-featured .vc-btn{width:56px;height:56px}
.mus-featured .vc-title{font-size:13px}

/* DISCOGRAPHY */
.disc{padding-top:28px}
.disc-f{display:flex;gap:3px;margin-bottom:12px;flex-wrap:wrap}
.df{padding:4px 10px;border-radius:100px;font-size:9px;font-weight:700;border:1px solid var(--bd);background:none;color:var(--t4);cursor:pointer;font-family:var(--fd);transition:.2s}.df:hover{color:var(--t)}.df.on{background:var(--or);border-color:var(--or);color:#fff}
.disc-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}
.dc{border-radius:8px;overflow:hidden;border:1px solid var(--bd);background:var(--cd);transition:.2s;cursor:pointer}
.dc:hover{transform:translateY(-2px);border-color:rgba(255,255,255,.1);box-shadow:0 6px 20px rgba(0,0,0,.25)}
.dc-cv{aspect-ratio:1;background:var(--bg2);overflow:hidden;position:relative}.dc-cv img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s}.dc:hover .dc-cv img{transform:scale(1.04)}
.dc-no{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:18px;color:rgba(255,255,255,.04)}
.dc-tp{position:absolute;top:5px;right:5px;font-size:7px;font-weight:800;text-transform:uppercase;padding:2px 5px;border-radius:3px;background:rgba(0,0,0,.6);color:var(--t2);backdrop-filter:blur(4px)}
.dc-i{padding:7px 8px}.dc-t{font-family:var(--fd);font-size:11px;font-weight:700;color:var(--t);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dc-y{font-size:9px;color:var(--t4);margin-top:1px}

/* EVENTS */
.evts{padding-top:28px}
.evts-row{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.evts-row::-webkit-scrollbar{display:none}
.evt-card{flex-shrink:0;width:220px;border-radius:12px;border:1px solid rgba(249,115,22,.12);background:rgba(249,115,22,.03);padding:14px;transition:.2s;cursor:pointer}
.evt-card:hover{border-color:rgba(249,115,22,.25);background:rgba(249,115,22,.06)}
.evt-top{display:flex;gap:10px;align-items:flex-start;margin-bottom:8px}
.evt-dd{text-align:center;min-width:38px;background:rgba(249,115,22,.1);border-radius:8px;padding:5px 4px}
.evt-mm{font-size:8px;font-weight:800;text-transform:uppercase;color:var(--or);letter-spacing:.05em}.evt-d{font-size:17px;font-weight:900;color:#fff;font-family:var(--fd);line-height:1}
.evt-tt{font-size:12px;font-weight:700;color:var(--t);line-height:1.25}.evt-vv{font-size:10px;color:var(--t4);margin-top:2px}

/* TWO COL: Bio + Sidebar */
.mid{padding-top:28px}
.mid-g{display:grid;grid-template-columns:1fr 360px;gap:32px;align-items:start}

/* Bio */
.bio{color:var(--t2)!important;font-size:14px;line-height:1.85}
.bio *{color:inherit!important;font-family:inherit!important;font-size:inherit!important}
.bio p{margin-bottom:12px}.bio a{color:var(--or)!important;text-decoration:underline}.bio b,.bio strong{color:var(--t)!important;font-weight:700}.bio div{margin-bottom:6px}
.bio-meta{display:inline-flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;padding:10px 14px;border-radius:10px;background:rgba(255,255,255,.025);border:1px solid var(--bd)}
.bio-m{display:flex;flex-direction:column;min-width:60px}.bio-mv{font-family:var(--fd);font-size:14px;font-weight:800;color:var(--t)}.bio-ml{font-size:8px;font-weight:700;color:var(--t4);text-transform:uppercase;letter-spacing:.06em;margin-top:1px}

.socials{display:flex;flex-wrap:wrap;gap:5px;margin-top:14px}
.soc{display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border-radius:100px;border:1px solid var(--bd);background:rgba(255,255,255,.02);text-decoration:none;transition:.2s;font-family:var(--fd)}
.soc:hover{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.1);transform:translateY(-1px)}
.soc svg{width:12px;height:12px}.soc span{font-size:10px;font-weight:700;color:var(--t2)}

.mems{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.mem{display:flex;align-items:center;gap:7px;background:var(--cd);border:1px solid var(--bd);border-radius:10px;padding:7px 10px;text-decoration:none;transition:.2s}
.mem:hover{border-color:rgba(255,255,255,.1);background:rgba(255,255,255,.04)}
.mem-img{width:30px;height:30px;border-radius:50%;object-fit:cover;flex-shrink:0;background:var(--bg2)}
.mem-noimg{display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:rgba(255,255,255,.07);font-family:var(--fd)}
.mem-n{font-size:11px;font-weight:700;color:var(--t)}.mem-y{font-size:9px;color:var(--t4);margin-top:0}

/* Sidebar */
.sc{border-radius:12px;border:1px solid var(--bd);background:var(--cd);padding:12px;margin-bottom:10px}
.ni{display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--bd2);text-decoration:none;transition:opacity .15s}.ni:last-child{border-bottom:none}.ni:hover{opacity:.8}
.ni-img{width:40px;height:40px;border-radius:6px;object-fit:cover;flex-shrink:0;background:var(--bg2)}.ni-t{font-size:11px;font-weight:700;color:var(--t2);line-height:1.3}.ni-d{font-size:9px;color:var(--t4);margin-top:1px}

/* GALLERY */
.gal-z{padding-top:28px}
.gal{display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:160px;gap:3px;border-radius:12px;overflow:hidden}
.gal-c{position:relative;overflow:hidden;cursor:zoom-in}.gal-big{grid-column:span 2;grid-row:span 2}
.gal-c img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s}.gal-c:hover img{transform:scale(1.05)}
.gal-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0;background:rgba(0,0,0,0);transition:.2s}.gal-c:hover .gal-ov{opacity:1;background:rgba(0,0,0,.3)}
.gal-more{position:absolute;inset:0;background:rgba(9,13,19,.7);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:20px;font-weight:900;color:#fff}
.gal-less{display:block;margin:6px auto 0;font-size:10px;font-weight:700;color:var(--t4);background:none;border:1px solid var(--bd);padding:4px 12px;border-radius:100px;cursor:pointer;font-family:var(--fd)}
.lb{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.95);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center}
.lb-m{max-width:88vw;max-height:88vh;display:flex;flex-direction:column;align-items:center}.lb-m img{max-width:100%;max-height:80vh;object-fit:contain;border-radius:6px}.lb-m p{font-size:11px;color:rgba(255,255,255,.3);margin-top:6px}
.lb-x{position:absolute;top:16px;right:20px;background:rgba(255,255,255,.08);border:none;color:rgba(255,255,255,.6);font-size:16px;cursor:pointer;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.lb-a{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.06);border:none;color:rgba(255,255,255,.6);font-size:30px;cursor:pointer;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.lb-p{left:12px}.lb-n{right:12px}.lb-ct{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);font-size:10px;color:rgba(255,255,255,.2);font-weight:600}

/* DISCUSSIONS placeholder */
.disc-section{padding-top:28px}
.disc-empty{border:1px dashed var(--bd);border-radius:12px;padding:32px;text-align:center}
.disc-empty-t{font-size:13px;font-weight:700;color:var(--t3);margin-bottom:4px}
.disc-empty-s{font-size:11px;color:var(--t4)}
.disc-btn{margin-top:12px;padding:8px 20px;border-radius:100px;border:1px solid var(--bd);background:rgba(255,255,255,.03);color:var(--t2);font-size:11px;font-weight:700;cursor:pointer;font-family:var(--fd);transition:.2s}
.disc-btn:hover{background:rgba(255,255,255,.07)}

/* SIMILAR */
.sim{padding-top:28px;padding-bottom:48px}
.sim-row{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;scrollbar-width:none;-webkit-overflow-scrolling:touch}.sim-row::-webkit-scrollbar{display:none}
.sim-c{flex-shrink:0;width:100px;text-align:center;text-decoration:none;transition:.2s}.sim-c:hover{transform:translateY(-2px)}
.sim-img{width:72px;height:72px;border-radius:50%;object-fit:cover;margin:0 auto 5px;border:2px solid var(--bd);background:var(--bg2)}
.sim-noimg{display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;color:rgba(255,255,255,.05);font-family:var(--fd)}
.sim-n{font-size:10px;font-weight:700;color:var(--t2)}

@media(max-width:1024px){
  .mus-layout{grid-template-columns:1fr}.mus-list{grid-column:1;grid-template-columns:repeat(3,1fr)}
  .mid-g{grid-template-columns:1fr}
  .hero-ct{flex-direction:column;align-items:flex-start;min-height:auto!important;padding-top:48px;gap:16px}
  .hero-right{align-items:flex-start;flex-direction:row;gap:10px}.hd-s{display:none}
  .gal{grid-template-columns:repeat(3,1fr);grid-auto-rows:130px}
}
@media(max-width:640px){
  .hd-n{display:none}.mus-list{grid-template-columns:1fr 1fr}.disc-g{grid-template-columns:repeat(2,1fr)}.gal{grid-template-columns:repeat(2,1fr);grid-auto-rows:110px}.gal-big{grid-column:span 1;grid-row:span 1}
}
      `}</style>

      <div className="pg">
        <header className="hd"><div className="hd-i">
          <Link href="/" className="hd-logo"><b>music</b><i>.lt</i></Link>
          <div className="hd-s"><input placeholder="Ieškok atlikėjų, albumų, dainų…" /></div>
          <nav className="hd-n">{NAV.map(n => <a key={n} href="/" className={n === 'Atlikėjai' ? 'on' : ''}>{n}</a>)}</nav>
          <HeaderAuth />
        </div></header>

        {/* ═══ HERO ═══ */}
        <div className={`hero ${heroImage ? '' : 'no-img'}`}>
          <div className="hero-bg">
            {heroImage ? <img src={heroImage} alt="" /> : artist.cover_image_url ? <div className="hero-blur"><img src={artist.cover_image_url} alt="" /></div> : <div className="hero-fb" />}
          </div>
          <div className="hero-dim" />
          <div className="hero-ct">
            <div className="hero-left">
              {flag && <div className="hero-row1"><span className="hero-flag">{flag}</span></div>}
              <h1 className="hero-name">
                {artist.name}
                {artist.is_verified && <span className="hero-vf"><svg width="11" height="11" viewBox="0 0 24 24" fill="#fff"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg></span>}
              </h1>
              <div className="hero-tags">
                {genres.map(g => <span key={g.id} className="hero-tag">{g.name}</span>)}
              </div>
              <div className="hero-actions">
                <button className="hero-like">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                  {totalLikes > 0 ? totalLikes : 'Patinka'}
                </button>
                {/* Member groups inline in hero for solo */}
                {isSolo && members.length > 0 && members.map(m => (
                  <Link key={m.id} href={`/atlikejai/${m.slug}`} className="mem" style={{ background: 'rgba(255,255,255,.04)', borderColor: 'rgba(255,255,255,.08)' }}>
                    {m.cover_image_url ? <img src={m.cover_image_url} alt={m.name} className="mem-img" /> : <div className="mem-img mem-noimg">{m.name[0]}</div>}
                    <div><div className="mem-n">{m.name}</div>{m.member_from && <div className="mem-y">{m.member_from}–{m.member_until || 'dabar'}</div>}</div>
                  </Link>
                ))}
              </div>
            </div>
            <div className="hero-right">
              {chartData.length > 5 && <div className="hero-chart"><div className="hero-chart-lbl">Populiarumas</div><Spark data={chartData} /></div>}
              {nextEvt && (
                <div className="hero-evt">
                  <div className="he-d"><div className="he-mo">{new Date(nextEvt.event_date).toLocaleDateString('lt-LT', { month: 'short' }).toUpperCase()}</div><div className="he-day">{new Date(nextEvt.event_date).getDate()}</div></div>
                  <div><div className="he-t">{nextEvt.title}</div><div className="he-v">{nextEvt.venues?.name || nextEvt.venue_custom || ''}{nextEvt.venues?.city ? `, ${nextEvt.venues.city}` : ''}</div></div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ═══ MUSIC ═══ */}
        {(topVideos.length > 0 || newTracks.length > 0) && (
          <div className="mus w">
            <div className="st">Muzika</div>
            {hasNewMusic && <div className="mus-tabs">
              <button className={`mus-tab ${musicTab === 'new' ? 'on' : ''}`} onClick={() => setMusicTab('new')}>Nauja muzika</button>
              <button className={`mus-tab ${musicTab === 'top' ? 'on' : ''}`} onClick={() => setMusicTab('top')}>Populiariausia</button>
            </div>}
            <div className="mus-layout">
              <div className="mus-featured">
                {curTracks[0] && <VideoCard track={curTracks[0]} isPlaying={playingId === curTracks[0].id} onPlay={() => setPlayingId(curTracks[0].id)} />}
              </div>
              <div className="mus-list">
                {curTracks.slice(1).map(t => <VideoCard key={t.id} track={t} isPlaying={playingId === t.id} onPlay={() => setPlayingId(t.id)} />)}
              </div>
            </div>
          </div>
        )}

        {/* ═══ EVENTS ═══ */}
        {events.length > 0 && (
          <div className="evts w">
            <div className="st">Renginiai · {events.length}</div>
            <div className="evts-row">
              {events.map((e: any) => { const d = new Date(e.event_date); return (
                <div key={e.id} className="evt-card">
                  <div className="evt-top">
                    <div className="evt-dd"><div className="evt-mm">{d.toLocaleDateString('lt-LT', { month: 'short' }).toUpperCase()}</div><div className="evt-d">{d.getDate()}</div></div>
                    <div><div className="evt-tt">{e.title}</div><div className="evt-vv">{e.venues?.name || e.venue_custom || ''}{e.venues?.city ? `, ${e.venues.city}` : ''}</div></div>
                  </div>
                </div>
              ) })}
            </div>
          </div>
        )}

        {/* ═══ DISCOGRAPHY ═══ */}
        {albums.length > 0 && (
          <div className="disc w">
            <div className="st">Diskografija · {albums.length}</div>
            {albumTypes.length > 1 && <div className="disc-f"><button className={`df ${discFilter === 'all' ? 'on' : ''}`} onClick={() => setDiscFilter('all')}>Visi</button>{albumTypes.map(t => <button key={t} className={`df ${discFilter === t ? 'on' : ''}`} onClick={() => setDiscFilter(t)}>{t}</button>)}</div>}
            <div className="disc-g">{filteredAlbums.map(a => (
              <div key={a.id} className="dc">
                <div className="dc-cv">{a.cover_image_url ? <img src={a.cover_image_url} alt={a.title} /> : <div className="dc-no">💿</div>}{aType(a) !== 'Albumas' && <span className="dc-tp">{aType(a)}</span>}</div>
                <div className="dc-i"><div className="dc-t">{a.title}</div><div className="dc-y">{a.year || '—'}</div></div>
              </div>
            ))}</div>
          </div>
        )}

        {/* ═══ BIO + NEWS ═══ */}
        {(hasBio || members.length > 0 || news.length > 0) && (
          <div className="mid w">
            <div className="mid-g">
              <div>
                <div className="bio-meta">
                  {activeYears && <div className="bio-m"><div className="bio-mv">{activeYears}</div><div className="bio-ml">Aktyvumas</div></div>}
                  {isSolo && age && <div className="bio-m"><div className="bio-mv">{age} m.</div><div className="bio-ml">Amžius</div></div>}
                  {artist.country && <div className="bio-m"><div className="bio-mv">{flag} {artist.country}</div><div className="bio-ml">Šalis</div></div>}
                  {albums.length > 0 && <div className="bio-m"><div className="bio-mv">{albums.length}</div><div className="bio-ml">Albumai</div></div>}
                  {tracks.length > 0 && <div className="bio-m"><div className="bio-mv">{tracks.length}+</div><div className="bio-ml">Dainos</div></div>}
                </div>
                {hasBio && <><div className="st">Apie</div><div className="bio" dangerouslySetInnerHTML={{ __html: artist.description }} /></>}
                {links.length > 0 && <div className="socials">{links.map(l => { const p = SOC[l.platform]; return <a key={l.platform} href={l.url} target="_blank" rel="noopener" className="soc">{p && <svg viewBox="0 0 24 24" fill={p.c}><path d={p.d} /></svg>}<span>{p?.l || l.platform}</span></a> })}{artist.website && <a href={artist.website} target="_blank" rel="noopener" className="soc"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--t3)' }}><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg><span>Svetainė</span></a>}</div>}
                {!isSolo && members.length > 0 && <div style={{ marginTop: 20 }}><div className="st">Nariai · {members.length}</div><div className="mems">{members.map(m => <Link key={m.id} href={`/atlikejai/${m.slug}`} className="mem">{m.cover_image_url ? <img src={m.cover_image_url} alt={m.name} className="mem-img" /> : <div className="mem-img mem-noimg">{m.name[0]}</div>}<div><div className="mem-n">{m.name}</div><div className="mem-y">{m.member_from ? `${m.member_from}–${m.member_until || 'dabar'}` : ''}</div></div></Link>)}</div></div>}
              </div>
              <div>
                {news.length > 0 && <div className="sc"><div className="st" style={{ marginBottom: 8 }}>Naujienos</div>{news.map(n => <Link key={n.id} href={`/news/${n.slug}`} className="ni">{n.image_small_url ? <img src={n.image_small_url} alt="" className="ni-img" /> : <div className="ni-img" />}<div><div className="ni-t">{n.title}</div><div className="ni-d">{new Date(n.published_at).toLocaleDateString('lt-LT')}</div></div></Link>)}</div>}
              </div>
            </div>
          </div>
        )}

        {/* ═══ GALLERY ═══ */}
        {photos.length > 0 && <div className="gal-z w"><div className="st">Galerija · {photos.length}</div><Gallery photos={photos} /></div>}

        {/* ═══ DISCUSSIONS ═══ */}
        <div className="disc-section w">
          <div className="st">Diskusijos</div>
          <div className="disc-empty">
            <div className="disc-empty-t">Dar nėra diskusijų apie {artist.name}</div>
            <div className="disc-empty-s">Būk pirmas — pradėk diskusiją!</div>
            <button className="disc-btn">+ Nauja diskusija</button>
          </div>
        </div>

        {/* ═══ SIMILAR ═══ */}
        {similar.length > 0 && (
          <div className="sim w">
            <div className="st">Panaši muzika</div>
            <div className="sim-row">{similar.map((a: any) => <Link key={a.id} href={`/atlikejai/${a.slug}`} className="sim-c">{a.cover_image_url ? <img src={a.cover_image_url} alt={a.name} className="sim-img" /> : <div className="sim-img sim-noimg">{a.name[0]}</div>}<div className="sim-n">{a.name}</div></Link>)}</div>
          </div>
        )}
      </div>
    </>
  )
}
