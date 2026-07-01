import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET /api/admin/naujienu-triage/list
//
// Grąžina VISAS legacy RECENZIJA discussions (~524, lengvi laukai — be body),
// su prisegta triage būsena ir susieto nario info. Filtravimą (status/paieška)
// atlieka klientas — rinkinys mažas, tad serverio puslapiuotės nereikia.
//
// Recenzijų selektorius (patikrinta gyvai): is_legacy AND legacy_kind='news'
// AND title ILIKE '%recenzij%'.
export async function GET(_req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const sb = createAdminClient()

  // 1. Recenzijos (be body — kad atsakymas liktų lengvas).
  const { data: reviews, error } = await sb
    .from('discussions')
    .select('id, title, slug, source_url, first_post_at, created_at, news_has_text, artist_id')
    .eq('is_legacy', true)
    .eq('legacy_kind', 'news')
    .ilike('title', '%recenzij%')
    .order('first_post_at', { ascending: false, nullsFirst: false })
    .limit(2000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows = reviews || []
  const ids = rows.map((r) => r.id)

  // 2. Triage būsenos šiems id.
  const triageById = new Map<number, any>()
  if (ids.length) {
    const { data: triage } = await sb
      .from('news_review_triage')
      .select('discussion_id, author_raw, author_key, parse_method, parse_conf, author_profile_id, status, converted_blog_post_id')
      .in('discussion_id', ids)
    for (const t of triage || []) triageById.set(t.discussion_id, t)
  }

  // 2b. Galerijos (reportages) šioms recenzijoms — Thread C 3 etapas.
  //     Ryšys per reportages.legacy_discussion_id = discussions.id.
  const galleryByDisc = new Map<number, any>()
  if (ids.length) {
    const { data: reps } = await sb
      .from('reportages')
      .select('legacy_discussion_id, slug, photo_count')
      .in('legacy_discussion_id', ids)
    for (const g of reps || []) if (g.legacy_discussion_id != null) galleryByDisc.set(g.legacy_discussion_id, g)
  }

  // 3. Susietų narių profiliai.
  const profileIds = Array.from(
    new Set((Array.from(triageById.values()).map((t) => t.author_profile_id).filter(Boolean))),
  )
  const profileById = new Map<string, any>()
  if (profileIds.length) {
    const { data: profs } = await sb
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .in('id', profileIds as string[])
    for (const p of profs || []) profileById.set(p.id, p)
  }

  // 4. Sujungiam.
  const items = rows.map((r) => {
    const t = triageById.get(r.id)
    const prof = t?.author_profile_id ? profileById.get(t.author_profile_id) : null
    const g = galleryByDisc.get(r.id)
    return {
      discussion_id: r.id,
      title: r.title,
      slug: r.slug,
      source_url: r.source_url,
      published_at: r.first_post_at || r.created_at,
      has_text: !!r.news_has_text,
      artist_id: r.artist_id,
      author_raw: t?.author_raw ?? null,
      author_key: t?.author_key ?? null,
      parse_method: t?.parse_method ?? null,
      parse_conf: t?.parse_conf ?? null,
      status: t?.status ?? 'pending',
      converted_blog_post_id: t?.converted_blog_post_id ?? null,
      member: prof ? { id: prof.id, username: prof.username, full_name: prof.full_name, avatar_url: prof.avatar_url } : null,
      gallery: g ? { slug: g.slug, photo_count: g.photo_count ?? 0 } : null,
    }
  })

  // 5. Suvestinė (klientui — greitiems filtrų skaitikliams).
  const counts = {
    total: items.length,
    with_text: items.filter((i) => i.has_text).length,
    with_gallery: items.filter((i) => i.gallery).length,
    parsed: items.filter((i) => i.author_raw).length,
    linked: items.filter((i) => i.status === 'linked').length,
    converted: items.filter((i) => i.status === 'converted').length,
    dismissed: items.filter((i) => i.status === 'dismissed').length,
    pending: items.filter((i) => i.status === 'pending').length,
  }

  return NextResponse.json({ items, counts })
}
