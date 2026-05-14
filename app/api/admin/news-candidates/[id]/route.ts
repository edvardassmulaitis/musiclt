/**
 * Admin actions per single candidate'ą.
 *
 * GET    /api/admin/news-candidates/{id}        — full detail
 * PATCH  /api/admin/news-candidates/{id}        — { action: 'approve'|'reject', reject_reason? }
 *   approve → inserts į news() table'ę su AI-generated content'u
 *   reject  → status='rejected', reason saugomas
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export const runtime = 'nodejs'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user.role as string) || '')) {
    return null
  }
  return session
}

function slugifyLt(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ą]/g, 'a').replace(/[č]/g, 'c').replace(/[ę]/g, 'e')
    .replace(/[ė]/g, 'e').replace(/[į]/g, 'i').replace(/[š]/g, 's')
    .replace(/[ų]/g, 'u').replace(/[ū]/g, 'u').replace(/[ž]/g, 'z')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 80)
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const candidateId = parseInt(id, 10)
  if (Number.isNaN(candidateId)) {
    return NextResponse.json({ error: 'Bad ID' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('news_candidates')
    .select(`
      *,
      primary_artist:artists!news_candidates_primary_artist_id_fkey(id, name, slug, cover_image_url)
    `)
    .eq('id', candidateId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  // Pridėti suggested artists su pavadinimais (BIGINT[] → look up)
  let suggestedArtists: Array<{ id: number; name: string; slug: string }> = []
  if (data.suggested_artist_ids && data.suggested_artist_ids.length > 0) {
    const { data: arts } = await supabase
      .from('artists')
      .select('id, name, slug, cover_image_url')
      .in('id', data.suggested_artist_ids)
    suggestedArtists = (arts || []) as any[]
  }

  return NextResponse.json({ candidate: data, suggested_artists: suggestedArtists })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const candidateId = parseInt(id, 10)
  if (Number.isNaN(candidateId)) {
    return NextResponse.json({ error: 'Bad ID' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const action = body.action as string | undefined
  const supabase = createAdminClient()

  // Load candidate
  const { data: cand, error: loadErr } = await supabase
    .from('news_candidates')
    .select('*')
    .eq('id', candidateId)
    .single()

  if (loadErr || !cand) {
    return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
  }
  if (cand.status !== 'pending') {
    return NextResponse.json({ error: `Already ${cand.status}` }, { status: 409 })
  }

  if (action === 'reject') {
    const { error } = await supabase
      .from('news_candidates')
      .update({
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
        reviewed_by: (session.user as any).id || null,
        reject_reason: (body.reason || '').slice(0, 500),
      })
      .eq('id', candidateId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, status: 'rejected' })
  }

  if (action === 'approve') {
    // Build news INSERT payload from candidate + optional body overrides
    const overrideTitle = (body.title as string | undefined) || cand.ai_title
    const overrideBody  = (body.body  as string | undefined) || cand.ai_body
    const overrideImage = (body.image_url as string | undefined) || cand.suggested_image_url

    // Build slug
    let slugBase = slugifyLt(overrideTitle)
    if (!slugBase) slugBase = `news-${Date.now()}`

    // Next ID + unique slug
    const { data: maxRow } = await supabase
      .from('news').select('id').order('id', { ascending: false }).limit(1).single()
    const nextId = (maxRow?.id || 0) + 1

    let finalSlug = slugBase
    let attempt = 0
    while (true) {
      const { data: ex } = await supabase
        .from('news').select('id').eq('slug', finalSlug).maybeSingle()
      if (!ex) break
      attempt++
      finalSlug = `${slugBase}-${attempt}`
    }

    // Body — pridėti source attribution apačioje
    const bodyWithSource = cand.source_url
      ? `${overrideBody}\n\n<p class="news-source"><em>Šaltinis: <a href="${escapeAttr(cand.source_url)}" target="_blank" rel="noopener">${escapeHtml(cand.source_portal || 'pirminis šaltinis')}</a></em></p>`
      : overrideBody

    const { data: created, error: insErr } = await supabase
      .from('news')
      .insert({
        id: nextId,
        slug: finalSlug,
        title: overrideTitle,
        body: bodyWithSource,
        type: 'news',
        author_id: (session.user as any).id || null,
        source_url: cand.source_url,
        source_name: cand.source_portal,
        artist_id: cand.primary_artist_id,
        artist_id2: cand.suggested_artist_ids?.[1] || null,
        image_small_url: overrideImage,
        image_title_url: overrideImage,
        published_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      })
      .select('id, slug')
      .single()

    if (insErr) {
      return NextResponse.json({ error: `Publish failed: ${insErr.message}` }, { status: 500 })
    }

    // Mark candidate approved
    await supabase
      .from('news_candidates')
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: (session.user as any).id || null,
        published_news_id: created.id,
      })
      .eq('id', candidateId)

    return NextResponse.json({ ok: true, status: 'approved', news_id: created.id, slug: created.slug })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
