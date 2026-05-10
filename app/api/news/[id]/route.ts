// app/api/news/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  // Modern news pirma (admin-sukurtos) — `artists.photos` column nera (drop'inta),
  // todėl naudojam tik cover_image_url.
  const modern = await supabase
    .from('news')
    .select(`
      *,
      artist:artist_id(id, name, slug, cover_image_url),
      artist2:artist_id2(id, name, slug, cover_image_url)
    `)
    .eq('id', id)
    .maybeSingle()
  if (modern.data) return NextResponse.json(modern.data)

  // Legacy fallback'as — discussions table su legacy_kind='news'. Admin
  // edit form'as gali naudoti tuos pačius laukus (title, body, slug,
  // source_url, artist_id, artist_id2). Adapt'inam į modern news shape.
  const legacy = await supabase
    .from('discussions')
    .select(`
      id, slug, title, body, source_url, legacy_kind, legacy_id, is_legacy,
      first_post_at, created_at, related_tracks,
      artist:artist_id(id, name, slug, cover_image_url),
      artist2:artist_id2(id, name, slug, cover_image_url)
    `)
    .eq('id', id)
    .eq('legacy_kind', 'news')
    .eq('is_legacy', true)
    .maybeSingle()
  if (legacy.data) {
    const a = legacy.data as any
    return NextResponse.json({
      id: a.id,
      title: a.title,
      slug: a.slug,
      body: a.body || '',
      type: 'news',
      source_url: a.source_url,
      source_name: null,
      published_at: a.first_post_at || a.created_at,
      image_small_url: null,
      image_title_url: null,
      gallery: [],
      image1_url: null, image1_caption: null,
      image2_url: null, image2_caption: null,
      image3_url: null, image3_caption: null,
      image4_url: null, image4_caption: null,
      image5_url: null, image5_caption: null,
      is_featured: false,
      is_hidden_home: false,
      is_title_page: false,
      is_delfi: false,
      artist: a.artist,
      artist2: a.artist2,
      _source: 'legacy',
      _related_tracks: a.related_tracks,
    })
  }
  return NextResponse.json({ error: 'Naujiena nerasta' }, { status: 404 })
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

    // Build gallery fallback into image1-5 columns for backwards compat
    const gallery: { url: string; caption?: string }[] = data.gallery || []
    const imageColumns: Record<string, string | null> = {}
    for (let i = 1; i <= 5; i++) {
      imageColumns[`image${i}_url`] = gallery[i - 1]?.url || null
      imageColumns[`image${i}_caption`] = gallery[i - 1]?.caption || null
    }

    const { error } = await supabase
      .from('news')
      .update({
        title: data.title,
        body: data.body,
        type: data.type,
        slug: data.slug,
        source_url: data.source_url || null,
        source_name: data.source_name || null,
        is_featured: data.is_featured || false,
        is_hidden_home: data.is_hidden_home || false,
        is_title_page: data.is_title_page || false,
        is_delfi: data.is_delfi || false,
        artist_id: data.artist_id || null,
        artist_id2: data.artist_id2 || null,
        album_code: data.album_code || null,
        // Hero photo
        image_small_url: data.image_small_url || null,
        image_title_url: data.image_title_url || null,
        // Gallery as jsonb (if column exists) + legacy columns
        ...(data.gallery !== undefined ? { gallery: gallery } : {}),
        ...imageColumns,
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
