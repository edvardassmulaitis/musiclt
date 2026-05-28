import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEvents, createEvent, searchEvents } from '@/lib/supabase-events'
import { unstable_cache } from 'next/cache'
import { HOME_TAGS } from '@/lib/home-latest'

// Cached homepage path — be filtr'ų, limit<=24, showPast=false. Naudoja
// tag'ą `home:events-latest`, kuris invalidate'inamas iš admin POST/PUT/DELETE.
const cachedHomeEvents = unstable_cache(
  async (limit: number) =>
    getEvents({
      showPast: false,
      limit,
      offset: 0,
    }),
  ['home-events-latest'],
  { tags: [HOME_TAGS.events], revalidate: 900 }
)

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const search = sp.get('search')

  if (search) {
    const results = await searchEvents(search)
    return NextResponse.json(results)
  }

  const city = sp.get('city') || undefined
  const status = sp.get('status') || undefined
  const period = (sp.get('period') as 'week' | 'month' | 'all') || undefined
  const showPast = sp.get('showPast') === 'true'
  const limit = parseInt(sp.get('limit') || '20')
  const offset = parseInt(sp.get('offset') || '0')

  // Homepage shape — be filtr'ų ir paginnacijos. Kviečiame cached path'ą
  // su tag invalidation'u. /renginiai puslapis su city/period filter'iais
  // tęsia eitį per tiesioginį `getEvents`.
  const isHomepageShape =
    !city && !status && !period && !showPast && offset === 0 && limit <= 24

  try {
    const result = isHomepageShape
      ? await cachedHomeEvents(limit)
      : await getEvents({ city, status, period, showPast, limit, offset })
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=300',
        'CDN-Cache-Control': 'public, s-maxage=900, stale-while-revalidate=300',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=900, stale-while-revalidate=300',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { artists, ...eventData } = body
    const event = await createEvent(eventData, session.user.id)

    // Link artists if provided
    if (artists && Array.isArray(artists) && event?.id) {
      const { setEventArtists } = await import('@/lib/supabase-events')
      await setEventArtists(event.id, artists)
    }

    // Cache invalidation — homepage'o renginių sekcija turi pasimatyti iškart.
    try {
      const { revalidateHomeTag } = await import('@/lib/home-latest')
      revalidateHomeTag('events')
    } catch {}

    return NextResponse.json(event, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
