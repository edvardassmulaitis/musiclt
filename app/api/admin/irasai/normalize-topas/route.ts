// app/api/admin/irasai/normalize-topas/route.ts
//
// POST { id } → konvertuoja topo list_items legacy plain-text → naują entity
// formatą su DB automatch (BE kūrimo). Logika lib/topas-resolve.resolveTopasItems.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveTopasItems } from '@/lib/topas-resolve'

export const maxDuration = 60

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user as any).role || '')) return null
  return session
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const id = body.id
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const sb = createAdminClient()
  const { data: post, error } = await sb.from('blog_posts').select('id, post_type, list_items').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!post) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (post.post_type !== 'topas') return NextResponse.json({ error: 'ne topas' }, { status: 400 })
  const list = Array.isArray(post.list_items) ? post.list_items : []
  if (!list.length) return NextResponse.json({ error: 'tuščias list_items' }, { status: 400 })

  const { items, summary } = await resolveTopasItems(sb, list, { create: false })
  const { error: upErr } = await sb.from('blog_posts')
    .update({ list_items: items, homepage_reviewed_at: new Date().toISOString() }).eq('id', id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  return NextResponse.json({ ok: true, summary, items })
}
