import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function GET() {
  const sb = createAdminClient()
  const { data } = await sb
    .from('venues')
    .select('id,legacy_id,slug,name,city,country,address,phone,cover_image_url')
    .order('name', { ascending: true })
  return NextResponse.json({ venues: data || [] })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!role || !['admin', 'super_admin'].includes(role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({}))
  if (!body.name) return NextResponse.json({ error: 'Pavadinimas privalomas' }, { status: 400 })
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('venues')
    .insert({
      name: body.name,
      city: body.city ?? null,
      country: body.country ?? 'Lithuania',
      address: body.address ?? null,
      phone: body.phone ?? null,
      description: body.description ?? null,
      cover_image_url: body.cover_image_url ?? null,
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
