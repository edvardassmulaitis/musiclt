// app/api/mano-muzika/route.ts
// GET → visa prisijungusio nario „Mano muzika" kolekcija.
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveProfile } from '@/lib/profile-resolve'
import { getMyMusic } from '@/lib/mano-muzika'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const profile = await resolveProfile(session)
  if (!profile) return NextResponse.json({ error: 'Profilio nepavyko paruošti' }, { status: 500 })
  try {
    const data = await getMyMusic(profile.id)
    return NextResponse.json({ ok: true, ...data, profile: { id: profile.id, username: profile.username } })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
