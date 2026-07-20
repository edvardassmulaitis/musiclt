'use client'
// app/v2/V2Client.tsx — alternatyvaus /v2 puslapio prezentacija.
// Header/footer ateina iš SiteShell (app/layout.tsx) — čia jų NErenderinam.
// Stiliai naudoja globals.css temos tokenus (--bg-*, --text-*, --accent-*,
// --border-*, --radius-*), todėl adaptuojasi ir light, ir dark režimui.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { proxyImgResized } from '@/lib/img-proxy'
import { eventHref } from '@/lib/event-href'

/* ─────────────────────────── Types (tik naudojami laukai) ─────────────────────────── */
type ArtistRef = { id?: number; name: string; slug?: string | null; cover_image_url?: string | null } | null
type MTrack = {
  id: number; title: string; slug: string | null; cover_url: string | null
  artist_name: string; artist_slug: string; artists: ArtistRef
  video_uploaded_at?: string | null; is_new?: boolean; created_at?: string | null
}
type MAlbum = {
  id: number; title: string; slug: string | null; cover_image_url: string | null; cover_url?: string | null
  year: number | null; month?: number | null; day?: number | null; release_date?: string | null
  artist_name: string; artist_slug: string; artists: ArtistRef; is_new?: boolean
}
type Music = {
  tracks: { lt: MTrack[]; world: MTrack[]; totalLt: number; totalWorld: number }
  albums: { lt: MAlbum[]; world: MAlbum[]; totalLt: number; totalWorld: number }
  upcoming: MAlbum[]; upcomingTotal: number
}
type EventItem = {
  id: number; title: string; slug?: string | null; legacy_id?: number | string | null
  start_date?: string; cover_image_url?: string | null; city?: string | null
  venues?: { name?: string; city?: string } | null; is_festival?: boolean; is_abroad?: boolean
  event_artists?: { artists?: { name: string; slug: string } | null }[] | null
}
type HistItem = {
  id: string; type: 'album_anniversary' | 'birthday' | 'death_anniversary'
  title: string; subtitle?: string | null; href: string; emoji?: string | null
  cover: string | null; year: number | null; age: number | null; artist?: string | null
}
type Candidate = { rank: number; title: string; artist: string; cover: string | null; votes: number }
type CommunityItem = {
  id: string; type: 'dd' | 'blog' | 'discussion' | 'atradimas'; subtype?: string | null
  editorial_type?: string | null; title: string; href: string; cover?: string | null
  author_name?: string | null; author_avatar?: string | null; comment_count?: number
  vote_total?: number; candidates?: Candidate[]; excerpt?: string | null
}
type TopItem = {
  id: number; position: number; prev_position: number | null; is_new?: boolean
  tracks?: { title: string; slug?: string | null; cover_url?: string | null; artists?: ArtistRef } | null
}
type Nomination = {
  id: number; votes: number; weighted_votes: number
  tracks?: { title: string; cover_url: string | null; artists?: ArtistRef } | null
}

type Props = {
  music: Music
  events: EventItem[]
  history: HistItem[]
  community: CommunityItem[]
  top: TopItem[]
  nominations: Nomination[]
}

/* ─────────────────────────── Helpers ─────────────────────────── */
const MON_LT = ['sau', 'vas', 'kov', 'bal', 'geg', 'bir', 'lie', 'rgp', 'rgs', 'spa', 'lap', 'gru']
const MON_UP = ['SAU', 'VAS', 'KOV', 'BAL', 'GEG', 'BIR', 'LIE', 'RGP', 'RGS', 'SPA', 'LAP', 'GRU']

function img(url: string | null | undefined, w: number): string {
  return proxyImgResized(url || null, w)
}
function artistHref(slug?: string | null): string {
  return slug ? `/atlikejai/${slug}` : '/atlikejai'
}
function albumHref(a: MAlbum): string {
  if (a.slug && a.artist_slug) return `/albumai/${a.artist_slug}-${a.slug}-${a.id}`
  return artistHref(a.artist_slug)
}
function eventDate(iso?: string): { d: string; m: string } {
  if (!iso) return { d: '', m: '' }
  const dt = new Date(iso)
  if (isNaN(dt.getTime())) return { d: '', m: '' }
  return { d: String(dt.getDate()), m: MON_UP[dt.getMonth()] || '' }
}
function albumWhen(a: MAlbum): string {
  if (a.release_date) {
    const dt = new Date(a.release_date)
    if (!isNaN(dt.getTime())) return `${dt.getDate()} ${MON_LT[dt.getMonth()]}`
  }
  return a.year ? String(a.year) : ''
}
function upcomingWhen(a: MAlbum): string {
  if (a.year && a.month) {
    const now = new Date()
    const dt = new Date(a.year, a.month - 1, a.day ?? 1)
    const days = Math.round((dt.getTime() - now.getTime()) / 86_400_000)
    if (days >= 0 && days <= 60) return `Po ${days} d.`
    return `${a.day ?? ''} ${MON_LT[a.month - 1]}`.trim()
  }
  return a.year ? String(a.year) : 'Netrukus'
}

/* ─────────────────────────── Small UI atoms ─────────────────────────── */
function Thumb({ url, w, alt, radius = 8 }: { url: string | null | undefined; w: number; alt: string; radius?: number }) {
  const src = img(url, w)
  return (
    <span className="v2-thumb" style={{ borderRadius: radius }}>
      {src ? <img src={src} alt={alt} loading="lazy" decoding="async" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} /> : null}
    </span>
  )
}

/* ─────────────────────────── Component ─────────────────────────── */
export default function V2Client({ music, events, history, community, top, nominations }: Props) {
  const [lane, setLane] = useState<'lt' | 'world'>('lt')

  const tracks = lane === 'lt' ? music.tracks.lt : music.tracks.world
  const albums = lane === 'lt' ? music.albums.lt : music.albums.world
  const laneTotal = lane === 'lt' ? music.tracks.totalLt : music.tracks.totalWorld
  const featured = tracks[0]
  const restTracks = tracks.slice(1, 7)

  // Dienos daina — iš community feed'o (item.type==='dd'); fallback į nominations.
  const ddItem = useMemo(() => community.find((c) => c.type === 'dd'), [community])
  const ddCandidates: Candidate[] = useMemo(() => {
    if (ddItem?.candidates?.length) return ddItem.candidates.slice(0, 3)
    return nominations.slice(0, 3).map((n, i) => ({
      rank: i + 1,
      title: n.tracks?.title || '',
      artist: n.tracks?.artists?.name || '',
      cover: n.tracks?.cover_url || null,
      votes: n.votes || 0,
    }))
  }, [ddItem, nominations])
  const ddSubtype = ddItem?.subtype || 'today_leader'

  // Bendruomenės akcentai (blog / discussion / atradimas) — be dd.
  const highlights = useMemo(
    () => community.filter((c) => c.type !== 'dd').slice(0, 3),
    [community],
  )

  // Topai movers — top 5.
  const movers = top.slice(0, 5)

  // Istorija — pirmi ~12, mišrūs tipai.
  const hist = history.slice(0, 12)

  return (
    <div className="v2-shell">
      <style>{V2_CSS}</style>

      <header className="v2-head">
        <div>
          <h1>Music.lt <span className="v2-badge">v2</span></h1>
          <p>Alternatyvus pagrindinio puslapio variantas — su tikrais duomenimis.</p>
        </div>
        <Link href="/" className="v2-headlink">← Į dabartinį puslapį</Link>
      </header>

      {/* ══════════ SPLIT: nauja muzika (65%) + bendruomenė (35%) ══════════ */}
      <div className="v2-split">
        {/* ─── Nauja muzika ─── */}
        <section className="v2-zone">
          <div className="v2-zhead">
            <div className="v2-ztitle"><span className="v2-bar" /> Nauja muzika</div>
            <div className="v2-tabs">
              <button className={lane === 'lt' ? 'on' : ''} onClick={() => setLane('lt')}>Lietuva</button>
              <button className={lane === 'world' ? 'on' : ''} onClick={() => setLane('world')}>Pasaulis</button>
            </div>
          </div>

          {featured ? (
            <Link href={artistHref(featured.artist_slug)} className="v2-featured">
              <span className="v2-fcover">
                {img(featured.cover_url || featured.artists?.cover_image_url, 240)
                  ? <img src={img(featured.cover_url || featured.artists?.cover_image_url, 240)} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                  : null}
                {featured.is_new ? <span className="v2-fresh">Nauja</span> : null}
              </span>
              <span className="v2-finfo">
                <span className="v2-fk">▶ Naujausias klipas</span>
                <span className="v2-fn">{featured.title}</span>
                <span className="v2-fa">{featured.artist_name}</span>
              </span>
            </Link>
          ) : (
            <div className="v2-empty">Šiuo metu nėra naujų dainų šioje juostoje.</div>
          )}

          {restTracks.length > 0 && (
            <div className="v2-tracklist">
              {restTracks.map((t) => (
                <Link key={t.id} href={artistHref(t.artist_slug)} className="v2-trk">
                  <Thumb url={t.cover_url || t.artists?.cover_image_url} w={80} alt={t.title} />
                  <span className="v2-nm"><b>{t.title}</b><span>{t.artist_name}</span></span>
                  {t.is_new ? <span className="v2-dot" /> : null}
                </Link>
              ))}
            </div>
          )}
          {laneTotal > tracks.length && (
            <Link href="/muzika" className="v2-more">Visos naujos dainos ({laneTotal}) →</Link>
          )}

          {/* Nauji albumai */}
          {albums.length > 0 && (
            <>
              <div className="v2-subhead">Nauji albumai</div>
              <div className="v2-albrow">
                {albums.slice(0, 6).map((a) => (
                  <Link key={a.id} href={albumHref(a)} className="v2-alb">
                    <Thumb url={a.cover_image_url || a.cover_url || a.artists?.cover_image_url} w={200} alt={a.title} radius={10} />
                    <span className="v2-albn">{a.title}</span>
                    <span className="v2-alba">{a.artist_name}</span>
                    <span className="v2-albw">{albumWhen(a)}</span>
                  </Link>
                ))}
              </div>
            </>
          )}

          {/* Greitai pasirodys */}
          {music.upcoming.length > 0 && (
            <>
              <div className="v2-subhead">Greitai pasirodys</div>
              <div className="v2-uprow">
                {music.upcoming.slice(0, 6).map((a) => (
                  <Link key={a.id} href={albumHref(a)} className="v2-up">
                    <Thumb url={a.cover_image_url || a.cover_url || a.artists?.cover_image_url} w={96} alt={a.title} />
                    <span className="v2-nm"><b>{a.title}</b><span>{a.artist_name}</span></span>
                    <span className="v2-cd">{upcomingWhen(a)}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </section>

        {/* ─── Bendruomenė (šoninė juosta) ─── */}
        <aside className="v2-side">
          {/* Dienos daina */}
          <div className="v2-card v2-accent">
            <div className="v2-ctag v2-ctag-o">♪ Dienos daina</div>
            {ddCandidates.length > 0 ? (
              <>
                <div className="v2-ddsub">{ddSubtype === 'yesterday_winner' ? 'Vakar laimėjo' : 'Šiandien pirmauja'}</div>
                {ddCandidates.map((c) => (
                  <div key={c.rank} className="v2-ddrow">
                    <span className="v2-ddrank">{c.rank}</span>
                    <Thumb url={c.cover} w={72} alt={c.title} />
                    <span className="v2-nm"><b>{c.title}</b><span>{c.artist}</span></span>
                    <span className="v2-ddv">{c.votes}★</span>
                  </div>
                ))}
                <Link href="/dienos-daina" className="v2-ddcta">Balsuoti / siūlyti →</Link>
              </>
            ) : (
              <div className="v2-empty">Šios dienos balsavimas dar tuščias — pasiūlyk pirmas.</div>
            )}
          </div>

          {/* Topai — kyla */}
          {movers.length > 0 && (
            <div className="v2-card">
              <div className="v2-ctag v2-ctag-g">▲ Topai · šią savaitę</div>
              <div className="v2-movers">
                {movers.map((m) => {
                  const delta = m.prev_position != null ? m.prev_position - m.position : null
                  return (
                    <Link key={m.id} href={artistHref(m.tracks?.artists?.slug)} className="v2-mv">
                      <span className="v2-mpos">{m.position}</span>
                      <Thumb url={m.tracks?.cover_url || m.tracks?.artists?.cover_image_url} w={64} alt={m.tracks?.title || ''} radius={6} />
                      <span className="v2-nm"><b>{m.tracks?.title}</b><span>{m.tracks?.artists?.name}</span></span>
                      <span className={'v2-delta ' + (delta == null ? 'n' : delta > 0 ? 'u' : delta < 0 ? 'd' : 'z')}>
                        {delta == null ? 'NAUJA' : delta > 0 ? `▲${delta}` : delta < 0 ? `▼${-delta}` : '–'}
                      </span>
                    </Link>
                  )
                })}
              </div>
              <Link href="/top40" className="v2-ddcta">Visas topas →</Link>
            </div>
          )}

          {/* Bendruomenės akcentai */}
          {highlights.length > 0 && (
            <div className="v2-card">
              <div className="v2-ctag v2-ctag-b">✦ Bendruomenėje</div>
              <div className="v2-hl">
                {highlights.map((h) => (
                  <Link key={h.id} href={h.href || '/bendruomene'} className="v2-hlrow">
                    <Thumb url={h.cover} w={88} alt={h.title} radius={8} />
                    <span className="v2-hltext">
                      <span className="v2-hlkind">{communityKind(h.type)}</span>
                      <b>{h.title}</b>
                      {h.author_name ? <span className="v2-hlauthor">{h.author_name}</span> : null}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* ══════════ Renginių afišos ══════════ */}
      {events.length > 0 && (
        <section className="v2-block">
          <div className="v2-bhead"><span className="v2-bar" /><h2>Koncertai</h2><Link href="/koncertai" className="v2-more2">Daugiau →</Link></div>
          <div className="v2-kon">
            {events.slice(0, 10).map((ev) => {
              const { d, m } = eventDate(ev.start_date)
              const line1 = ev.event_artists?.[0]?.artists?.name || ev.title
              const place = ev.venues?.city || ev.city || (ev.is_abroad ? 'Užsienis' : '')
              return (
                <Link key={ev.id} href={eventHref({ title: ev.title, slug: ev.slug, legacy_id: ev.legacy_id })} className="v2-kcard">
                  <span className="v2-kcover">
                    {img(ev.cover_image_url, 320) ? <img src={img(ev.cover_image_url, 320)} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} /> : null}
                    {d ? <span className="v2-kdate"><b>{d}</b><span>{m}</span></span> : null}
                    {ev.is_festival ? <span className="v2-kfest">Festivalis</span> : null}
                  </span>
                  <span className="v2-kbody">
                    {place ? <span className="v2-kcity">{place}</span> : null}
                    <span className="v2-kname">{line1}</span>
                  </span>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* ══════════ Muzikos istorija / nostalgija ══════════ */}
      {hist.length > 0 && (
        <section className="v2-block">
          <div className="v2-bhead"><span className="v2-bar" style={{ background: 'var(--accent-blue)' }} /><h2>Šiandien muzikos istorijoje</h2><Link href="/istorija" className="v2-more2">Daugiau →</Link></div>
          <div className="v2-hist">
            {hist.map((h) => (
              <Link key={h.id} href={h.href} className="v2-hcard">
                <span className="v2-hcover">
                  {img(h.cover, 200) ? <img src={img(h.cover, 200)} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} /> : <span className="v2-hemoji">{h.emoji || '♪'}</span>}
                  <span className="v2-hkind">{histKind(h)}</span>
                </span>
                <span className="v2-hn">{h.title}</span>
                <span className="v2-hs">{h.subtitle || h.artist || ''}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function communityKind(t: CommunityItem['type']): string {
  switch (t) {
    case 'blog': return 'Įrašas'
    case 'discussion': return 'Diskusija'
    case 'atradimas': return 'Atradimas'
    default: return 'Bendruomenė'
  }
}
function histKind(h: HistItem): string {
  switch (h.type) {
    case 'birthday': return h.age ? `${h.age} m.` : 'Gimtadienis'
    case 'death_anniversary': return 'In memoriam'
    default: return h.year ? `${new Date().getFullYear() - h.year} m.` : 'Sukaktis'
  }
}

/* ─────────────────────────── Styles (temos tokenai) ─────────────────────────── */
const V2_CSS = `
.v2-shell{max-width:var(--page-max);margin:0 auto;padding:var(--page-pad-top) var(--page-pad-x) var(--page-pad-bottom);}
.v2-shell a{color:inherit;text-decoration:none}
.v2-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:22px}
.v2-head h1{font-family:'Outfit',sans-serif;font-size:var(--page-h1-size);font-weight:var(--page-h1-weight);letter-spacing:var(--page-h1-tracking);line-height:1.05;margin:0;color:var(--text-primary)}
.v2-badge{font-size:.5em;vertical-align:middle;background:var(--accent-orange);color:#fff;border-radius:var(--radius-pill);padding:.2em .6em;font-weight:800;letter-spacing:0}
.v2-head p{margin:.35rem 0 0;font-size:var(--page-sub-size);color:var(--page-sub-color)}
.v2-headlink{font-size:13px;color:var(--text-muted);white-space:nowrap}
.v2-bar{width:5px;height:20px;border-radius:3px;background:var(--accent-orange);flex:none;display:inline-block}

.v2-split{display:grid;grid-template-columns:minmax(0,1.85fr) minmax(0,1fr);gap:22px;align-items:start}

/* nauja muzika zona */
.v2-zone{background:var(--card-surface);border:1px solid var(--card-border-default);border-radius:var(--radius-2xl);padding:18px 20px}
.v2-zhead{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.v2-ztitle{display:flex;align-items:center;gap:10px;font-family:'Outfit',sans-serif;font-size:20px;font-weight:800;color:var(--text-primary)}
.v2-tabs{margin-left:auto;display:flex;gap:6px}
.v2-tabs button{border:1px solid var(--border-default);background:transparent;color:var(--text-secondary);border-radius:var(--radius-pill);padding:6px 14px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit}
.v2-tabs button.on{background:var(--text-primary);color:var(--bg-body);border-color:var(--text-primary)}

.v2-featured{display:flex;gap:16px;align-items:center;padding:12px;border:1px solid var(--card-border-subtle);border-radius:var(--radius-xl);background:var(--bg-hover);margin-bottom:12px}
.v2-fcover{width:120px;height:120px;border-radius:12px;overflow:hidden;flex:none;position:relative;background:linear-gradient(135deg,var(--bg-elevated),var(--bg-surface))}
.v2-fcover img{width:100%;height:100%;object-fit:cover;display:block}
.v2-fresh{position:absolute;left:8px;bottom:8px;background:var(--accent-orange);color:#fff;font-size:10.5px;font-weight:800;border-radius:6px;padding:2px 8px}
.v2-finfo{display:flex;flex-direction:column;min-width:0}
.v2-fk{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--accent-orange)}
.v2-fn{font-family:'Outfit',sans-serif;font-weight:800;font-size:22px;line-height:1.1;margin-top:5px;color:var(--text-primary)}
.v2-fa{color:var(--text-muted);font-size:14px;margin-top:3px}

.v2-tracklist{display:grid;grid-template-columns:1fr 1fr;gap:2px 18px}
.v2-trk{display:flex;align-items:center;gap:11px;padding:7px 6px;border-radius:var(--radius-sm)}
.v2-trk:hover{background:var(--bg-hover)}
.v2-thumb{width:40px;height:40px;flex:none;overflow:hidden;display:block;background:linear-gradient(135deg,var(--bg-elevated),var(--bg-surface))}
.v2-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.v2-nm{flex:1;min-width:0;font-size:13.5px;line-height:1.25}
.v2-nm b{font-weight:700;color:var(--text-primary);display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v2-nm span{color:var(--text-muted);font-size:12px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v2-dot{width:8px;height:8px;border-radius:50%;background:var(--accent-green);flex:none}
.v2-more{display:inline-block;margin-top:8px;font-size:12.5px;font-weight:700;color:var(--accent-orange)}

.v2-subhead{margin:18px 0 10px;font-family:'Outfit',sans-serif;font-size:15px;font-weight:800;color:var(--text-secondary)}
.v2-albrow{display:flex;gap:14px;overflow-x:auto;padding-bottom:4px}
.v2-alb{width:118px;flex:none}
.v2-alb .v2-thumb{width:118px;height:118px}
.v2-albn{display:block;font-weight:700;font-size:13px;margin-top:8px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v2-alba{display:block;color:var(--text-muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v2-albw{display:block;color:var(--text-faint);font-size:11px;margin-top:2px}

.v2-uprow{display:grid;grid-template-columns:1fr 1fr;gap:2px 18px}
.v2-up{display:flex;align-items:center;gap:10px;padding:7px 6px;border-radius:var(--radius-sm)}
.v2-up:hover{background:var(--bg-hover)}
.v2-up .v2-thumb{width:36px;height:36px}
.v2-cd{font-size:10.5px;font-weight:800;color:var(--accent-orange);background:var(--card-active-bg);border-radius:6px;padding:2px 7px;white-space:nowrap}

/* šoninė juosta */
.v2-side{display:flex;flex-direction:column;gap:16px}
.v2-card{background:var(--card-surface);border:1px solid var(--card-border-default);border-radius:var(--radius-xl);padding:15px}
.v2-accent{background:linear-gradient(180deg,var(--card-active-bg),transparent),var(--card-surface);border-color:rgba(249,115,22,.28)}
.v2-ctag{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:3px 10px;border-radius:var(--radius-pill)}
.v2-ctag-o{background:rgba(249,115,22,.14);color:var(--accent-orange)}
.v2-ctag-g{background:rgba(34,197,94,.14);color:var(--accent-green)}
.v2-ctag-b{background:rgba(59,130,246,.14);color:var(--accent-link)}
.v2-ddsub{font-size:11.5px;color:var(--text-muted);margin:10px 0 4px}
.v2-ddrow{display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--card-border-subtle)}
.v2-ddrow:last-of-type{border-bottom:none}
.v2-ddrow .v2-thumb{width:38px;height:38px}
.v2-ddrank{font-weight:800;color:var(--text-faint);width:14px;font-size:13px}
.v2-ddv{font-size:11.5px;font-weight:700;color:var(--text-secondary);white-space:nowrap}
.v2-ddcta{display:inline-block;margin-top:11px;font-size:12.5px;font-weight:700;color:var(--accent-orange)}

.v2-movers{margin-top:10px}
.v2-mv{display:flex;align-items:center;gap:9px;padding:6px 0;border-bottom:1px solid var(--card-border-subtle)}
.v2-mv:last-of-type{border-bottom:none}
.v2-mpos{font-weight:800;color:var(--text-faint);width:15px;font-size:13px}
.v2-delta{font-size:11px;font-weight:800;white-space:nowrap}
.v2-delta.u{color:var(--accent-green)} .v2-delta.d{color:var(--accent-red)} .v2-delta.n{color:var(--accent-orange)} .v2-delta.z{color:var(--text-faint)}

.v2-hl{margin-top:10px;display:flex;flex-direction:column;gap:4px}
.v2-hlrow{display:flex;gap:11px;padding:7px 0;border-bottom:1px solid var(--card-border-subtle)}
.v2-hlrow:last-of-type{border-bottom:none}
.v2-hlrow .v2-thumb{width:46px;height:46px;flex:none}
.v2-hltext{min-width:0;display:flex;flex-direction:column}
.v2-hlkind{font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--text-faint)}
.v2-hltext b{font-size:13px;font-weight:700;color:var(--text-primary);line-height:1.3;margin-top:1px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.v2-hlauthor{font-size:11.5px;color:var(--text-muted);margin-top:2px}

.v2-empty{color:var(--text-muted);font-size:13px;padding:10px 2px}

/* blokai (full width) */
.v2-block{margin-top:var(--page-section-gap)}
.v2-bhead{display:flex;align-items:center;gap:11px;margin-bottom:14px}
.v2-bhead h2{font-family:'Outfit',sans-serif;font-size:20px;font-weight:800;margin:0;color:var(--text-primary)}
.v2-more2{margin-left:auto;font-size:12.5px;font-weight:700;color:var(--accent-orange)}

.v2-kon{display:grid;grid-template-columns:repeat(5,1fr);gap:14px}
.v2-kcard{border:1px solid var(--card-border-default);border-radius:var(--radius-xl);overflow:hidden;background:var(--card-surface)}
.v2-kcover{display:block;height:150px;position:relative;background:linear-gradient(135deg,var(--bg-elevated),var(--bg-surface))}
.v2-kcover img{width:100%;height:100%;object-fit:cover;display:block}
.v2-kdate{position:absolute;top:9px;left:9px;background:var(--bg-surface);color:var(--text-primary);border-radius:8px;text-align:center;padding:3px 8px;line-height:1.02;box-shadow:0 2px 6px rgba(0,0,0,.15)}
.v2-kdate b{font-size:15px;display:block;font-weight:800}
.v2-kdate span{font-size:9px;color:var(--text-muted);font-weight:700}
.v2-kfest{position:absolute;top:9px;right:9px;background:var(--accent-blue);color:#fff;font-size:9.5px;font-weight:800;border-radius:6px;padding:2px 7px;text-transform:uppercase;letter-spacing:.05em}
.v2-kbody{display:block;padding:9px 11px 11px}
.v2-kcity{display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted)}
.v2-kname{display:block;font-weight:700;font-size:13.5px;margin-top:2px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

.v2-hist{display:grid;grid-template-columns:repeat(6,1fr);gap:14px}
.v2-hcard{display:block}
.v2-hcover{display:flex;align-items:center;justify-content:center;position:relative;width:100%;aspect-ratio:1;border-radius:var(--radius-lg);overflow:hidden;background:linear-gradient(135deg,var(--bg-elevated),var(--bg-surface))}
.v2-hcover img{width:100%;height:100%;object-fit:cover;display:block}
.v2-hemoji{font-size:38px}
.v2-hkind{position:absolute;bottom:7px;left:7px;background:rgba(0,0,0,.62);color:#fff;font-size:9.5px;font-weight:800;border-radius:6px;padding:2px 7px;text-transform:uppercase;letter-spacing:.04em;backdrop-filter:blur(3px)}
.v2-hn{display:block;font-weight:700;font-size:13px;margin-top:8px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v2-hs{display:block;color:var(--text-muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

@media (max-width:900px){
  .v2-split{grid-template-columns:1fr}
  .v2-tracklist,.v2-uprow{grid-template-columns:1fr}
  .v2-kon{grid-template-columns:repeat(2,1fr)}
  .v2-hist{grid-template-columns:repeat(3,1fr)}
}
@media (max-width:640px){
  .v2-shell{padding-left:var(--page-pad-x-sm);padding-right:var(--page-pad-x-sm)}
  .v2-hist{grid-template-columns:repeat(2,1fr)}
}
`
