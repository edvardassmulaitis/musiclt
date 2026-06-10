// app/api/admin/irasai/route.ts
//
// Admin: narių įrašų tipų tvarkymas homepage Bendruomenės juostai.
//   GET  ?view=todo|all & include_hidden=0|1 & offset & limit
//        → narių įrašai naujausi pirma. Paslėpti nariai (hide_from_homepage)
//          SLEPIAMI by default (jie homepage vis tiek nerodomi). „todo" = dar
//          neperžiūrėti (homepage_reviewed_at IS NULL).
//   PATCH { id, kind }            → priskirti vieną plokščią tipą (žr. KINDS) + pažymėti peržiūrėtą
//         { id, reviewed:bool }   → pažymėti/atžymėti „sutvarkyta" nekeičiant tipo
//
// VIENAS plokščias tipų sąrašas (be dviejų lygių). „kind" ↔ (post_type, editorial_type):
//   irasas           → article, null            (numatytasis; bet kas apie bet ką)
//   muzikos_apzvalga → review (jei jau review) ARBA article+recenzija (albumai/grupės/dainos)
//   koncertai        → article, koncertai        (renginio apžvalga)
//   topas            → topas, null
//   atradimas        → article, 'atradimas'      (muzikos atradimas)
//   kuryba           → creation, null
//   vertimas         → translation, null

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { enrichProseLinks } from '@/lib/topas-resolve'

export const maxDuration = 60

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user as any).role || '')) return null
  return session
}

// Manual prozos enrichinimas: regular įrašo content → DB albumai/dainos/atlikėjai nuorodomis.
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  if (body.action !== 'enrich_prose' || !body.id) return NextResponse.json({ error: 'bad request' }, { status: 400 })
  const sb = createAdminClient()
  const { data: post } = await sb.from('blog_posts').select('id, post_type, content').eq('id', body.id).maybeSingle()
  if (!post) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (post.post_type === 'topas') return NextResponse.json({ error: 'Topas enrichinamas per /admin/topai-vidiniai' }, { status: 400 })
  if (!post.content) return NextResponse.json({ error: 'nėra teksto' }, { status: 400 })
  const enriched = await enrichProseLinks(sb, post.content).catch(() => post.content)
  const count = (enriched.match(/bp-enrich"/g) || []).length
  const { error } = await sb.from('blog_posts').update({ content: enriched }).eq('id', body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, enriched: count })
}

// (post_type, editorial_type) → plokščias kind
function kindOf(postType: string, editorial: string | null): string {
  if (postType === 'topas') return 'topas'
  if (postType === 'creation') return 'kuryba'
  if (postType === 'translation') return 'vertimas'
  if (postType === 'review') return 'muzikos_apzvalga'
  if (postType === 'article') {
    if (editorial === 'recenzija') return 'muzikos_apzvalga'
    if (editorial === 'koncertai') return 'koncertai'
    if (editorial === 'atradimas') return 'atradimas'
  }
  return 'irasas'
}

// kind → (post_type, editorial_type). curReview=true reiškia, kad postas jau yra
// post_type=review (struktūrinė albumo recenzija) — jos neverčiam į article.
function writeKind(kind: string, curPostType: string): { post_type?: string; editorial_type: string | null } | null {
  switch (kind) {
    case 'irasas': return { post_type: 'article', editorial_type: null }
    case 'muzikos_apzvalga':
      return curPostType === 'review'
        ? { post_type: 'review', editorial_type: null }
        : { post_type: 'article', editorial_type: 'recenzija' }
    case 'koncertai': return { post_type: 'article', editorial_type: 'koncertai' }
    case 'atradimas': return { post_type: 'article', editorial_type: 'atradimas' }
    case 'topas': return { post_type: 'topas', editorial_type: null }
    case 'kuryba': return { post_type: 'creation', editorial_type: null }
    case 'vertimas': return { post_type: 'translation', editorial_type: null }
    default: return null
  }
}

function isNewItem(e: any): boolean {
  return !!e && typeof e === 'object' && ('rank' in e || 'entity_id' in e || 'entity_slug' in e)
}
function topasSummary(list: any[] | null) {
  const arr = Array.isArray(list) ? list : []
  if (!arr.length) return { format: 'empty', total: 0, matched: 0, unmatched: 0 }
  const news = arr.filter(isNewItem).length
  const format = news === 0 ? 'legacy' : news === arr.length ? 'new' : 'mixed'
  const matched = arr.filter(e => isNewItem(e) && e.entity_id != null).length
  return { format, total: arr.length, matched, unmatched: arr.length - matched }
}

export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sb = createAdminClient()
  const url = new URL(req.url)
  const view = url.searchParams.get('view') === 'all' ? 'all' : 'todo'
  const includeHidden = url.searchParams.get('include_hidden') === '1'
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 300)
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0)

  // !inner kai slepiam paslėptus narius (filtras DB lygyje); kitaip paprastas join.
  const join = includeHidden
    ? 'blogs:blog_id(slug, profiles:user_id(username, full_name, hide_from_homepage))'
    : 'blogs:blog_id!inner(slug, profiles:user_id!inner(username, full_name, hide_from_homepage))'

  // SVARBU (supabase-js): filtrai (.not/.is/.eq/.in) PRIEŠ transformacijas (.order/.range).
  let q = sb.from('blog_posts')
    .select(`id, slug, title, post_type, editorial_type, status, published_at, created_at, homepage_reviewed_at, list_items, target_album_id, target_event_id, ${join}`)
    .eq('status', 'published')
    .in('post_type', ['article', 'topas', 'review', 'creation', 'translation', 'event'])
  if (!includeHidden) q = q.not('blogs.profiles.hide_from_homepage', 'is', true)
  if (view === 'todo') q = q.is('homepage_reviewed_at', null)

  const { data, error } = await q
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
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
      kind: kindOf(b.post_type, b.editorial_type),
      reviewed: !!b.homepage_reviewed_at,
      published_at: b.published_at,
      author: prof?.username || prof?.full_name || null,
      hidden: !!prof?.hide_from_homepage,
      topas: b.post_type === 'topas' ? topasSummary(b.list_items) : null,
    }
  })
  return NextResponse.json({ items, hasMore: (data || []).length === limit, offset, limit })
}

export async function PATCH(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const id = body.id
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const sb = createAdminClient()

  // Tik „sutvarkyta" perjungimas (be tipo keitimo)
  if ('reviewed' in body && !('kind' in body)) {
    const { error } = await sb.from('blog_posts')
      .update({ homepage_reviewed_at: body.reviewed ? new Date().toISOString() : null }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, reviewed: !!body.reviewed })
  }

  // Tipo priskyrimas (+ automatiškai pažymim peržiūrėtą)
  if (typeof body.kind === 'string') {
    const { data: cur } = await sb.from('blog_posts').select('post_type').eq('id', id).maybeSingle()
    const upd = writeKind(body.kind, cur?.post_type || 'article')
    if (!upd) return NextResponse.json({ error: 'bad kind' }, { status: 400 })
    const { error } = await sb.from('blog_posts')
      .update({ ...upd, homepage_reviewed_at: new Date().toISOString() }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, ...upd, kind: body.kind, reviewed: true })
  }

  return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
}
