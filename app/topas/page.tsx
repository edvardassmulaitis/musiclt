import { Metadata } from 'next'
import TopChartsClient from './TopChartsClient'
import { createAdminClient } from '@/lib/supabase'

export const metadata: Metadata = {
  title: 'TOP 40 ir LT TOP 30 | music.lt',
  description: 'Populiariausios dainos Lietuvoje ir pasaulyje šią savaitę. Balsuok už mėgstamas dainas.',
}

async function getTopData(topType: string) {
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
        artists:artist_id (
          id, slug, name, cover_image_url
        )
      )
    `)
    .eq('week_id', week.id)
    .order('position', { ascending: true })

  const normalized = (entries || []).map(e => ({
    ...e,
    tracks: Array.isArray(e.tracks) ? e.tracks[0] ?? null : e.tracks,
  })).map(e => ({
    ...e,
    tracks: e.tracks ? {
      ...e.tracks,
      artists: Array.isArray(e.tracks.artists) ? e.tracks.artists[0] ?? null : e.tracks.artists,
    } : null,
  }))
  return { entries: normalized, week }
}

export default async function TopPage() {
  const [top40, ltTop30] = await Promise.all([
    getTopData('top40'),
    getTopData('lt_top30'),
  ])
  return (
    <div style={{ background: '#080d14', minHeight: '100vh' }}>
      <TopChartsClient top40={top40 as any} ltTop30={ltTop30 as any} />
    </div>
  )
}
