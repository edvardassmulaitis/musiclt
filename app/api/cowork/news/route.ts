import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { validateCoworkApiKey } from '@/lib/cowork-auth'

// GET /api/cowork/news?limit=20&offset=0&search=query&type=news
export async function GET(req: NextRequest) {
  if (!validateCoworkApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') || '20')
  const offset = parseInt(searchParams.get('offset') || '0')
  const search = searchParams.get('search')
  const type = searchParams.get('type')

  const supabase = createAdminClient()
  let query = supabase
    .from('news')
    .select('id, slug, title, type, artist_id, is_featured, is_hidden_home, image_small_url, published_at, created_at')
    .order('published_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (search) query = query.ilike('title', `%${search}%`)
  if (type) query = query.eq('type', type)

  const { data: news, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ news, count: news?.length })
}

// POST /api/cowork/news - sukurti naują naujieną
export async function POST(req: NextRequest) {
  if (!validateCoworkApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const {
    id, slug, title, body: newsBody, type,
    source_url, source_name, is_featured,
    artist_id, image_small_url, image_title_url,
  } = body

  if (!id || !slug || !title) {
    return NextResponse.json({ error: 'id, slug ir title yra privalomi' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('news')
    .insert({
      id,
      slug,
      title,
      body: newsBody,
      type: type || 'news',
      source_url,
      source_name,
      is_featured: is_featured || false,
      artist_id,
      image_small_url,
      image_title_url,
      published_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ news: data }, { status: 201 })
}

// PATCH /api/cowork/news - atnaujinti naujieną
export async function PATCH(req: NextRequest) {
  if (!validateCoworkApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { id, ...updates } = body

  if (!id) {
    return NextResponse.json({ error: 'id yra privalomas' }, { status: 400 })
  }

  delete updates.created_at

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('news')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ news: data })
}
