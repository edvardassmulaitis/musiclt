import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'
import { ensureUserBlog } from '@/lib/ensure-blog'
import { createPost } from '@/lib/supabase-blog'
import type { ResolvedProfile } from '@/lib/profile-resolve'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/admin/naujienu-triage/convert   (Thread C, 2 etapas)
//
// Paverčia SUSIETĄ (status='linked') legacy RECENZIJĄ nario įrašu:
//   discussions.body → blog_posts (post_type='review', editorial_type='recenzija',
//   user_id = susietas narys, content = recenzijos HTML, original_url = šaltinis,
//   target_artist_id = discussions.artist_id, published_at = pirmo posto data).
//
// IDEMPOTENTIŠKA: jei triage.status jau 'converted' ir turi
// converted_blog_post_id — nieko nekuriam, grąžinam esamą.
//
// Sąlygos:
//   • Autorius privalo būti susietas su nariu (author_profile_id + status='linked').
//   • Recenzija privalo turėti realų tekstą (news_has_text) — tuščių nekonvertuojam.
//
// Body: { discussion_id }
const LT_MAP: Record<string, string> = {
  ą: 'a', č: 'c', ę: 'e', ė: 'e', į: 'i', š: 's', ų: 'u', ū: 'u', ž: 'z',
}
function slugify(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[ąčęėįšųūž]/g, (c) => LT_MAP[c] || c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72)
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const discussionId = Number(body.discussion_id)
  if (!discussionId) return NextResponse.json({ error: 'discussion_id privalomas' }, { status: 400 })

  const sb = createAdminClient()
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const actorId = String((session.user as any)?.id || '')
  const actor = uuidRe.test(actorId) ? actorId : null
  const now = new Date().toISOString()

  // 1. Triage būsena — turi būti susieta su nariu.
  const { data: tr, error: trErr } = await sb
    .from('news_review_triage')
    .select('discussion_id, author_raw, author_profile_id, status, converted_blog_post_id')
    .eq('discussion_id', discussionId)
    .maybeSingle()
  if (trErr) return NextResponse.json({ error: trErr.message }, { status: 500 })

  // Idempotencija — jau konvertuota.
  if (tr?.status === 'converted' && tr.converted_blog_post_id) {
    return NextResponse.json({ ok: true, action: 'convert', already: true, blog_post_id: tr.converted_blog_post_id })
  }
  if (!tr || !tr.author_profile_id) {
    return NextResponse.json({ error: 'Pirma susiek autorių su nariu' }, { status: 409 })
  }

  // 2. Recenzijos turinys iš discussions.
  const { data: disc, error: dErr } = await sb
    .from('discussions')
    .select('id, title, body, source_url, first_post_at, created_at, artist_id, news_has_text')
    .eq('id', discussionId)
    .maybeSingle()
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 })
  if (!disc) return NextResponse.json({ error: 'Recenzija nerasta' }, { status: 404 })
  if (!disc.news_has_text || !((disc.body || '').trim())) {
    return NextResponse.json({ error: 'Recenzija be teksto — nėra ką konvertuoti' }, { status: 422 })
  }

  // 3. Susieto nario profilis (autorius) + jo blogas.
  const { data: prof } = await sb
    .from('profiles')
    .select('id, email, username, full_name, avatar_url')
    .eq('id', tr.author_profile_id)
    .maybeSingle()
  if (!prof) return NextResponse.json({ error: 'Susietas narys nerastas' }, { status: 404 })

  let blog: any
  try {
    blog = await ensureUserBlog(prof as ResolvedProfile)
  } catch (e: any) {
    return NextResponse.json({ error: `Nepavyko užtikrinti nario blogo: ${e?.message || e}` }, { status: 500 })
  }

  // 4. Kuriam blog_posts įrašą. Slug su discussion_id — kad nesikirstų.
  const title = (disc.title || 'Recenzija').trim()
  const baseSlug = slugify(title) || 'recenzija'
  const publishedAt = disc.first_post_at || disc.created_at || now

  const data: any = {
    title,
    slug: `${baseSlug}-${discussionId}`,
    content: disc.body,
    summary: null,
    status: 'published',
    post_type: 'review',
    editorial_type: 'recenzija',
    original_url: disc.source_url || null,
    target_artist_id: disc.artist_id ?? null,
    published_at: publishedAt,
    tags: ['recenzija'],
  }

  let post: any
  try {
    post = await createPost(blog.id, prof.id, data)
  } catch (e: any) {
    return NextResponse.json({ error: `Nepavyko sukurti įrašo: ${e?.message || e}` }, { status: 500 })
  }

  // 5. Pažymim triage kaip konvertuotą (idempotencijai + UI).
  const { error: upErr } = await sb
    .from('news_review_triage')
    .update({
      status: 'converted',
      converted_blog_post_id: post.id,
      updated_at: now,
      updated_by: actor,
    })
    .eq('discussion_id', discussionId)
  if (upErr) {
    // Įrašas sukurtas, bet triage neatsinaujino — pranešam, kad admin žinotų.
    return NextResponse.json(
      { ok: true, action: 'convert', blog_post_id: post.id, warning: `Triage neatsinaujino: ${upErr.message}` },
      { status: 200 },
    )
  }

  // 6. GALERIJA (Thread C, 3 etapas): jei recenzija turi susietą reportažą
  //    (reportages.legacy_discussion_id = discussionId), įrašom nuorodą ATGAL
  //    į šį narių įrašą — dvipusis viešas cross-link. Idempotentiška.
  let gallery: { slug: string } | null = null
  const { data: rep } = await sb
    .from('reportages')
    .select('id, slug, blog_post_id')
    .eq('legacy_discussion_id', discussionId)
    .limit(1)
    .maybeSingle()
  if (rep) {
    if (!rep.blog_post_id) {
      await sb.from('reportages').update({ blog_post_id: post.id, updated_at: now }).eq('id', rep.id)
    }
    gallery = { slug: rep.slug }
  }

  const url = blog.slug && post.slug ? `/blogas/${blog.slug}/${post.slug}` : '/blogas'
  return NextResponse.json({ ok: true, action: 'convert', blog_post_id: post.id, url, gallery, member: { id: prof.id, username: prof.username } })
}
