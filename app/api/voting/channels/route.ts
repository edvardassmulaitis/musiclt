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
  const includeInactive = searchParams.get('includeInactive') === 'true'
  const supabase = createAdminClient()

  let q = supabase.from('voting_channels').select('*').order('sort_order').order('name')
  if (!includeInactive) q = q.eq('is_active', true)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ channels: data || [] })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session?.user?.role as string))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: 'Trūksta pavadinimo' }, { status: 400 })

  const slug = body.slug || slugify(body.name)
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('voting_channels')
    .insert({
      slug,
      name: body.name,
      description: body.description || null,
      logo_url: body.logo_url || null,
      cover_image_url: body.cover_image_url || null,
      is_active: body.is_active ?? true,
      sort_order: body.sort_order ?? 0,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ channel: data })
}
