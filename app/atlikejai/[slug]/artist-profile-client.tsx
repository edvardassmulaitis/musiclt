'use client'
// app/atlikejai/[slug]/artist-profile-client.tsx

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { HeaderAuth } from '@/components/HeaderAuth'

type Genre = { id: number; name: string }
type SocialLink = { platform: string; url: string }
type Photo = { url: string; caption?: string }
type Album = {
  id: number; slug: string; title: string; year?: number; month?: number
  cover_image_url?: string; spotify_id?: string; video_url?: string
  type_studio?: boolean; type_ep?: boolean; type_single?: boolean
  type_live?: boolean; type_compilation?: boolean; type_remix?: boolean; type_soundtrack?: boolean; type_demo?: boolean
}
type Track = { id: number; slug: string; title: string; type?: string; video_url?: string; spotify_id?: string; cover_url?: string; release_date?: string; lyrics?: string }
type Member = { id: number; slug: string; name: string; cover_image_url?: string; type?: string; member_from?: number; member_until?: number }
type NewsItem = { id: number; slug: string; title: string; image_small_url?: string; published_at: string; type: string }

type Props = {
  artist: any; genres: Genre[]; links: SocialLink[]; photos: Photo[]
  albums: Album[]; tracks: Track[]; members: Member[]
  breaks: { year_from: number; year_until?: number }[]
  followers: number; news: NewsItem[]; events: any[]; heroTrack: Track | null
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

// Country code → flag emoji
const COUNTRY_FLAGS: Record<string, string> = {
  'Lietuva':'🇱🇹','Latvija':'🇱🇻','Estija':'🇪🇪','Lenkija':'🇵🇱','Vokietija':'🇩🇪',
  'Prancūzija':'🇫🇷','Italija':'🇮🇹','Ispanija':'🇪🇸','Portugalija':'🇵🇹','Olandija':'🇳🇱',
  'Belgija':'🇧🇪','Austrija':'🇦🇹','Šveicarija':'🇨🇭','Švedija':'🇸🇪','Norvegija':'🇳🇴',
  'Danija':'🇩🇰','Suomija':'🇫🇮','Islandija':'🇮🇸','Airija':'🇮🇪','Kroatija':'🇭🇷',
  'Čekija':'🇨🇿','Slovakija':'🇸🇰','Vengrija':'🇭🇺','Rumunija':'🇷🇴','Bulgarija':'🇧🇬',
  'Serbija':'🇷🇸','Graikija':'🇬🇷','Turkija':'🇹🇷','Ukraina':'🇺🇦','Rusija':'🇷🇺',
  'Didžioji Britanija':'🇬🇧','Jungtinė Karalystė':'🇬🇧','JAV':'🇺🇸','Kanada':'🇨🇦',
  'Australija':'🇦🇺','Japonija':'🇯🇵','Pietų Korėja':'🇰🇷','Brazilija':'🇧🇷',
  'Argentina':'🇦🇷','Meksika':'🇲🇽','Naujoji Zelandija':'🇳🇿','Jamaika':'🇯🇲','Kuba':'🇨🇺',
}
function countryFlag(c?: string) { return c ? COUNTRY_FLAGS[c] || '🌍' : '' }

const PLATFORM_ICON: Record<string, { svg: string; color: string; label: string }> = {
  spotify: { label:'Spotify', color:'#1DB954', svg:'<path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.52 17.34c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.1-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.64 1.32.42.18.48.66.3 1.02zm1.44-3.3c-.3.42-.84.6-1.26.3-3.24-1.98-8.16-2.58-11.94-1.38-.48.12-.96-.12-1.08-.6-.12-.48.12-.96.6-1.08 4.38-1.32 9.78-.66 13.5 1.62.36.18.54.78.18 1.14zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.3c-.6.18-1.14-.18-1.32-.72s.18-1.14.72-1.32c4.2-1.26 11.28-.96 15.72 1.62.54.3.72 1.02.42 1.56-.3.42-1.02.6-1.62.3z"/>' },
  youtube: { label:'YouTube', color:'#FF0000', svg:'<path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.55A3.02 3.02 0 0 0 .5 6.19 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14c1.88.55 9.38.55 9.38.55s7.5 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.81zM9.54 15.57V8.43L15.82 12l-6.28 3.57z"/>' },
  instagram: { label:'Instagram', color:'#E1306C', svg:'<path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.97.24 2.44.41.61.24 1.05.52 1.51.98.46.46.74.9.98 1.51.17.47.36 1.27.41 2.44.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.24 1.97-.41 2.44-.24.61-.52 1.05-.98 1.51-.46.46-.9.74-1.51.98-.47.17-1.27.36-2.44.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.97-.24-2.44-.41a4.08 4.08 0 0 1-1.51-.98 4.08 4.08 0 0 1-.98-1.51c-.17-.47-.36-1.27-.41-2.44C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.24-1.97.41-2.44.24-.61.52-1.05.98-1.51a4.08 4.08 0 0 1 1.51-.98c.47-.17 1.27-.36 2.44-.41C8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.78.3-1.44.71-2.1 1.37A5.88 5.88 0 0 0 .63 4.14C.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.3.78.71 1.44 1.37 2.1a5.88 5.88 0 0 0 2.14 1.37c.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.88 5.88 0 0 0 2.14-1.37 5.88 5.88 0 0 0 1.37-2.1c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.88 5.88 0 0 0-1.37-2.14A5.88 5.88 0 0 0 19.86.63C19.1.33 18.22.13 16.95.07 15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm7.85-10.41a1.44 1.44 0 1 0-2.88 0 1.44 1.44 0 0 0 2.88 0z"/>' },
  tiktok: { label:'TikTok', color:'#00f2ea', svg:'<path d="M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.96-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>' },
  facebook: { label:'Facebook', color:'#1877F2', svg:'<path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>' },
  twitter: { label:'X', color:'#fff', svg:'<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>' },
  soundcloud: { label:'SoundCloud', color:'#FF5500', svg:'<path d="M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.27-2.154c-.009-.06-.05-.1-.084-.1zm-.899.828c-.06 0-.091.037-.104.094L0 14.479l.172 1.282c.013.06.045.094.09.094.051 0 .09-.034.104-.09l.2-1.287-.2-1.334c-.014-.057-.053-.09-.09-.09zm1.83-1.229c-.063 0-.109.05-.117.109l-.209 2.545.209 2.464c.008.065.054.109.117.109.062 0 .108-.044.118-.109l.233-2.464-.233-2.545c-.01-.06-.056-.109-.118-.109zm.922-.153c-.074 0-.127.056-.135.121l-.193 2.698.193 2.5c.008.066.061.121.135.121.074 0 .126-.055.135-.121l.218-2.5-.218-2.698c-.009-.065-.061-.121-.135-.121zm.93-.156c-.084 0-.144.065-.152.14l-.177 2.854.177 2.52c.008.074.068.14.152.14.083 0 .143-.066.152-.14l.2-2.52-.2-2.854c-.009-.075-.069-.14-.152-.14zm.933-.17c-.093 0-.16.073-.167.158l-.163 3.025.163 2.535c.007.083.074.157.167.157.092 0 .16-.074.167-.157l.183-2.535-.183-3.025c-.007-.085-.075-.158-.167-.158zm3.856-1.605c-.123 0-.216.096-.222.207l-.14 4.28.14 2.514c.006.114.1.207.222.207.123 0 .217-.093.222-.207l.157-2.514-.157-4.28c-.005-.11-.099-.207-.222-.207zm.93-.055c-.133 0-.232.103-.238.225l-.125 4.335.125 2.498c.006.12.105.224.238.224.132 0 .232-.104.238-.224l.14-2.498-.14-4.335c-.006-.122-.106-.225-.238-.225zm.927-.015c-.143 0-.248.11-.252.242l-.11 4.35.11 2.488c.004.13.109.242.252.242.142 0 .248-.112.252-.242l.125-2.488-.125-4.35c-.004-.132-.11-.242-.252-.242zm5.592.06c-.268 0-.49.225-.496.49l-.068 4.3.068 2.44c.006.268.228.49.496.49.268 0 .49-.222.496-.49l.076-2.44-.076-4.3c-.006-.265-.228-.49-.496-.49zm-3.732-.037c-.153 0-.27.118-.275.26l-.1 4.388.1 2.473c.005.142.122.26.275.26.152 0 .27-.118.275-.26l.112-2.473-.112-4.388c-.005-.142-.123-.26-.275-.26zm.932.004c-.163 0-.286.126-.291.277l-.084 4.383.084 2.46c.005.152.128.277.29.277.163 0 .286-.125.291-.277l.096-2.46-.096-4.383c-.005-.151-.128-.277-.29-.277zm.93.015c-.173 0-.303.133-.306.295l-.068 4.368.068 2.445c.003.163.133.296.306.296.173 0 .303-.133.306-.296l.077-2.445-.077-4.368c-.003-.162-.133-.295-.306-.295zm.928-.014c-.184 0-.322.14-.325.312l-.053 4.382.053 2.435c.003.172.141.312.325.312.183 0 .322-.14.325-.312l.06-2.435-.06-4.382c-.003-.172-.142-.312-.325-.312zm.93.043c-.193 0-.338.148-.34.33l-.038 4.339.038 2.42c.002.182.147.33.34.33.192 0 .338-.148.34-.33l.043-2.42-.043-4.34c-.002-.18-.148-.328-.34-.328zm3.613-.013c-.261 0-.478.22-.48.478L21.2 14.48l.044 2.4c.002.26.22.477.48.477.26 0 .477-.218.48-.477l.05-2.4-.05-4.363c-.003-.26-.22-.477-.48-.477zM23.998 12.41c0-2.754-2.24-4.989-5-4.989-.758 0-1.476.17-2.118.474-.342.16-.433.325-.437.642v9.795c.005.325.27.59.6.604h6.955a3.483 3.483 0 0 0 0-6.527z"/>' },
  bandcamp: { label:'Bandcamp', color:'#629aa9', svg:'<path d="M0 18.75l7.437-13.5H24l-7.438 13.5H0z"/>' },
}

const NAV = ['Topai', 'Muzika', 'Renginiai', 'Atlikėjai', 'Bendruomenė']

// ── Music Sidebar ─────────────────────────────────────────────────────────
function MusicSidebar({ tracks, albums, heroTrack }: { tracks: Track[]; albums: Album[]; heroTrack: Track | null }) {
  const [activeTrack, setActiveTrack] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [discOpen, setDiscOpen] = useState(false)
  const [albumFilter, setAlbumFilter] = useState('all')

  const tracksWithVideo = tracks.filter(t => t.video_url)
  const cur = tracksWithVideo[activeTrack] || heroTrack
  const vid = cur ? ytId(cur.video_url) : null

  const albumTypes = [...new Set(albums.map(albumType))]
  const filteredAlbums = albumFilter === 'all' ? albums : albums.filter(a => albumType(a) === albumFilter)

  return (
    <div className="ms">
      {/* Player */}
      {cur && (
        <>
          <div className="ms-player-hdr">
            <div className="ms-player-icon">♫</div>
            <span>Muzika</span>
          </div>
          <div className="ms-video">
            {playing && vid ? (
              <iframe src={`https://www.youtube.com/embed/${vid}?autoplay=1&rel=0`} allow="autoplay; encrypted-media" allowFullScreen className="ms-iframe" />
            ) : (
              <div className="ms-thumb" onClick={() => { if (vid) setPlaying(true) }}>
                {vid ? <img src={`https://img.youtube.com/vi/${vid}/mqdefault.jpg`} alt={cur.title} />
                  : <div className="ms-no-thumb">♪</div>}
                {vid && <div className="ms-play-overlay"><div className="ms-play-btn"><svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg></div></div>}
              </div>
            )}
          </div>
          <div className="ms-now">
            <div className="ms-now-title">{cur.title}</div>
            {tracksWithVideo.length > 1 && <div className="ms-now-sub">{activeTrack + 1} / {tracksWithVideo.length}</div>}
          </div>
          {tracksWithVideo.length > 1 && (
            <div className="ms-tracklist">
              {tracksWithVideo.slice(0, 8).map((t, i) => {
                const v = ytId(t.video_url)
                const th = t.cover_url || (v ? `https://img.youtube.com/vi/${v}/default.jpg` : null)
                return (
                  <button key={t.id} onClick={() => { setActiveTrack(i); setPlaying(false) }}
                    className={`ms-track ${activeTrack === i ? 'ms-track-on' : ''}`}>
                    <span className="ms-track-num">{i + 1}</span>
                    {th ? <img src={th} alt="" className="ms-track-img" /> : <div className="ms-track-img ms-track-noimg">♪</div>}
                    <span className="ms-track-name">{t.title}</span>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Discography */}
      {albums.length > 0 && (
        <div className="ms-disc">
          <button className="ms-disc-toggle" onClick={() => setDiscOpen(!discOpen)}>
            <span>Diskografija · {albums.length}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: discOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}><path d="M6 9l6 6 6-6"/></svg>
          </button>
          {discOpen && (
            <>
              {albumTypes.length > 1 && (
                <div className="ms-disc-filters">
                  <button className={`ms-df ${albumFilter === 'all' ? 'ms-df-on' : ''}`} onClick={() => setAlbumFilter('all')}>Visi</button>
                  {albumTypes.map(t => <button key={t} className={`ms-df ${albumFilter === t ? 'ms-df-on' : ''}`} onClick={() => setAlbumFilter(t)}>{t}</button>)}
                </div>
              )}
              <div className="ms-albums">
                {filteredAlbums.map(a => (
                  <div key={a.id} className="ms-album">
                    <div className="ms-album-cover">
                      {a.cover_image_url ? <img src={a.cover_image_url} alt={a.title} /> : <div className="ms-album-nocover">💿</div>}
                    </div>
                    <div className="ms-album-info">
                      <div className="ms-album-title">{a.title}</div>
                      <div className="ms-album-sub">{a.year || '—'} · {albumType(a)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Gallery ───────────────────────────────────────────────────────────────
function Gallery({ photos }: { photos: Photo[] }) {
  const [lb, setLb] = useState<number | null>(null)
  const [showAll, setShowAll] = useState(false)
  if (!photos.length) return null
  const PREVIEW = 6
  const shown = showAll ? photos : photos.slice(0, PREVIEW)
  const hidden = photos.length - PREVIEW
  return (
    <>
      <div className="gal-grid">
        {shown.map((p, i) => (
          <div key={i} className="gal-cell" onClick={() => setLb(i)}>
            <img src={p.url} alt={p.caption || ''} />
            <div className="gal-hover"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></div>
            {!showAll && i === PREVIEW - 1 && hidden > 0 && (
              <div className="gal-more" onClick={e => { e.stopPropagation(); setShowAll(true) }}>
                <span>+{hidden}</span><small>nuotraukos</small>
              </div>
            )}
          </div>
        ))}
      </div>
      {showAll && photos.length > PREVIEW && <button className="gal-less" onClick={() => setShowAll(false)}>↑ Mažiau</button>}
      {lb !== null && (
        <div className="lb-overlay" onClick={() => setLb(null)}>
          <button className="lb-x" onClick={e => { e.stopPropagation(); setLb(null) }}>✕</button>
          <button className="lb-arr lb-prev" onClick={e => { e.stopPropagation(); setLb(Math.max(0, lb - 1)) }}>‹</button>
          <div className="lb-main" onClick={e => e.stopPropagation()}>
            <img src={photos[lb].url} alt="" />
            {photos[lb].caption && <p className="lb-cap">{photos[lb].caption}</p>}
          </div>
          <button className="lb-arr lb-next" onClick={e => { e.stopPropagation(); setLb(Math.min(photos.length - 1, lb + 1)) }}>›</button>
          <div className="lb-counter">{lb + 1} / {photos.length}</div>
        </div>
      )}
    </>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────
export default function ArtistProfileClient({
  artist, genres, links, photos, albums, tracks, members, breaks, followers, news, events, heroTrack
}: Props) {
  const heroImg = artist.cover_image_wide_url || artist.cover_image_url
  const hasDescription = artist.description && artist.description.trim().length > 10
  const hasMusicSidebar = tracks.length > 0 || albums.length > 0
  const flag = countryFlag(artist.country)
  const activeYears = artist.active_from
    ? `${artist.active_from} – ${artist.active_until || 'dabar'}`
    : null

  // Mock barometer (placeholder until real scoring exists)
  const barometerRank = Math.floor(Math.random() * 40) + 1
  const genreRank = Math.floor(Math.random() * 15) + 1

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=DM+Sans:ital,wght@0,400;0,500;0,700;1,400&display=swap');
        :root {
          --bg:#0a0e14; --bg2:#111720; --text:#f0f2f5; --text2:#b8c4d8; --text3:#6a7a94; --text4:#3a4a60;
          --border:rgba(255,255,255,0.07); --border2:rgba(255,255,255,0.04);
          --orange:#f97316; --blue:#3b82f6; --card:rgba(255,255,255,0.03);
          --font-d:'Outfit',system-ui,sans-serif; --font-b:'DM Sans',system-ui,sans-serif;
        }
        * { box-sizing:border-box; }
        .ap { background:var(--bg); color:var(--text); font-family:var(--font-b); -webkit-font-smoothing:antialiased; min-height:100vh; }

        /* ═══ HEADER ═══ */
        .hd { position:sticky; top:0; z-index:50; background:rgba(10,14,20,0.95); backdrop-filter:blur(24px); border-bottom:1px solid var(--border2); }
        .hd-in { max-width:1400px; margin:0 auto; padding:0 24px; height:56px; display:flex; align-items:center; gap:24px; }
        .hd-logo { font-family:var(--font-d); font-size:22px; font-weight:900; letter-spacing:-.03em; text-decoration:none; }
        .hd-logo b { color:#f2f4f8; } .hd-logo i { color:#fb923c; font-style:normal; }
        .hd-search { flex:1; max-width:420px; height:36px; border-radius:100px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08); display:flex; align-items:center; overflow:hidden; }
        .hd-search input { flex:1; padding:0 16px; font-size:13px; background:none; border:none; outline:none; color:var(--text2); font-family:var(--font-b); }
        .hd-search input::placeholder { color:var(--text4); }
        .hd-nav { display:flex; gap:2px; margin-left:auto; }
        .hd-nav a { padding:6px 14px; font-size:12px; font-weight:600; color:var(--text3); border-radius:6px; text-decoration:none; transition:all .15s; font-family:var(--font-d); }
        .hd-nav a:hover { color:var(--text); background:rgba(255,255,255,0.06); }
        .hd-nav a.on { color:var(--orange); }

        /* ═══ HERO ═══ */
        .hero { position:relative; overflow:hidden; }
        .hero-bg { position:absolute; inset:0; }
        .hero-bg img { width:100%; height:100%; object-fit:cover; object-position:center 20%; filter:blur(30px) brightness(0.35) saturate(1.4); transform:scale(1.3); }
        .hero-bg-fallback { position:absolute; inset:0; background:linear-gradient(135deg, #0f1825 0%, #0a0e14 50%, rgba(249,115,22,0.05) 100%); }
        .hero-overlay { position:absolute; inset:0; background:linear-gradient(to bottom, rgba(10,14,20,0.3) 0%, rgba(10,14,20,0.95) 100%); }
        .hero-inner { position:relative; max-width:1400px; margin:0 auto; padding:80px 24px 40px; display:flex; gap:32px; align-items:flex-end; }
        .hero-avatar { width:180px; height:180px; border-radius:16px; object-fit:cover; border:3px solid rgba(255,255,255,0.1); flex-shrink:0; box-shadow:0 16px 48px rgba(0,0,0,.6); background:var(--bg2); }
        .hero-avatar-fallback { width:180px; height:180px; border-radius:16px; flex-shrink:0; background:linear-gradient(135deg, var(--bg2), rgba(249,115,22,0.08)); display:flex; align-items:center; justify-content:center; font-size:56px; font-weight:900; color:rgba(255,255,255,0.06); font-family:var(--font-d); border:3px solid rgba(255,255,255,0.06); }
        .hero-info { flex:1; min-width:0; padding-bottom:4px; }
        .hero-flag-row { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
        .hero-flag { font-size:20px; line-height:1; }
        .hero-country { font-size:12px; font-weight:700; color:var(--text3); letter-spacing:.04em; font-family:var(--font-d); }
        .hero-name { font-family:var(--font-d); font-size:clamp(2rem,5vw,3.5rem); font-weight:900; line-height:1.05; letter-spacing:-.04em; color:#fff; margin-bottom:12px; }
        .hero-verified { display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px; background:var(--blue); border-radius:50%; margin-left:6px; vertical-align:middle; }

        .hero-stats { display:flex; flex-wrap:wrap; gap:16px; margin-bottom:14px; }
        .hero-stat { display:flex; flex-direction:column; align-items:center; min-width:56px; }
        .hero-stat-val { font-family:var(--font-d); font-size:18px; font-weight:900; color:#fff; }
        .hero-stat-lbl { font-size:10px; font-weight:600; color:var(--text4); text-transform:uppercase; letter-spacing:.06em; margin-top:1px; }

        .hero-genres { display:flex; flex-wrap:wrap; gap:5px; margin-bottom:14px; }
        .hero-genre { font-size:11px; font-weight:700; color:var(--text2); background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.1); border-radius:100px; padding:3px 11px; font-family:var(--font-d); }

        .hero-actions { display:flex; gap:8px; align-items:center; }
        .hero-like-btn { display:flex; align-items:center; gap:6px; padding:9px 24px; border-radius:100px; border:none; font-size:13px; font-weight:800; cursor:pointer; font-family:var(--font-d); transition:all .2s; background:var(--orange); color:#fff; box-shadow:0 4px 16px rgba(249,115,22,.3); }
        .hero-like-btn:hover { transform:translateY(-1px); box-shadow:0 6px 20px rgba(249,115,22,.4); }
        .hero-like-count { font-size:12px; color:var(--text4); font-weight:600; }

        /* Barometer badge */
        .hero-baro { display:flex; gap:6px; margin-left:auto; }
        .baro-badge { display:flex; flex-direction:column; align-items:center; background:rgba(255,255,255,0.04); border:1px solid var(--border); border-radius:10px; padding:6px 12px; min-width:60px; }
        .baro-rank { font-family:var(--font-d); font-size:20px; font-weight:900; color:var(--orange); }
        .baro-label { font-size:8px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:var(--text4); margin-top:1px; text-align:center; }

        /* ═══ BODY ═══ */
        .body { max-width:1400px; margin:0 auto; padding:36px 24px 80px; }
        .body-grid { display:grid; gap:0; align-items:start; }
        .body-grid.has-sidebar { grid-template-columns:7fr 5fr; }
        .body-grid.no-sidebar { grid-template-columns:1fr; max-width:860px; }
        .main-col { }
        .body-grid.has-sidebar .main-col { padding-right:36px; }
        .side-col { position:sticky; top:80px; padding-left:24px; border-left:1px solid var(--border2); }

        /* Section */
        .sec { margin-bottom:40px; } .sec:last-child { margin-bottom:0; }
        .sec-title { font-family:var(--font-d); font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.14em; color:var(--text4); margin-bottom:16px; display:flex; align-items:center; gap:10px; }
        .sec-title::after { content:''; flex:1; height:1px; background:var(--border); }

        /* Bio — force light text regardless of inline styles */
        .bio { color:var(--text2) !important; font-size:15px; line-height:1.85; }
        .bio * { color:inherit !important; font-family:inherit !important; font-size:inherit !important; }
        .bio p { margin-bottom:14px; }
        .bio a { color:var(--orange) !important; text-decoration:underline; }
        .bio a:hover { color:#fb923c !important; }
        .bio b, .bio strong { color:var(--text) !important; font-weight:700; }
        .bio br + br { display:none; }
        .bio div { margin-bottom:8px; }

        /* Social links (below bio) */
        .socials { display:flex; flex-wrap:wrap; gap:8px; margin-top:20px; }
        .social-link { display:inline-flex; align-items:center; gap:6px; padding:7px 14px; border-radius:100px; border:1px solid var(--border); background:rgba(255,255,255,0.03); text-decoration:none; transition:all .2s; }
        .social-link:hover { background:rgba(255,255,255,0.07); border-color:rgba(255,255,255,0.15); transform:translateY(-1px); }
        .social-link svg { width:14px; height:14px; }
        .social-link span { font-size:11px; font-weight:700; color:var(--text2); font-family:var(--font-d); }

        /* Members */
        .members { display:flex; flex-wrap:wrap; gap:12px; }
        .member-card { display:flex; align-items:center; gap:10px; background:var(--card); border:1px solid var(--border); border-radius:12px; padding:10px 14px; text-decoration:none; transition:all .2s; min-width:200px; }
        .member-card:hover { border-color:rgba(255,255,255,0.12); background:rgba(255,255,255,0.05); }
        .member-img { width:40px; height:40px; border-radius:50%; object-fit:cover; flex-shrink:0; background:var(--bg2); }
        .member-noimg { display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:900; color:rgba(255,255,255,0.1); font-family:var(--font-d); }
        .member-name { font-size:13px; font-weight:700; color:var(--text); }
        .member-years { font-size:10px; color:var(--text4); margin-top:1px; }

        /* News in sidebar */
        .news-item { display:flex; gap:10px; padding:8px 0; border-bottom:1px solid var(--border2); text-decoration:none; transition:opacity .2s; }
        .news-item:last-child { border-bottom:none; }
        .news-item:hover { opacity:.8; }
        .news-thumb { width:48px; height:48px; border-radius:8px; object-fit:cover; flex-shrink:0; background:var(--bg2); }
        .news-title { font-size:12px; font-weight:700; color:var(--text2); line-height:1.4; }
        .news-date { font-size:10px; color:var(--text4); margin-top:3px; }

        /* Events */
        .evt { display:flex; gap:12px; align-items:flex-start; padding:8px 0; border-bottom:1px solid var(--border2); }
        .evt:last-child { border-bottom:none; }
        .evt-date { width:44px; flex-shrink:0; text-align:center; background:rgba(249,115,22,.08); border-radius:8px; padding:5px 3px; }
        .evt-mo { font-size:9px; font-weight:800; text-transform:uppercase; color:var(--orange); letter-spacing:.06em; }
        .evt-day { font-size:18px; font-weight:900; color:var(--text); line-height:1; margin-top:1px; font-family:var(--font-d); }
        .evt-title { font-size:13px; font-weight:700; color:var(--text); }
        .evt-venue { font-size:11px; color:var(--text4); margin-top:2px; }

        /* ═══ MUSIC SIDEBAR ═══ */
        .ms { border-radius:14px; overflow:hidden; background:rgba(0,0,0,.4); border:1px solid var(--border); backdrop-filter:blur(12px); margin-bottom:12px; }
        .ms-player-hdr { display:flex; align-items:center; gap:8px; padding:11px 14px; border-bottom:1px solid var(--border2); font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.1em; color:var(--text3); font-family:var(--font-d); }
        .ms-player-icon { width:24px; height:24px; border-radius:6px; background:linear-gradient(135deg, var(--orange), #e05500); display:flex; align-items:center; justify-content:center; font-size:11px; color:#fff; }
        .ms-video { position:relative; background:#000; }
        .ms-iframe { width:100%; aspect-ratio:16/9; border:none; display:block; }
        .ms-thumb { position:relative; aspect-ratio:16/9; overflow:hidden; cursor:pointer; }
        .ms-thumb img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .3s; }
        .ms-thumb:hover img { transform:scale(1.04); }
        .ms-no-thumb { width:100%; aspect-ratio:16/9; background:#111; display:flex; align-items:center; justify-content:center; font-size:32px; color:rgba(255,255,255,.08); }
        .ms-play-overlay { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.2); }
        .ms-play-btn { width:52px; height:52px; border-radius:50%; background:rgba(249,115,22,.9); display:flex; align-items:center; justify-content:center; box-shadow:0 4px 20px rgba(249,115,22,.4); transition:transform .15s; }
        .ms-thumb:hover .ms-play-btn { transform:scale(1.08); }
        .ms-now { padding:10px 14px; background:rgba(249,115,22,.06); border-top:1px solid rgba(249,115,22,.1); }
        .ms-now-title { font-size:13px; font-weight:800; color:var(--text); }
        .ms-now-sub { font-size:10px; color:var(--text4); margin-top:2px; }
        .ms-tracklist { border-top:1px solid var(--border2); }
        .ms-track { width:100%; display:flex; align-items:center; gap:8px; padding:7px 14px; text-align:left; background:none; border:none; border-bottom:1px solid var(--border2); cursor:pointer; transition:background .15s; font-family:var(--font-b); color:var(--text2); }
        .ms-track:last-child { border-bottom:none; }
        .ms-track:hover { background:rgba(255,255,255,.03); }
        .ms-track-on { background:rgba(249,115,22,.06); color:var(--orange); }
        .ms-track-num { width:16px; font-size:10px; font-weight:600; color:var(--text4); text-align:center; flex-shrink:0; font-family:var(--font-d); }
        .ms-track-on .ms-track-num { color:var(--orange); }
        .ms-track-img { width:32px; height:32px; border-radius:5px; object-fit:cover; flex-shrink:0; }
        .ms-track-noimg { background:rgba(255,255,255,.05); display:flex; align-items:center; justify-content:center; font-size:12px; color:rgba(255,255,255,.1); }
        .ms-track-name { font-size:12px; font-weight:600; flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

        /* Discography accordion */
        .ms-disc { border-top:1px solid var(--border); }
        .ms-disc-toggle { width:100%; display:flex; align-items:center; justify-content:space-between; padding:11px 14px; background:none; border:none; cursor:pointer; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.1em; color:var(--text3); font-family:var(--font-d); }
        .ms-disc-filters { display:flex; gap:3px; padding:0 14px 8px; flex-wrap:wrap; }
        .ms-df { padding:3px 10px; border-radius:100px; font-size:10px; font-weight:700; border:1px solid var(--border); background:none; color:var(--text4); cursor:pointer; font-family:var(--font-d); }
        .ms-df-on { background:var(--orange); border-color:var(--orange); color:#fff; }
        .ms-albums { display:grid; grid-template-columns:1fr 1fr; gap:4px; padding:0 14px 14px; }
        .ms-album { border-radius:8px; overflow:hidden; background:rgba(255,255,255,.03); border:1px solid var(--border2); cursor:pointer; transition:all .2s; }
        .ms-album:hover { border-color:rgba(255,255,255,.1); }
        .ms-album-cover { aspect-ratio:1; background:var(--bg2); overflow:hidden; }
        .ms-album-cover img { width:100%; height:100%; object-fit:cover; display:block; }
        .ms-album-nocover { width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:20px; color:rgba(255,255,255,.06); }
        .ms-album-info { padding:6px 8px; }
        .ms-album-title { font-size:11px; font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .ms-album-sub { font-size:9px; color:var(--text4); margin-top:1px; }

        /* Sidebar card */
        .scard { border-radius:14px; border:1px solid var(--border); background:var(--card); padding:14px; margin-bottom:12px; }

        /* ═══ FULL-WIDTH SECTIONS ═══ */
        .zone-full { max-width:1400px; margin:0 auto; padding:0 24px; }

        /* Gallery */
        .gal-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:3px; border-radius:12px; overflow:hidden; }
        .gal-cell { aspect-ratio:1; position:relative; overflow:hidden; cursor:zoom-in; }
        .gal-cell img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .3s; }
        .gal-cell:hover img { transform:scale(1.06); }
        .gal-hover { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0); transition:background .2s; opacity:0; }
        .gal-cell:hover .gal-hover { background:rgba(0,0,0,.35); opacity:1; }
        .gal-more { position:absolute; inset:0; background:rgba(10,14,20,.75); backdrop-filter:blur(4px); display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; }
        .gal-more span { font-size:24px; font-weight:900; color:#fff; } .gal-more small { font-size:9px; font-weight:600; color:rgba(255,255,255,.5); text-transform:uppercase; letter-spacing:.08em; }
        .gal-less { display:block; margin:8px auto 0; font-size:11px; font-weight:700; color:var(--text4); background:none; border:1px solid var(--border); padding:5px 14px; border-radius:100px; cursor:pointer; font-family:var(--font-d); }

        /* Lightbox */
        .lb-overlay { position:fixed; inset:0; z-index:1000; background:rgba(0,0,0,.95); backdrop-filter:blur(12px); display:flex; align-items:center; justify-content:center; }
        .lb-main { max-width:88vw; max-height:88vh; display:flex; flex-direction:column; align-items:center; }
        .lb-main img { max-width:100%; max-height:80vh; object-fit:contain; border-radius:8px; }
        .lb-cap { font-size:12px; color:rgba(255,255,255,.4); text-align:center; margin-top:8px; }
        .lb-x { position:absolute; top:20px; right:24px; background:rgba(255,255,255,.1); border:none; color:rgba(255,255,255,.7); font-size:18px; cursor:pointer; width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; }
        .lb-arr { position:absolute; top:50%; transform:translateY(-50%); background:rgba(255,255,255,.08); border:none; color:rgba(255,255,255,.7); font-size:36px; cursor:pointer; width:52px; height:52px; border-radius:50%; display:flex; align-items:center; justify-content:center; }
        .lb-prev { left:16px; } .lb-next { right:16px; }
        .lb-counter { position:absolute; bottom:20px; left:50%; transform:translateX(-50%); font-size:11px; color:rgba(255,255,255,.3); font-weight:600; }

        @media(max-width:1024px) {
          .body-grid.has-sidebar { grid-template-columns:1fr; }
          .body-grid.has-sidebar .main-col { padding-right:0; }
          .side-col { position:static; padding-left:0; border-left:none; border-top:1px solid var(--border2); padding-top:24px; margin-top:24px; }
          .hero-inner { flex-direction:column; align-items:flex-start; padding:60px 24px 32px; gap:20px; }
          .hero-avatar, .hero-avatar-fallback { width:120px; height:120px; }
          .hero-baro { margin-left:0; margin-top:8px; }
          .hd-search { display:none; }
        }
        @media(max-width:640px) {
          .hd-nav { display:none; }
          .hero-avatar, .hero-avatar-fallback { width:90px; height:90px; }
          .ms-albums { grid-template-columns:1fr 1fr; }
          .gal-grid { grid-template-columns:repeat(2, 1fr); }
          .members { flex-direction:column; }
          .member-card { min-width:0; }
        }
      `}</style>

      <div className="ap">
        {/* Header */}
        <header className="hd">
          <div className="hd-in">
            <Link href="/" className="hd-logo"><b>music</b><i>.lt</i></Link>
            <div className="hd-search"><input placeholder="Ieškok atlikėjų, albumų, dainų…" /></div>
            <nav className="hd-nav">{NAV.map(n => <a key={n} href="/" className={n === 'Atlikėjai' ? 'on' : ''}>{n}</a>)}</nav>
            <HeaderAuth />
          </div>
        </header>

        {/* Hero — blurred bg approach for quality control */}
        <div className="hero">
          <div className="hero-bg">
            {heroImg ? <img src={heroImg} alt="" /> : null}
            {!heroImg && <div className="hero-bg-fallback" />}
          </div>
          <div className="hero-overlay" />
          <div className="hero-inner">
            {heroImg
              ? <img src={heroImg} alt={artist.name} className="hero-avatar" />
              : <div className="hero-avatar-fallback">{artist.name[0]}</div>}
            <div className="hero-info">
              <div className="hero-flag-row">
                {flag && <span className="hero-flag">{flag}</span>}
                {artist.country && <span className="hero-country">{artist.country}</span>}
              </div>
              <h1 className="hero-name">
                {artist.name}
                {artist.is_verified && <span className="hero-verified"><svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></span>}
              </h1>

              <div className="hero-stats">
                {activeYears && <div className="hero-stat"><div className="hero-stat-val">{artist.active_from}</div><div className="hero-stat-lbl">Nuo</div></div>}
                {albums.length > 0 && <div className="hero-stat"><div className="hero-stat-val">{albums.length}</div><div className="hero-stat-lbl">Albumai</div></div>}
                {tracks.length > 0 && <div className="hero-stat"><div className="hero-stat-val">{tracks.length}+</div><div className="hero-stat-lbl">Dainos</div></div>}
                {members.length > 0 && <div className="hero-stat"><div className="hero-stat-val">{members.length}</div><div className="hero-stat-lbl">Nariai</div></div>}
              </div>

              {genres.length > 0 && (
                <div className="hero-genres">{genres.map(g => <span key={g.id} className="hero-genre">{g.name}</span>)}</div>
              )}

              <div className="hero-actions">
                <button className="hero-like-btn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                  Patinka
                </button>
                {followers > 0 && <span className="hero-like-count">{followers}</span>}

                {/* Barometer */}
                <div className="hero-baro">
                  <div className="baro-badge">
                    <div className="baro-rank">#{barometerRank}</div>
                    <div className="baro-label">Barometras</div>
                  </div>
                  {genres.length > 0 && (
                    <div className="baro-badge">
                      <div className="baro-rank">#{genreRank}</div>
                      <div className="baro-label">{genres[0].name}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Body: text + music sidebar */}
        <div className="body">
          <div className={`body-grid ${hasMusicSidebar ? 'has-sidebar' : 'no-sidebar'}`}>
            <div className="main-col">
              {/* Bio */}
              {hasDescription && (
                <div className="sec">
                  <div className="sec-title">Apie</div>
                  <div className="bio" dangerouslySetInnerHTML={{ __html: artist.description }} />
                  {/* Social links below bio */}
                  {links.length > 0 && (
                    <div className="socials">
                      {links.map(l => {
                        const p = PLATFORM_ICON[l.platform]
                        return (
                          <a key={l.platform} href={l.url} target="_blank" rel="noopener" className="social-link">
                            {p && <svg viewBox="0 0 24 24" fill={p.color} dangerouslySetInnerHTML={{ __html: p.svg }} />}
                            <span>{p?.label || l.platform}</span>
                          </a>
                        )
                      })}
                      {artist.website && (
                        <a href={artist.website} target="_blank" rel="noopener" className="social-link">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                          <span>Svetainė</span>
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Members */}
              {members.length > 0 && (
                <div className="sec">
                  <div className="sec-title">Nariai · {members.length}</div>
                  <div className="members">
                    {members.map(m => (
                      <Link key={m.id} href={`/atlikejai/${m.slug}`} className="member-card">
                        {m.cover_image_url
                          ? <img src={m.cover_image_url} alt={m.name} className="member-img" />
                          : <div className="member-img member-noimg">{m.name[0]}</div>}
                        <div>
                          <div className="member-name">{m.name}</div>
                          <div className="member-years">
                            {m.member_from ? `${m.member_from}${m.member_until ? ` – ${m.member_until}` : ' – dabar'}` : ''}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Gallery */}
              {photos.length > 0 && (
                <div className="sec">
                  <div className="sec-title">Galerija · {photos.length}</div>
                  <Gallery photos={photos} />
                </div>
              )}
            </div>

            {/* Sidebar */}
            {hasMusicSidebar && (
              <div className="side-col">
                <MusicSidebar tracks={tracks} albums={albums} heroTrack={heroTrack} />

                {/* Events */}
                {events.length > 0 && (
                  <div className="scard">
                    <div className="sec-title" style={{ marginBottom:10 }}>Renginiai</div>
                    {events.map((e: any) => {
                      const d = new Date(e.event_date)
                      return (
                        <div key={e.id} className="evt">
                          <div className="evt-date">
                            <div className="evt-mo">{d.toLocaleDateString('lt-LT', { month:'short' }).toUpperCase()}</div>
                            <div className="evt-day">{d.getDate()}</div>
                          </div>
                          <div><div className="evt-title">{e.title}</div><div className="evt-venue">{e.venues?.name || e.venue_custom || ''}{e.venues?.city ? `, ${e.venues.city}` : ''}</div></div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* News */}
                {news.length > 0 && (
                  <div className="scard">
                    <div className="sec-title" style={{ marginBottom:10 }}>Naujienos</div>
                    {news.map(n => (
                      <Link key={n.id} href={`/news/${n.slug}`} className="news-item">
                        {n.image_small_url ? <img src={n.image_small_url} alt="" className="news-thumb" /> : <div className="news-thumb" />}
                        <div><div className="news-title">{n.title}</div><div className="news-date">{new Date(n.published_at).toLocaleDateString('lt-LT')}</div></div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
