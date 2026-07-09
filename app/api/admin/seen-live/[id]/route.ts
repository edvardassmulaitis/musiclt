// app/api/admin/seen-live/[id]/route.ts
// PATCH { action:'approve'|'reject', ...overrides } — narių „matyti gyvai"
// draft'ų moderavimas. Approve gali pririšti/sukurti atlikėją ir/ar renginį.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { reviewSeenLive, type SeenLiveReviewOverrides } from '@/lib/seen-live'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { id: idStr } = await ctx.params
  const id = Number(idStr)
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Blogas id' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const action = body.action
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'Blogas action' }, { status: 400 })
  }

  const overrides: SeenLiveReviewOverrides = {
    artist_id: body.artist_id ?? null,
    create_artist: !!body.create_artist,
    artist_name: body.artist_name ?? null,
    extra_artist_ids: Array.isArray(body.extra_artist_ids) ? body.extra_artist_ids.map(Number).filter(Number.isFinite) : [],
    event_id: body.event_id ?? null,
    create_event: !!body.create_event,
    event_title: body.event_title ?? null,
    event_is_festival: !!body.event_is_festival,
    country_id: body.country_id ?? null,
    country_name: body.country_name ?? null,
    city_id: body.city_id ?? null,
    city_name: body.city_name ?? null,
    venue_id: body.venue_id ?? null,
    venue_name: body.venue_name ?? null,
    event_address: body.event_address ?? null,
    event_date: body.event_date ?? null,
    seen_year: body.seen_year ?? null,
    note: body.note,
  }

  try {
    await reviewSeenLive(id, action, overrides, (session.user as any).id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Klaida' }, { status: 400 })
  }
}
