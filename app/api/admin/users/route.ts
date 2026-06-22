import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user?.role !== 'admin' && session.user?.role !== 'super_admin')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = createAdminClient()

  const sp = req.nextUrl.searchParams
  const q = (sp.get('q') || '').trim()
  const sort = sp.get('sort') || 'activity' // activity | messages | karma | recent
  const claimedOnly = sp.get('claimed') === '1'
  const limit = Math.min(parseInt(sp.get('limit') || '100', 10) || 100, 500)
  const offset = parseInt(sp.get('offset') || '0', 10) || 0

  // Tik tie laukai, kurių reikia sąrašui — be sunkių JSONB/bio.
  let query = supabase
    .from('profiles')
    .select(
      'id, email, full_name, username, avatar_url, role, provider, is_claimed, created_at, ' +
        'legacy_message_count, legacy_login_count, legacy_karma_points, last_seen_legacy_at, hide_from_homepage',
      { count: 'exact' }
    )

  if (q) {
    // Paieška per username / email / full_name (case-insensitive).
    const safe = q.replace(/[%,()]/g, ' ')
    query = query.or(
      `username.ilike.%${safe}%,email.ilike.%${safe}%,full_name.ilike.%${safe}%`
    )
  }

  if (claimedOnly) {
    // „Registruoti" = arba realiai prisijungę (Google/FB), arba ghost'as
    // jau perimtas (is_claimed). Atmetam neperimtus legacy_forum ghost'us.
    query = query.or('is_claimed.eq.true,provider.neq.legacy_forum')
  }

  // Rūšiavimas. nullsFirst:false → reikšmės su duomenim viršuje, NULL apačioj.
  if (sort === 'messages') {
    query = query.order('legacy_message_count', { ascending: false, nullsFirst: false })
  } else if (sort === 'karma') {
    query = query.order('legacy_karma_points', { ascending: false, nullsFirst: false })
  } else if (sort === 'recent') {
    query = query.order('created_at', { ascending: false })
  } else {
    // activity (default): registruoti/perimti pirma, tada pagal forumo aktyvumą.
    query = query
      .order('is_claimed', { ascending: false, nullsFirst: false })
      .order('legacy_message_count', { ascending: false, nullsFirst: false })
      .order('legacy_login_count', { ascending: false, nullsFirst: false })
  }

  // range() apeina PostgREST 1000-row default cap (paginate'inam patys).
  const { data: users, count, error } = await query.range(offset, offset + limit - 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ users, total: count ?? null, limit, offset })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json()
  const { userId } = body
  if (!userId) return NextResponse.json({ error: 'Invalid' }, { status: 400 })

  const supabase = createAdminClient()

  // Legacy profilio claim — priskirti realų el. paštą seno nario profiliui.
  // Po to žmogus prisijungęs tuo el. paštu automatiškai perima profilį
  // (signIn / magic-link verify pažymi is_claimed). Reclaim'inamas ir username.
  if ('setEmail' in body) {
    const raw = typeof body.setEmail === 'string' ? body.setEmail.trim().toLowerCase() : ''
    if (!raw || !raw.includes('@')) {
      return NextResponse.json({ error: 'Neteisingas el. paštas' }, { status: 400 })
    }
    // Konflikto patikra: ar el. paštą jau turi KITAS profilis (UNIQUE lower(email)).
    const { data: holder } = await supabase
      .from('profiles')
      .select('id, username, full_name, provider, is_claimed')
      .ilike('email', raw)
      .neq('id', userId)
      .limit(1)
      .maybeSingle()
    if (holder) {
      return NextResponse.json(
        {
          error: 'conflict',
          message: `Šį el. paštą jau turi kitas profilis: ${holder.username || holder.full_name || holder.id}. Sujungimui kreipkis (rankinis merge).`,
          holder,
        },
        { status: 409 }
      )
    }
    const { error } = await supabase.from('profiles').update({ email: raw }).eq('id', userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, email: raw })
  }

  // hide_from_homepage toggle (admin + super_admin gali)
  if ('hide_from_homepage' in body) {
    const { error } = await supabase
      .from('profiles')
      .update({ hide_from_homepage: !!body.hide_from_homepage })
      .eq('id', userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // role update (tik super_admin)
  if (session.user?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const validRoles = ['user', 'admin', 'super_admin', 'moderator']
  if (!validRoles.includes(body.role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }
  const { error } = await supabase.from('profiles').update({ role: body.role }).eq('id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
