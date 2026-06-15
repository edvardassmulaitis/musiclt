import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveProfile } from '@/lib/profile-resolve'
import { getTeamArtists, pickActiveArtist } from '@/lib/artist-studio'
import { createAdminClient } from '@/lib/supabase'
import EmptyStudio from '../EmptyStudio'
import EmbedManager from './EmbedManager'
import ConnectionsManager from './ConnectionsManager'

export const dynamic = 'force-dynamic'

export default async function StudioSocial({ searchParams }: { searchParams: Promise<{ a?: string }> }) {
  const sp = await searchParams
  const session = await getServerSession(authOptions)
  const profile = await resolveProfile(session)
  const artists = profile?.id ? await getTeamArtists(profile.id) : []
  const active = pickActiveArtist(artists, sp.a)
  if (!active) return <EmptyStudio />

  const sb = createAdminClient()
  const [embedsRes, connsRes, artistRes] = await Promise.all([
    sb.from('artist_social_embeds').select('id, platform, url, caption, sort_order')
      .eq('artist_id', active.id).eq('is_active', true)
      .order('sort_order', { ascending: true }).order('created_at', { ascending: false }),
    sb.from('artist_social_connections').select('id, platform, external_id, username, status, last_synced_at, last_error')
      .eq('artist_id', active.id),
    sb.from('artists').select('youtube').eq('id', active.id).maybeSingle(),
  ])

  return (
    <div className="space-y-7">
      <ConnectionsManager artistId={active.id} initial={(connsRes.data || []) as any} defaultYoutube={(artistRes.data as any)?.youtube || ''} />
      <div>
        <h2 className="mb-3 font-['Outfit',sans-serif] text-lg font-bold text-[var(--text-primary)]">Rankiniai įrašai</h2>
        <EmbedManager artistId={active.id} initial={(embedsRes.data || []) as any} />
      </div>
    </div>
  )
}
