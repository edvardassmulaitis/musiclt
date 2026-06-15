// GET /api/studija/mine — atlikėjai, kuriuos valdo prisijungęs vartotojas.
// Naudoja HeaderAuth (rodyti „Atlikėjo studija" nuorodą tik valdytojams).
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveProfile } from '@/lib/profile-resolve'
import { getTeamArtists } from '@/lib/artist-studio'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  const profile = await resolveProfile(session)
  if (!profile?.id) return NextResponse.json({ artists: [] })
  const artists = await getTeamArtists(profile.id)
  return NextResponse.json({ artists: artists.map((a) => ({ id: a.id, slug: a.slug, name: a.name })) })
}
