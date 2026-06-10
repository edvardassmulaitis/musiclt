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

// Enrichinimas saugomas ATSKIRAI (content_enriched) — userio originalus content nekeičiamas.
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const stripTags2 = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
function enrichLinkList(html: string) {
  const out: { text: string; href: string; context: string }[] = []
  const re = /<a class="bp-enrich" href="([^"]*)">(?:<img[^>]*>)?<span>([^<]*)<\/span><\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const ctxStart = Math.max(0, m.index - 80)
    const ctx = stripTags2(html.slice(ctxStart, m.index + m[0].length + 60))
    out.push({ text: m[2], href: m[1], context: '…' + ctx + '…' })
  }
  return out
}
async function entityLink(sb: any, type: string, id: number) {
  if (type === 'artist') { const { data } = await sb.from('artists').select('slug, cover_image_url').eq('id', id).maybeSingle(); return { href: `/atlikejai/${data?.slug}`, cover: data?.cover_image_url || null } }
  if (type === 'album') { const { data } = await sb.from('albums').select('slug, cover_image_url, artist:artist_id(slug)').eq('id', id).maybeSingle(); const ar = Array.isArray(data?.artist) ? data?.artist[0] : data?.artist; return { href: `/albumai/${[ar?.slug, data?.slug].filter(Boolean).join('-')}-${id}`, cover: data?.cover_image_url || null } }
  const { data } = await sb.from('tracks').select('slug, cover_url').eq('id', id).maybeSingle(); return { href: `/dainos/${data?.slug}-${id}`, cover: data?.cover_url || null }
}
// Įterpia nuorodą į VISUS termino pasitaikymus (NE esamose nuorodose). Jei terminas
// apsuptas kabučių („…" / "…") — kabutės paslepiamos (įtraukiamos į nuorodą).
const QUO_CLASS = '[„“”‘’"\']'
function wrapText(html: string, text: string, href: string, cover: string | null): { html: string; wrapped: boolean } {
  const thumb = cover ? `<img class="bp-enrich-thumb" src="${cover}" alt=""/>` : ''
  const link = (t: string) => `<a class="bp-enrich" href="${href}">${thumb}<span>${t}</span></a>`
  const parts = html.split(/(<a\b[^>]*>[\s\S]*?<\/a>)/i)
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${QUO_CLASS}?)(${escRe(text)})(${QUO_CLASS}?)(?![\\p{L}\\p{N}])`, 'giu')
  let wrapped = false
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) continue            // anchor segmentas — praleidžiam
    parts[i] = parts[i].replace(re, (_m, q1, t, q2) => {
      wrapped = true
      return (q1 && q2) ? link(t) : `${q1}${link(t)}${q2}`   // abi kabutės → paslepiam
    })
  }
  return { html: parts.join(''), wrapped }
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const action = String(body.action || ''); const id = body.id
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const sb = createAdminClient()
  const { data: post } = await sb.from('blog_posts').select('id, post_type, content, content_enriched').eq('id', id).maybeSingle()
  if (!post) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (post.post_type === 'topas') return NextResponse.json({ error: 'Topas enrichinamas per /admin/topai-vidiniai' }, { status: 400 })
  const base = post.content_enriched || post.content || ''

  if (action === 'enrich_info') {
    return NextResponse.json({ ok: true, links: enrichLinkList(base), has_enriched: !!post.content_enriched })
  }
  if (action === 'reset_enrich') {
    await sb.from('blog_posts').update({ content_enriched: null }).eq('id', id)
    return NextResponse.json({ ok: true, links: [] })
  }
  if (action === 'enrich_prose') {
    if (!post.content) return NextResponse.json({ error: 'nėra teksto' }, { status: 400 })
    const enriched = await enrichProseLinks(sb, post.content).catch(() => post.content)  // VISADA iš švaraus content
    await sb.from('blog_posts').update({ content_enriched: enriched }).eq('id', id)
    return NextResponse.json({ ok: true, enriched: (enriched.match(/bp-enrich"/g) || []).length, links: enrichLinkList(enriched) })
  }
  // Rankinis susiejimas: pasirinktas entitetas → suranda jo pavadinimą tekste ir prikabina nuorodą.
  if (action === 'link_text') {
    const h = body.hit
    if (!h?.id) return NextResponse.json({ error: 'hit required' }, { status: 400 })
    const map: Record<string, string> = { daina: 'track', grupe: 'artist', albumas: 'album', track: 'track', artist: 'artist', album: 'album' }
    const type = map[h.type] || 'track'
    const inf = await entityLink(sb, type, h.id)
    const term = (body.term || h.title || h.artist || '').trim()
    if (!term) return NextResponse.json({ error: 'nėra termino' }, { status: 400 })
    const { html, wrapped } = wrapText(post.content_enriched || post.content || '', term, inf.href, inf.cover)
    if (!wrapped) return NextResponse.json({ ok: false, error: `Tekste nerasta „${term}"`, links: enrichLinkList(base) })
    await sb.from('blog_posts').update({ content_enriched: html }).eq('id', id)
    return NextResponse.json({ ok: true, links: enrichLinkList(html) })
  }
  // Atrišti konkretų terminą
  if (action === 'unlink_text') {
    const text = String(body.text || '')
    if (!post.content_enriched) return NextResponse.json({ error: 'nėra enrichinto' }, { status: 400 })
    const re = new RegExp(`<a class="bp-enrich"[^>]*><(?:img[^>]*>)?(?:<span>)?${escRe(text)}(?:</span>)?</a>|<a class="bp-enrich"[^>]*>(?:<img[^>]*>)?<span>${escRe(text)}</span></a>`, 'i')
    const html = post.content_enriched.replace(re, text)
    await sb.from('blog_posts').update({ content_enriched: html }).eq('id', id)
    return NextResponse.json({ ok: true, links: enrichLinkList(html) })
  }
  return NextResponse.json({ error: 'bad action' }, { status: 400 })
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
    .select(`id, slug, title, post_type, editorial_type, status, published_at, created_at, homepage_reviewed_at, featured_until, list_items, target_album_id, target_event_id, ${join}`)
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
      featured_until: b.featured_until || null,
      featured: !!(b.featured_until && new Date(b.featured_until).getTime() > Date.now()),
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

  // „Verta dėmesio" (featured) — /atrasti viršuje iki featured_until.
  // body.featured: true → now + featured_hours (default 48h); false → null.
  if ('featured' in body && !('kind' in body)) {
    const hours = Math.min(Math.max(parseInt(body.featured_hours) || 48, 1), 24 * 14)
    const featured_until = body.featured ? new Date(Date.now() + hours * 3600_000).toISOString() : null
    const { error } = await sb.from('blog_posts').update({ featured_until }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, featured_until })
  }

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
