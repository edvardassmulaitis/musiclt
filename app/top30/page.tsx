import { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase'
import TopChartView, { type TopData } from '@/components/TopChartView'

export const metadata: Metadata = {
  title: 'LT TOP 30 — Lietuvos muzikos topas | music.lt',
  description: 'Šios savaitės LT TOP 30 — populiariausios lietuvių dainos. Balsuok už mėgstamas.',
}

async function getTopData(topType: string): Promise<TopData> {
  const supabase = createAdminClient()
  const { data: week } = await supabase
    .from('top_weeks')
    .select('*')
    .eq('top_type', topType)
    .eq('is_active', true)
    .single()
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

  const finalized = !!week.is_finalized
  const withPositions = finalized
    ? normalized
    : normalized.map((e, i) => ({ ...e, position: i + 1 }))

  return { entries: withPositions as any, week }
}

export default async function Top30Page() {
  const data = await getTopData('lt_top30')
  return (
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
  )
}
