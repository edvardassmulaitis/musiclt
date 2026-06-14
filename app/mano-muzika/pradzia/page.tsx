// app/mano-muzika/pradzia/page.tsx
// Naujo nario gamified muzikos susidėjimo srautas.
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveProfile } from '@/lib/profile-resolve'
import { getArtistSuggestions, getPopularStyles } from '@/lib/mano-muzika'
import OnboardingClient from './OnboardingClient'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Susidėk savo muziką — music.lt',
  robots: { index: false, follow: false },
}

export default async function OnboardingPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/auth/signin?callbackUrl=/mano-muzika/pradzia')
  const profile = await resolveProfile(session)
  if (!profile) redirect('/auth/signin?callbackUrl=/mano-muzika/pradzia')

  const [styles, artists] = await Promise.all([
    getPopularStyles(16),
    getArtistSuggestions({ limit: 30 }),
  ])

  return <OnboardingClient styles={styles} initialArtists={artists} username={profile.username || null} />
}
