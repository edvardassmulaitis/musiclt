import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEventById, updateEvent, deleteEvent, setEventArtists } from '@/lib/supabase-events'
import { resolveLocation } from '@/lib/geo'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const event = await getEventById(id)
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(event)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { artists, resolve_location, country_name, country_id, ...eventData } = body

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
    }

    await updateEvent(id, eventData)

    if (artists && Array.isArray(artists)) {
      await setEventArtists(id, artists)
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await deleteEvent(id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
