import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAbroadEventBySlug, vkHref } from '@/lib/verta-keliones-db'
import { flagEmoji, tripCostFrom, fmtDate, reachLabel, type Concert, type Destination } from '@/lib/verta-keliones-seed'
import VKPlayButton from './vk-play-button'

export const revalidate = 300

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

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const d = await getAbroadEventBySlug(slug)
  if (!d) return { title: 'Koncertas nerastas | music.lt' }
  const { concert: c, dest } = d
  const place = [c.venue, dest?.city, dest?.country].filter(Boolean).join(', ')
  const title = `${c.artist} — ${dest?.city || 'koncertas užsienyje'} | Verta kelionės`
  const desc = `${c.artist} ${fmtDate(c.date, c.endDate)}${place ? `, ${place}` : ''}. Kelionė iš Lietuvos ${dest ? `nuo €${tripCostFrom(c, dest)}` : ''}.`
  return {
    title, description: desc,
    alternates: { canonical: vkHref(c) },
    openGraph: { title, description: desc, type: 'website', ...(c.image ? { images: [c.image] } : {}) },
  }
}

export default async function VKDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const data = await getAbroadEventBySlug(slug)
  if (!data) notFound()

  const { concert: c, dest, topTrack, related } = data
  const cost = dest ? tripCostFrom(c, dest) : null
  const flight = dest?.reach === 'flight'
  const ticket = c.ticketUrl || `https://www.google.com/search?q=${encodeURIComponent(`${c.artist} ${dest?.city || ''} 2026 tickets`)}`
  const flag = dest ? flagEmoji(dest.countryCode) : ''

  const jsonLd = {
    '@context': 'https://schema.org', '@type': c.isFestival ? 'Festival' : 'MusicEvent',
    name: c.festivalName || `${c.artist} — ${dest?.city || ''}`.trim(),
    startDate: c.date, ...(c.endDate ? { endDate: c.endDate } : {}),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: { '@type': 'Place', name: c.venue || dest?.city || '', address: { '@type': 'PostalAddress', addressLocality: dest?.city || '', addressCountry: dest?.countryCode || '' } },
    ...(c.image ? { image: c.image } : {}),
    performer: { '@type': 'MusicGroup', name: c.artist },
    ...(c.ticketUrl ? { offers: { '@type': 'Offer', url: c.ticketUrl, priceCurrency: 'EUR' } } : {}),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <style>{CSS}</style>

      <div className="vkd-wrap">
        <nav className="vkd-crumb">
          <Link href="/verta-keliones">Verta kelionės</Link><span>/</span><b>{c.artist}{dest ? ` · ${dest.city}` : ''}</b>
        </nav>

        {/* HERO */}
        <div className="vkd-hero">
          <div className="vkd-hero-bg" style={c.image ? { backgroundImage: `url(${c.image})` } : { background: gradFor(c.artist) }} />
          <div className="vkd-hero-grad" />
          <div className="vkd-hero-inner">
            <div className="vkd-tags">
              {c.isFestival && <span className="vkd-tag fest">FESTIVALIS</span>}
              <span className="vkd-tag reach">{flight ? '✈' : '🚗'} {dest ? reachLabel(c, dest) : ''}</span>
              {c.verified && <span className="vkd-tag ok">✓ DATA PATVIRTINTA</span>}
            </div>
            <h1 className="vkd-title">{c.artist}</h1>
            {c.festivalName && <p className="vkd-fest-name">{c.festivalName}</p>}
            <div className="vkd-meta">
              <span><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>{fmtDate(c.date, c.endDate)}</span>
              {dest && <span><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>{flag} {[c.venue, dest.city].filter(Boolean).join(', ')}</span>}
            </div>
            <div className="vkd-cta">
              {cost != null && <span className="vkd-cost">Kelionė nuo €{cost}</span>}
              <a href={ticket} target="_blank" rel="noopener noreferrer" className="vkd-ticket">🎟 Bilietai</a>
            </div>
          </div>
        </div>

        <div className="vkd-cols">
          <div className="vkd-main">
            {c.why && (
              <section className="vkd-block">
                <h2 className="vkd-h2">Kodėl verta</h2>
                <p className="vkd-desc">{c.why}</p>
              </section>
            )}

            {/* Grotuvas — atlikėjo top daina */}
            {topTrack?.video_url && (
              <section className="vkd-block">
                <h2 className="vkd-h2">Pasiklausyk</h2>
                <VKPlayButton track={topTrack} artistName={c.artist} artistSlug={c.artistSlug || ''} />
              </section>
            )}

            {c.genres.length > 0 && (
              <section className="vkd-block">
                <h2 className="vkd-h2">Stilius</h2>
                <div className="vkd-genres">
                  {c.genres.slice(0, 8).map(g => <span key={g} className="vkd-genre">{g}</span>)}
                </div>
              </section>
            )}

            {related.length > 0 && (
              <section className="vkd-block">
                <h2 className="vkd-h2">Kiti koncertai šioje kryptyje</h2>
                <div className="vkd-rel">
                  {related.map(r => <RelCard key={r.id} c={r} dest={dest} />)}
                </div>
              </section>
            )}
          </div>

          <aside className="vkd-side">
            <div className="vkd-info">
              <dl className="vkd-info-list">
                <div><dt>Atlikėjas</dt><dd>{c.artistSlug ? <Link href={`/atlikejai/${c.artistSlug}`} className="vkd-link">{c.artist}</Link> : c.artist}</dd></div>
                <div><dt>Data</dt><dd>{fmtDate(c.date, c.endDate)}</dd></div>
                {c.venue && <div><dt>Vieta</dt><dd>{c.venue}</dd></div>}
                {dest && <div><dt>Miestas</dt><dd>{flag} {dest.city}, {dest.country}</dd></div>}
                {dest && <div><dt>Kaip pasiekti</dt><dd>{reachLabel(c, dest)}</dd></div>}
                {cost != null && <div><dt>Kelionė nuo</dt><dd className="vkd-cost-dd">€{cost}</dd></div>}
              </dl>
              <a href={ticket} target="_blank" rel="noopener noreferrer" className="vkd-ticket full">🎟 Bilietai</a>
            </div>
          </aside>
        </div>

        <div className="vkd-back"><Link href="/verta-keliones">← Visi koncertai užsienyje</Link></div>
      </div>
    </>
  )
}

function RelCard({ c, dest }: { c: Concert; dest: Destination | null }) {
  const flag = dest ? flagEmoji(dest.countryCode) : ''
  return (
    <Link href={vkHref(c)} className="vkd-rel-card">
      <div className="vkd-rel-thumb" style={c.image ? { backgroundImage: `url(${c.image})` } : { background: gradFor(c.artist) }}>
        {!c.image && <span>{c.artist}</span>}
      </div>
      <div className="vkd-rel-body">
        <span className="vkd-rel-name">{c.artist}</span>
        <span className="vkd-rel-when">{fmtDate(c.date, c.endDate)}</span>
        <span className="vkd-rel-place">{flag} {[c.venue, dest?.city].filter(Boolean).join(' · ')}</span>
      </div>
    </Link>
  )
}

const CSS = `
.vkd-wrap { max-width:1100px; margin:0 auto; padding:18px var(--page-pad-x,24px) 60px; font-family:'DM Sans',system-ui,sans-serif; }
@media(max-width:640px){ .vkd-wrap { padding-left:var(--page-pad-x-sm,16px); padding-right:var(--page-pad-x-sm,16px); } }

.vkd-crumb { display:flex; align-items:center; gap:7px; font-family:'Outfit',sans-serif; font-size:12px; font-weight:600; color:var(--text-faint); margin-bottom:14px; }
.vkd-crumb a { color:var(--text-muted); }
.vkd-crumb a:hover { color:var(--accent-orange); }
.vkd-crumb b { color:var(--text-secondary); font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:60vw; }

.vkd-hero { position:relative; border-radius:22px; overflow:hidden; min-height:280px; margin-bottom:26px; background:var(--bg-elevated); border:1px solid var(--border-default,rgba(255,255,255,0.08)); }
.vkd-hero-bg { position:absolute; inset:0; background-size:cover; background-position:center 25%; background-color:#0c1622; }
.vkd-hero-grad { position:absolute; inset:0; background:linear-gradient(180deg, rgba(8,12,18,0.15) 0%, rgba(8,12,18,0.5) 46%, rgba(8,12,18,0.95) 100%); }
.vkd-hero-inner { position:relative; z-index:2; display:flex; flex-direction:column; align-items:flex-start; justify-content:flex-end; gap:11px; min-height:280px; padding:28px clamp(20px,4vw,42px); }
.vkd-tags { display:flex; flex-wrap:wrap; gap:6px; }
.vkd-tag { font-family:'Outfit',sans-serif; font-weight:800; font-size:12px; letter-spacing:.04em; padding:5px 11px; border-radius:100px; }
.vkd-tag.fest { background:#67e8f9; color:#0c2a44; }
.vkd-tag.reach { background:rgba(255,255,255,0.16); color:#dbe7f5; backdrop-filter:blur(4px); }
.vkd-tag.ok { background:rgba(34,197,94,0.18); color:#4ade80; border:1px solid rgba(34,197,94,0.3); }
.vkd-title { font-family:'Outfit',sans-serif; font-weight:900; font-size:clamp(28px,5vw,48px); line-height:1.02; letter-spacing:-.02em; color:#fff; text-shadow:0 3px 24px rgba(0,0,0,.5); }
.vkd-fest-name { font-family:'Outfit',sans-serif; font-weight:700; font-size:16px; color:#dbe7f5; }
.vkd-meta { display:flex; flex-wrap:wrap; gap:16px; }
.vkd-meta span { display:inline-flex; align-items:center; gap:7px; font-family:'Outfit',sans-serif; font-size:14px; font-weight:700; color:#dbe7f5; }
.vkd-meta svg { opacity:.85; flex-shrink:0; }
.vkd-cta { display:flex; align-items:center; flex-wrap:wrap; gap:14px; margin-top:4px; }
.vkd-cost { font-family:'Outfit',sans-serif; font-weight:900; font-size:20px; color:#fff; padding:7px 14px; border-radius:100px; background:rgba(249,115,22,0.92); box-shadow:0 4px 16px rgba(249,115,22,0.35); }
.vkd-ticket { display:inline-flex; align-items:center; gap:7px; font-family:'Outfit',sans-serif; font-weight:800; font-size:14px; padding:11px 22px; border-radius:12px; background:linear-gradient(135deg,var(--accent-orange),#ea580c); color:#fff; box-shadow:0 8px 28px rgba(249,115,22,0.3); transition:transform .15s; }
.vkd-ticket:hover { transform:scale(1.03); }
.vkd-ticket.full { width:100%; justify-content:center; margin-top:14px; }

.vkd-cols { display:grid; grid-template-columns:1fr 320px; gap:30px; align-items:start; }
@media(max-width:900px){ .vkd-cols { grid-template-columns:1fr; } }

.vkd-block { margin-bottom:30px; }
.vkd-h2 { font-family:'Outfit',sans-serif; font-weight:800; font-size:20px; color:var(--text-primary); margin-bottom:12px; }
.vkd-desc { font-size:16px; line-height:1.7; color:var(--text-secondary); max-width:640px; }

.vkd-play { display:inline-flex; align-items:center; gap:9px; font-family:'Outfit',sans-serif; font-weight:800; font-size:14px; padding:11px 18px; border-radius:12px; cursor:pointer;
  background:var(--bg-surface); border:1px solid var(--border-default,rgba(255,255,255,0.1)); color:var(--text-primary); transition:all .15s; }
.vkd-play:hover { border-color:rgba(249,115,22,0.5); color:var(--accent-orange); }
.vkd-play svg { color:var(--accent-orange); }

.vkd-genres { display:flex; flex-wrap:wrap; gap:7px; }
.vkd-genre { font-size:12px; font-weight:600; color:var(--text-muted); background:var(--bg-surface); border:1px solid var(--border-default,rgba(255,255,255,0.07)); border-radius:100px; padding:5px 12px; }

/* Susiję */
.vkd-rel { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:12px; }
.vkd-rel-card { display:flex; gap:11px; padding:9px; border-radius:13px; background:var(--bg-surface); border:1px solid var(--border-default,rgba(255,255,255,0.07)); transition:all .15s; }
.vkd-rel-card:hover { border-color:rgba(249,115,22,0.45); transform:translateY(-2px); }
.vkd-rel-thumb { flex-shrink:0; width:60px; height:60px; border-radius:10px; background-size:cover; background-position:center; display:flex; align-items:center; justify-content:center; padding:4px; overflow:hidden; }
.vkd-rel-thumb span { font-family:'Outfit',sans-serif; font-weight:800; font-size:12px; color:#fff; text-align:center; line-height:1.1; overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; }
.vkd-rel-body { display:flex; flex-direction:column; gap:2px; min-width:0; justify-content:center; }
.vkd-rel-name { font-family:'Outfit',sans-serif; font-weight:800; font-size:14px; color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.vkd-rel-card:hover .vkd-rel-name { color:var(--accent-orange); }
.vkd-rel-when { font-family:'Outfit',sans-serif; font-weight:700; font-size:12px; color:var(--accent-orange); }
.vkd-rel-place { font-size:12px; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* Šoninė */
.vkd-side { position:sticky; top:80px; }
@media(max-width:900px){ .vkd-side { position:static; } }
.vkd-info { padding:18px; border-radius:16px; background:var(--bg-surface); border:1px solid var(--border-default,rgba(255,255,255,0.07)); }
.vkd-info-list { display:flex; flex-direction:column; gap:11px; }
.vkd-info-list div { display:flex; flex-direction:column; gap:2px; }
.vkd-info-list dt { font-family:'Outfit',sans-serif; font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--text-faint); }
.vkd-info-list dd { font-size:14px; font-weight:600; color:var(--text-secondary); line-height:1.35; }
.vkd-cost-dd { color:var(--accent-orange)!important; font-weight:800!important; }
.vkd-link { color:var(--accent-link); font-weight:700; }

.vkd-back { margin-top:28px; }
.vkd-back a { font-family:'Outfit',sans-serif; font-size:14px; font-weight:700; color:var(--text-muted); }
.vkd-back a:hover { color:var(--accent-orange); }
`
