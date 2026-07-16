import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEvents, createEvent, searchEvents } from '@/lib/supabase-events'
import { resolveLocation } from '@/lib/geo'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const search = sp.get('search')

  if (search) {
    const results = await searchEvents(search)
    return NextResponse.json(results)
  }

  try {
    // 2026-07-16: `home_hero=1` istoriškai buvo IGNORUOJAMAS (parametras
    // egzistavo tik URL'uose) — „hero renginiai" iš tikrųjų buvo tiesiog
    // artimiausi renginiai. Dabar home_hero=1 / homepage=1 reiškia „homepage
    // kontekstas": gerbiamas events.hide_from_homepage (admin'o „Slėpti nuo
    // pagrindinio" pagaliau veikia hero, afišai ir feed kandidatams).
    const homepageCtx = sp.get('home_hero') === '1' || sp.get('homepage') === '1'
    const result = await getEvents({
      city: sp.get('city') || undefined,
      venueId: sp.get('venueId') ? parseInt(sp.get('venueId')!) : undefined,
      status: sp.get('status') || undefined,
      period: (sp.get('period') as 'week' | 'month' | 'all') || undefined,
      showPast: sp.get('showPast') === 'true',
      order: (sp.get('order') as 'asc' | 'desc') || undefined,
      limit: parseInt(sp.get('limit') || '20'),
      offset: parseInt(sp.get('offset') || '0'),
      excludeHiddenFromHomepage: homepageCtx,
    })
    // compact=1 — homepage'ui: numetam description (160KB+), ticket_url
    if (sp.get('compact') === '1' && result.events) {
      result.events = result.events.map((e: any) => {
        const { description, ...rest } = e
        return rest
      })
    }
    // CDN edge cache — homepage renginių sekcija.
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['editor', 'admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { artists, resolve_location, country_name, country_id, ...eventData } = body

    // Connected geo: find-or-create šalį/miestą/vietą, kad DB liktų sujungta.
    // Opt-in per `resolve_location` (kad kitų kvietėjų neveiktų).
    if (resolve_location) {
      const loc = await resolveLocation({
        countryId: country_id ?? null, countryName: country_name ?? null,
        cityId: eventData.city_id ?? null, cityName: eventData.city ?? null,
        venueId: eventData.venue_id ?? null, venueName: eventData.venue_name ?? null,
        address: eventData.address ?? null,
      })
      eventData.venue_id = loc.venueId
      eventData.venue_name = loc.venueName ?? eventData.venue_name
      eventData.city = loc.cityName ?? eventData.city
      eventData.city_id = loc.cityId ?? eventData.city_id
      if (eventData.is_abroad == null) eventData.is_abroad = loc.isAbroad
    }

    const event = await createEvent(eventData, session.user.id)

    // Link artists if provided
    if (artists && Array.isArray(artists) && event?.id) {
      const { setEventArtists } = await import('@/lib/supabase-events')
      await setEventArtists(event.id, artists)
    }

    return NextResponse.json(event, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
