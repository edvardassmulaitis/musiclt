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
      tracks (
        id, slug, title, cover_url, spotify_id, video_url,
        artists ( id, slug, name, cover_image_url )
      )
    `)
    .eq('week_id', week.id)
    .order('position', { ascending: true })

  return { entries: entries || [], week }
}

export default async function TopPage() {
  const [top40, ltTop30] = await Promise.all([
    getTopData('top40'),
    getTopData('lt_top30'),
  ])

  return <TopChartsClient top40={top40} ltTop30={ltTop30} />
}
