// app/api/admin/featured/route.ts
//
// POST { kind: 'post'|'discussion'|'discovery', id, featured: boolean, hours? }
// „Dėmesio centre" valdymas iš /atrasti kortelių (admin-only ★ mygtukas) —
// veikia visiems trims turinio tipams (blog_posts / discussions / discoveries).
// hours: 1..336 (default 48).

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const TABLE: Record<string, string> = {
  post: 'blog_posts',
  discussion: 'discussions',
  discovery: 'discoveries',
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const role = session?.user?.role
  if (role !== 'admin' && role !== 'super_admin')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const table = TABLE[String(body.kind)]
  const id = body.id
  if (!table || !id) return NextResponse.json({ error: 'kind/id required' }, { status: 400 })

  const hours = Math.min(Math.max(parseInt(body.hours) || 48, 1), 24 * 14)
  const featured_until = body.featured ? new Date(Date.now() + hours * 3600_000).toISOString() : null

  const sb = createAdminClient()
  const { error } = await sb.from(table).update({ featured_until }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, featured_until })
}
