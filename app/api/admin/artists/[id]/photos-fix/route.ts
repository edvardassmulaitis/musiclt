/**
 * POST /api/admin/artists/[id]/photos-fix
 *
 * Backfill esamiems atlikėjams, kuriuos importavom prieš photo-quality fix'ą:
 *   1) /small/ thumbnail'us deaktyvuoja (palieka DB'oje case admin nori juos
 *      dar kartą peržiūrėti, bet jie nebebus rodomi galerijoje).
 *   2) Full-size foto (be /small/ kelyje) — aktyvina (is_active=true) ir
 *      perskaičiuoja sort_order = 0..N pagal jau buvusį order'į.
 *   3) Jei yra bent viena full-size foto, atnaujina artists.cover_image_url
 *      į pirmą iš jų — kad public puslapis rodytų ne 70px miniatūrą, o normalų
 *      hero/avatar.
 *
 * Body (JSON, optional):
 *   {
 *     deleteSmall?: boolean,    // default false — jei true, /small/ rows ištrinami
 *     forceCover?: boolean,     // default false — jei true, perrašo cover_image_url net
 *                               //                  jei artist'as jau turi non-/small/ cover'į
 *   }
 *
 * Response:
 *   { ok: true, artistId, activated, deactivated, deleted, coverUpdated, newCover }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

const supabase = createAdminClient()

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return null
  }
  return session
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: idStr } = await params
  const artistId = Number(idStr)
  if (!Number.isFinite(artistId) || artistId <= 0) {
    return NextResponse.json({ error: 'Bad artist id' }, { status: 400 })
  }

  let body: any = {}
  try { body = await req.json() } catch { /* empty body OK */ }
  const deleteSmall = body?.deleteSmall === true
  const forceCover = body?.forceCover === true

  // 1) Surenkam visas šio artist'o photo eilutes
  const { data: photos, error: pErr } = await supabase
    .from('artist_photos')
    .select('id, url, is_active, sort_order')
    .eq('artist_id', artistId)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true })
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })

  const all = (photos || []) as any[]
  const fullSize = all.filter(p => typeof p.url === 'string' && !p.url.includes('/small/'))
  const smalls = all.filter(p => typeof p.url === 'string' && p.url.includes('/small/'))

  let activated = 0
  let deactivated = 0
  let deleted = 0

  // 2) Aktyvinam full-size + perskaičiuojam sort_order
  for (let i = 0; i < fullSize.length; i++) {
    const p = fullSize[i]
    const updates: Record<string, any> = { is_active: true, sort_order: i }
    const { error: uErr } = await (supabase
      .from('artist_photos') as any)
      .update(updates)
      .eq('id', p.id)
    if (!uErr) activated++
  }

  // 3) Tvarkom small thumb'us — delete arba deactivate
  if (smalls.length > 0) {
    if (deleteSmall) {
      const ids = smalls.map(p => p.id)
      const { error: dErr } = await (supabase
        .from('artist_photos') as any)
        .delete()
        .in('id', ids)
      if (!dErr) deleted = ids.length
    } else {
      for (const p of smalls) {
        const { error: uErr } = await (supabase
          .from('artist_photos') as any)
          .update({ is_active: false, sort_order: 900 + (p.sort_order || 0) })
          .eq('id', p.id)
        if (!uErr) deactivated++
      }
    }
  }

  // 4) Cover override — pirma full-size foto
  let coverUpdated = false
  let newCover: string | null = null
  if (fullSize.length > 0) {
    const candidate = fullSize[0].url as string
    // Patikrinam dabartinį cover'į
    const { data: artistRow } = await supabase
      .from('artists')
      .select('cover_image_url')
      .eq('id', artistId)
      .maybeSingle()
    const current = (artistRow as any)?.cover_image_url as string | null | undefined
    const currentIsSmall = current ? current.includes('/small/') : true
    if (forceCover || !current || currentIsSmall) {
      const { error: cErr } = await (supabase
        .from('artists') as any)
        .update({ cover_image_url: candidate })
        .eq('id', artistId)
      if (!cErr) {
        coverUpdated = true
        newCover = candidate
      }
    }
  }

  return NextResponse.json({
    ok: true,
    artistId,
    activated,
    deactivated,
    deleted,
    coverUpdated,
    newCover,
  })
}
