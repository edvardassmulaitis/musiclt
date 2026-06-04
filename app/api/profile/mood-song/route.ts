// app/api/profile/mood-song/route.ts
//
// POST   { track_id }  → nustato nario „Nuotaikos dainą" (profiles.mood_song_track_id)
// DELETE               → išvalo
//
// Nuotaikos daina rodoma profilio hero featured slot'e. Paprastas vieno
// lauko update — atskiras nuo /api/profile PUT, kad wizard'as galėtų jį
// kviesti tiesiogiai.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { resolveProfile } from '@/lib/profile-resolve'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const profile = await resolveProfile(session)
  if (!profile) return NextResponse.json({ error: 'Profilio nepavyko paruošti' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const trackId = Number(body?.track_id)
  if (!Number.isFinite(trackId)) {
    return NextResponse.json({ error: 'Truksta dainos' }, { status: 400 })
  }

  const sb = createAdminClient()

  // Patikrinam, kad daina egzistuoja
  const { data: track } = await sb
    .from('tracks')
    .select('id')
    .eq('id', trackId)
    .maybeSingle() as { data: any }
  if (!track) return NextResponse.json({ error: 'Daina nerasta' }, { status: 404 })

  const { error } = await sb
    .from('profiles')
    .update({ mood_song_track_id: trackId, mood_song_set_at: new Date().toISOString() })
    .eq('id', profile.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const profile = await resolveProfile(session)
  if (!profile) return NextResponse.json({ error: 'Profilio nepavyko paruošti' }, { status: 500 })

  const sb = createAdminClient()
  const { error } = await sb
    .from('profiles')
    .update({ mood_song_track_id: null, mood_song_set_at: null })
    .eq('id', profile.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
