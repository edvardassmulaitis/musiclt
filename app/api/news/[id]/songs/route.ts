// app/api/news/[id]/songs/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('news_songs')
    .select(`
      id, sort_order, song_id, title, artist_name, youtube_url,
      song:song_id (
        id, title,
        artists!tracks_artist_id_fkey ( name ),
        video_url
      )
    `)
    .eq('news_id', parseInt(id))
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Normalise: always expose youtube_url regardless of source
  const songs = (data || []).map((s: any) => ({
    id: s.id,
    song_id: s.song_id,
    title: s.song?.title || s.title || '',
    artist_name: s.song?.artists?.name || s.artist_name || '',
    youtube_url: s.song?.video_url || s.youtube_url || '',
  }))

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

  // Delete all existing, re-insert
  await supabase.from('news_songs').delete().eq('news_id', newsId)

  if (songs.length > 0) {
    const rows = songs.map((s: any, i: number) => ({
      news_id: newsId,
      sort_order: i,
      song_id: s.song_id || null,
      title: s.title || null,
      artist_name: s.artist_name || null,
      youtube_url: s.song_id ? null : (s.youtube_url || null), // manual songs store URL here
    }))

    const { error } = await supabase.from('news_songs').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
