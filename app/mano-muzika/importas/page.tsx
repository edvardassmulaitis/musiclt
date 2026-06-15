// app/mano-muzika/importas/page.tsx
// Muzikos importo įrankis (Last.fm / Spotify failas / YouTube).
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveProfile } from '@/lib/profile-resolve'
import { lastfmConfigured } from '@/lib/music-import'
import ImportClient from './ImportClient'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Perkelti muziką — music.lt',
  robots: { index: false, follow: false },
}

export default async function ImportasPage({ searchParams }: { searchParams: Promise<{ src?: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/auth/signin?callbackUrl=/mano-muzika/importas')
  const profile = await resolveProfile(session)
  if (!profile) redirect('/auth/signin?callbackUrl=/mano-muzika/importas')
  const sp = await searchParams
  const youtubeKey = !!process.env.YOUTUBE_API_KEY
  return <ImportClient lastfmOk={lastfmConfigured()} youtubeOk={youtubeKey} initialSource={sp?.src || null} />
}
