// Atlikėjo studijos karkasas — auth gate + navigacija.
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveProfile } from '@/lib/profile-resolve'
import { getTeamArtists } from '@/lib/artist-studio'
import StudioNav from './StudioNav'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Atlikėjo zona | music.lt' }

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  const profile = await resolveProfile(session)
  if (!profile?.id) redirect('/auth/signin?callbackUrl=/atlikejams/zona')

  const artists = await getTeamArtists(profile.id)

  return (
    <div className="page-shell">
      <Suspense fallback={<div className="mb-6 h-24" />}>
        <StudioNav artists={artists.map((a) => ({ id: a.id, slug: a.slug, name: a.name, cover_image_url: a.cover_image_url }))} />
      </Suspense>
      {children}
    </div>
  )
}
