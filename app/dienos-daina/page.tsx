import { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase'
import DienesDainaClient from './DienesDainaClient'

export const dynamic = 'force-dynamic'

function todayLT(): string {
  return new Date().toLocaleDateString('lt-LT', {
    timeZone: 'Europe/Vilnius',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).split('.').reverse().join('-')
}

function yesterdayLT(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toLocaleDateString('lt-LT', {
    timeZone: 'Europe/Vilnius',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).split('.').reverse().join('-')
}

function normalizeTrack(raw: any) {
  if (!raw) return null
  const track = Array.isArray(raw) ? raw[0] ?? null : raw
  if (!track) return null
  return {
    ...track,
    artists: Array.isArray(track.artists) ? track.artists[0] ?? null : track.artists,
  }
}

async function getData() {
  const supabase = createAdminClient()
  const today = todayLT()
  const yesterday = yesterdayLT()

  console.log('DIENOS DAINA TODAY:', today)

  // Pirma paprastas query be join'ų
  const simpleRes = await supabase
    .from('daily_song_nominations')
    .select('id, date, comment, created_at, user_id, track_id')
    .eq('date', today)
    .is('removed_at', null)
    .order('created_at', { ascending: true })

  console.log('SIMPLE ERROR:', JSON.stringify(simpleRes.error))
  console.log('SIMPLE DATA:', JSON.stringify(simpleRes.data))

  // Tada su tracks join'u
  const nominationsRes = await supabase
    .from('daily_song_nominations')
    .select(`
      id, date, comment, created_at, user_id,
      tracks:track_id (
        id, slug, title, cover_url, spotify_id, video_url,
        artists:artist_id ( id, slug, name, cover_image_url )
      )
    `)
    .eq('date', today)
    .is('removed_at', null)
    .order('created_at', { ascending: true })

  console.log('NOMINATIONS ERROR:', JSON.stringify(nominationsRes.error))
  console.log('NOMINATIONS DATA:', JSON.stringify(nominationsRes.data))

  const winnersRes = await supabase
    .from('daily_song_winners')
    .select(`
      id, date, total_votes, weighted_votes, winning_comment, winning_user_id,
      tracks:track_id (
        id, slug, title, cover_url, spotify_id, video_url,
        artists:artist_id ( id, slug, name, cover_image_url )
      )
    `)
    .order('date', { ascending: false })
    .limit(15)

  const nominations = nominationsRes.data || []
  const nominationIds = nominations.map((n: any) => n.id)
  let voteCounts: Record<number, { total: number; weighted: number }> = {}

  if (nominationIds.length > 0) {
    const { data: votes } = await supabase
      .from('daily_song_votes')
      .select('nomination_id, weight')
      .eq('date', today)
      .in('nomination_id', nominationIds)
    for (const v of votes || []) {
      if (!voteCounts[v.nomination_id]) voteCounts[v.nomination_id] = { total: 0, weighted: 0 }
      voteCounts[v.nomination_id].total += 1
      voteCounts[v.nomination_id].weighted += v.weight
    }
  }

  const enrichedNominations = nominations
    .map((n: any) => ({
      ...n,
      tracks: normalizeTrack(n.tracks),
      votes: voteCounts[n.id]?.total || 0,
      weighted_votes: voteCounts[n.id]?.weighted || 0,
    }))
    .sort((a: any, b: any) => b.weighted_votes - a.weighted_votes)

  const enrichedWinners = (winnersRes.data || []).map((w: any) => ({
    ...w,
    tracks: normalizeTrack(w.tracks),
  }))

  return {
    nominations: enrichedNominations as any,
    winners: enrichedWinners as any,
    today,
    yesterday,
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const { winners } = await getData()
  const latest = winners[0]
  if (latest?.tracks) {
    const track = latest.tracks as any
    return {
      title: `Dienos daina: ${track.title} — ${track.artists?.name} | music.lt`,
      description: `Vakarykštė dienos daina: ${track.title}. Balsuok už šiandienos geriausią dainą!`,
      openGraph: {
        title: `Dienos daina: ${track.title}`,
        description: latest.winning_comment || `${track.title} — ${track.artists?.name}`,
        images: track.cover_url ? [track.cover_url] : [],
      },
    }
  }
  return {
    title: 'Dienos daina | music.lt',
    description: 'Kasdien balsuok už geriausią dainą ir siūlyk savo favoritą!',
  }
}

export default async function DienesDainaPage() {
  const data = await getData()
  return <DienesDainaClient {...data} />
}
