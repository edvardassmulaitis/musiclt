import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { resolveOrCreateArtist, resolveOrCreateTrack } from '@/lib/supabase-voting'

function isAdmin(role?: string) {
  return role === 'admin' || role === 'super_admin'
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const eventId = searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'Trūksta event_id' }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('voting_participants')
    .select('*')
    .eq('event_id', parseInt(eventId))
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ participants: data || [] })
}

/**
 * POST: sukuria participant. Palaiko du režimus:
 * 1) Link į esamus: { event_id, artist_id, track_id?, album_id? }
 * 2) Auto-create: { event_id, artist_name, song_title?, youtube_url?, lyrics?, country? }
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session?.user?.role as string))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  if (!body.event_id) return NextResponse.json({ error: 'Trūksta event_id' }, { status: 400 })

  const supabase = createAdminClient()

  let artist_id: number | null = body.artist_id ?? null
  let track_id: number | null = body.track_id ?? null
  let album_id: number | null = body.album_id ?? null

  // Auto-create path
  if (!artist_id && body.artist_name) {
    artist_id = await resolveOrCreateArtist({
      name: body.artist_name,
      country: body.country,
      description: body.bio,
    })
  }

  if (!track_id && body.song_title && artist_id) {
    track_id = await resolveOrCreateTrack({
      title: body.song_title,
      artist_id,
      youtube_url: body.youtube_url,
      lyrics: body.lyrics,
    })
  }

  const { data, error } = await supabase
    .from('voting_participants')
    .insert({
      event_id: body.event_id,
      artist_id,
      track_id,
      album_id,
      display_name: body.display_name || null,
      display_subtitle: body.display_subtitle || body.song_title || null,
      country: body.country || null,
      photo_url: body.photo_url || null,
      video_url: body.video_url || body.youtube_url || null,
      lyrics: body.lyrics || null,
      bio: body.bio || null,
      metadata: body.metadata || null,
      sort_order: body.sort_order ?? 0,
      is_disqualified: false,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ participant: data })
}

/**
 * Bulk import endpoint: PUT su { event_id, participants: [...] }
 * Kiekvienas dalyvis gauna auto-create logiką.
 */
export async function PUT(req: Request) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session?.user?.role as string))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { event_id, participants, replace_existing } = body

  if (!event_id || !Array.isArray(participants))
    return NextResponse.json({ error: 'Trūksta event_id arba participants array' }, { status: 400 })

  const supabase = createAdminClient()

  if (replace_existing) {
    await supabase.from('voting_participants').delete().eq('event_id', event_id)
  }

  const created = []
  for (let i = 0; i < participants.length; i++) {
    const p = participants[i]
    let artist_id = p.artist_id ?? null
    let track_id = p.track_id ?? null

    if (!artist_id && p.artist_name) {
      artist_id = await resolveOrCreateArtist({
        name: p.artist_name,
        country: p.country,
        description: p.bio,
      })
    }

    if (!track_id && p.song_title && artist_id) {
      track_id = await resolveOrCreateTrack({
        title: p.song_title,
        artist_id,
        youtube_url: p.youtube_url,
        lyrics: p.lyrics,
      })
    }

    const { data, error } = await supabase
      .from('voting_participants')
      .insert({
        event_id,
        artist_id,
        track_id,
        album_id: p.album_id ?? null,
        display_name: p.display_name || p.artist_name || null,
        display_subtitle: p.display_subtitle || p.song_title || null,
        country: p.country || null,
        photo_url: p.photo_url || null,
        video_url: p.video_url || p.youtube_url || null,
        lyrics: p.lyrics || null,
        bio: p.bio || null,
        metadata: p.metadata || null,
        sort_order: p.sort_order ?? i,
        is_disqualified: false,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { error: `Nepavyko pridėti ${p.artist_name || p.display_name}: ${error.message}`, created },
        { status: 500 }
      )
    }
    created.push(data)
  }

  return NextResponse.json({ created, count: created.length })
}
