import { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase'
import TopChartView, { type TopData } from '@/components/TopChartView'
import { resolveDisplayWeek, fetchLiveVoteSplit, getCurrentVoteWeekId, getLiveSuggested, getLiveDropped } from '@/lib/top-week'

export const metadata: Metadata = {
  title: 'TOP 40 — Pasaulinės muzikos topas | music.lt',
  description: 'Šios savaitės TOP 40 — populiariausios dainos. Balsuok už mėgstamas.',
}

// Topo state'as keičiasi po populate/vote/finalize/reset operacijų — turi būti
// dynamic, kitaip Next.js išcache'ina ir admin pakeitimai nematomi public'e.
export const dynamic = 'force-dynamic'

async function getTopData(topType: string): Promise<TopData> {
  const supabase = createAdminClient()
  // Pereinamasis fallback: einamoji savaitė jei turi entries, kitaip naujausia
  // finalizuota (legacy archyvas). Žr. lib/top-week.ts.
  const { week, isFallback } = await resolveDisplayWeek(supabase, topType)
  const voteWeekId = await getCurrentVoteWeekId(supabase, topType)
  const [suggested, dropped] = await Promise.all([getLiveSuggested(supabase, voteWeekId), getLiveDropped(supabase, voteWeekId)])
  if (!week) return { entries: [], week: null, isFallback: false, voteWeekId, suggested, dropped }
  const { data: entries } = await supabase
    .from('top_entries')
    .select(`
      id, position, prev_position, weeks_in_top, total_votes, is_new, peak_position, track_id,
      legacy_track_id, artist_name, title,
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

  // STABILUS rikiavimas: tiek pre-finalize, tiek post-finalize sortuojam pagal
  // top_entries.position. Pozicijas keičia TIK finalize_top_week RPC (savaitės
  // pabaigoje). Mid-week balsai kaupiasi į registered_votes counter'į, bet
  // chart'o tvarkos NEKEIČIA — kitaip vienas user'is matytų savo pačio balsų
  // efektą realtime ir tai pasirodytų kaip "manipuliacija".
  const inTop = normalized.filter((e: any) => (e.weeks_in_top || 0) >= 1)
  const newcomerEntries = normalized.filter((e: any) => (e.weeks_in_top || 0) === 0)

  inTop.sort((a: any, b: any) => (a.position || 999) - (b.position || 999))
  newcomerEntries.sort((a: any, b: any) => (a.position || 999) - (b.position || 999))

  return { entries: [...inTop, ...newcomerEntries] as any, week, isFallback, voteWeekId, suggested, dropped }
}

export default async function Top40Page() {
  const data = await getTopData('top40')
  return (
    <>
      <TopChartView
        data={data}
        topType="top40"
        title="TOP 40"
        badge="Pasaulinis topas"
        subtitle="Šios savaitės karščiausios pasaulinės muzikos dainos. Klausytojų balsai formuoja reitingą."
        accent={{ hex: 'var(--accent-orange)', rgb: 'rgba(249, 115, 22, 0.10)' }}
        siblingHref="/top30"
        siblingLabel="Lietuviška TOP 30"
      />
    </>
  )
}
