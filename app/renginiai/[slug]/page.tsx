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

  // Schema.org Event
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MusicEvent',
    name: ev.title,
    startDate: ev.start_date,
    ...(ev.end_date ? { endDate: ev.end_date } : {}),
    description: ev.description || '',
    eventStatus: isCancelled
      ? 'https://schema.org/EventCancelled'
      : isPast
        ? 'https://schema.org/EventPostponed'
        : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: ev.venue_name || '',
      address: {
        '@type': 'PostalAddress',
        addressLocality: ev.city || '',
        streetAddress: ev.address || '',
        addressCountry: 'LT',
      },
    },
    ...(ev.cover_image_url ? { image: ev.cover_image_url } : {}),
    ...(ev.ticket_url ? {
      offers: {
        '@type': 'Offer',
        url: ev.ticket_url,
        ...(ev.price_from ? { lowPrice: ev.price_from } : {}),
        ...(ev.price_to ? { highPrice: ev.price_to } : {}),
        priceCurrency: 'EUR',
        availability: isPast ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
      },
    } : {}),
    performer: allArtists.map(ea => {
      const a = getArtist(ea)
      return a ? { '@type': 'MusicGroup', name: a.name, url: `${siteUrl}/atlikejas/${a.slug || a.id}` } : null
    }).filter(Boolean),
    organizer: { '@type': 'Organization', name: 'Music.lt', url: siteUrl },
  }

  function formatPrice(from: number | null, to: number | null) {
    if (!from && !to) return null
    if (from && to && from !== to) return `${from}–${to} €`
    return `${from || to} €`
  }

  const price = formatPrice(ev.price_from, ev.price_to)

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs mb-6" style={{ color: '#3d5878' }}>
          <Link href="/renginiai" className="hover:text-blue-400 transition">Renginiai</Link>
          <span>/</span>
          <span style={{ color: '#5e7290' }}>{ev.title}</span>
        </div>

        {/* Cover */}
        {ev.cover_image_url && (
          <div className="rounded-2xl overflow-hidden mb-8 aspect-[2.2/1]">
            <img src={ev.cover_image_url} alt={ev.title} className="w-full h-full object-cover" />
          </div>
        )}

        {/* Status badges */}
        <div className="flex items-center gap-2 mb-3">
          {isCancelled && <span className="px-2.5 py-1 rounded-full text-xs font-black bg-red-500/20 text-red-400 border border-red-500/20">Atšauktas</span>}
          {isPast && <span className="px-2.5 py-1 rounded-full text-xs font-black border" style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)', color: '#4a6580' }}>Praėjęs renginys</span>}
          {ev.is_featured && !isCancelled && !isPast && <span className="px-2.5 py-1 rounded-full text-xs font-black bg-orange-500/20 text-orange-400 border border-orange-500/20">★ Featured</span>}
        </div>

        {/* Title */}
        <h1 className={`text-3xl sm:text-4xl font-black leading-tight tracking-tight mb-4 ${isCancelled ? 'line-through' : ''}`}
          style={{ fontFamily: "'Outfit', sans-serif", color: '#f2f4f8' }}>
          {ev.title}
        </h1>

        {/* Date + venue info */}
        <div className="flex flex-wrap gap-6 mb-8 p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.12em] mb-1" style={{ color: '#334058' }}>Data</p>
            <p className="text-sm font-bold" style={{ color: '#c8d8f0' }}>
              {startDate.toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
            </p>
            {endDate && (
              <p className="text-xs mt-0.5" style={{ color: '#4a6580' }}>
                iki {endDate.toLocaleDateString('lt-LT', { month: 'long', day: 'numeric' })}
              </p>
            )}
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.12em] mb-1" style={{ color: '#334058' }}>Vieta</p>
            <p className="text-sm font-bold" style={{ color: '#c8d8f0' }}>{ev.venue_name}</p>
            <p className="text-xs" style={{ color: '#4a6580' }}>{[ev.address, ev.city].filter(Boolean).join(', ')}</p>
          </div>
          {price && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] mb-1" style={{ color: '#334058' }}>Kaina</p>
              <p className="text-sm font-bold" style={{ color: '#fb923c' }}>{price}</p>
            </div>
          )}
        </div>

        {/* Ticket CTA */}
        {ev.ticket_url && !isPast && !isCancelled && (
          <a href={ev.ticket_url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-white font-black px-6 py-3 rounded-full text-sm transition-all shadow-lg shadow-orange-900/40 hover:scale-[1.02] mb-8">
            🎟️ Pirkti bilietą
          </a>
        )}

        {/* Description */}
        {ev.description && (
          <div className="text-[15px] leading-relaxed mb-10" style={{ color: '#b0bdd4' }}
            dangerouslySetInnerHTML={{ __html: ev.description }} />
        )}

        {/* Artists */}
        {allArtists.length > 0 && (
          <div className="mb-8">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] mb-4" style={{ color: '#334058' }}>Atlikėjai</p>
            <div className="space-y-2">
              {allArtists.map((ea: any) => {
                const a = getArtist(ea)
                if (!a) return null
                return (
                  <Link key={a.id} href={`/atlikejas/${a.slug || a.id}`}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all hover:bg-white/[.04] group"
                    style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
                      style={{ background: `hsl(${(a.name.charCodeAt(0) || 65) * 17 % 360},30%,16%)` }}>
                      {a.cover_image_url
                        ? <img src={a.cover_image_url} alt={a.name} className="w-full h-full object-cover" />
                        : <span className="text-lg font-bold" style={{ color: 'rgba(255,255,255,0.15)' }}>{a.name[0]}</span>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold group-hover:text-blue-300 transition" style={{ color: '#c8d8f0' }}>{a.name}</p>
                    </div>
                    {ea.is_headliner && (
                      <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/20">HEADLINER</span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* Back */}
        <Link href="/renginiai" className="text-xs hover:text-blue-400 transition" style={{ color: '#4a6580' }}>
          ← Visi renginiai
        </Link>
      </div>
    </>
  )
}
