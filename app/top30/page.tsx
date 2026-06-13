import { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase'
import TopChartView, { type TopData } from '@/components/TopChartView'
import { TopaiFilterBar } from '@/components/topai/TopaiFilterBar'
import { resolveDisplayWeek, fetchLiveVoteSplit } from '@/lib/top-week'

export const metadata: Metadata = {
  title: 'LT TOP 30 — Lietuvos muzikos topas | music.lt',
  description: 'Šios savaitės LT TOP 30 — populiariausios lietuvių dainos. Balsuok už mėgstamas.',
}

// Topo state'as keičiasi po populate/vote/finalize/reset operacijų — turi būti
// dynamic, kitaip Next.js išcache'ina ir admin pakeitimai nematomi public'e.
export const dynamic = 'force-dynamic'

async function getTopData(topType: string): Promise<TopData> {
  const supabase = createAdminClient()
  // Pereinamasis fallback: einamoji savaitė jei turi entries, kitaip naujausia
  // finalizuota (legacy archyvas). Žr. lib/top-week.ts.
  const { week, isFallback } = await resolveDisplayWeek(supabase, topType)
  if (!week) return { entries: [], week: null, isFallback: false }
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

  // Registered/anon split — rank tik pagal registered (žr. /top40 komentarą).
  const { registered: regVotes, anon: anonVotes } = await fetchLiveVoteSplit(supabase, week.id)

  const normalized = (entries || []).map((e: any) => ({
    ...e,
    tracks: Array.isArray(e.tracks) ? e.tracks[0] ?? null : e.tracks,
    registered_votes: regVotes.get(e.track_id) ?? 0,
    anon_votes: anonVotes.get(e.track_id) ?? 0,
    total_votes: (regVotes.get(e.track_id) ?? 0) + (anonVotes.get(e.track_id) ?? 0),
  })).map((e: any) => ({
    ...e,
    tracks: e.tracks ? {
      ...e.tracks,
      artists: Array.isArray(e.tracks.artists) ? e.tracks.artists[0] ?? null : e.tracks.artists,
    } : null,
  }))

  // Stabilus rikiavimas pagal position (žr. /top40 komentarą).
  const inTop = normalized.filter((e: any) => (e.weeks_in_top || 0) >= 1)
  const newcomerEntries = normalized.filter((e: any) => (e.weeks_in_top || 0) === 0)
  inTop.sort((a: any, b: any) => (a.position || 999) - (b.position || 999))
  newcomerEntries.sort((a: any, b: any) => (a.position || 999) - (b.position || 999))

  return { entries: [...inTop, ...newcomerEntries] as any, week, isFallback }
}

export default async function Top30Page() {
  const data = await getTopData('lt_top30')
  return (
    <>
      <div style={{ paddingTop: 14 }}><TopaiFilterBar view="community" /></div>
      <TopChartView
        data={data}
        topType="lt_top30"
        title="LT TOP 30"
        badge="Lietuvos topas"
        subtitle="Šios savaitės populiariausi lietuviški kūriniai. Tu sprendi, kas šią savaitę užims pirmą vietą."
        accent={{ hex: '#22c55e', rgb: 'rgba(34, 197, 94, 0.10)' }}
        siblingHref="/top40"
        siblingLabel="Pasaulinė TOP 40"
      />
    </>
  )
}
