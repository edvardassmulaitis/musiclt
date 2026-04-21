import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { slugify } from '@/lib/supabase-voting'

function isAdmin(role?: string) {
  return role === 'admin' || role === 'super_admin'
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const channelId = searchParams.get('channel_id')
  const supabase = createAdminClient()

  let q = supabase.from('voting_editions').select('*').order('year', { ascending: false })
  if (channelId) q = q.eq('channel_id', parseInt(channelId))

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ editions: data || [] })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session?.user?.role as string))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  if (!body.channel_id || !body.name)
    return NextResponse.json({ error: 'Trūksta channel_id arba pavadinimo' }, { status: 400 })

  const slug = body.slug || slugify(body.name)
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('voting_editions')
    .insert({
      channel_id: body.channel_id,
      slug,
      name: body.name,
      year: body.year ?? null,
      description: body.description || null,
      cover_image_url: body.cover_image_url || null,
      status: body.status || 'draft',
      vote_open: body.vote_open || null,
      vote_close: body.vote_close || null,
      results_visible: body.results_visible || 'always',
      sort_order: body.sort_order ?? 0,
      metadata: body.metadata || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ edition: data })
}
