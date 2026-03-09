'use client'
// app/lt/albumas/[slug]/[id]/album-page-client.tsx
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { HeaderAuth } from '@/components/HeaderAuth'

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

type Props = {
  album: Album; artist: Artist; tracks: Track[]
  otherAlbums: SimpleAlbum[]; similarAlbums: any[]
  likes: number
}

function ytId(url?: string | null) {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  return m ? m[1] : null
}

export default function AlbumPageClient({ album, artist, tracks, otherAlbums, similarAlbums, likes }: Props) {
  const [playingIdx, setPlayingIdx] = useState(0)
  const [liked, setLiked] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => { setLoaded(true) }, [])

  const currentTrack = tracks[playingIdx]
  const currentVid = ytId(currentTrack?.video_url)
  const albumVid = ytId(album.video_url)

  // Popularity mock — based on position (first tracks more popular) + single boost
  const maxPop = tracks.length
  const popScore = (t: Track) => {
    const base = (maxPop - t.position + 1) / maxPop
    const singleBoost = t.is_single ? 0.3 : 0
    return Math.min(1, base + singleBoost)
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="pg">

        {/* HEADER */}
        <header className="hd">
          <div className="hw">
            <Link href="/" className="lg"><b>music</b><i>.lt</i></Link>
            <div className="sr-wrap"><input placeholder="Ieškok atlikėjų, albumų, dainų…" /></div>
            <nav className="nv">
              {['Topai', 'Muzika', 'Renginiai', 'Atlikėjai', 'Bendruomenė'].map(n =>
                <a key={n} href="/" className="">{n}</a>
              )}
            </nav>
            <HeaderAuth />
          </div>
        </header>

        {/* HERO */}
        <div className="hero">
          {album.cover_image_url && (
            <div className="hero-bg">
              <img src={album.cover_image_url} alt="" />
            </div>
          )}
          <div className="hero-g1" />
          <div className="hero-g2" />
          <div className={`hero-ct${loaded ? ' hero-in' : ''}`}>
            <div className="hero-inner">
              <div className="hero-row">
                {album.cover_image_url
                  ? <img className="cover" src={album.cover_image_url} alt={album.title} />
                  : <div className="cover cover-fb">💿</div>}
                <div className="hero-info">
                  <div className="hero-label">
                    {album.type}
                    {album.is_upcoming && <span className="upcoming-badge">Greitai</span>}
                  </div>
                  <h1 className="hero-title">{album.title}</h1>
                  <Link href={`/atlikejai/${artist.slug}`} className="hero-artist">{artist.name}</Link>
                  <div className="hero-meta">
                    {album.dateFormatted && <span>{album.dateFormatted}</span>}
                    <span className="dot">·</span>
                    <span>{tracks.length} {tracks.length === 1 ? 'daina' : tracks.length < 10 ? 'dainos' : 'dainų'}</span>
                  </div>
                  <div className="actions">
                    <button
                      className={`btn-like${liked ? ' liked' : ''}`}
                      onClick={() => setLiked(!liked)}
                    >
                      {liked ? '♥' : '♡'} {likes + (liked ? 1 : 0)}
                    </button>
                    <button className="btn-share" title="Dalintis">↗</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CONTENT */}
        <div className="content">
          <div className="left">

            {/* Player + Tracklist */}
            <div className="card">
              <div className="card-head">Susijusi muzika</div>

              {/* YouTube player */}
              <div className="yt-wrap">
                {currentVid || albumVid ? (
                  <iframe
                    key={currentVid || albumVid}
                    src={`https://www.youtube.com/embed/${currentVid || albumVid}?rel=0`}
                    allow="autoplay; encrypted-media"
                    allowFullScreen
                    className="yt-frame"
                  />
                ) : (
                  <div className="yt-placeholder">
                    <div className="yt-icon">▶</div>
                    <div className="yt-hint">Vaizdo įrašas nepriskirtas</div>
                  </div>
                )}
              </div>

              {/* Now playing */}
              {currentTrack && (
                <div className="now-playing">
                  <div className="now-info">
                    <div className="now-title">{currentTrack.title}</div>
                    <div className="now-artist">
                      {artist.name}
                      {currentTrack.featuring.length > 0 && ` su ${currentTrack.featuring.join(', ')}`}
                    </div>
                  </div>
                  <div className="now-yt-icon">▶</div>
                </div>
              )}

              {/* Tracks */}
              <div className="tracklist">
                {tracks.map((t, i) => {
                  const pop = popScore(t)
                  const isPlaying = playingIdx === i
                  return (
                    <div
                      key={t.id}
                      className={`track${isPlaying ? ' playing' : ''}`}
                      onClick={() => setPlayingIdx(i)}
                    >
                      <div className="track-top">
                        <div className="track-num">
                          {isPlaying ? '▶' : t.position}
                        </div>
                        <div className="track-thumb">
                          {album.cover_image_url
                            ? <img src={album.cover_image_url} alt="" />
                            : '🎵'}
                        </div>
                        <div className="track-info">
                          <div className="track-name">
                            <span className="track-name-text">
                              {t.title}
                              {t.featuring.length > 0 && (
                                <span className="track-feat"> su {t.featuring.join(', ')}</span>
                              )}
                            </span>
                            {t.is_new && <span className="badge-new">NEW</span>}
                            {t.is_single && <span className="badge-single">Singlas</span>}
                          </div>
                        </div>
                        <Link
                          href={`/lt/daina/${t.slug}/${t.id}/`}
                          className="track-link"
                          onClick={e => e.stopPropagation()}
                        >→</Link>
                      </div>
                      {/* Popularity bar */}
                      <div className="pop-row">
                        <div className="pop-bg">
                          <div className="pop-fill" style={{ width: `${Math.round(pop * 100)}%` }} />
                        </div>
                        <div className="pop-val">{Math.round(pop * 100)}%</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Ar žinojai */}
            <div className="card dyk-card">
              <div className="dyk-label">💡 Ar žinojai?</div>
              <div className="dyk-text">
                Informacija apie šį albumą bus rodoma automatiškai iš Wikipedia.
                Administratorius gali keisti šį tekstą admin panelėje.
              </div>
              <div className="dyk-src">Šaltinis: Wikipedia · Adminas gali keisti</div>
            </div>

            {/* Comments */}
            <div className="card">
              <div className="card-head">
                Komentarai
                <span className="card-head-count">0</span>
              </div>
              <div className="comments">
                <div className="comment-input-row">
                  <div className="c-avatar-me">{artist.name[0]}</div>
                  <input className="comment-input" placeholder="Rašyk komentarą…" />
                  <button className="comment-send">Siųsti</button>
                </div>
                <div className="comments-empty">Būk pirmas — palik komentarą!</div>
              </div>
            </div>

          </div>

          <div className="right">

            {/* Panaši muzika */}
            {similarAlbums.length > 0 && (
              <div className="card">
                <div className="card-head">Panaši muzika</div>
                <div className="sim-scroll">
                  {similarAlbums.map((a: any) => (
                    <Link key={a.id} href={`/lt/albumas/${a.slug}/${a.id}/`} className="sim-item">
                      {a.cover_image_url
                        ? <img src={a.cover_image_url} alt={a.title} className="sim-cover" />
                        : <div className="sim-cover sim-cover-fb">🎵</div>}
                      <div className="sim-title">{a.title}</div>
                      <div className="sim-meta">{a.artists?.name} · {a.year}</div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Kiti albumai */}
            {otherAlbums.length > 0 && (
              <div className="card">
                <div className="card-head">Kiti albumai</div>
                <div className="sim-scroll">
                  {otherAlbums.map(a => (
                    <Link key={a.id} href={`/lt/albumas/${a.slug}/${a.id}/`} className="sim-item">
                      {a.cover_image_url
                        ? <img src={a.cover_image_url} alt={a.title} className="sim-cover" />
                        : <div className="sim-cover sim-cover-fb">💿</div>}
                      <div className="sim-title">{a.title}</div>
                      <div className="sim-meta">{a.year}</div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  )
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=DM+Sans:wght@400;500;700&display=swap');
:root {
  --bg: #080c12; --bg2: #111822; --t: #f0f2f5; --t2: #b0bdd4; --t3: #5e7290; --t4: #334058;
  --bd: rgba(255,255,255,.06); --bd2: rgba(255,255,255,.035);
  --or: #f97316; --card: rgba(255,255,255,.03);
  --fd: 'Outfit', system-ui, sans-serif; --fb: 'DM Sans', system-ui, sans-serif;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
.pg { background: var(--bg); color: var(--t); font-family: var(--fb); -webkit-font-smoothing: antialiased; min-height: 100vh; }

/* HEADER */
.hd { position: sticky; top: 0; z-index: 50; background: rgba(8,12,18,.92); backdrop-filter: blur(20px); border-bottom: 1px solid rgba(255,255,255,.03); }
.hw { max-width: 1400px; margin: 0 auto; padding: 0 24px; height: 52px; display: flex; align-items: center; gap: 18px; }
.lg { font-family: var(--fd); font-size: 20px; font-weight: 900; letter-spacing: -.03em; text-decoration: none; }
.lg b { color: #f2f4f8; } .lg i { color: #fb923c; font-style: normal; }
.sr-wrap { flex: 1; max-width: 360px; height: 32px; border-radius: 100px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.06); display: flex; align-items: center; }
.sr-wrap input { flex: 1; padding: 0 14px; font-size: 12px; background: none; border: none; outline: none; color: var(--t2); font-family: var(--fb); }
.sr-wrap input::placeholder { color: var(--t4); }
.nv { display: flex; gap: 1px; margin-left: auto; }
.nv a { padding: 4px 10px; font-size: 11px; font-weight: 600; color: var(--t3); border-radius: 4px; text-decoration: none; font-family: var(--fd); transition: .15s; }
.nv a:hover { color: var(--t); background: rgba(255,255,255,.04); }

/* HERO */
.hero { position: relative; height: 360px; overflow: hidden; }
.hero-bg { position: absolute; inset: 0; }
.hero-bg img { width: 100%; height: 100%; object-fit: cover; object-position: center 20%; display: block; filter: brightness(.25) saturate(1.2); transform: scale(1.05); }
.hero-g1 { position: absolute; inset: 0; background: linear-gradient(to top, var(--bg) 0%, rgba(8,12,18,.8) 40%, rgba(8,12,18,.3) 100%); }
.hero-g2 { position: absolute; inset: 0; background: linear-gradient(to right, rgba(8,12,18,.5) 0%, transparent 60%); }
.hero-ct { position: relative; max-width: 1400px; margin: 0 auto; height: 100%; display: flex; align-items: flex-end; padding: 0 24px 28px; opacity: 0; transform: translateY(10px); transition: opacity .5s, transform .5s; }
.hero-in { opacity: 1; transform: translateY(0); }
.hero-inner { width: 100%; }
.hero-row { display: flex; gap: 20px; align-items: flex-end; }
.cover { width: 130px; height: 130px; border-radius: 14px; object-fit: cover; display: block; box-shadow: 0 20px 50px rgba(0,0,0,.7); flex-shrink: 0; background: var(--bg2); }
.cover-fb { display: flex; align-items: center; justify-content: center; font-size: 40px; }
@media(min-width: 500px) { .cover { width: 180px; height: 180px; } }
.hero-info { flex: 1; min-width: 0; }
.hero-label { font-size: 10px; font-weight: 700; color: rgba(255,255,255,.3); letter-spacing: .1em; text-transform: uppercase; margin-bottom: 4px; display: flex; align-items: center; gap: 8px; }
.upcoming-badge { background: rgba(249,115,22,.15); border: 1px solid rgba(249,115,22,.3); color: var(--or); padding: 1px 7px; border-radius: 999px; font-size: 9px; }
.hero-title { font-family: var(--fd); font-size: clamp(18px, 4.5vw, 36px); font-weight: 900; line-height: 1.1; margin-bottom: 5px; word-break: break-word; }
.hero-artist { font-size: clamp(13px, 2.5vw, 17px); font-weight: 700; color: var(--or); text-decoration: none; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hero-artist:hover { opacity: .85; }
.hero-meta { display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.hero-meta span { font-size: 12px; color: rgba(255,255,255,.32); }
.dot { color: rgba(255,255,255,.15) !important; }
.actions { display: flex; gap: 8px; margin-top: 14px; align-items: center; }
.btn-like { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 999px; font-size: 13px; font-weight: 700; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.06); color: rgba(255,255,255,.7); cursor: pointer; transition: all .15s; font-family: var(--fd); }
.btn-like:hover, .btn-like.liked { background: rgba(249,115,22,.2); border-color: rgba(249,115,22,.4); color: var(--or); }
.btn-share { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 999px; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.06); color: rgba(255,255,255,.45); cursor: pointer; font-size: 15px; transition: all .15s; }
.btn-share:hover { background: rgba(255,255,255,.1); }

/* LAYOUT */
.content { max-width: 1400px; margin: 0 auto; padding: 20px 24px 60px; display: grid; gap: 16px; }
@media(min-width: 768px) { .content { grid-template-columns: 1fr 280px; gap: 20px; } }
.left { display: flex; flex-direction: column; gap: 16px; }
.right { display: flex; flex-direction: column; gap: 16px; }

/* CARD */
.card { background: var(--card); border: 1px solid var(--bd); border-radius: 16px; overflow: hidden; }
.card-head { display: flex; align-items: center; justify-content: space-between; padding: 11px 14px; border-bottom: 1px solid rgba(255,255,255,.055); font-size: 12px; font-weight: 700; color: rgba(255,255,255,.75); font-family: var(--fd); }
.card-head-count { font-size: 10px; color: var(--t4); font-weight: 400; }

/* PLAYER */
.yt-wrap { width: 100%; aspect-ratio: 16/9; background: #000; overflow: hidden; }
.yt-frame { width: 100%; height: 100%; border: none; display: block; }
.yt-placeholder { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; }
.yt-icon { font-size: 36px; color: rgba(255,255,255,.1); }
.yt-hint { font-size: 11px; color: rgba(255,255,255,.15); }
.now-playing { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,.055); gap: 10px; }
.now-info { flex: 1; min-width: 0; }
.now-title { font-size: 13px; font-weight: 700; color: var(--t); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.now-artist { font-size: 11px; color: var(--t3); margin-top: 1px; }
.now-yt-icon { width: 28px; height: 28px; border-radius: 8px; background: rgba(255,255,255,.07); display: flex; align-items: center; justify-content: center; font-size: 12px; color: rgba(255,255,255,.35); flex-shrink: 0; }

/* TRACKLIST */
.tracklist { }
.track { padding: 8px 14px 6px; border-bottom: 1px solid rgba(255,255,255,.035); cursor: pointer; transition: background .1s; }
.track:last-child { border-bottom: none; }
.track:hover { background: rgba(255,255,255,.022); }
.track.playing { background: rgba(249,115,22,.07); }
.track-top { display: flex; align-items: center; gap: 10px; }
.track-num { width: 18px; text-align: center; font-size: 11px; color: rgba(255,255,255,.2); flex-shrink: 0; font-family: var(--fd); }
.track.playing .track-num { color: var(--or); font-weight: 700; }
.track-thumb { width: 30px; height: 30px; border-radius: 5px; background: rgba(255,255,255,.06); flex-shrink: 0; overflow: hidden; display: flex; align-items: center; justify-content: center; font-size: 10px; color: rgba(255,255,255,.15); }
.track-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.track-info { flex: 1; min-width: 0; }
.track-name { display: flex; align-items: center; gap: 5px; }
.track-name-text { font-size: 12px; font-weight: 600; color: rgba(255,255,255,.82); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
.track.playing .track-name-text { color: var(--or); }
.track-feat { font-weight: 400; color: rgba(255,255,255,.4); }
.track-link { font-size: 11px; color: rgba(255,255,255,.2); flex-shrink: 0; text-decoration: none; padding: 2px 4px; border-radius: 4px; transition: .15s; }
.track-link:hover { color: var(--or); background: rgba(249,115,22,.08); }
.badge-new { font-size: 8px; font-weight: 800; padding: 1px 5px; border-radius: 3px; background: rgba(249,115,22,.12); color: var(--or); border: 1px solid rgba(249,115,22,.18); flex-shrink: 0; }
.badge-single { font-size: 8px; font-weight: 800; padding: 1px 5px; border-radius: 3px; background: rgba(255,255,255,.07); color: rgba(255,255,255,.32); border: 1px solid rgba(255,255,255,.08); flex-shrink: 0; }

/* POPULARITY BAR */
.pop-row { display: flex; align-items: center; gap: 6px; padding: 4px 0 0 38px; }
.pop-bg { flex: 1; height: 2px; background: rgba(255,255,255,.05); border-radius: 2px; overflow: hidden; }
.pop-fill { height: 100%; border-radius: 2px; background: linear-gradient(90deg, rgba(249,115,22,.9), rgba(249,115,22,.35)); transition: width .4s ease; }
.pop-val { font-size: 9px; color: rgba(255,255,255,.15); flex-shrink: 0; width: 26px; text-align: right; font-family: var(--fd); }

/* DYK */
.dyk-card { padding: 14px; background: rgba(249,115,22,.04) !important; border-color: rgba(249,115,22,.12) !important; }
.dyk-label { font-size: 10px; font-weight: 800; color: var(--or); text-transform: uppercase; letter-spacing: .08em; margin-bottom: 6px; font-family: var(--fd); }
.dyk-text { font-size: 12px; color: rgba(255,255,255,.45); line-height: 1.65; }
.dyk-src { font-size: 10px; color: rgba(255,255,255,.18); margin-top: 6px; }

/* COMMENTS */
.comments { padding: 14px; }
.comment-input-row { display: flex; gap: 8px; margin-bottom: 12px; }
.c-avatar-me { width: 30px; height: 30px; border-radius: 50%; background: rgba(249,115,22,.18); border: 1px solid rgba(249,115,22,.28); flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: var(--or); }
.comment-input { flex: 1; height: 34px; border-radius: 999px; padding: 0 14px; font-size: 12px; font-family: var(--fb); background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08); color: rgba(255,255,255,.7); outline: none; }
.comment-input::placeholder { color: rgba(255,255,255,.18); }
.comment-send { height: 34px; padding: 0 14px; border-radius: 999px; background: var(--or); border: none; color: #fff; font-size: 12px; font-weight: 700; font-family: var(--fb); cursor: pointer; flex-shrink: 0; }
.comments-empty { font-size: 12px; color: var(--t4); text-align: center; padding: 12px 0 4px; }

/* SIMILAR / OTHER ALBUMS */
.sim-scroll { display: flex; gap: 10px; padding: 12px; overflow-x: auto; scrollbar-width: none; }
.sim-scroll::-webkit-scrollbar { display: none; }
.sim-item { flex-shrink: 0; width: 96px; text-decoration: none; }
.sim-cover { width: 96px; height: 96px; border-radius: 10px; object-fit: cover; display: block; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.07); margin-bottom: 6px; }
.sim-cover-fb { display: flex; align-items: center; justify-content: center; font-size: 24px; }
.sim-title { font-size: 11px; font-weight: 600; color: rgba(255,255,255,.6); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sim-meta { font-size: 10px; color: rgba(255,255,255,.24); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sim-item:hover .sim-title { color: var(--or); }

@media(max-width: 768px) {
  .sr-wrap, .nv { display: none; }
  .content { padding: 16px 16px 48px; }
  .hero { height: 300px; }
  .hero-ct { padding: 0 16px 24px; }
}
@media(max-width: 480px) {
  .hero { height: 260px; }
  .cover { width: 110px !important; height: 110px !important; }
}
`
