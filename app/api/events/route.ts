import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEvents, createEvent, searchEvents } from '@/lib/supabase-events'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const search = sp.get('search')

  if (search) {
    const results = await searchEvents(search)
    return NextResponse.json(results)
  }

  try {
    const result = await getEvents({
      city: sp.get('city') || undefined,
      status: sp.get('status') || undefined,
      period: (sp.get('period') as 'week' | 'month' | 'all') || undefined,
      showPast: sp.get('showPast') === 'true',
      limit: parseInt(sp.get('limit') || '20'),
      offset: parseInt(sp.get('offset') || '0'),
    })
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

    return NextResponse.json(event, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
