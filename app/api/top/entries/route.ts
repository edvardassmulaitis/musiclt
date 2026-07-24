import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getCurrentWeekMonday, getCurrentVoteWeekId, getLiveSuggested, getLiveDropped } from '@/lib/top-week'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const topType = searchParams.get('type') || 'top40'
  const weekId = searchParams.get('week_id')
  const supabase = createAdminClient()
  const voteWeekId = await getCurrentVoteWeekId(supabase, topType)

  // Find target week — by explicit week_id, or by current calendar week's
  // Monday (week_start anchor). NE TIKRINAM is_active flag — visada
  // einame į einamosios kalendorinės savaitės įrašą.
  let week: any = null
  if (weekId) {
    const { data } = await supabase
      .from('top_weeks')
      .select('*')
      .eq('id', parseInt(weekId))
      .single()
    week = data
  } else {
    const thisMonday = getCurrentWeekMonday()
    const { data } = await supabase
      .from('top_weeks')
      .select('*')
      .eq('top_type', topType)
      .eq('week_start', thisMonday)
      .maybeSingle()
    week = data
  }

  // Fallback'as: jei einamosios savaitės įrašo nėra DB (cron'as nesukūrė),
  // naudoti naujausią savaitę kurios įraše YRA bent vienas top_entries —
  // taip homepage'ui bus ką rodyti, o voting'as vis tiek bus prikabintas
  // prie current week'o per /api/top/vote (kuris naudoja week_id atskirai).
  if (!week) {
    // Pirmenybė NEfinalizuotai savaitei — kad balsavimas (reels + topo psl.)
    // liktų atviras, jei cron'as nesukūrė einamosios savaitės įrašo. Tik jei
    // tokios nėra — imam naujausią (galbūt finalizuotą, read-only display'ui).
    const { data: liveWk } = await supabase
      .from('top_weeks')
      .select('*')
      .eq('top_type', topType)
      .eq('is_finalized', false)
      .order('week_start', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (liveWk) week = liveWk
    else {
      const { data: latest } = await supabase
        .from('top_weeks')
        .select('*')
        .eq('top_type', topType)
        .order('week_start', { ascending: false })
        .limit(1)
        .maybeSingle()
      week = latest
    }
  }
  if (!week) return NextResponse.json({ entries: [], week: null, vote_week_id: voteWeekId, suggested: [] })

  let { data: entries, error } = await supabase
    .from('top_entries')
    .select('id, position, prev_position, weeks_in_top, total_votes, is_new, peak_position, track_id')
    .eq('week_id', week.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Jei grąžintos savaitės entries tuščia (cron'as sukūrė week'ą, bet
  // nesurolovino entries — arba rotacija nutrūko ir kelios savaitės iš eilės
  // tuščios), krentam į NAUJAUSIĄ ankstesnę savaitę KURI TURI entries — kaip
  // resolveDisplayWeek /top30 /top40 puslapiuose. Grąžinam ir tos savaitės
  // objektą (su tikru is_finalized), kad reels/psl. rodytų read-only
  // rezultatus, o NE tuščią sąrašą (bug 2026-07-23: lt_top30 tuščias nuo 06-15).
  // „Chart" = eilutės su weeks_in_top>=1. Vien newcomer'iai (weeks_in_top=0,
  // t.y. „Siūlomi kūriniai" gyvoj savaitėj) NĖRA topas — tada krentam į legacy.
  // Legacy savaitėse weeks_in_top dažnai NULL → fallback'ui užtenka BET KOKIŲ
  // entries. Tik einamosios (vote) savaitės newcomer'ius (weeks_in_top=0)
  // atmetam per hasChart, kad jie nebūtų parodyti kaip topas.
  const hasChart = (arr: any[] | null | undefined) => (arr || []).some((e: any) => (e.weeks_in_top || 0) >= 1)
  if (!hasChart(entries)) {
    const { data: priorWeeks } = await supabase
      .from('top_weeks')
      .select('*')
      .eq('top_type', topType)
      .lt('week_start', week.week_start)
      .order('week_start', { ascending: false })
      .limit(12)
    for (const pw of (priorWeeks || [])) {
      const { data: pe } = await supabase
        .from('top_entries')
        .select('id, position, prev_position, weeks_in_top, total_votes, is_new, peak_position, track_id')
        .eq('week_id', pw.id)
      if (pe?.length) { entries = pe; week = pw; break }
    }
  }
  if (!entries?.length) return NextResponse.json({ entries: [], week, vote_week_id: voteWeekId, suggested: [] })

  // LIVE vote split (registered vs anon). Admin'as nori matyti split'ą
  // (anti-spam), o rank'inimas remiasi TIK registered balsais — anon balsai
  // pozicijų neįtakoja. top_entries.total_votes atnaujinama tik per finalize
  // RPC, todėl mid-week LIVE imam iš top_votes.
  const { data: liveVotes } = await supabase
    .from('top_votes')
    .select('track_id, user_id, voter_ip')
    .eq('week_id', week.id)
    .eq('vote_type', 'like')

  // ANTI-CHEAT: rankinam pagal UNIKALIUS balsuotojus (ne eilučių skaičių).
  // Taip 10 paspaudimų / to paties user'io pakartotiniai balsai / race-condition
  // eilutės NEPUČIA reitingo — vienas user'is = 1 balsas dainai. registered =
  // distinct user_id; anon = distinct voter_ip.
  const regSets = new Map<number, Set<string>>()
  const anonSets = new Map<number, Set<string>>()
  ;(liveVotes || []).forEach((v: any) => {
    if (v.user_id) {
      if (!regSets.has(v.track_id)) regSets.set(v.track_id, new Set())
      regSets.get(v.track_id)!.add(String(v.user_id))
    } else {
      const ipKey = v.voter_ip || 'unknown'
      if (!anonSets.has(v.track_id)) anonSets.set(v.track_id, new Set())
      anonSets.get(v.track_id)!.add(ipKey)
    }
  })
  const regMap = new Map<number, number>()
  const anonMap = new Map<number, number>()
  for (const [tid, s] of regSets) regMap.set(tid, s.size)
  for (const [tid, s] of anonSets) anonMap.set(tid, s.size)

  // STABILUS rikiavimas: visada pagal top_entries.position. Pozicijas keičia
  // TIK finalize_top_week RPC; mid-week balsai kaupiasi į registered_votes
  // counter'ius, bet chart'o tvarkos NEKEIČIA. Kitaip vienas user'is matytų
  // savo balsų efektą realtime — atrodytų kaip "manipuliacija".
  const inTop = (entries as any[]).filter(e => (e.weeks_in_top || 0) >= 1)
  const newcomerEntries = (entries as any[]).filter(e => (e.weeks_in_top || 0) === 0)
  inTop.sort((a, b) => (a.position || 999) - (b.position || 999))
  newcomerEntries.sort((a, b) => (a.position || 999) - (b.position || 999))
  entries.length = 0
  ;(entries as any[]).push(...inTop, ...newcomerEntries)

  const trackIds = entries.map(e => e.track_id).filter(Boolean)
  const { data: tracks } = await supabase
    .from('tracks')
    .select('id, slug, title, cover_url, artist_id, video_url')
    .in('id', trackIds)

  const artistIds = [...new Set((tracks || []).map((t: any) => t.artist_id).filter(Boolean))]
  const { data: artists } = artistIds.length > 0
    ? await supabase.from('artists').select('id, slug, name, cover_image_url').in('id', artistIds)
    : { data: [] }

  const artistMap = new Map((artists || []).map((a: any) => [a.id, a]))
  const trackMap = new Map((tracks || []).map((t: any) => [
    t.id, { ...t, artists: artistMap.get(t.artist_id) ?? null }
  ]))

  const merged = entries.map((e, i) => ({
    ...e,
    position: e.position ?? (i + 1),
    // LIVE count'ai (registered + anon split). total_votes = pilna suma display'ui;
    // registered_votes — admin'o spam-detection ir official ranking metric.
    registered_votes: regMap.get(e.track_id) ?? 0,
    anon_votes: anonMap.get(e.track_id) ?? 0,
    total_votes: (regMap.get(e.track_id) ?? 0) + (anonMap.get(e.track_id) ?? 0),
    tracks: trackMap.get(e.track_id) ?? null,
  }))

  // ── Gyvos vote savaitės „extra" įrašai: siūlomos naujos (weeks_in_top=0,
  //    votable „Naujos — balsuok") + iškritę (weeks_in_top=-1, read-only). ──
  const [suggested, dropped] = voteWeekId
    ? await Promise.all([getLiveSuggested(supabase, voteWeekId), getLiveDropped(supabase, voteWeekId)])
    : [[], []]

  // BE cache header'ių — admin operacijos (populate, finalize, reset) turi
  // matyti freshness'ą iš karto. Public /top40, /top30 puslapiai naudoja
  // savo Supabase queries (server components), ne /api/top/entries.
  return NextResponse.json({ entries: merged, week, vote_week_id: voteWeekId, suggested, dropped })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !['admin', 'super_admin'].includes(session.user.role))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { week_id, track_id } = body
  const supabase = createAdminClient()

  const { data: week } = await supabase
    .from('top_weeks')
    .select('top_type, is_finalized')
    .eq('id', week_id)
    .single()

  if (week?.is_finalized)
    return NextResponse.json({ error: 'Savaitė jau uždaryta' }, { status: 400 })

  const { count } = await supabase
    .from('top_entries')
    .select('id', { count: 'exact', head: true })
    .eq('week_id', week_id)

  const { data, error } = await supabase
    .from('top_entries')
    .upsert({
      week_id,
      track_id,
      top_type: week?.top_type || 'top40',
      position: (count || 0) + 1,
      total_votes: 0,
      is_new: true,
      weeks_in_top: 1,
      peak_position: (count || 0) + 1,
    }, { onConflict: 'week_id,track_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entry: data })
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !['admin', 'super_admin'].includes(session.user.role))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const supabase = createAdminClient()

  const { error } = await supabase.from('top_entries').delete().eq('id', id!)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

