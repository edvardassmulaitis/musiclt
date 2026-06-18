// /api/admin/galerija/photographers/[id]
//
// PATCH — atnaujinti fotografo laukus (įsk. is_curated toggle, socialinius, avatar).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['editor', 'admin', 'super_admin'].includes((session.user.role as string) || '')) return null
  return session
}

const FIELDS = ['name', 'role_title', 'bio', 'avatar_url', 'website_url', 'instagram_url', 'facebook_url', 'flickr_url', 'is_curated', 'display_order']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Neteisingas body' }, { status: 400 }) }

  const patch: any = { updated_at: new Date().toISOString() }
  for (const f of FIELDS) {
    if (!(f in body)) continue
    if (f === 'is_curated') patch[f] = !!body[f]
    else if (f === 'display_order') patch[f] = Number(body[f]) || 0
    else patch[f] = body[f] === '' ? null : body[f]
  }

  try {
    const sb = createAdminClient()
    const { error } = await sb.from('photographers').update(patch).eq('id', id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Klaida' }, { status: 500 })
  }
}
