// app/api/news/[id]/songs/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('news_songs')
    .select('id, sort_order, song_id, title, artist_name, youtube_url')
    .eq('news_id', id)
    .order('sort_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const songs: any[] = await req.json()
  const supabase = createAdminClient()
  await supabase.from('news_songs').delete().eq('news_id', id)
  if (songs.length > 0) {
    const { error } = await supabase.from('news_songs').insert(
      songs.map((s, i) => ({
        news_id: parseInt(id),
        sort_order: i,
        song_id: s.song_id || null,
        title: s.title || null,
        artist_name: s.artist_name || null,
        youtube_url: s.youtube_url || null,
      }))
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
