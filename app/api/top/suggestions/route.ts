import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || 'pending'
  const topType = searchParams.get('type')
  const supabase = createAdminClient()

  let query = supabase
    .from('top_suggestions')
    .select('id, top_type, status, created_at, suggested_by_user_id, track_id')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(100)

  if (topType) query = query.eq('top_type', topType)

  const { data: suggestions, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!suggestions?.length) return NextResponse.json({ suggestions: [] })

  // Gauti track info
  const trackIds = suggestions.map(s => s.track_id).filter(Boolean)
  const { data: tracks } = trackIds.length > 0
    ? await supabase.from('tracks').select('id, title, artist_id').in('id', trackIds)
    : { data: [] }

  const artistIds = [...new Set((tracks || []).map((t: any) => t.artist_id).filter(Boolean))]
  const { data: artists } = artistIds.length > 0
    ? await supabase.from('artists').select('id, name').in('id', artistIds)
    : { data: [] }

  const artistMap = new Map((artists || []).map((a: any) => [a.id, a]))
  const trackMap = new Map((tracks || []).map((t: any) => [
    t.id, { ...t, artist_name: artistMap.get(t.artist_id)?.name ?? '' }
  ]))

  const enriched = suggestions.map(s => ({
    ...s,
    track: s.track_id ? trackMap.get(s.track_id) ?? null : null,
  }))

  return NextResponse.json({ suggestions: enriched })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const body = await req.json()
  const { top_type, track_id } = body
  const supabase = createAdminClient()

  if (!track_id) return NextResponse.json({ error: 'Daina nenurodyta' }, { status: 400 })

  // ─── GUARD 1: daina jau yra einamos savaitės tope ───
  // Suk'a per active week — jei track_id yra top_entries (bet kokia pozicija,
  // įskaitant newcomers ir below-top), atmetam su aiškiu pranešimu.
  const { data: activeWeek } = await supabase
    .from('top_weeks')
    .select('id')
    .eq('top_type', top_type)
    .eq('is_active', true)
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (activeWeek?.id) {
    const { data: alreadyInTop } = await supabase
      .from('top_entries')
      .select('id, position, weeks_in_top')
      .eq('week_id', activeWeek.id)
      .eq('track_id', track_id)
      .maybeSingle()
    if (alreadyInTop) {
      return NextResponse.json({
        error: 'Ši daina jau yra šios savaitės tope — jos siūlyti nebereikia.',
      }, { status: 400 })
    }
  }

  // ─── GUARD 2: daina senesnė nei 1 metai ───
  // Per web tik freshmusic. Admin'as gali rankiniu būdu pridėti senesnių per
  // /admin/top (POST /api/top/entries), bet user'iai per pasiūlymus — ne.
  const { data: track } = await supabase
    .from('tracks')
    .select('id, release_date, release_year')
    .eq('id', track_id)
    .maybeSingle()

  if (!track) {
    return NextResponse.json({ error: 'Daina nerasta' }, { status: 404 })
  }

  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  const currentYear = new Date().getFullYear()

  let tooOld = false
  if (track.release_date) {
    // Tikslesnis check — full date.
    const rd = new Date(track.release_date)
    if (Number.isFinite(rd.getTime()) && rd < oneYearAgo) tooOld = true
  } else if (track.release_year) {
    // Tik metai — leidžiam jei release_year >= currentYear - 1 (year 2025 May
    // 2026 atveju gali būti tarp 4 mėn ir 16 mėn — duodam benefit of doubt).
    if (track.release_year < currentYear - 1) tooOld = true
  } else {
    // Nei data, nei metai — negalim patikrinti, bet leidžiam: admin'as vis
    // tiek peržiūrės. (Alternatyva — strict reject; pasirinkau lenient nes
    // mūsų DB neturi 100% pilnumos ir kitaip per daug tikrų dainų atmestų.)
  }

  if (tooOld) {
    return NextResponse.json({
      error: 'Galima siūlyti tik dainas, išleistas per paskutinius 12 mėnesių. Senesnėms — kreipkis į adminą.',
    }, { status: 400 })
  }

  // ─── Existing pasiūlymas — return idempotently ───
  const { data: existing } = await supabase
    .from('top_suggestions')
    .select('id, status')
    .eq('top_type', top_type)
    .eq('track_id', track_id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ suggestion: existing })
  }

  const { data, error } = await supabase
    .from('top_suggestions')
    .insert({
      top_type,
      track_id,
      suggested_by_user_id: session.user.id,
      status: 'pending',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ suggestion: data })
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !['admin', 'super_admin'].includes(session.user.role))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, status } = body
  const supabase = createAdminClient()

  const { data: suggestion, error: fetchErr } = await supabase
    .from('top_suggestions')
    .update({
      status,
      reviewed_by: session.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*, tracks:track_id(id, title)')
    .single()

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

  // Approved pasiūlymai pateks į top_entries kai prasidės NAUJA savaitė
  // (per /api/top/weeks GET kuris kviečia get_or_create_active_week)

  return NextResponse.json({ ok: true, suggestion })
}
