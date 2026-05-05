import { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase'
import TopChartView, { type TopData } from '@/components/TopChartView'
import { getCurrentWeekMonday, fetchLiveVoteSplit } from '@/lib/top-week'

export const metadata: Metadata = {
  title: 'TOP 40 — Pasaulinės muzikos topas | music.lt',
  description: 'Šios savaitės TOP 40 — populiariausios dainos. Balsuok už mėgstamas.',
}

// Topo state'as keičiasi po populate/vote/finalize/reset operacijų — turi būti
// dynamic, kitaip Next.js išcache'ina ir admin pakeitimai nematomi public'e.
export const dynamic = 'force-dynamic'

async function getTopData(topType: string): Promise<TopData> {
  const supabase = createAdminClient()
  // Anchor į dabartinę kalendorinę savaitę (week_start = einamasis pirmadienis)
  const thisMonday = getCurrentWeekMonday()
  const { data: week } = await supabase
    .from('top_weeks')
    .select('*')
    .eq('top_type', topType)
    .eq('week_start', thisMonday)
    .maybeSingle()
  if (!week) return { entries: [], week: null }
  const { data: entries } = await supabase
    .from('top_entries')
    .select(`
      id, position, prev_position, weeks_in_top, total_votes, is_new, peak_position, track_id,
      tracks:track_id (
        id, slug, title, cover_url, spotify_id, video_url,
        artists:artist_id ( id, slug, name, cover_image_url )
      )
    `)
    .eq('week_id', week.id)

  // LIVE votes split: registered = ranking, anon = display only (anti-spam).
  // Anon balsus rodom counter'yje, bet į pozicijas jie NEĮEINA.
  const { registered: regVotes, anon: anonVotes } = await fetchLiveVoteSplit(supabase, week.id)

  const normalized = (entries || []).map((e: any) => ({
    ...e,
    tracks: Array.isArray(e.tracks) ? e.tracks[0] ?? null : e.tracks,
    registered_votes: regVotes.get(e.track_id) ?? 0,
    anon_votes: anonVotes.get(e.track_id) ?? 0,
    // total_votes = display sum (registered + anon), bet rank'inimui naudojam tik registered
    total_votes: (regVotes.get(e.track_id) ?? 0) + (anonVotes.get(e.track_id) ?? 0),
  })).map((e: any) => ({
    ...e,
    tracks: e.tracks ? {
      ...e.tracks,
      artists: Array.isArray(e.tracks.artists) ? e.tracks.artists[0] ?? null : e.tracks.artists,
    } : null,
  }))

  // SVARBU: pozicijos 1..N priskirtinos TIK in-top entries (weeks_in_top >= 1).
  // Newcomers (weeks_in_top = 0) lieka su savo pozicijomis ir rodomi atskirame
  // panel'yje (TopChartView filter'ina pagal weeks_in_top).
  const finalized = !!week.is_finalized
  const inTop = normalized.filter((e: any) => (e.weeks_in_top || 0) >= 1)
  const newcomerEntries = normalized.filter((e: any) => (e.weeks_in_top || 0) === 0)

  if (finalized) {
    inTop.sort((a: any, b: any) => (a.position || 999) - (b.position || 999))
  } else {
    // Rank pagal registered_votes — anon nereitinguoja (spam protection).
    inTop.sort((a: any, b: any) => (b.registered_votes || 0) - (a.registered_votes || 0))
    inTop.forEach((e: any, i: number) => { e.position = i + 1 })
  }
  newcomerEntries.sort((a: any, b: any) => (b.registered_votes || 0) - (a.registered_votes || 0))

  return { entries: [...inTop, ...newcomerEntries] as any, week }
}

export default async function Top40Page() {
  const data = await getTopData('top40')
  return (
    <TopChartView
      data={data}
      topType="top40"
      title="TOP 40"
      badge="Pasaulinis topas"
      subtitle="Šios savaitės karščiausios pasaulinės muzikos dainos. Klausytojų balsai formuoja reitingą."
      accent={{ hex: '#f97316', rgb: 'rgba(249, 115, 22, 0.10)' }}
      siblingHref="/top30"
      siblingLabel="Lietuviška TOP 30"
    />
  )
}
