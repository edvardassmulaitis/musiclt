import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('news')
    .select(`
      *,
      artist:artists!news_artist_id_fkey(id, name, slug, cover_image_url),
      artist2:artists!news_artist_id2_fkey(id, name, slug, cover_image_url)
    `)
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const data = await req.json()
    const supabase = createAdminClient()
    const { error } = await supabase
      .from('news')
      .update({
        title: data.title, body: data.body,
        type: data.type, slug: data.slug,
        source_url: data.source_url || null, source_name: data.source_name || null,
        is_featured: data.is_featured || false, is_hidden_home: data.is_hidden_home || false,
        is_title_page: data.is_title_page || false, is_delfi: data.is_delfi || false,
        artist_id: data.artist_id || null, artist_id2: data.artist_id2 || null,
        album_code: data.album_code || null,
        image_small_url: data.image_small_url || null, image_title_url: data.image_title_url || null,
        image1_url: data.image1_url || null, image1_caption: data.image1_caption || null,
        image2_url: data.image2_url || null, image2_caption: data.image2_caption || null,
        image3_url: data.image3_url || null, image3_caption: data.image3_caption || null,
        image4_url: data.image4_url || null, image4_caption: data.image4_caption || null,
        image5_url: data.image5_url || null, image5_caption: data.image5_caption || null,
        published_at: data.published_at,
      })
      .eq('id', id)

    if (error) throw new Error(error.message)
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = createAdminClient()
  const { error } = await supabase.from('news').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
