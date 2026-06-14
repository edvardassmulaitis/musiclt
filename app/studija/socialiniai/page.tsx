import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveProfile } from '@/lib/profile-resolve'
import { getTeamArtists, pickActiveArtist } from '@/lib/artist-studio'
import { createAdminClient } from '@/lib/supabase'
import EmptyStudio from '../EmptyStudio'
import EmbedManager from './EmbedManager'

export const dynamic = 'force-dynamic'

export default async function StudioSocial({ searchParams }: { searchParams: Promise<{ a?: string }> }) {
  const sp = await searchParams
  const session = await getServerSession(authOptions)
  const profile = await resolveProfile(session)
  const artists = profile?.id ? await getTeamArtists(profile.id) : []
  const active = pickActiveArtist(artists, sp.a)
  if (!active) return <EmptyStudio />

  const sb = createAdminClient()
  const { data } = await sb
    .from('artist_social_embeds')
    .select('id, platform, url, caption, sort_order')
    .eq('artist_id', active.id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  return <EmbedManager artistId={active.id} initial={(data || []) as any} />
}
