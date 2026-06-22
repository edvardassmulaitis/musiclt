// app/sveiki/page.tsx
//
// „Sveiki" — įspūdingas pasveikinimo / apžvalgos puslapis po prisijungimo.
// Rodo: koliažą iš patikusių viršelių, profilio apžvalgą (legacy statistiką
// jei profilis perimtas), ir funkcijų pristatymą su CTA. Į jį nukreipiama po
// magic-link verify ir po Google login (kai nėra specifinio callbackUrl).

import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveProfile } from '@/lib/profile-resolve'
import { createAdminClient } from '@/lib/supabase'
import WelcomeClient from './WelcomeClient'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Sveiki — music.lt',
  robots: { index: false, follow: false },
}

type Cover = { url: string }

async function gatherWelcomeData(profile: any) {
  const sb = createAdminClient()
  const username: string | null = profile.username || null

  let covers: string[] = []
  let likedArtists = 0
  let likedAlbums = 0
  let likedTracks = 0

  if (username) {
    const { data: likes } = await sb
      .from('likes')
      .select('entity_type, entity_legacy_id')
      .eq('user_username', username)
      .range(0, 4999)
    const rows = (likes as { entity_type: string; entity_legacy_id: number }[]) || []
    const artistIds = new Set<number>()
    const albumIds = new Set<number>()
    const trackIds = new Set<number>()
    for (const r of rows) {
      if (r.entity_type === 'artist') artistIds.add(r.entity_legacy_id)
      else if (r.entity_type === 'album') albumIds.add(r.entity_legacy_id)
      else if (r.entity_type === 'track') trackIds.add(r.entity_legacy_id)
    }
    likedArtists = artistIds.size
    likedAlbums = albumIds.size
    likedTracks = trackIds.size

    const [ar, al] = await Promise.all([
      artistIds.size
        ? sb.from('artists').select('cover_image_url').in('legacy_id', Array.from(artistIds)).not('cover_image_url', 'is', null).limit(40)
        : Promise.resolve({ data: [] as any[] }),
      albumIds.size
        ? sb.from('albums').select('cover_image_url').in('legacy_id', Array.from(albumIds)).not('cover_image_url', 'is', null).limit(40)
        : Promise.resolve({ data: [] as any[] }),
    ])
    covers = [
      ...(((ar as any).data as any[]) || []).map((x) => x.cover_image_url),
      ...(((al as any).data as any[]) || []).map((x) => x.cover_image_url),
    ].filter(Boolean)
  }

  // Naujam vartotojui (be patikimų) — populiarių atlikėjų koliažas.
  if (covers.length < 12) {
    const { data: pop } = await sb
      .from('artists')
      .select('cover_image_url')
      .not('cover_image_url', 'is', null)
      .order('score', { ascending: false, nullsFirst: false })
      .limit(40)
    const extra = (((pop as any) || []) as any[]).map((x) => x.cover_image_url).filter(Boolean)
    covers = Array.from(new Set([...covers, ...extra]))
  }

  return {
    covers: covers.slice(0, 30),
    likedArtists,
    likedAlbums,
    likedTracks,
    hasLegacy: !!(profile.legacy_message_count || profile.legacy_karma_points || profile.joined_legacy_at),
  }
}

export default async function SveikiPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/auth/signin?callbackUrl=/sveiki')
  const profile = await resolveProfile(session)
  if (!profile) redirect('/auth/signin?callbackUrl=/sveiki')

  const data = await gatherWelcomeData(profile)
  const isAdmin = profile.role === 'admin' || profile.role === 'super_admin'
  const isReturning = !!profile.is_claimed || data.likedArtists + data.likedAlbums + data.likedTracks > 0

  return (
    <WelcomeClient
      name={profile.full_name || profile.username || 'bičiuli'}
      username={profile.username || null}
      avatarUrl={profile.avatar_url || null}
      covers={data.covers}
      stats={{
        artists: data.likedArtists,
        albums: data.likedAlbums,
        tracks: data.likedTracks,
        karma: profile.legacy_karma_points || null,
        messages: profile.legacy_message_count || null,
        joinedLegacy: profile.joined_legacy_at || null,
      }}
      hasLegacy={data.hasLegacy}
      isReturning={isReturning}
      isAdmin={isAdmin}
    />
  )
}
