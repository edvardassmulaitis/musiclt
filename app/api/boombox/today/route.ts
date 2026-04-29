// app/api/boombox/today/route.ts
//
// Vienas endpoint'as atveža visą dienos turinį Boombox zonoms:
//   - image_drop, duel_drop, verdict_drop (ar `null` jei admin'as
//     nepublikavo nieko šiandien)
//   - video_drops sąrašas (curated short videos)
//   - viewer'io completion state'as (kas jau atlikta)
//   - streak'as ir total XP
//
// Naudojamas client'ui užkrauti pradinę zonos būseną.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import {
  ensureAnonCookie,
  fetchTodayImageDrop,
  fetchTodayDuelDrop,
  fetchTodayVerdictDrop,
  fetchTodayVideoDrops,
  fetchCompletionsForViewer,
} from '@/lib/boombox'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  let userId: string | null = null
  if (session?.user?.email) {
    const sb = createAdminClient()
    const { data } = await sb.from('profiles').select('id').eq('email', session.user.email).maybeSingle()
    userId = data?.id || null
  }
  const anonId = userId ? null : await ensureAnonCookie()

  const [imageDrop, duelDrop, verdictDrop, videoDrops] = await Promise.all([
    fetchTodayImageDrop(),
    fetchTodayDuelDrop(),
    fetchTodayVerdictDrop(),
    fetchTodayVideoDrops(5),
  ])

  const completions = await fetchCompletionsForViewer({
    userId, anonId,
    dropIds: {
      image: imageDrop?.id,
      duel: duelDrop?.id,
      verdict: verdictDrop?.id,
      videos: videoDrops.map(v => v.id),
    },
  })

  // Streak info
  let streak = { current: 0, total_xp: 0, longest: 0 }
  if (userId || anonId) {
    const sb = createAdminClient()
    const filter = userId ? { user_id: userId } : { anon_id: anonId }
    const { data } = await sb
      .from('boombox_streaks')
      .select('current_streak, longest_streak, total_xp')
      .match(filter)
      .maybeSingle()
    if (data) {
      streak = {
        current: data.current_streak || 0,
        total_xp: data.total_xp || 0,
        longest: data.longest_streak || 0,
      }
    }
  }

  return NextResponse.json({
    isAuthenticated: !!userId,
    image: imageDrop,
    duel: duelDrop,
    verdict: verdictDrop,
    videos: videoDrops,
    completions,
    streak,
  })
}
