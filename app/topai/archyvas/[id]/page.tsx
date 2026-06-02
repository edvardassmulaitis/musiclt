import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'
import TopChartView, { type TopData } from '@/components/TopChartView'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  return {
    title: `Topo archyvas — savaitė #${id} | music.lt`,
  }
}

async function getWeekData(weekId: number): Promise<{ data: TopData; topType: string } | null> {
  const supabase = createAdminClient()
  const { data: week } = await supabase
    .from('top_weeks')
    .select('*')
    .eq('id', weekId)
    .maybeSingle()
  if (!week || !week.is_finalized) return null

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
    .order('position', { ascending: true })

  const normalized = (entries || []).map((e: any) => ({
    ...e,
    tracks: Array.isArray(e.tracks) ? e.tracks[0] ?? null : e.tracks,
    total_votes: e.total_votes || 0,
  })).map((e: any) => ({
    ...e,
    tracks: e.tracks ? {
      ...e.tracks,
      artists: Array.isArray(e.tracks.artists) ? e.tracks.artists[0] ?? null : e.tracks.artists,
    } : null,
  }))

  return { data: { entries: normalized as any, week, isFallback: true }, topType: week.top_type }
}

export default async function ArchiveWeekPage({ params }: Props) {
  const { id } = await params
  const weekId = parseInt(id)
  if (!Number.isFinite(weekId)) notFound()

  const res = await getWeekData(weekId)
  if (!res) notFound()

  const isLt = res.topType === 'lt_top30'
  return (
    <TopChartView
      data={res.data}
      topType={isLt ? 'lt_top30' : 'top40'}
      title={isLt ? 'LT TOP 30' : 'TOP 40'}
      badge={isLt ? 'Lietuvos topas' : 'Pasaulinis topas'}
      subtitle={isLt
        ? 'Šios savaitės populiariausi lietuviški kūriniai.'
        : 'Šios savaitės karščiausios pasaulinės muzikos dainos.'}
      accent={isLt
        ? { hex: '#22c55e', rgb: 'rgba(34, 197, 94, 0.10)' }
        : { hex: '#f97316', rgb: 'rgba(249, 115, 22, 0.10)' }}
      siblingHref={isLt ? '/top40' : '/top30'}
      siblingLabel={isLt ? 'Pasaulinė TOP 40' : 'Lietuviška TOP 30'}
      archiveMode
      backHref="/topai/archyvas"
    />
  )
}
