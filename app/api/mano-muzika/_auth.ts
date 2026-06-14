// app/api/mano-muzika/_auth.ts
// Bendras auth helper — grąžina prisijungusio nario profile.id arba null.
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveProfile } from '@/lib/profile-resolve'

export async function getUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  const profile = await resolveProfile(session)
  return profile?.id ?? null
}
