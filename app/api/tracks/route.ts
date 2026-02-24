import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = (page - 1) * limit

  let query = supabase
    .from('tracks')
    .select(`
      id, title, type, release_date, video_url, spotify_id, is_new, is_new_date, cover_url,
      artists!tracks_artist_id_fkey(id, name, slug),
      track_artists(artist_id),
      album_tracks(position, albums(id, title, year))
    `, { count: 'exact' })
    .order('title', { ascending: true })
    .range(offset, offset + limit - 1)

  if (search) {
    query = query.ilike('title', `%${search}%`)
  }

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const tracks = (data || []).map((t: any) => {
    const albumList = (t.album_tracks || [])
      .map((at: any) => at.albums ? {
        id: at.albums.id,
        title: at.albums.title,
        year: at.albums.year,
        position: at.position,
      } : null)
      .filter(Boolean)

    const releaseYear = t.release_date
      ? new Date(t.release_date).getFullYear()
      : (albumList[0]?.year || null)

    return {
      ...t,
      artist_name: t.artists?.name || '',
      artist_slug: t.artists?.slug || '',
      featuring_count: (t.track_artists || []).length,
      album_count: albumList.length,
      albums_list: albumList,
      release_year: releaseYear,
    }
  })

  return NextResponse.json({ tracks, total: count || 0 })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const data = await req.json()

  if (!data.title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 })
  if (!data.artist_id) return NextResponse.json({ error: 'Artist required' }, { status: 400 })

  const { data: track, error } = await supabase
    .from('tracks')
    .insert({
      title: data.title.trim(),
      artist_id: Number(data.artist_id),
      type: data.type || 'normal',
      release_date: data.release_date || null,
      video_url: data.video_url || null,
      spotify_id: data.spotify_id || null,
      lyrics: data.lyrics || null,
      description: data.description || null,
      is_new: data.is_new ?? false,
      is_new_date: data.is_new ? (data.is_new_date || new Date().toISOString().slice(0, 10)) : null,
      cover_url: data.cover_url || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Save featuring artists
  if (data.featuring?.length > 0) {
    await supabase.from('track_artists').insert(
      data.featuring.map((f: any) => ({ track_id: track.id, artist_id: f.artist_id }))
    )
  }

  return NextResponse.json(track, { status: 201 })
}
