import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getEventBySlug } from '@/lib/supabase-events'

type Artist = { id: number; name: string; slug: string; cover_image_url: string | null }

function getArtist(ea: any): Artist | null {
  const a = Array.isArray(ea.artists) ? ea.artists[0] : ea.artists
  return a || null
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ev = await getEventBySlug(slug)
  if (!ev) return { title: 'Nerasta' }
  return {
    title: `${ev.title} — Music.lt`,
    description: ev.description || `${ev.title} — ${ev.venue_name}, ${ev.city}`,
    openGraph: {
      title: ev.title,
      description: ev.description || '',
      type: 'website',
      ...(ev.cover_image_url ? { images: [ev.cover_image_url] } : {}),
    },
  }
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ev = await getEventBySlug(slug)
  if (!ev) notFound()

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://musiclt.vercel.app'
  const headliners = (ev.event_artists || []).filter((ea: any) => ea.is_headliner)
  const others = (ev.event_artists || []).filter((ea: any) => !ea.is_headliner)
  const allArtists = [...headliners, ...others]

  const isPast = ev.status === 'past'
  const isCancelled = ev.status === 'cancelled'

  const startDate = new Date(ev.start_date)
  const endDate = ev.end_date ? new Date(ev.end_date) : null

  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'MusicEvent', name: ev.title, startDate: ev.start_date,
    ...(ev.end_date ? { endDate: ev.end_date } : {}), description: ev.description || '',
    eventStatus: isCancelled ? 'https://schema.org/EventCancelled' : isPast ? 'https://schema.org/EventPostponed' : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: { '@type': 'Place', name: ev.venue_name || '', address: { '@type': 'PostalAddress', addressLocality: ev.city || '', streetAddress: ev.address || '', addressCountry: 'LT' } },
    ...(ev.cover_image_url ? { image: ev.cover_image_url } : {}),
    ...(ev.ticket_url ? { offers: { '@type': 'Offer', url: ev.ticket_url, ...(ev.price_from ? { lowPrice: ev.price_from } : {}), ...(ev.price_to ? { highPrice: ev.price_to } : {}), priceCurrency: 'EUR', availability: isPast ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock' } } : {}),
    performer: allArtists.map(ea => { const a = getArtist(ea); return a ? { '@type': 'MusicGroup', name: a.name, url: `${siteUrl}/atlikejai/${a.slug || a.id}` } : null }).filter(Boolean),
    organizer: { '@type': 'Organization', name: 'Music.lt', url: siteUrl },
  }

  function formatPrice(from: number | null, to: number | null) {
    if (!from && !to) return null
    if (from && to && from !== to) return `${from}–${to} \u20AC`
    return `${from || to} \u20AC`
  }

  const price = formatPrice(ev.price_from, ev.price_to)
  const dayNum = startDate.getDate().toString().padStart(2, '0')
  const monthStr = startDate.toLocaleDateString('lt-LT', { month: 'short' }).toUpperCase().replace('.', '')
  const yearStr = startDate.getFullYear()
  const weekday = startDate.toLocaleDateString('lt-LT', { weekday: 'long' })
  const timeStr = startDate.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' })

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="max-w-[1360px] mx-auto px-5 lg:px-8">

        {/* HERO: image left (only if present), info right */}
        <div className={`flex flex-col lg:flex-row gap-8 ${ev.cover_image_url ? 'mb-10' : 'mb-6 pt-8'}`}>

          {/* Left: Cover (hidden entirely when no image to avoid a broken placeholder box) */}
          {ev.cover_image_url && (
            <div className="lg:w-[55%] flex-shrink-0">
              <div className="rounded-2xl overflow-hidden aspect-[4/3] lg:aspect-auto lg:h-full relative">
                <img
                  src={ev.cover_image_url}
                  alt={ev.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Hide the whole cover wrapper if the source is unreachable
                    const wrapper = e.currentTarget.closest('div.lg\\:w-\\[55\\%\\]') as HTMLElement | null
                    if (wrapper) wrapper.style.display = 'none'
                  }}
                />
                <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(transparent 60%, rgba(8,12,18,0.4))' }} />
              </div>
            </div>
          )}

          {/* Right: Info */}
          <div className={`${ev.cover_image_url ? 'lg:w-[45%]' : 'w-full max-w-3xl'} flex flex-col justify-center`}>

            {/* Badges */}
            <div className="flex items-center gap-2 mb-3">
              {isCancelled && <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-red-500/20 text-red-400 border border-red-500/20">ATŠAUKTAS</span>}
              {isPast && <span className="px-2.5 py-1 rounded-full text-[10px] font-black" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#4a6580' }}>PRAĖJĘS</span>}
              {ev.is_featured && !isCancelled && !isPast && <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-orange-500/15 text-orange-400 border border-orange-500/20">&#9733; FEATURED</span>}
            </div>

            {/* Title */}
            <h1 className={`text-3xl sm:text-4xl font-black leading-[1.1] tracking-tight mb-5 ${isCancelled ? 'line-through' : ''}`}
              style={{ fontFamily: "'Outfit', sans-serif", color: '#f2f4f8' }}>
              {ev.title}
            </h1>

            {/* Date */}
            <div className="flex items-start gap-4 mb-5">
              <div className="text-center px-3 py-2 rounded-xl flex-shrink-0" style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.15)' }}>
                <p className="text-2xl font-black leading-none" style={{ color: '#f97316' }}>{dayNum}</p>
                <p className="text-[10px] font-black tracking-wider mt-0.5" style={{ color: '#c2410c' }}>{monthStr}</p>
                <p className="text-[10px] mt-0.5" style={{ color: '#7c2d12' }}>{yearStr}</p>
              </div>
              <div className="pt-1">
                <p className="text-sm font-bold capitalize" style={{ color: '#c8d8f0' }}>{weekday}, {timeStr}</p>
                {endDate && <p className="text-xs mt-0.5" style={{ color: '#4a6580' }}>iki {endDate.toLocaleDateString('lt-LT', { month: 'long', day: 'numeric' })}</p>}
                <div className="flex items-center gap-1.5 mt-2">
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="#4a6580" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                  </svg>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#c8d8f0' }}>{ev.venue_name}</p>
                    <p className="text-xs" style={{ color: '#4a6580' }}>{[ev.address, ev.city].filter(Boolean).join(', ')}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Price */}
            {price && <p className="text-xl font-black mb-5" style={{ color: '#fb923c' }}>{price}</p>}

            {/* Ticket CTA */}
            {ev.ticket_url && !isPast && !isCancelled && (
              <a href={ev.ticket_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 w-full sm:w-auto text-center font-black px-8 py-3.5 rounded-xl text-sm transition-all hover:scale-[1.02] mb-5"
                style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#fff', boxShadow: '0 8px 32px rgba(249,115,22,0.3)' }}>
                &#127903; Pirkti bilieta
              </a>
            )}

            {/* Artists */}
            {allArtists.length > 0 && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.12em] mb-2" style={{ color: '#334058' }}>Atlikejai</p>
                <div className="flex flex-wrap gap-2">
                  {allArtists.map((ea: any) => {
                    const a = getArtist(ea)
                    if (!a) return null
                    return (
                      <Link key={a.id} href={`/atlikejai/${a.slug || a.id}`}
                        className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full transition-all hover:bg-white/[.06] group"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
                          style={{ background: `hsl(${(a.name.charCodeAt(0) || 65) * 17 % 360},30%,16%)` }}>
                          {a.cover_image_url
                            ? <img src={a.cover_image_url} alt={a.name} className="w-full h-full object-cover" />
                            : <span className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.2)' }}>{a.name[0]}</span>}
                        </div>
                        <span className="text-xs font-bold group-hover:text-blue-300 transition" style={{ color: '#c8d8f0' }}>{a.name}</span>
                        {ea.is_headliner && <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-400">&#9733;</span>}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* DESCRIPTION */}
        {ev.description && (
          <div className="max-w-3xl mb-12">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] mb-3" style={{ color: '#334058' }}>Apie rengini</p>
            <div className="text-[15px] leading-relaxed" style={{ color: '#8a9bba' }}
              dangerouslySetInnerHTML={{ __html: ev.description }} />
          </div>
        )}

        {/* Back */}
        <div className="pb-10">
          <Link href="/renginiai" className="text-xs font-bold hover:text-blue-400 transition" style={{ color: '#334058' }}>
            &larr; Visi renginiai
          </Link>
        </div>
      </div>
    </>
  )
}
