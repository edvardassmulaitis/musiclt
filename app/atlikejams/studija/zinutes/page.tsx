import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveProfile } from '@/lib/profile-resolve'
import { getTeamArtists, pickActiveArtist } from '@/lib/artist-studio'
import { createAdminClient } from '@/lib/supabase'
import EmptyStudio from '../EmptyStudio'
import MessageComposer from './MessageComposer'

export const dynamic = 'force-dynamic'

export default async function StudioMessages({ searchParams }: { searchParams: Promise<{ a?: string }> }) {
  const sp = await searchParams
  const session = await getServerSession(authOptions)
  const profile = await resolveProfile(session)
  const artists = profile?.id ? await getTeamArtists(profile.id) : []
  const active = pickActiveArtist(artists, sp.a)
  if (!active) return <EmptyStudio />

  const sb = createAdminClient()
  const [{ count }, { data: updates }] = await Promise.all([
    sb.from('artist_follows').select('*', { count: 'exact', head: true }).eq('artist_id', active.id),
    sb.from('artist_updates').select('id, kind, title, body, recipients, created_at').eq('artist_id', active.id).order('created_at', { ascending: false }).limit(20),
  ])

  return <MessageComposer artistId={active.id} followerCount={count || 0} initial={(updates || []) as any} />
}
