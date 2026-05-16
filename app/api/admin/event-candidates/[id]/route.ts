/**
 * Admin actions per single event candidate'ą.
 *
 * GET    /api/admin/event-candidates/{id}        — full detail
 * PATCH  /api/admin/event-candidates/{id}        — { action: 'approve'|'reject', overrides? }
 *   approve → INSERT events table + link event_artists
 *   reject  → status='rejected'
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { createEvent, setEventArtists } from '@/lib/supabase-events'

export const runtime = 'nodejs'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user.role as string) || '')) return null
  return session
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const candidateId = parseInt(id, 10)
  if (Number.isNaN(candidateId)) return NextResponse.json({ error: 'Bad ID' }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('event_candidates')
    .select(`
      *,
      primary_artist:artists!event_candidates_primary_artist_id_fkey(id, name, slug, cover_image_url)
    `)
    .eq('id', candidateId)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  let suggestedArtists: any[] = []
  if (data.suggested_artist_ids?.length > 0) {
    const { data: arts } = await supabase
      .from('artists')
      .select('id, name, slug, cover_image_url, legacy_likes')
      .in('id', data.suggested_artist_ids)
    suggestedArtists = arts || []
  }

  return NextResponse.json({ candidate: data, suggested_artists: suggestedArtists })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const candidateId = parseInt(id, 10)
  if (Number.isNaN(candidateId)) return NextResponse.json({ error: 'Bad ID' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const action = body.action as string | undefined
  const supabase = createAdminClient()

  const { data: cand, error: loadErr } = await supabase
    .from('event_candidates')
    .select('*')
    .eq('id', candidateId)
    .single()
  if (loadErr || !cand) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
  if (cand.status !== 'pending') return NextResponse.json({ error: `Already ${cand.status}` }, { status: 409 })

  if (action === 'reject') {
    // reviewed_by NEpaduodamas — event_candidates.reviewed_by yra INTEGER, bet
    // session.user.id yra UUID iš Supabase Auth. Tas pats bug'as kaip news_candidates
    // (žr. migracija 20260515f). Defensive skip kol bus event_candidates
    // migracija į UUID tipą.
    const { error } = await supabase
      .from('event_candidates')
      .update({
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
        reject_reason: (body.reason || '').slice(0, 500),
      })
      .eq('id', candidateId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, status: 'rejected' })
  }

  if (action === 'approve') {
    const overrideTitle = (body.title as string | undefined) || cand.title
    const overrideDate  = (body.event_date as string | undefined) || cand.event_date
    const overrideVenue = (body.venue_name as string | undefined) || cand.venue_name_raw
    const overrideCity  = (body.city as string | undefined) || cand.city
    const overrideImage = (body.image_url as string | undefined) || cand.image_url || null

    if (!overrideDate) {
      return NextResponse.json({ error: 'event_date required for approval' }, { status: 400 })
    }

    try {
      const event = await createEvent({
        title: overrideTitle,
        description: cand.description || undefined,
        start_date: overrideDate,
        venue_name: overrideVenue || undefined,
        city: overrideCity || undefined,
        cover_image_url: overrideImage || undefined,
        ticket_url: cand.ticket_url || undefined,
      }, (session.user as any).id || '')

      // Link artists (visus iš suggested_artist_ids, ne tik primary)
      const artistIds: number[] = cand.suggested_artist_ids || []
      if (event?.id && artistIds.length > 0) {
        await setEventArtists(event.id, artistIds.map((id, i) => ({
          artist_id: id,
          is_headliner: id === cand.primary_artist_id || (i === 0 && !cand.primary_artist_id),
        })))
      }

      // reviewed_by skip same reason as in reject branch above.
      await supabase
        .from('event_candidates')
        .update({
          status: 'approved',
          reviewed_at: new Date().toISOString(),
          published_event_id: event?.id,
        })
        .eq('id', candidateId)

      return NextResponse.json({ ok: true, status: 'approved', event_id: event?.id, slug: event?.slug })
    } catch (e: any) {
      return NextResponse.json({ error: `Publish failed: ${e.message}` }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
