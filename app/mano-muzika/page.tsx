// app/mano-muzika/page.tsx
// „Mano muzika" — nario mėgstamos muzikos valdymo centras.
// Server component: auth gating + initial data, paskui MyMusicClient.
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveProfile } from '@/lib/profile-resolve'
import { getMyMusic } from '@/lib/mano-muzika'
import MyMusicClient from './MyMusicClient'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Mano muzika — music.lt',
  description: 'Tvarkyk savo mėgstamus atlikėjus, albumus, dainas, nuotaikos dainas ir stilius.',
  robots: { index: false, follow: false },
}

export default async function ManoMuzikaPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/auth/signin?callbackUrl=/mano-muzika')

  const profile = await resolveProfile(session)
  if (!profile) redirect('/auth/signin?callbackUrl=/mano-muzika')

  const data = await getMyMusic(profile.id)

  // Jei naujas narys (nieko nesusidėjęs ir onboarding nepraleido/nebaigė) —
  // siūlom susidėjimo srautą.
  const totalFavs = data.counts.artists + data.counts.albums + data.counts.tracks
  const suggestOnboarding = totalFavs === 0 && !data.setup.completed && !data.setup.skipped

  return (
    <MyMusicClient
      initial={data}
      username={profile.username || null}
      avatarUrl={profile.avatar_url || null}
      suggestOnboarding={suggestOnboarding}
    />
  )
}
