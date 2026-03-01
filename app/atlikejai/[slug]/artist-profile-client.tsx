'use client'
// app/atlikejai/[slug]/artist-profile-client.tsx

import { useState } from 'react'
import Link from 'next/link'
import { HeaderAuth } from '@/components/HeaderAuth'

type Genre = { id: number; name: string }
type SocialLink = { platform: string; url: string }
type Photo = { url: string; caption?: string }
type Album = {
  id: number; slug: string; title: string; year?: number; month?: number
  cover_image_url?: string; spotify_id?: string; video_url?: string
  type_studio?: boolean; type_ep?: boolean; type_single?: boolean
  type_live?: boolean; type_compilation?: boolean; type_remix?: boolean
  type_soundtrack?: boolean; type_demo?: boolean
}
type Track = {
  id: number; slug: string; title: string; type?: string
  video_url?: string; spotify_id?: string; cover_url?: string
  release_date?: string; lyrics?: string
}
type RelatedArtist = { id: number; slug: string; name: string; cover_image_url?: string; type?: string; year_from?: number; year_until?: number }
type NewsItem = { id: number; slug: string; title: string; image_small_url?: string; published_at: string; type: string }
type Event = { id: number; slug: string; title: string; event_date: string; venue_custom?: string; image_small_url?: string; venues?: { name: string; city?: string } }

type Props = {
  artist: any; genres: Genre[]; links: SocialLink[]; photos: Photo[]
  albums: Album[]; tracks: Track[]; related: RelatedArtist[]
  breaks: { year_from: number; year_until?: number }[]
  followers: number; news: NewsItem[]; events: Event[]
}

function ytId(url?: string | null) {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  return m ? m[1] : null
}

function albumType(a: Album): string {
  if (a.type_ep) return 'EP'
  if (a.type_single) return 'Singlas'
  if (a.type_live) return 'Live'
  if (a.type_compilation) return 'Rinkinys'
  if (a.type_remix) return 'Remix'
  if (a.type_soundtrack) return 'Soundtrack'
  if (a.type_demo) return 'Demo'
  return 'Albumas'
}

function formatEventDate(d: string) {
  try {
    const date = new Date(d)
    const mo = date.toLocaleDateString('lt-LT', { month: 'short' }).toUpperCase()
    const day = date.getDate()
    return { mo, day: day.toString() }
  } catch { return { mo: '?', day: '?' } }
}

const PLATFORM_ICONS: Record<string, { label: string; color: string }> = {
  spotify: { label: 'Spotify', color: '#1DB954' },
  youtube: { label: 'YouTube', color: '#FF0000' },
  instagram: { label: 'Instagram', color: '#E1306C' },
  tiktok: { label: 'TikTok', color: '#00f2ea' },
  facebook: { label: 'Facebook', color: '#1877F2' },
  twitter: { label: 'X', color: '#fff' },
  soundcloud: { label: 'SoundCloud', color: '#FF5500' },
  bandcamp: { label: 'Bandcamp', color: '#629aa9' },
}

const NAV = ['Topai', 'Muzika', 'Renginiai', 'Atlikėjai', 'Bendruomenė']

// ── Photo Gallery with Lightbox ───────────────────────────────────────────

function Gallery({ photos }: { photos: Photo[] }) {
  const [lb, setLb] = useState<number | null>(null)
  if (!photos.length) return null
  const show = photos.slice(0, 8)
  return (
    <>
      <div className="ap-gallery">
        {show.map((p, i) => (
          <div key={i} className="ap-gal-cell" onClick={() => setLb(i)}>
            <img src={p.url} alt={p.caption || ''} />
            <div className="ap-gal-hover">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
            </div>
          </div>
        ))}
      </div>
      {photos.length > 8 && <div className="ap-gal-more">+{photos.length - 8} nuotraukos</div>}
      {lb !== null && (
        <div className="ap-lb" onClick={() => setLb(null)}>
          <button className="ap-lb-x" onClick={e => { e.stopPropagation(); setLb(null) }}>✕</button>
          <button className="ap-lb-prev" onClick={e => { e.stopPropagation(); setLb(Math.max(0, lb - 1)) }}>‹</button>
          <div className="ap-lb-wrap" onClick={e => e.stopPropagation()}>
            <img src={photos[lb].url} alt="" />
            {photos[lb].caption && <p className="ap-lb-cap">{photos[lb].caption}</p>}
          </div>
          <button className="ap-lb-next" onClick={e => { e.stopPropagation(); setLb(Math.min(photos.length - 1, lb + 1)) }}>›</button>
          <div className="ap-lb-counter">{lb + 1} / {photos.length}</div>
        </div>
      )}
    </>
  )
}

// ── Main Component ────────────────────────────────────────────────────────

export default function ArtistProfileClient({
  artist, genres, links, photos, albums, tracks, related, breaks, followers, news, events
}: Props) {
  const [playingTrack, setPlayingTrack] = useState<number | null>(null)
  const [albumFilter, setAlbumFilter] = useState<string>('all')

  const heroImg = artist.cover_image_wide_url || artist.cover_image_url
  const hasDescription = artist.description && artist.description.trim().length > 0
  const activeYears = artist.active_from
    ? `${artist.active_from}${artist.active_until ? ` – ${artist.active_until}` : ' – dabar'}`
    : null

  // Album filtering
  const albumTypes = [...new Set(albums.map(albumType))]
  const filteredAlbums = albumFilter === 'all' ? albums : albums.filter(a => albumType(a) === albumFilter)

  // Separate singles from full albums for display
  const studioAlbums = albums.filter(a => a.type_studio || (!a.type_single && !a.type_ep && !a.type_live && !a.type_compilation && !a.type_remix && !a.type_soundtrack && !a.type_demo))
  const singles = albums.filter(a => a.type_single)

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=DM+Sans:ital,wght@0,400;0,500;0,700;1,400&display=swap');
        :root {
          --bg:#0a0e14; --bg2:#111720; --text:#f0f2f5; --text2:#b8c4d8; --text3:#6a7a94; --text4:#3a4a60;
          --border:rgba(255,255,255,0.07); --border2:rgba(255,255,255,0.04);
          --orange:#f97316; --blue:#3b82f6; --card:rgba(255,255,255,0.03);
          --font-display:'Outfit',system-ui,sans-serif; --font-body:'DM Sans',system-ui,sans-serif;
        }
        .ap { background:var(--bg); color:var(--text); font-family:var(--font-body); -webkit-font-smoothing:antialiased; min-height:100vh; }

        /* Header */
        .ap-header { position:sticky; top:0; z-index:50; background:rgba(10,14,20,0.95); backdrop-filter:blur(24px); border-bottom:1px solid var(--border2); }
        .ap-header-inner { max-width:1400px; margin:0 auto; padding:0 24px; height:56px; display:flex; align-items:center; gap:24px; }
        .ap-logo { font-family:var(--font-display); font-size:22px; font-weight:900; letter-spacing:-.03em; text-decoration:none; flex-shrink:0; }
        .ap-logo-m { color:#f2f4f8; } .ap-logo-d { color:#fb923c; }
        .ap-search { flex:1; display:flex; align-items:center; border-radius:100px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08); max-width:480px; }
        .ap-search input { flex:1; height:36px; padding:0 16px; font-size:13px; background:transparent; border:none; outline:none; color:var(--text2); font-family:var(--font-body); }
        .ap-search input::placeholder { color:var(--text4); }
        .ap-nav { display:flex; gap:2px; margin-left:auto; }
        .ap-nav a { padding:6px 14px; font-size:12px; font-weight:600; color:var(--text3); border-radius:6px; text-decoration:none; transition:all .15s; font-family:var(--font-display); }
        .ap-nav a:hover { color:var(--text); background:rgba(255,255,255,0.06); }
        .ap-nav a.active { color:var(--orange); }

        /* ═══ HERO ═══ */
        .ap-hero { position:relative; height:60vh; min-height:400px; max-height:600px; overflow:hidden; }
        .ap-hero-img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:center 20%; }
        .ap-hero-grad { position:absolute; inset:0; background:
          linear-gradient(to top, var(--bg) 0%, rgba(10,14,20,0.6) 40%, rgba(10,14,20,0.2) 100%),
          linear-gradient(to right, rgba(10,14,20,0.5) 0%, transparent 60%); }
        .ap-hero-no-img { position:absolute; inset:0; background:linear-gradient(135deg, #1a1e2e 0%, #0a0e14 100%); }
        .ap-hero-no-img::after { content:''; position:absolute; inset:0; background:radial-gradient(ellipse at 30% 50%, rgba(249,115,22,0.08) 0%, transparent 60%); }
        .ap-hero-content { position:absolute; bottom:0; left:0; right:0; padding:0 0 48px; }
        .ap-hero-inner { max-width:1400px; margin:0 auto; padding:0 24px; animation:apFade .8s .1s both; }
        @keyframes apFade { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:none; } }

        .ap-type-badge { display:inline-flex; align-items:center; gap:5px; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.14em; color:var(--orange); margin-bottom:12px; font-family:var(--font-display); }
        .ap-type-dot { width:6px; height:6px; border-radius:50%; background:var(--orange); }
        .ap-name { font-family:var(--font-display); font-size:clamp(2.5rem,6vw,5rem); font-weight:900; line-height:1; letter-spacing:-.04em; color:#fff; margin-bottom:16px; }
        .ap-verified { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; background:var(--blue); border-radius:50%; margin-left:8px; vertical-align:middle; }

        .ap-meta { display:flex; flex-wrap:wrap; align-items:center; gap:12px; margin-bottom:20px; }
        .ap-meta-item { display:flex; align-items:center; gap:5px; font-size:13px; color:var(--text2); font-weight:500; }
        .ap-meta-sep { width:3px; height:3px; border-radius:50%; background:var(--text4); }
        .ap-genres { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:20px; }
        .ap-genre { font-size:11px; font-weight:700; color:var(--text2); background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.12); border-radius:100px; padding:4px 12px; font-family:var(--font-display); transition:all .2s; cursor:pointer; }
        .ap-genre:hover { background:rgba(255,255,255,0.12); color:#fff; }

        .ap-socials { display:flex; gap:6px; }
        .ap-social { width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; text-decoration:none; transition:all .2s; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.05); backdrop-filter:blur(4px); }
        .ap-social:hover { transform:scale(1.1); border-color:rgba(255,255,255,0.25); }
        .ap-social svg { width:16px; height:16px; }

        .ap-follow-row { display:flex; align-items:center; gap:16px; margin-top:20px; }
        .ap-follow-btn { display:flex; align-items:center; gap:6px; padding:10px 28px; border-radius:100px; border:none; font-size:13px; font-weight:800; cursor:pointer; font-family:var(--font-display); transition:all .2s; background:var(--orange); color:#fff; box-shadow:0 4px 20px rgba(249,115,22,.3); }
        .ap-follow-btn:hover { transform:translateY(-1px); box-shadow:0 6px 24px rgba(249,115,22,.4); }
        .ap-followers { font-size:13px; color:var(--text3); font-weight:500; }

        /* ═══ BODY LAYOUT ═══ */
        .ap-body { max-width:1400px; margin:0 auto; padding:48px 24px 80px; }
        .ap-grid { display:grid; grid-template-columns:1fr 380px; gap:48px; align-items:start; }

        /* Section titles */
        .ap-section { margin-bottom:48px; }
        .ap-section:last-child { margin-bottom:0; }
        .ap-stitle { font-family:var(--font-display); font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.16em; color:var(--text4); margin-bottom:20px; display:flex; align-items:center; gap:10px; }
        .ap-stitle::after { content:''; flex:1; height:1px; background:var(--border); }

        /* Bio */
        .ap-bio { color:var(--text2); font-size:15px; line-height:1.8; }
        .ap-bio p { margin-bottom:16px; }

        /* ═══ DISCOGRAPHY ═══ */
        .ap-disc-filters { display:flex; gap:4px; margin-bottom:16px; flex-wrap:wrap; }
        .ap-disc-filter { padding:5px 14px; border-radius:100px; font-size:11px; font-weight:700; border:1px solid var(--border); background:none; color:var(--text3); cursor:pointer; font-family:var(--font-display); transition:all .2s; }
        .ap-disc-filter:hover { color:var(--text); border-color:rgba(255,255,255,0.15); }
        .ap-disc-filter.active { background:var(--orange); border-color:var(--orange); color:#fff; }

        .ap-albums { display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:16px; }
        .ap-album { background:var(--card); border:1px solid var(--border); border-radius:12px; overflow:hidden; cursor:pointer; transition:all .2s; }
        .ap-album:hover { transform:translateY(-3px); border-color:rgba(255,255,255,0.12); box-shadow:0 12px 32px rgba(0,0,0,.4); }
        .ap-album-cover { aspect-ratio:1; background:var(--bg2); position:relative; overflow:hidden; }
        .ap-album-cover img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .3s; }
        .ap-album:hover .ap-album-cover img { transform:scale(1.05); }
        .ap-album-no-cover { width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:28px; color:rgba(255,255,255,.08); background:linear-gradient(135deg, var(--bg2), rgba(249,115,22,.05)); }
        .ap-album-type { position:absolute; top:8px; right:8px; font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; padding:3px 7px; border-radius:4px; background:rgba(0,0,0,.7); color:var(--text2); backdrop-filter:blur(4px); }
        .ap-album-info { padding:10px 12px; }
        .ap-album-title { font-family:var(--font-display); font-size:13px; font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .ap-album-year { font-size:11px; color:var(--text4); margin-top:2px; }

        /* ═══ TRACKS ═══ */
        .ap-tracks { display:flex; flex-direction:column; }
        .ap-track { display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:10px; transition:background .15s; cursor:pointer; }
        .ap-track:hover { background:rgba(255,255,255,.04); }
        .ap-track-num { width:20px; font-size:12px; font-weight:600; color:var(--text4); text-align:center; flex-shrink:0; font-family:var(--font-display); }
        .ap-track-thumb { width:40px; height:40px; border-radius:6px; object-fit:cover; flex-shrink:0; background:var(--bg2); }
        .ap-track-no-thumb { display:flex; align-items:center; justify-content:center; font-size:14px; color:rgba(255,255,255,.1); }
        .ap-track-info { flex:1; min-width:0; }
        .ap-track-title { font-size:13px; font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .ap-track-sub { font-size:11px; color:var(--text4); margin-top:1px; display:flex; align-items:center; gap:6px; }
        .ap-track-badge { font-size:9px; font-weight:800; text-transform:uppercase; padding:1px 5px; border-radius:3px; background:rgba(249,115,22,.12); color:var(--orange); }
        .ap-track-play { width:32px; height:32px; border-radius:50%; border:none; background:rgba(255,255,255,.06); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all .2s; flex-shrink:0; color:var(--text3); }
        .ap-track-play:hover { background:var(--orange); color:#fff; }
        .ap-track-playing { background:var(--orange); color:#fff; }

        .ap-track-video { margin-top:8px; border-radius:12px; overflow:hidden; border:1px solid var(--border); }
        .ap-track-video iframe { width:100%; aspect-ratio:16/9; border:none; display:block; }

        /* ═══ SIDEBAR ═══ */
        .ap-sidebar { position:sticky; top:80px; display:flex; flex-direction:column; gap:16px; }
        .ap-scard { border-radius:14px; border:1px solid var(--border); background:var(--card); padding:16px; }

        /* Events */
        .ap-event { display:flex; gap:12px; align-items:flex-start; padding:8px 0; border-bottom:1px solid var(--border2); }
        .ap-event:last-child { border-bottom:none; }
        .ap-event-date { width:44px; flex-shrink:0; text-align:center; background:rgba(249,115,22,.08); border-radius:8px; padding:6px 4px; }
        .ap-event-date-mo { font-size:9px; font-weight:800; text-transform:uppercase; color:var(--orange); letter-spacing:.06em; }
        .ap-event-date-day { font-size:18px; font-weight:900; color:var(--text); line-height:1; margin-top:1px; font-family:var(--font-display); }
        .ap-event-info { flex:1; min-width:0; }
        .ap-event-title { font-size:13px; font-weight:700; color:var(--text); }
        .ap-event-venue { font-size:11px; color:var(--text4); margin-top:2px; }

        /* News */
        .ap-news-item { display:flex; gap:10px; padding:8px 0; border-bottom:1px solid var(--border2); text-decoration:none; transition:opacity .2s; }
        .ap-news-item:last-child { border-bottom:none; }
        .ap-news-item:hover { opacity:.8; }
        .ap-news-thumb { width:48px; height:48px; border-radius:8px; object-fit:cover; flex-shrink:0; background:var(--bg2); }
        .ap-news-title { font-size:12px; font-weight:700; color:var(--text2); line-height:1.4; }
        .ap-news-date { font-size:10px; color:var(--text4); margin-top:3px; }

        /* Related */
        .ap-related { display:grid; grid-template-columns:repeat(auto-fill, minmax(100px, 1fr)); gap:10px; }
        .ap-rel { text-align:center; text-decoration:none; transition:all .2s; }
        .ap-rel:hover { transform:translateY(-2px); }
        .ap-rel-img { width:64px; height:64px; border-radius:50%; object-fit:cover; margin:0 auto 6px; border:2px solid var(--border); background:var(--bg2); }
        .ap-rel-name { font-size:11px; font-weight:700; color:var(--text2); }

        /* ═══ GALLERY ═══ */
        .ap-gallery { display:grid; grid-template-columns:repeat(4, 1fr); gap:4px; border-radius:12px; overflow:hidden; }
        .ap-gal-cell { aspect-ratio:1; position:relative; overflow:hidden; cursor:zoom-in; }
        .ap-gal-cell img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .3s; }
        .ap-gal-cell:hover img { transform:scale(1.06); }
        .ap-gal-hover { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0); transition:background .2s; opacity:0; }
        .ap-gal-cell:hover .ap-gal-hover { background:rgba(0,0,0,.35); opacity:1; }
        .ap-gal-more { text-align:center; margin-top:8px; font-size:11px; color:var(--text4); font-weight:600; }

        /* Lightbox */
        .ap-lb { position:fixed; inset:0; z-index:1000; background:rgba(0,0,0,.95); backdrop-filter:blur(12px); display:flex; align-items:center; justify-content:center; }
        .ap-lb-wrap { max-width:88vw; max-height:88vh; display:flex; flex-direction:column; align-items:center; }
        .ap-lb-wrap img { max-width:100%; max-height:80vh; object-fit:contain; border-radius:8px; box-shadow:0 24px 80px rgba(0,0,0,.8); }
        .ap-lb-cap { font-size:12px; color:rgba(255,255,255,.45); text-align:center; margin-top:10px; }
        .ap-lb-x { position:absolute; top:20px; right:24px; background:rgba(255,255,255,.1); border:none; color:rgba(255,255,255,.7); font-size:18px; cursor:pointer; width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; }
        .ap-lb-prev,.ap-lb-next { position:absolute; top:50%; transform:translateY(-50%); background:rgba(255,255,255,.08); border:none; color:rgba(255,255,255,.7); font-size:36px; cursor:pointer; width:52px; height:52px; border-radius:50%; display:flex; align-items:center; justify-content:center; }
        .ap-lb-prev { left:16px; } .ap-lb-next { right:16px; }
        .ap-lb-counter { position:absolute; bottom:20px; left:50%; transform:translateX(-50%); font-size:11px; font-weight:600; color:rgba(255,255,255,.3); }

        @media(max-width:1024px) {
          .ap-grid { grid-template-columns:1fr; }
          .ap-sidebar { position:static; }
          .ap-name { font-size:clamp(2rem,8vw,3.5rem); }
          .ap-hero { height:50vh; min-height:320px; }
          .ap-albums { grid-template-columns:repeat(auto-fill, minmax(130px, 1fr)); }
          .ap-gallery { grid-template-columns:repeat(3, 1fr); }
        }
        @media(max-width:640px) {
          .ap-search { display:none; }
          .ap-nav { display:none; }
          .ap-albums { grid-template-columns:repeat(2, 1fr); gap:10px; }
          .ap-gallery { grid-template-columns:repeat(2, 1fr); }
          .ap-hero-content { padding:0 0 32px; }
        }
      `}</style>

      <div className="ap">
        {/* Header */}
        <header className="ap-header">
          <div className="ap-header-inner">
            <Link href="/" className="ap-logo"><span className="ap-logo-m">music</span><span className="ap-logo-d">.lt</span></Link>
            <div className="ap-search"><input type="text" placeholder="Ieškok atlikėjų, albumų, dainų…" /></div>
            <nav className="ap-nav">
              {NAV.map(n => <a key={n} href="/" className={n === 'Atlikėjai' ? 'active' : ''}>{n}</a>)}
            </nav>
            <HeaderAuth />
          </div>
        </header>

        {/* Hero */}
        <div className="ap-hero">
          {heroImg ? <img src={heroImg} alt={artist.name} className="ap-hero-img" /> : <div className="ap-hero-no-img" />}
          <div className="ap-hero-grad" />
          <div className="ap-hero-content">
            <div className="ap-hero-inner">
              <div className="ap-type-badge">
                <span className="ap-type-dot" />
                {artist.type === 'solo' ? 'Solo atlikėjas' : 'Grupė'}
                {artist.country && <> · {artist.country}</>}
              </div>
              <h1 className="ap-name">
                {artist.name}
                {artist.is_verified && (
                  <span className="ap-verified"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></span>
                )}
              </h1>

              <div className="ap-meta">
                {activeYears && <span className="ap-meta-item">📅 {activeYears}</span>}
                {activeYears && genres.length > 0 && <span className="ap-meta-sep" />}
                {followers > 0 && <span className="ap-meta-item">❤️ {followers} sekėjai</span>}
                {albums.length > 0 && <><span className="ap-meta-sep" /><span className="ap-meta-item">💿 {albums.length} albumai</span></>}
                {tracks.length > 0 && <><span className="ap-meta-sep" /><span className="ap-meta-item">🎵 {tracks.length}+ dainų</span></>}
              </div>

              {genres.length > 0 && (
                <div className="ap-genres">
                  {genres.map(g => <span key={g.id} className="ap-genre">{g.name}</span>)}
                </div>
              )}

              {links.length > 0 && (
                <div className="ap-socials">
                  {links.map(l => (
                    <a key={l.platform} href={l.url} target="_blank" rel="noopener" className="ap-social"
                      style={{ color: PLATFORM_ICONS[l.platform]?.color || '#fff' }} title={PLATFORM_ICONS[l.platform]?.label || l.platform}>
                      <span style={{ fontSize:12, fontWeight:900 }}>{(PLATFORM_ICONS[l.platform]?.label || l.platform).slice(0,2).toUpperCase()}</span>
                    </a>
                  ))}
                  {artist.website && (
                    <a href={artist.website} target="_blank" rel="noopener" className="ap-social" title="Svetainė">
                      <span style={{ fontSize:12, fontWeight:900, color:'#fff' }}>🌐</span>
                    </a>
                  )}
                </div>
              )}

              <div className="ap-follow-row">
                <button className="ap-follow-btn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                  Sekti
                </button>
                {followers > 0 && <span className="ap-followers">{followers} sekėjų</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="ap-body">
          <div className="ap-grid">
            {/* Main column */}
            <div>
              {/* Bio */}
              {hasDescription && (
                <div className="ap-section">
                  <div className="ap-stitle">Apie</div>
                  <div className="ap-bio" dangerouslySetInnerHTML={{ __html: artist.description }} />
                </div>
              )}

              {/* Discography */}
              {albums.length > 0 && (
                <div className="ap-section">
                  <div className="ap-stitle">Diskografija · {albums.length}</div>
                  {albumTypes.length > 1 && (
                    <div className="ap-disc-filters">
                      <button className={`ap-disc-filter ${albumFilter === 'all' ? 'active' : ''}`} onClick={() => setAlbumFilter('all')}>Visi</button>
                      {albumTypes.map(t => (
                        <button key={t} className={`ap-disc-filter ${albumFilter === t ? 'active' : ''}`} onClick={() => setAlbumFilter(t)}>{t}</button>
                      ))}
                    </div>
                  )}
                  <div className="ap-albums">
                    {filteredAlbums.map(a => (
                      <div key={a.id} className="ap-album">
                        <div className="ap-album-cover">
                          {a.cover_image_url ? <img src={a.cover_image_url} alt={a.title} /> : <div className="ap-album-no-cover">💿</div>}
                          {albumType(a) !== 'Albumas' && <span className="ap-album-type">{albumType(a)}</span>}
                        </div>
                        <div className="ap-album-info">
                          <div className="ap-album-title">{a.title}</div>
                          <div className="ap-album-year">{a.year || '—'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tracks */}
              {tracks.length > 0 && (
                <div className="ap-section">
                  <div className="ap-stitle">Dainos · {tracks.length}</div>
                  <div className="ap-tracks">
                    {tracks.map((t, i) => {
                      const vid = ytId(t.video_url)
                      const thumb = t.cover_url || (vid ? `https://img.youtube.com/vi/${vid}/default.jpg` : null)
                      const isPlaying = playingTrack === t.id
                      return (
                        <div key={t.id}>
                          <div className="ap-track" onClick={() => vid && setPlayingTrack(isPlaying ? null : t.id)}>
                            <div className="ap-track-num">{i + 1}</div>
                            {thumb ? <img src={thumb} alt="" className="ap-track-thumb" /> : <div className="ap-track-thumb ap-track-no-thumb">♪</div>}
                            <div className="ap-track-info">
                              <div className="ap-track-title">{t.title}</div>
                              <div className="ap-track-sub">
                                {t.type && t.type !== 'normal' && <span className="ap-track-badge">{t.type}</span>}
                                {t.lyrics && <span>📝 Žodžiai</span>}
                              </div>
                            </div>
                            {vid && (
                              <button className={`ap-track-play ${isPlaying ? 'ap-track-playing' : ''}`}>
                                {isPlaying
                                  ? <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                                  : <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>}
                              </button>
                            )}
                          </div>
                          {isPlaying && vid && (
                            <div className="ap-track-video">
                              <iframe src={`https://www.youtube.com/embed/${vid}?autoplay=1&rel=0`} allow="autoplay; encrypted-media" allowFullScreen />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Gallery */}
              {photos.length > 0 && (
                <div className="ap-section">
                  <div className="ap-stitle">Galerija · {photos.length}</div>
                  <Gallery photos={photos} />
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="ap-sidebar">
              {/* Upcoming events */}
              {events.length > 0 && (
                <div className="ap-scard">
                  <div className="ap-stitle" style={{ marginBottom:12 }}>Artėjantys renginiai</div>
                  {events.map((e: any) => {
                    const { mo, day } = formatEventDate(e.event_date)
                    const venue = e.venues?.name || e.venue_custom || ''
                    const city = e.venues?.city || ''
                    return (
                      <div key={e.id} className="ap-event">
                        <div className="ap-event-date">
                          <div className="ap-event-date-mo">{mo}</div>
                          <div className="ap-event-date-day">{day}</div>
                        </div>
                        <div className="ap-event-info">
                          <div className="ap-event-title">{e.title}</div>
                          <div className="ap-event-venue">{[venue, city].filter(Boolean).join(', ')}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Latest news */}
              {news.length > 0 && (
                <div className="ap-scard">
                  <div className="ap-stitle" style={{ marginBottom:12 }}>Naujienos</div>
                  {news.map(n => (
                    <Link key={n.id} href={`/news/${n.slug}`} className="ap-news-item">
                      {n.image_small_url ? <img src={n.image_small_url} alt="" className="ap-news-thumb" /> : <div className="ap-news-thumb" />}
                      <div>
                        <div className="ap-news-title">{n.title}</div>
                        <div className="ap-news-date">{new Date(n.published_at).toLocaleDateString('lt-LT')}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {/* Related artists */}
              {related.length > 0 && (
                <div className="ap-scard">
                  <div className="ap-stitle" style={{ marginBottom:12 }}>Susiję atlikėjai</div>
                  <div className="ap-related">
                    {related.map(r => (
                      <Link key={r.id} href={`/atlikejai/${r.slug}`} className="ap-rel">
                        {r.cover_image_url
                          ? <img src={r.cover_image_url} alt={r.name} className="ap-rel-img" />
                          : <div className="ap-rel-img" style={{ display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:900, color:'rgba(255,255,255,.12)' }}>{r.name[0]}</div>}
                        <div className="ap-rel-name">{r.name}</div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
