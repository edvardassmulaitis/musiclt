// app/api/tracks/[id]/play/route.ts
//
// Record that someone started playing a track. Fire-and-forget from the
// player UI — we don't block playback on this. The row goes into
// public.track_plays; offline jobs roll it up into trending rankings later.
//
// Auth: optional. Signed-in users get user_id filled; anon requests record
// the ml_anon_id cookie so we can shape trends per-device without knowing
// who's behind it. No rate limiting yet — volumes are small.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { readAnonIdFromCookie } from '@/lib/anon-migration'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const trackId = parseInt(id)
  if (!Number.isFinite(trackId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const sb = createAdminClient()
  const session = await getServerSession(authOptions)
  const email = session?.user?.email || null

  // Resolve the profile id via email — session.user.id can be stale after
  // migrations (see 20260424_artist_likes_profile_fk), so email is the
  // authoritative key.
  let userId: string | null = null
  if (email) {
    try {
      const { data } = await sb.from('profiles').select('id').eq('email', email).single()
      if (data?.id) userId = (data as any).id
    } catch {}
  }

  const anonId = userId ? null : await readAnonIdFromCookie()

  const { error } = await sb.from('track_plays').insert({
    track_id: trackId,
    user_id: userId,
    anon_id: anonId,
  })
  if (error) {
    // Log but don't fail loud — this endpoint should never break playback.
    console.error('[track-play] insert failed:', error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
