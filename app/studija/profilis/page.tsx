import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveProfile } from '@/lib/profile-resolve'
import { getTeamArtists, pickActiveArtist } from '@/lib/artist-studio'
import { createAdminClient } from '@/lib/supabase'
import EmptyStudio from '../EmptyStudio'
import ProfileEditor from './ProfileEditor'

export const dynamic = 'force-dynamic'

export default async function StudioProfile({ searchParams }: { searchParams: Promise<{ a?: string }> }) {
  const sp = await searchParams
  const session = await getServerSession(authOptions)
  const profile = await resolveProfile(session)
  const artists = profile?.id ? await getTeamArtists(profile.id) : []
  const active = pickActiveArtist(artists, sp.a)
  if (!active) return <EmptyStudio />

  const sb = createAdminClient()
  const { data } = await sb
    .from('artists')
    .select('id, slug, name, description, website, facebook, instagram, youtube, tiktok, spotify, soundcloud, bandcamp, twitter')
    .eq('id', active.id)
    .maybeSingle()

  return <ProfileEditor artist={data as any} />
}
