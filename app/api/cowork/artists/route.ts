import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { validateCoworkApiKey } from '@/lib/cowork-auth'

// GET /api/cowork/artists?limit=20&offset=0&search=query
export async function GET(req: NextRequest) {
  if (!validateCoworkApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') || '20')
  const offset = parseInt(searchParams.get('offset') || '0')
  const search = searchParams.get('search')

  const supabase = createAdminClient()
  let query = supabase
    .from('artists')
    .select('id, slug, name, country, description, cover_image_url, active_from, active_until, type, gender, created_at')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (search) {
    query = query.ilike('name', `%${search}%`)
  }

  const { data: artists, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ artists, count: artists?.length })
}

// POST /api/cowork/artists - sukurti naują atlikėją
export async function POST(req: NextRequest) {
  if (!validateCoworkApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { name, slug, country, description, cover_image_url, active_from, type, gender } = body

  if (!name || !slug) {
    return NextResponse.json({ error: 'name ir slug yra privalomi' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('artists')
    .insert({
      name,
      slug,
      country: country || 'Lietuva',
      description,
      cover_image_url,
      active_from,
      type: type || 'group',
      gender: gender || '',
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ artist: data }, { status: 201 })
}

// PATCH /api/cowork/artists - atnaujinti atlikėją
export async function PATCH(req: NextRequest) {
  if (!validateCoworkApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { id, ...updates } = body

  if (!id) {
    return NextResponse.json({ error: 'id yra privalomas' }, { status: 400 })
  }

  // Pašaliname laukus kurių negalima keisti
  delete updates.created_at

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('artists')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ artist: data })
}
