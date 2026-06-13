import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getFestivalBySlug } from '@/lib/supabase-events'

type Artist = { id: number; name: string; slug: string; cover_image_url: string | null; country?: string | null }

const MONTHS_GEN = ['sausio', 'vasario', 'kovo', 'balandžio', 'gegužės', 'birželio', 'liepos', 'rugpjūčio', 'rugsėjo', 'spalio', 'lapkričio', 'gruodžio']

function getArtist(ea: any): Artist | null {
  const a = Array.isArray(ea.artists) ? ea.artists[0] : ea.artists
  return a || null
}

function fmtRange(startIso: string, endIso: string | null): string {
  const s = new Date(startIso)
  const y = s.getFullYear()
  if (endIso) {
    const e = new Date(endIso)
    if (e.getFullYear() === y && e.getMonth() === s.getMonth() && e.getDate() !== s.getDate())
      return `${MONTHS_GEN[s.getMonth()]} ${s.getDate()}–${e.getDate()} d., ${y}`
    if (e.getTime() !== s.getTime())
      return `${MONTHS_GEN[s.getMonth()]} ${s.getDate()} – ${MONTHS_GEN[e.getMonth()]} ${e.getDate()} d., ${y}`
  }
  return `${MONTHS_GEN[s.getMonth()]} ${s.getDate()} d., ${y}`
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ev = await getFestivalBySlug(slug)
  if (!ev) return { title: 'Festivalis nerastas — music.lt' }
  const when = fmtRange(ev.start_date, ev.end_date)
  const artists = (ev.event_artists || []).map((ea: any) => getArtist(ea)?.name).filter(Boolean).slice(0, 8).join(', ')
  const desc = ev.description
    ? ev.description.replace(/<[^>]+>/g, '').slice(0, 155)
    : `${ev.title} (${when})${ev.city ? `, ${ev.city}` : ''}. Line-up${artists ? `: ${artists}` : ''}.`
  return {
    title: `${ev.title} – line-up, datos, atlikėjai | music.lt`,
    description: desc,
    alternates: { canonical: `/festivaliai/${ev.slug}` },
    openGraph: {
      title: ev.title,
      description: desc,
      type: 'website',
      ...(ev.cover_image_url ? { images: [ev.cover_image_url] } : {}),
    },
  }
}

export default async function FestivalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ev = await getFestivalBySlug(slug)
  if (!ev) notFound()

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://musiclt.vercel.app'
  const genresByArtist: Record<number, string[]> = ev.artistGenres || {}

  const sorted = (ev.event_artists || []).slice().sort((a: any, b: any) =>
    (Number(b.is_headliner) - Number(a.is_headliner)) || (a.sort_order - b.sort_order))
  const headliners = sorted.filter((ea: any) => ea.is_headliner).map(getArtist).filter(Boolean) as Artist[]
  const others = sorted.filter((ea: any) => !ea.is_headliner).map(getArtist).filter(Boolean) as Artist[]
  const allArtists = [...headliners, ...others]

  const today = new Date().toISOString().slice(0, 10)
  const isUpcoming = (ev.end_date || ev.start_date || '').slice(0, 10) >= today
  const isCancelled = ev.status === 'cancelled'

  const when = fmtRange(ev.start_date, ev.end_date)
  const start = new Date(ev.start_date)
  const dayNum = start.getDate().toString().padStart(2, '0')
  const monthStr = MONTHS_GEN[start.getMonth()].slice(0, 3)
  const yearStr = start.getFullYear()

  const price = ev.price_from
    ? (ev.price_to && ev.price_to !== ev.price_from ? `${ev.price_from}–${ev.price_to} €` : `${ev.price_from} €`)
    : null

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': ev.end_date ? 'Festival' : 'MusicEvent',
    name: ev.title,
    startDate: ev.start_date,
    ...(ev.end_date ? { endDate: ev.end_date } : {}),
    description: (ev.description || '').replace(/<[^>]+>/g, '').slice(0, 500),
    eventStatus: isCancelled ? 'https://schema.org/EventCancelled' : isUpcoming ? 'https://schema.org/EventScheduled' : 'https://schema.org/EventPostponed',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: { '@type': 'Place', name: ev.venue_name || ev.city || 'Lietuva', address: { '@type': 'PostalAddress', addressLocality: ev.city || '', streetAddress: ev.address || '', addressCountry: 'LT' } },
    ...(ev.cover_image_url ? { image: ev.cover_image_url } : {}),
    ...(ev.ticket_url ? { offers: { '@type': 'Offer', url: ev.ticket_url, ...(ev.price_from ? { lowPrice: ev.price_from } : {}), ...(ev.price_to ? { highPrice: ev.price_to } : {}), priceCurrency: 'EUR' } } : {}),
    performer: allArtists.map(a => ({ '@type': 'MusicGroup', name: a.name, url: `${siteUrl}/atlikejai/${a.slug || a.id}` })),
    organizer: { '@type': 'Organization', name: 'Music.lt', url: siteUrl },
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <style>{FP_CSS}</style>

      <div className="fp-wrap">
        {/* ── Breadcrumb ── */}
        <nav className="fp-crumb">
          <Link href="/festivaliai">Festivaliai</Link><span>/</span><b>{ev.title}</b>
        </nav>

        {/* ── HERO banner ── */}
        <div className="fp-hero">
          <div className="fp-hero-bg" style={ev.cover_image_url ? { backgroundImage: `url(${ev.cover_image_url})` } : undefined} />
          <div className="fp-hero-grad" />
          <div className="fp-hero-inner">
            <div className="fp-hero-tags">
              {isCancelled && <span className="fp-tag cancel">ATŠAUKTAS</span>}
              {isUpcoming && !isCancelled && <span className="fp-tag up">🎪 BŪSIMAS FESTIVALIS</span>}
              {!isUpcoming && !isCancelled && <span className="fp-tag arch">FESTIVALIŲ ARCHYVAS</span>}
            </div>
            <h1 className="fp-hero-title">{ev.title}</h1>
            <div className="fp-hero-meta">
              <span><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>{when}</span>
              {(ev.venue_name || ev.city) && <span><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>{[ev.venue_name, ev.city].filter(Boolean).join(', ')}</span>}
              {allArtists.length > 0 && <span><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>{allArtists.length} atlikėjai</span>}
            </div>
            {(price || (ev.ticket_url && isUpcoming && !isCancelled)) && (
              <div className="fp-hero-cta">
                {price && <span className="fp-price">{price}</span>}
                {ev.ticket_url && isUpcoming && !isCancelled && (
                  <a href={ev.ticket_url} target="_blank" rel="noopener noreferrer" className="fp-ticket">🎟 Pirkti bilietą</a>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="fp-cols">
          {/* ── Pagrindinis stulpelis ── */}
          <div className="fp-main">
            {/* Aprašymas */}
            {ev.description && (
              <section className="fp-block">
                <h2 className="fp-h2">Apie festivalį</h2>
                <div className="fp-desc" dangerouslySetInnerHTML={{ __html: ev.description }} />
              </section>
            )}

            {/* LINE-UP */}
            {allArtists.length > 0 && (
              <section className="fp-block">
                <h2 className="fp-h2">Line-up <span className="fp-h2-count">{allArtists.length}</span></h2>

                {headliners.length > 0 && (
                  <>
                    <p className="fp-sub">Headlineriai</p>
                    <div className="fp-head-grid">
                      {headliners.map(a => <ArtistCard key={a.id} a={a} genres={genresByArtist[a.id]} big />)}
                    </div>
                  </>
                )}

                {others.length > 0 && (
                  <>
                    {headliners.length > 0 && <p className="fp-sub">Kiti atlikėjai</p>}
                    <div className="fp-art-grid">
                      {others.map(a => <ArtistCard key={a.id} a={a} genres={genresByArtist[a.id]} />)}
                    </div>
                  </>
                )}
              </section>
            )}
          </div>

          {/* ── Šoninė juosta ── */}
          <aside className="fp-side">
            <div className="fp-info">
              <div className="fp-info-date">
                <span className="fp-info-day">{dayNum}</span>
                <span className="fp-info-mon">{monthStr}</span>
                <span className="fp-info-year">{yearStr}</span>
              </div>
              <dl className="fp-info-list">
                <div><dt>Datos</dt><dd>{when}</dd></div>
                {ev.venue_name && <div><dt>Vieta</dt><dd>{ev.venue_name}</dd></div>}
                {ev.city && <div><dt>Miestas</dt><dd>{ev.city}</dd></div>}
                {ev.address && <div><dt>Adresas</dt><dd>{ev.address}</dd></div>}
                {price && <div><dt>Bilietai</dt><dd>{price}</dd></div>}
                <div><dt>Atlikėjų</dt><dd>{allArtists.length}</dd></div>
              </dl>
              {ev.ticket_url && isUpcoming && !isCancelled && (
                <a href={ev.ticket_url} target="_blank" rel="noopener noreferrer" className="fp-ticket full">🎟 Pirkti bilietą</a>
              )}
            </div>

            {ev.attendees && ev.attendees.length > 0 && (
              <div className="fp-info">
                <p className="fp-side-h">Dalyvauja ({ev.attendees.length})</p>
                <div className="fp-att">
                  {ev.attendees.slice(0, 18).map((att: any, i: number) => (
                    <Link key={`${att.user_username}-${i}`} href={`/u/${att.user_username}`} className="fp-att-chip" title={att.user_username}>
                      <span className="fp-att-av" style={{ background: `hsl(${(att.user_username.charCodeAt(0) || 65) * 17 % 360},32%,18%)` }}>
                        {att.user_avatar_url ? <img src={att.user_avatar_url} alt={att.user_username} /> : att.user_username[0]?.toUpperCase()}
                      </span>
                      <span className="fp-att-name">{att.user_username}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>

        <div className="fp-back">
          <Link href="/festivaliai">← Visi festivaliai</Link>
        </div>
      </div>
    </>
  )
}

/* ── Atlikėjo kortelė ── */
function ArtistCard({ a, genres, big }: { a: Artist; genres?: string[]; big?: boolean }) {
  const isLt = a.country === 'Lietuva'
  return (
    <Link href={`/atlikejai/${a.slug || a.id}`} className={`fp-artist${big ? ' big' : ''}`}>
      <span className="fp-artist-av" style={{ background: `hsl(${(a.name.charCodeAt(0) || 65) * 17 % 360},32%,17%)` }}>
        {a.cover_image_url ? <img src={a.cover_image_url} alt={a.name} loading="lazy" /> : <span className="fp-artist-i">{a.name[0]?.toUpperCase()}</span>}
      </span>
      <span className="fp-artist-info">
        <span className="fp-artist-name">{isLt && <span className="fp-flag">🇱🇹</span>}{a.name}</span>
        {big && genres && genres.length > 0 && <span className="fp-artist-gen">{genres.slice(0, 2).join(' · ')}</span>}
      </span>
    </Link>
  )
}

const FP_CSS = `
.fp-wrap { max-width:1160px; margin:0 auto; padding:18px var(--page-pad-x,24px) 60px; font-family:'DM Sans',system-ui,sans-serif; }
@media(max-width:640px){ .fp-wrap { padding-left:var(--page-pad-x-sm,16px); padding-right:var(--page-pad-x-sm,16px); } }

.fp-crumb { display:flex; align-items:center; gap:7px; font-family:'Outfit',sans-serif; font-size:12.5px; font-weight:600; color:var(--text-faint); margin-bottom:14px; }
.fp-crumb a { color:var(--text-muted); }
.fp-crumb a:hover { color:#06b6d4; }
.fp-crumb b { color:var(--text-secondary); font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:60vw; }

/* HERO */
.fp-hero { position:relative; border-radius:22px; overflow:hidden; min-height:300px; margin-bottom:26px; background:var(--bg-elevated);
  border:1px solid var(--border-default,rgba(255,255,255,0.08)); }
.fp-hero-bg { position:absolute; inset:0; background-size:cover; background-position:center; background-color:#0c1622; }
.fp-hero-grad { position:absolute; inset:0; background:linear-gradient(180deg, rgba(8,12,18,0.2) 0%, rgba(8,12,18,0.55) 45%, rgba(8,12,18,0.95) 100%); }
.fp-hero-inner { position:relative; z-index:2; display:flex; flex-direction:column; align-items:flex-start; justify-content:flex-end; gap:12px; min-height:300px; padding:30px clamp(20px,4vw,44px); }
.fp-hero-tags { display:flex; gap:6px; }
.fp-tag { font-family:'Outfit',sans-serif; font-weight:800; font-size:10.5px; letter-spacing:.04em; padding:5px 12px; border-radius:100px; }
.fp-tag.up { background:#06b6d4; color:#04121a; }
.fp-tag.arch { background:rgba(255,255,255,0.14); color:#dbe7f5; backdrop-filter:blur(4px); }
.fp-tag.cancel { background:#ef4444; color:#fff; }
.fp-hero-title { font-family:'Outfit',sans-serif; font-weight:900; font-size:clamp(28px,5vw,50px); line-height:1.02; letter-spacing:-.02em; color:#fff; text-shadow:0 3px 24px rgba(0,0,0,.5); max-width:820px; }
.fp-hero-meta { display:flex; flex-wrap:wrap; gap:18px; }
.fp-hero-meta span { display:inline-flex; align-items:center; gap:7px; font-family:'Outfit',sans-serif; font-size:13.5px; font-weight:700; color:#dbe7f5; }
.fp-hero-meta svg { opacity:.85; }
.fp-hero-cta { display:flex; align-items:center; gap:14px; margin-top:4px; }
.fp-price { font-family:'Outfit',sans-serif; font-weight:900; font-size:20px; color:#fb923c; }
.fp-ticket { display:inline-flex; align-items:center; gap:7px; font-family:'Outfit',sans-serif; font-weight:800; font-size:13.5px; padding:11px 22px; border-radius:12px;
  background:linear-gradient(135deg,#06b6d4,#0891b2); color:#04121a; box-shadow:0 8px 28px rgba(6,182,212,0.3); transition:transform .15s; }
.fp-ticket:hover { transform:scale(1.03); }
.fp-ticket.full { width:100%; justify-content:center; margin-top:14px; }

/* Stulpeliai */
.fp-cols { display:grid; grid-template-columns:1fr 330px; gap:30px; align-items:start; }
@media(max-width:900px){ .fp-cols { grid-template-columns:1fr; } }

.fp-block { margin-bottom:34px; }
.fp-h2 { font-family:'Outfit',sans-serif; font-weight:800; font-size:20px; color:var(--text-primary); margin-bottom:14px; display:flex; align-items:center; gap:9px; }
.fp-h2-count { font-size:12px; font-weight:700; color:#06b6d4; background:rgba(6,182,212,0.12); border-radius:100px; padding:3px 10px; }
.fp-sub { font-family:'Outfit',sans-serif; font-size:10.5px; font-weight:800; text-transform:uppercase; letter-spacing:.1em; color:var(--text-faint); margin:18px 0 11px; }
.fp-sub:first-of-type { margin-top:0; }
.fp-desc { font-size:15px; line-height:1.7; color:var(--text-secondary); max-width:680px; }
.fp-desc p { margin-bottom:12px; }

/* Headliner grid */
.fp-head-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:12px; }
.fp-art-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(170px,1fr)); gap:9px; }
@media(max-width:640px){ .fp-head-grid,.fp-art-grid { grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); } }

.fp-artist { display:flex; align-items:center; gap:11px; padding:9px 12px; border-radius:13px; background:var(--bg-surface);
  border:1px solid var(--border-default,rgba(255,255,255,0.07)); transition:all .15s; }
.fp-artist:hover { border-color:rgba(6,182,212,0.45); background:var(--bg-hover); transform:translateY(-2px); }
.fp-artist.big { padding:12px 14px; }
.fp-artist-av { width:42px; height:42px; border-radius:50%; overflow:hidden; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
.fp-artist.big .fp-artist-av { width:54px; height:54px; }
.fp-artist-av img { width:100%; height:100%; object-fit:cover; }
.fp-artist-i { font-family:'Outfit',sans-serif; font-weight:800; font-size:16px; color:rgba(255,255,255,0.5); }
.fp-artist-info { display:flex; flex-direction:column; gap:2px; min-width:0; }
.fp-artist-name { display:flex; align-items:center; gap:5px; font-family:'Outfit',sans-serif; font-weight:700; font-size:13.5px; color:var(--text-primary);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.fp-artist.big .fp-artist-name { font-size:15px; font-weight:800; }
.fp-artist:hover .fp-artist-name { color:#06b6d4; }
.fp-flag { font-size:11px; }
.fp-artist-gen { font-size:11px; color:var(--text-faint); font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* Šoninė */
.fp-side { display:flex; flex-direction:column; gap:16px; position:sticky; top:80px; }
@media(max-width:900px){ .fp-side { position:static; } }
.fp-info { padding:18px; border-radius:16px; background:var(--bg-surface); border:1px solid var(--border-default,rgba(255,255,255,0.07)); }
.fp-info-date { display:inline-flex; flex-direction:column; align-items:center; padding:10px 16px; border-radius:13px; margin-bottom:15px;
  background:rgba(6,182,212,0.1); border:1px solid rgba(6,182,212,0.2); }
.fp-info-day { font-family:'Outfit',sans-serif; font-weight:900; font-size:28px; line-height:1; color:#06b6d4; }
.fp-info-mon { font-family:'Outfit',sans-serif; font-weight:800; font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:#0891b2; margin-top:3px; }
.fp-info-year { font-size:10px; color:var(--text-faint); margin-top:2px; }
.fp-info-list { display:flex; flex-direction:column; gap:11px; }
.fp-info-list div { display:flex; flex-direction:column; gap:2px; }
.fp-info-list dt { font-family:'Outfit',sans-serif; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--text-faint); }
.fp-info-list dd { font-size:13.5px; font-weight:600; color:var(--text-secondary); line-height:1.35; }
.fp-side-h { font-family:'Outfit',sans-serif; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--text-faint); margin-bottom:11px; }
.fp-att { display:flex; flex-wrap:wrap; gap:6px; }
.fp-att-chip { display:inline-flex; align-items:center; gap:6px; padding:3px 10px 3px 3px; border-radius:100px; background:var(--bg-hover); border:1px solid var(--border-default,rgba(255,255,255,0.07)); transition:all .15s; }
.fp-att-chip:hover { border-color:rgba(6,182,212,0.4); }
.fp-att-av { width:22px; height:22px; border-radius:50%; overflow:hidden; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-family:'Outfit',sans-serif; font-size:10px; font-weight:800; color:rgba(255,255,255,0.6); }
.fp-att-av img { width:100%; height:100%; object-fit:cover; }
.fp-att-name { font-size:12px; font-weight:600; color:var(--text-secondary); }

.fp-back { margin-top:30px; }
.fp-back a { font-family:'Outfit',sans-serif; font-size:13px; font-weight:700; color:var(--text-muted); }
.fp-back a:hover { color:#06b6d4; }
`
