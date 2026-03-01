// app/api/news/[id]/songs/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  // Step 1: fetch news_songs rows
  const { data: rows, error } = await supabase
    .from('news_songs')
    .select('id, sort_order, song_id, title, artist_name, youtube_url')
    .eq('news_id', parseInt(id))
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!rows || rows.length === 0) return NextResponse.json([])

  // Step 2: for rows with song_id, fetch track data separately
  const trackIds = rows.filter(r => r.song_id).map(r => r.song_id as number)
  let tracksMap: Record<number, { title: string; artist_name: string; video_url: string }> = {}

  if (trackIds.length > 0) {
    const { data: tracks } = await supabase
      .from('tracks')
      .select('id, title, video_url, artists!tracks_artist_id_fkey(name)')
      .in('id', trackIds)

    for (const t of tracks || []) {
      tracksMap[t.id] = {
        title: t.title,
        artist_name: (t.artists as any)?.name || '',
        video_url: t.video_url || '',
      }
    }
  }

  // Step 3: merge
  const songs = rows.map((s: any) => {
    const track = s.song_id ? tracksMap[s.song_id] : null
    return {
      id: s.id,
      song_id: s.song_id,
      title: track?.title || s.title || '',
      artist_name: track?.artist_name || s.artist_name || '',
      youtube_url: track?.video_url || s.youtube_url || '',
    }
  })

  return NextResponse.json(songs)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const newsId = parseInt(id)
  const songs = await req.json()

  if (!Array.isArray(songs)) return NextResponse.json({ error: 'Array expected' }, { status: 400 })

  const supabase = createAdminClient()

  await supabase.from('news_songs').delete().eq('news_id', newsId)

  if (songs.length > 0) {
    const rows = songs.map((s: any, i: number) => ({
      news_id: newsId,
      sort_order: i,
      song_id: s.song_id || null,
      title: s.song_id ? null : (s.title || null),
      artist_name: s.song_id ? null : (s.artist_name || null),
      youtube_url: s.song_id ? null : (s.youtube_url || null),
    }))

    const { error } = await supabase.from('news_songs').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
