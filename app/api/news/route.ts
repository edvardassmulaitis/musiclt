import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')
  const search = searchParams.get('search') || ''
  const type = searchParams.get('type') || ''

  const supabase = createAdminClient()
  let query = supabase
    .from('news')
    .select(`
      id, slug, title, type, is_featured, is_hidden_home,
      image_small_url, published_at, created_at,
      artist:artists!news_artist_id_fkey(id, name, slug)
    `, { count: 'exact' })
    .order('published_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (search) query = query.ilike('title', `%${search}%`)
  if (type) query = query.eq('type', type)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ news: data || [], total: count || 0 })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const data = await req.json()
    const supabase = createAdminClient()

    // Generuoti slug iš titulo
    let slug = data.slug
    if (!slug && data.title) {
      slug = data.title
        .toLowerCase()
        .replace(/[ą]/g, 'a').replace(/[č]/g, 'c').replace(/[ę]/g, 'e')
        .replace(/[ė]/g, 'e').replace(/[į]/g, 'i').replace(/[š]/g, 's')
        .replace(/[ų]/g, 'u').replace(/[ū]/g, 'u').replace(/[ž]/g, 'z')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    }

    // Gauti sekantį ID
    const { data: maxId } = await supabase
      .from('news').select('id').order('id', { ascending: false }).limit(1).single()
    const nextId = (maxId?.id || 0) + 1

    // Unikalus slug
    let finalSlug = slug
    let attempt = 0
    while (true) {
      const { data: ex } = await supabase.from('news').select('id').eq('slug', finalSlug).maybeSingle()
      if (!ex) break
      attempt++
      finalSlug = `${slug}-${attempt}`
    }

    const { data: created, error } = await supabase
      .from('news')
      .insert({
        id: nextId, slug: finalSlug, title: data.title,
        body: data.body || null, type: data.type || 'news',
        author_id: session.user.id,
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
        published_at: data.published_at || new Date().toISOString(),
        created_at: new Date().toISOString(),
      })
      .select('id').single()

    if (error) throw new Error(error.message)
    return NextResponse.json({ id: created.id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
