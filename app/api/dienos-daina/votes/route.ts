import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { headers } from 'next/headers'
import { logActivity } from '@/lib/activity-logger'
import { clientIpFromHeaders } from '@/lib/rate-limit'
import { deviceVoteGuard } from '@/lib/vote-guard'

function todayLT(): string {
  return new Date().toLocaleDateString('lt-LT', {
    timeZone: 'Europe/Vilnius',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).split('.').reverse().join('-')
}

// Balsavimas PER NOMINACIJĄ — vartotojas/IP gali balsuoti už VISAS dienos dainas,
// bet tik vieną kartą už kiekvieną. Narių balsas sveria 3x, anonimo 1x.
// (Anksčiau: vienas balsas per dieną. 2026-06-01 Edvardo prašymu.)
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const body = await req.json()
  const { nomination_id, fingerprint } = body

  const headersList = await headers()
  const ip = clientIpFromHeaders(headersList)

  const date = todayLT()
  const supabase = createAdminClient()
  const userId = session?.user?.id ?? null

  const { data: nomination } = await supabase
    .from('daily_song_nominations')
    .select('id, track_id, date, user_id')
    .eq('id', nomination_id)
    .eq('date', date)
    .is('removed_at', null)
    .single()

  if (!nomination)
    return NextResponse.json({ error: 'Nominacija nerasta' }, { status: 404 })

  // Negalima balsuoti už SAVO pasiūlymą. Edvardo prašymu 2026-06-02.
  if (userId && (nomination as any).user_id === userId)
    return NextResponse.json({ error: 'Negali balsuoti už savo pasiūlytą dainą' }, { status: 400 })

  // Ar jau balsavo už ŠIĄ dainą (ne už dieną apskritai).
  if (userId) {
    const { data: existing } = await supabase
      .from('daily_song_votes')
      .select('id')
      .eq('nomination_id', nomination_id)
      .eq('user_id', userId)
      .maybeSingle()
    if (existing)
      return NextResponse.json({ error: 'Jau balsavai už šią dainą' }, { status: 400 })
    // ANTI-CHEAT: įrenginio/IP paskyrų limitas (multi-account farming).
    const g = await deviceVoteGuard({
      table: 'daily_song_votes', scopeColumn: 'nomination_id', scopeValue: nomination_id,
      userId, fingerprint: fingerprint || null, ip,
    })
    if (!g.allowed)
      return NextResponse.json({ error: 'Per daug paskyrų iš šio įrenginio/tinklo.' }, { status: 429 })
  } else {
    const { data: existing } = await supabase
      .from('daily_song_votes')
      .select('id')
      .eq('nomination_id', nomination_id)
      .is('user_id', null)
      .eq('voter_ip', ip)
      .maybeSingle()
    if (existing)
      return NextResponse.json({ error: 'Jau balsavai už šią dainą' }, { status: 400 })
    // ANTI-CHEAT: anon dedup ir pagal fingerprint (kad IP rotacija su tuo pačiu
    // įrenginiu neapeitų).
    if (fingerprint && String(fingerprint).length >= 8) {
      const { data: fpExisting } = await supabase
        .from('daily_song_votes')
        .select('id')
        .eq('nomination_id', nomination_id)
        .is('user_id', null)
        .eq('voter_fingerprint', fingerprint)
        .maybeSingle()
      if (fpExisting)
        return NextResponse.json({ error: 'Jau balsavai už šią dainą' }, { status: 400 })
    }
  }

  const weight = userId ? 3 : 1

  const { data, error } = await supabase
    .from('daily_song_votes')
    .insert({
      date,
      nomination_id,
      track_id: nomination.track_id,
      user_id: userId,
      voter_ip: ip,
      voter_fingerprint: fingerprint || null,
      weight,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Activity feed (tik registruotiems) ──
  try {
    if (userId) {
      const { data: track } = await supabase
        .from('tracks')
        .select('id, slug, title, cover_url, artist_id, artists:artist_id(slug, name, cover_image_url)')
        .eq('id', nomination.track_id)
        .maybeSingle() as { data: any }
      const fullTitle = track ? `${track.title}${track.artists?.name ? ' — ' + track.artists.name : ''}` : 'daina'
      await logActivity({
        event_type: 'daily_vote',
        user_id: userId,
        actor_name: (session?.user as any)?.name || null,
        actor_avatar: (session?.user as any)?.image || null,
        entity_type: 'track',
        entity_id: nomination.track_id,
        entity_title: fullTitle,
        entity_url: '/dienos-daina',
        entity_image: track?.cover_url || track?.artists?.cover_image_url || null,
      })
    }
  } catch (e: any) {
    console.error('[activity-log] daily_vote failed:', e?.message || e)
  }

  return NextResponse.json({ vote: data, weight })
}

// Grąžina VISŲ nominacijų id, už kurias vartotojas/IP jau balsavo šiandien.
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const date = todayLT()
  const supabase = createAdminClient()
  const userId = session?.user?.id ?? null

  let q = supabase.from('daily_song_votes').select('nomination_id').eq('date', date)
  q = userId ? q.eq('user_id', userId) : q.is('user_id', null).eq('voter_ip', ip)
  const { data } = await q
  const votedNominationIds = Array.from(new Set((data || []).map((v: any) => v.nomination_id)))

  return NextResponse.json({ voted_nomination_ids: votedNominationIds, is_authenticated: !!userId })
}
