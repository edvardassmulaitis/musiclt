// /api/admin/galerija/photographers
//
// GET  — fotografų sąrašas. ?curated=1 → tik curated; ?q=... → paieška pagal vardą.
// POST — sukurti naują fotografą. Body: { name, role_title?, bio?, avatar_url?,
//        website_url?, instagram_url?, facebook_url?, flickr_url?, is_curated? }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { slugify } from '@/lib/slugify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user.role as string) || '')) return null
  return session
}

const COLS = 'id, slug, name, role_title, bio, avatar_url, website_url, instagram_url, facebook_url, flickr_url, is_curated, display_order, source'

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const curatedOnly = req.nextUrl.searchParams.get('curated') === '1'
  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  try {
    const sb = createAdminClient()
    let query = sb.from('photographers').select(COLS)
    if (curatedOnly) query = query.eq('is_curated', true)
    if (q) query = query.ilike('name', `%${q}%`)
    const { data } = await query
      .order('is_curated', { ascending: false })
      .order('display_order', { ascending: true })
      .order('name', { ascending: true })
      .limit(curatedOnly || q ? 100 : 60)
    return NextResponse.json({ ok: true, items: data || [] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Klaida' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Neteisingas body' }, { status: 400 }) }
  const name = (body?.name || '').toString().trim()
  if (!name) return NextResponse.json({ ok: false, error: 'Trūksta vardo' }, { status: 400 })

  try {
    const sb = createAdminClient()
    let slug = slugify(name, 60)
    const { data: clash } = await sb.from('photographers').select('id').eq('slug', slug).maybeSingle()
    if (clash) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`
    const row = {
      slug,
      name,
      role_title: body?.role_title?.toString().trim() || null,
      bio: body?.bio?.toString().trim() || null,
      avatar_url: body?.avatar_url?.toString().trim() || null,
      website_url: body?.website_url?.toString().trim() || null,
      instagram_url: body?.instagram_url?.toString().trim() || null,
      facebook_url: body?.facebook_url?.toString().trim() || null,
      flickr_url: body?.flickr_url?.toString().trim() || null,
      is_curated: body?.is_curated === false ? false : true,
      source: 'manual',
    }
    const { data, error } = await sb.from('photographers').insert(row).select('id, slug').single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: data.id, slug: data.slug })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Klaida' }, { status: 500 })
  }
}
