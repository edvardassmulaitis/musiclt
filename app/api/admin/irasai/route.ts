// app/api/admin/irasai/route.ts
//
// Admin: narių įrašų (blog_posts) tipų tvarkymas homepage Bendruomenės juostai.
//   GET  → naujausių narių įrašų sąrašas (article/topas/review) su autoriumi,
//          dabartiniu tipu ir (topas atveju) list_items formato/match santrauka.
//   PATCH { id, post_type?, editorial_type? } → priskirti teisingą tipą.
//
// Tipų taksonomija suderinta su /atrasti ir homepage TypeStrip.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user as any).role || '')) return null
  return session
}

// list_items formato detekcija (legacy plain-text vs naujas entity formatas).
function isNewItem(e: any): boolean {
  return !!e && typeof e === 'object' && ('rank' in e || 'entity_id' in e || 'entity_slug' in e)
}
function topasSummary(list: any[] | null): {
  format: 'empty' | 'legacy' | 'new' | 'mixed'
  total: number; matched: number; unmatched: number
} {
  const arr = Array.isArray(list) ? list : []
  if (!arr.length) return { format: 'empty', total: 0, matched: 0, unmatched: 0 }
  const news = arr.filter(isNewItem).length
  const format = news === 0 ? 'legacy' : news === arr.length ? 'new' : 'mixed'
  const matched = arr.filter(e => isNewItem(e) && e.entity_id != null).length
  return { format, total: arr.length, matched, unmatched: arr.length - matched }
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sb = createAdminClient()

  const { data, error } = await sb
    .from('blog_posts')
    .select('id, slug, title, post_type, editorial_type, status, published_at, created_at, list_items, target_album_id, target_event_id, blogs:blog_id(slug, profiles:user_id(username, full_name, hide_from_homepage))')
    .in('post_type', ['article', 'topas', 'review', 'creation', 'translation', 'event'])
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(120)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const items = (data || []).map((b: any) => {
    const prof = Array.isArray(b.blogs?.profiles) ? b.blogs.profiles[0] : b.blogs?.profiles
    return {
      id: b.id,
      title: b.title || '(be pavadinimo)',
      slug: b.slug,
      blog_slug: b.blogs?.slug || prof?.username || null,
      post_type: b.post_type,
      editorial_type: b.editorial_type,
      status: b.status,
      published_at: b.published_at,
      author: prof?.username || prof?.full_name || null,
      hidden: !!prof?.hide_from_homepage,
      has_album: b.target_album_id != null,
      has_event: b.target_event_id != null,
      topas: b.post_type === 'topas' ? topasSummary(b.list_items) : null,
    }
  })
  return NextResponse.json({ items })
}

export async function PATCH(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const id = body.id
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const POST_TYPES = ['article', 'topas', 'review', 'creation', 'translation', 'event']
  const EDITORIAL = ['recenzija', 'koncertai', 'kita']
  const upd: Record<string, any> = {}
  if (typeof body.post_type === 'string' && POST_TYPES.includes(body.post_type)) upd.post_type = body.post_type
  if ('editorial_type' in body) {
    // 'kita' / '' / null → NULL (homepage tokio nepromotina)
    const e = body.editorial_type
    upd.editorial_type = e && EDITORIAL.includes(e) && e !== 'kita' ? e : null
  }
  if (!Object.keys(upd).length) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

  const sb = createAdminClient()
  const { error } = await sb.from('blog_posts').update(upd).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, updated: upd })
}
