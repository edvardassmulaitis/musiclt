import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getEventBySlug, eventHref } from '@/lib/supabase-events'
import FestivalLineup, { type LineupArtist } from '../../festivaliai/[slug]/festival-lineup'

type Artist = { id: number; name: string; slug: string; cover_image_url: string | null; country?: string | null }

const MONTHS_GEN = ['sausio', 'vasario', 'kovo', 'balandžio', 'gegužės', 'birželio', 'liepos', 'rugpjūčio', 'rugsėjo', 'spalio', 'lapkričio', 'gruodžio']

function getArtist(ea: any): Artist | null {
  const a = Array.isArray(ea.artists) ? ea.artists[0] : ea.artists
  return a || null
}

/* Vibrantiškas plakato gradientas pagal pavadinimą (kai nėra nuotraukos). */
const GRADS = [
  'linear-gradient(135deg,#7c3aed,#1e1b4b)', 'linear-gradient(135deg,#0ea5e9,#0c2a44)',
  'linear-gradient(135deg,#f43f5e,#3a0a1e)', 'linear-gradient(135deg,#f59e0b,#3a2206)',
  'linear-gradient(135deg,#ec4899,#3a0a26)', 'linear-gradient(135deg,#14b8a6,#06231f)',
]
function gradFor(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return GRADS[h % GRADS.length]
}

function fmtFull(startIso: string, endIso: string | null): string {
  const s = new Date(startIso)
  const time = s.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' })
  const base = `${MONTHS_GEN[s.getMonth()]} ${s.getDate()} d., ${s.getFullYear()}`
  if (endIso) {
    const e = new Date(endIso)
    if (e.toDateString() !== s.toDateString())
      return `${MONTHS_GEN[s.getMonth()]} ${s.getDate()} – ${MONTHS_GEN[e.getMonth()]} ${e.getDate()} d., ${s.getFullYear()}`
  }
  return `${base}, ${time}`
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ev = await getEventBySlug(slug)
  if (!ev) return { title: 'Renginys nerastas — music.lt' }
  const desc = ev.description
    ? ev.description.replace(/<[^>]+>/g, '').slice(0, 155)
    : `${ev.title}${ev.venue_name ? ` — ${ev.venue_name}` : ''}${ev.city ? `, ${ev.city}` : ''}. Datos, bilietai, atlikėjai.`
  return {
    title: `${ev.title} — bilietai, data, vieta | music.lt`,
    description: desc,
    alternates: { canonical: eventHref(ev) },
    openGraph: {
      title: ev.title, description: desc, type: 'website',
      ...(ev.cover_image_url ? { images: [ev.cover_image_url] } : {}),
    },
  }
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ev = await getEventBySlug(slug)
  if (!ev) notFound()

  // Kanoninis pretty URL (`<title>-<legacy_id>`). Jei atėjo sena `event-<id>`
  // forma ar kitoks slug — 308 redirect į gražų URL (SEO + UX).
  const canonical = eventHref(ev)
  if (ev.legacy_id != null && `/renginiai/${slug}` !== canonical) redirect(canonical)

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://musiclt.vercel.app'
  const genresByArtist: Record<number, string[]> = ev.artistGenres || {}
  const topTrackByArtist: Record<number, any> = ev.artistTopTrack || {}

  const sorted = (ev.event_artists || []).slice().sort((a: any, b: any) =>
    (Number(b.is_headliner) - Number(a.is_headliner)) || (a.sort_order - b.sort_order))
  const allArtists = sorted.map(getArtist).filter(Boolean) as Artist[]

  const lineupArtists: LineupArtist[] = sorted.map((ea: any) => {
    const a = getArtist(ea)
    if (!a) return null
    return {
      id: a.id, name: a.name, slug: a.slug, country: a.country ?? null,
      cover_image_url: a.cover_image_url, headliner: !!ea.is_headliner,
      genres: genresByArtist[a.id], topTrack: topTrackByArtist[a.id] || null,
    }
  }).filter(Boolean) as LineupArtist[]

  const isPast = ev.status === 'past'
  const isCancelled = ev.status === 'cancelled'
  const today = new Date().toISOString().slice(0, 10)
  const isUpcoming = !isPast && !isCancelled && (ev.end_date || ev.start_date || '').slice(0, 10) >= today

  const start = new Date(ev.start_date)
  const dayNum = start.getDate().toString().padStart(2, '0')
  const monthStr = MONTHS_GEN[start.getMonth()].slice(0, 3)
  const yearStr = start.getFullYear()
  const weekday = start.toLocaleDateString('lt-LT', { weekday: 'long' })
  const timeStr = start.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' })
  const when = fmtFull(ev.start_date, ev.end_date)

  const price = ev.price_from
    ? (ev.price_to && ev.price_to !== ev.price_from ? `${ev.price_from}–${ev.price_to} €` : `${ev.price_from} €`)
    : null
  const canBuy = !!ev.ticket_url && isUpcoming

  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'MusicEvent', name: ev.title, startDate: ev.start_date,
    ...(ev.end_date ? { endDate: ev.end_date } : {}),
    description: (ev.description || '').replace(/<[^>]+>/g, '').slice(0, 500),
    eventStatus: isCancelled ? 'https://schema.org/EventCancelled' : isPast ? 'https://schema.org/EventPostponed' : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: { '@type': 'Place', name: ev.venue_name || ev.city || 'Lietuva', address: { '@type': 'PostalAddress', addressLocality: ev.city || '', streetAddress: ev.address || '', addressCountry: 'LT' } },
    ...(ev.cover_image_url ? { image: ev.cover_image_url } : {}),
    ...(ev.ticket_url ? { offers: { '@type': 'Offer', url: ev.ticket_url, ...(ev.price_from ? { lowPrice: ev.price_from } : {}), ...(ev.price_to ? { highPrice: ev.price_to } : {}), priceCurrency: 'EUR', availability: isPast ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock' } } : {}),
    performer: allArtists.map(a => ({ '@type': 'MusicGroup', name: a.name, url: `${siteUrl}/atlikejai/${a.slug || a.id}` })),
    organizer: { '@type': 'Organization', name: 'Music.lt', url: siteUrl },
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <style>{EP_CSS}</style>

      <div className="ep-wrap">
        {/* ── Breadcrumb ── */}
        <nav className="ep-crumb">
          <Link href="/koncertai">Koncertai</Link><span>/</span><b>{ev.title}</b>
        </nav>

        {/* ── HERO ── */}
        <div className="ep-hero">
          <div className="ep-hero-bg" style={ev.cover_image_url ? { backgroundImage: `url(${ev.cover_image_url})` } : { background: gradFor(ev.title) }} />
          <div className="ep-hero-grad" />
          <div className="ep-hero-inner">
            <div className="ep-hero-tags">
              {isCancelled && <span className="ep-tag cancel">ATŠAUKTAS</span>}
              {ev.is_festival && <span className="ep-tag fest">FESTIVALIS</span>}
              {isUpcoming && !ev.is_festival && <span className="ep-tag up">🎤 KONCERTAS</span>}
              {isPast && <span className="ep-tag arch">PRAĖJĘS</span>}
              {ev.is_featured && !isCancelled && !isPast && <span className="ep-tag star">★ REKOMENDUOJAMA</span>}
            </div>
            <h1 className={`ep-hero-title${isCancelled ? ' ep-strike' : ''}`}>{ev.title}</h1>
            <div className="ep-hero-meta">
              <span><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg><span className="cap">{weekday}</span>, {timeStr}</span>
              {(ev.venue_name || ev.city) && <span><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>{[ev.venue_name, ev.city].filter(Boolean).join(', ')}</span>}
              {allArtists.length > 0 && <span><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>{allArtists.length} {allArtists.length === 1 ? 'atlikėjas' : 'atlikėjai'}</span>}
            </div>
            {(price || canBuy) && (
              <div className="ep-hero-cta">
                {price && <span className="ep-price">{price}</span>}
                {canBuy && <a href={ev.ticket_url} target="_blank" rel="noopener noreferrer" className="ep-ticket">🎟 Pirkti bilietą</a>}
              </div>
            )}
          </div>
        </div>

        <div className="ep-cols">
          {/* ── Pagrindinis ── */}
          <div className="ep-main">
            {ev.description && (
              <section className="ep-block">
                <h2 className="ep-h2">Apie renginį</h2>
                <div className="ep-desc" dangerouslySetInnerHTML={{ __html: ev.description }} />
              </section>
            )}

            {lineupArtists.length > 0 && (
              <section className="ep-block">
                <h2 className="ep-h2">Atlikėjai <span className="ep-h2-count">{lineupArtists.length}</span></h2>
                <FestivalLineup artists={lineupArtists} />
              </section>
            )}

            {ev.attendees && ev.attendees.length > 0 && (
              <section className="ep-block">
                <h2 className="ep-h2">Dalyvauja <span className="ep-h2-count">{ev.attendees.length}</span></h2>
                <div className="ep-att">
                  {ev.attendees.slice(0, 30).map((att: any, i: number) => (
                    <Link key={`${att.user_username}-${i}`} href={`/u/${att.user_username}`} className="ep-att-chip" title={att.user_username}>
                      <span className="ep-att-av" style={{ background: `hsl(${(att.user_username.charCodeAt(0) || 65) * 17 % 360},32%,18%)` }}>
                        {att.user_avatar_url ? <img src={att.user_avatar_url} alt={att.user_username} /> : att.user_username[0]?.toUpperCase()}
                      </span>
                      <span className="ep-att-name">{att.user_username}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* ── Šoninė ── */}
          <aside className="ep-side">
            <div className="ep-info">
              <div className="ep-info-date">
                <span className="ep-info-day">{dayNum}</span>
                <span className="ep-info-mon">{monthStr}</span>
                <span className="ep-info-year">{yearStr}</span>
              </div>
              <dl className="ep-info-list">
                <div><dt>Data</dt><dd>{when}</dd></div>
                {ev.venue_name && <div><dt>Vieta</dt><dd>{ev.venue_name}</dd></div>}
                {ev.city && <div><dt>Miestas</dt><dd>{ev.city}</dd></div>}
                {ev.address && <div><dt>Adresas</dt><dd>{ev.address}</dd></div>}
                {price && <div><dt>Bilietai</dt><dd>{price}</dd></div>}
              </dl>
              {canBuy
                ? <a href={ev.ticket_url} target="_blank" rel="noopener noreferrer" className="ep-ticket full">🎟 Pirkti bilietą</a>
                : isPast
                  ? <p className="ep-side-note">Renginys jau praėjo</p>
                  : isCancelled
                    ? <p className="ep-side-note cancel">Renginys atšauktas</p>
                    : null}
            </div>
          </aside>
        </div>

        <div className="ep-back">
          <Link href="/koncertai">← Visi koncertai</Link>
        </div>
      </div>
    </>
  )
}

const EP_CSS = `
.ep-wrap { max-width:1160px; margin:0 auto; padding:18px var(--page-pad-x,24px) 60px; font-family:'DM Sans',system-ui,sans-serif; }
@media(max-width:640px){ .ep-wrap { padding-left:var(--page-pad-x-sm,16px); padding-right:var(--page-pad-x-sm,16px); } }

.ep-crumb { display:flex; align-items:center; gap:7px; font-family:'Outfit',sans-serif; font-size:12.5px; font-weight:600; color:var(--text-faint); margin-bottom:14px; }
.ep-crumb a { color:var(--text-muted); }
.ep-crumb a:hover { color:var(--accent-orange); }
.ep-crumb b { color:var(--text-secondary); font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:60vw; }

/* HERO */
.ep-hero { position:relative; border-radius:22px; overflow:hidden; min-height:300px; margin-bottom:26px;
  background:var(--bg-elevated); border:1px solid var(--border-default,rgba(255,255,255,0.08)); }
.ep-hero-bg { position:absolute; inset:0; background-size:cover; background-position:center 28%; background-color:#0c1622; }
.ep-hero-grad { position:absolute; inset:0; background:linear-gradient(180deg, rgba(8,12,18,0.15) 0%, rgba(8,12,18,0.55) 48%, rgba(8,12,18,0.95) 100%); }
.ep-hero-inner { position:relative; z-index:2; display:flex; flex-direction:column; align-items:flex-start; justify-content:flex-end; gap:12px; min-height:300px; padding:30px clamp(20px,4vw,44px); }
.ep-hero-tags { display:flex; flex-wrap:wrap; gap:6px; }
.ep-tag { font-family:'Outfit',sans-serif; font-weight:800; font-size:10.5px; letter-spacing:.04em; padding:5px 12px; border-radius:100px; }
.ep-tag.up { background:var(--accent-orange); color:#fff; }
.ep-tag.fest { background:#67e8f9; color:#0c2a44; }
.ep-tag.arch { background:rgba(255,255,255,0.16); color:#dbe7f5; backdrop-filter:blur(4px); }
.ep-tag.star { background:rgba(249,115,22,0.18); color:#fb923c; border:1px solid rgba(249,115,22,0.3); }
.ep-tag.cancel { background:#ef4444; color:#fff; }
.ep-hero-title { font-family:'Outfit',sans-serif; font-weight:900; font-size:clamp(26px,4.6vw,46px); line-height:1.04; letter-spacing:-.02em; color:#fff; text-shadow:0 3px 24px rgba(0,0,0,.5); max-width:820px; }
.ep-strike { text-decoration:line-through; text-decoration-thickness:2px; opacity:.85; }
.ep-hero-meta { display:flex; flex-wrap:wrap; gap:16px; }
.ep-hero-meta span { display:inline-flex; align-items:center; gap:7px; font-family:'Outfit',sans-serif; font-size:13.5px; font-weight:700; color:#dbe7f5; }
.ep-hero-meta .cap { text-transform:capitalize; }
.ep-hero-meta svg { opacity:.85; flex-shrink:0; }
.ep-hero-cta { display:flex; align-items:center; flex-wrap:wrap; gap:14px; margin-top:4px; }
.ep-price { font-family:'Outfit',sans-serif; font-weight:900; font-size:20px; color:#fb923c; }
.ep-ticket { display:inline-flex; align-items:center; gap:7px; font-family:'Outfit',sans-serif; font-weight:800; font-size:13.5px; padding:11px 22px; border-radius:12px;
  background:linear-gradient(135deg,#f97316,#ea580c); color:#fff; box-shadow:0 8px 28px rgba(249,115,22,0.3); transition:transform .15s; }
.ep-ticket:hover { transform:scale(1.03); }
.ep-ticket.full { width:100%; justify-content:center; margin-top:14px; }

/* Stulpeliai */
.ep-cols { display:grid; grid-template-columns:1fr 330px; gap:30px; align-items:start; }
@media(max-width:900px){ .ep-cols { grid-template-columns:1fr; } }

.ep-block { margin-bottom:34px; }
.ep-h2 { font-family:'Outfit',sans-serif; font-weight:800; font-size:20px; color:var(--text-primary); margin-bottom:14px; display:flex; align-items:center; gap:9px; }
.ep-h2-count { font-size:12px; font-weight:700; color:var(--accent-orange); background:rgba(249,115,22,0.12); border-radius:100px; padding:3px 10px; }
.ep-desc { font-size:15px; line-height:1.7; color:var(--text-secondary); max-width:680px; }
.ep-desc p { margin-bottom:12px; }
.ep-desc a { color:var(--accent-link); }

/* Line-up reuse (festival-lineup.tsx naudoja .fp-* klases) */
.ep-main .fp-sub { font-family:'Outfit',sans-serif; font-size:10.5px; font-weight:800; text-transform:uppercase; letter-spacing:.1em; color:var(--text-faint); margin:18px 0 11px; }
.ep-main .fp-sub:first-of-type { margin-top:0; }
.ep-main .fp-head-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:12px; }
.ep-main .fp-art-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(170px,1fr)); gap:9px; }
@media(max-width:640px){ .ep-main .fp-head-grid,.ep-main .fp-art-grid { grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); } }
.ep-main .fp-artist { display:flex; align-items:center; gap:11px; padding:9px 12px; border-radius:13px; background:var(--bg-surface); border:1px solid var(--border-default,rgba(255,255,255,0.07)); transition:all .15s; }
.ep-main .fp-artist:hover { border-color:rgba(249,115,22,0.45); background:var(--bg-hover); transform:translateY(-2px); }
.ep-main .fp-artist.big { padding:12px 14px; }
.ep-main .fp-artist-av { position:relative; width:46px; height:46px; border-radius:50%; overflow:hidden; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
.ep-main .fp-artist.big .fp-artist-av { width:58px; height:58px; }
.ep-main .fp-artist-av img { width:100%; height:100%; object-fit:cover; }
.ep-main .fp-artist-i { font-family:'Outfit',sans-serif; font-weight:800; font-size:16px; color:rgba(255,255,255,0.5); }
.ep-main .fp-artist-play { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; border:none; cursor:pointer; background:rgba(6,12,20,0.45); color:#fff; opacity:0; transition:opacity .15s; }
.ep-main .fp-artist-av:hover .fp-artist-play { opacity:1; }
.ep-main .fp-artist-play svg { filter:drop-shadow(0 1px 3px rgba(0,0,0,.5)); transform:translateX(1px); }
.ep-main .fp-artist-info { display:flex; flex-direction:column; gap:2px; min-width:0; text-decoration:none; }
.ep-main .fp-artist-name { display:flex; align-items:center; gap:5px; font-family:'Outfit',sans-serif; font-weight:700; font-size:13.5px; color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ep-main .fp-artist.big .fp-artist-name { font-size:15px; font-weight:800; }
.ep-main .fp-artist:hover .fp-artist-name { color:var(--accent-orange); }
.ep-main .fp-flag { font-size:11px; }
.ep-main .fp-artist-gen { font-size:11px; color:var(--text-faint); font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* Šoninė */
.ep-side { display:flex; flex-direction:column; gap:16px; position:sticky; top:80px; }
@media(max-width:900px){ .ep-side { position:static; } }
.ep-info { padding:18px; border-radius:16px; background:var(--bg-surface); border:1px solid var(--border-default,rgba(255,255,255,0.07)); }
.ep-info-date { display:inline-flex; flex-direction:column; align-items:center; padding:10px 16px; border-radius:13px; margin-bottom:15px;
  background:rgba(249,115,22,0.1); border:1px solid rgba(249,115,22,0.2); }
.ep-info-day { font-family:'Outfit',sans-serif; font-weight:900; font-size:28px; line-height:1; color:var(--accent-orange); }
.ep-info-mon { font-family:'Outfit',sans-serif; font-weight:800; font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:#c2410c; margin-top:3px; }
.ep-info-year { font-size:10px; color:var(--text-faint); margin-top:2px; }
.ep-info-list { display:flex; flex-direction:column; gap:11px; }
.ep-info-list div { display:flex; flex-direction:column; gap:2px; }
.ep-info-list dt { font-family:'Outfit',sans-serif; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--text-faint); }
.ep-info-list dd { font-size:13.5px; font-weight:600; color:var(--text-secondary); line-height:1.35; }
.ep-side-note { margin-top:14px; text-align:center; font-family:'Outfit',sans-serif; font-size:12.5px; font-weight:700; color:var(--text-faint); padding:10px; border-radius:10px; background:var(--bg-hover); }
.ep-side-note.cancel { color:#f87171; }

/* Dalyvauja */
.ep-att { display:flex; flex-wrap:wrap; gap:6px; }
.ep-att-chip { display:inline-flex; align-items:center; gap:6px; padding:3px 10px 3px 3px; border-radius:100px; background:var(--bg-surface); border:1px solid var(--border-default,rgba(255,255,255,0.07)); transition:all .15s; }
.ep-att-chip:hover { border-color:rgba(249,115,22,0.4); }
.ep-att-av { width:22px; height:22px; border-radius:50%; overflow:hidden; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-family:'Outfit',sans-serif; font-size:10px; font-weight:800; color:rgba(255,255,255,0.6); }
.ep-att-av img { width:100%; height:100%; object-fit:cover; }
.ep-att-name { font-size:12px; font-weight:600; color:var(--text-secondary); }

.ep-back { margin-top:30px; }
.ep-back a { font-family:'Outfit',sans-serif; font-size:13px; font-weight:700; color:var(--text-muted); }
.ep-back a:hover { color:var(--accent-orange); }
`
