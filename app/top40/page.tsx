import { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase'
import TopChartView, { type TopData } from '@/components/TopChartView'
import { getCurrentWeekMonday } from '@/lib/top-week'

export const metadata: Metadata = {
  title: 'TOP 40 — Pasaulinės muzikos topas | music.lt',
  description: 'Šios savaitės TOP 40 — populiariausios dainos. Balsuok už mėgstamas.',
}

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
      id, position, prev_position, weeks_in_top, total_votes, is_new, peak_position,
      tracks:track_id (
        id, slug, title, cover_url, spotify_id, video_url,
        artists:artist_id ( id, slug, name, cover_image_url )
      )
    `)
    .eq('week_id', week.id)
    .order(week.is_finalized ? 'position' : 'total_votes', { ascending: !!week.is_finalized })

  const normalized = (entries || []).map((e: any) => ({
    ...e,
    tracks: Array.isArray(e.tracks) ? e.tracks[0] ?? null : e.tracks,
  })).map((e: any) => ({
    ...e,
    tracks: e.tracks ? {
      ...e.tracks,
      artists: Array.isArray(e.tracks.artists) ? e.tracks.artists[0] ?? null : e.tracks.artists,
    } : null,
  }))

  // Atnaujinti pozicijas pagal balsus jei dar nefinalizuota
  const finalized = !!week.is_finalized
  const withPositions = finalized
    ? normalized
    : normalized.map((e, i) => ({ ...e, position: i + 1 }))

  return { entries: withPositions as any, week }
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
      accent={{ hex: '#ef4444', rgb: 'rgba(239, 68, 68, 0.10)' }}
      siblingHref="/top30"
      siblingLabel="Lietuviška TOP 30"
    />
  )
}
