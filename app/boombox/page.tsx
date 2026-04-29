// app/boombox/page.tsx
//
// Boombox engagement zona — kasdienis 3-misijų wizard'as.
//   1. Atspėk dainą iš AI vaizdo
//   2. Dvikova tarp dviejų dainų
//   3. Dienos verdiktas (emoji reakcija)
//   + curated short video drops feed'as kaip final stage
//
// Server'is parsisiunčia visą dienos turinį iš lib/boombox helper'ių
// ir perduoda client'ui. Client'as valdo wizard flow + state.

import { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import {
  fetchTodayImageDrop,
  fetchTodayDuelDrop,
  fetchTodayVerdictDrop,
  fetchTodayVideoDrops,
  fetchCompletionsForViewer,
  readAnonCookie,
} from '@/lib/boombox'
import BoomboxClient from './BoomboxClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Boombox — kasdienės muzikos misijos | music.lt',
  description: 'Atspėk dainą iš vaizdo, balsuok dvikovose, palik verdiktą. Kasdien naujas drop\'as.',
}

async function loadInitial() {
  const session = await getServerSession(authOptions)
  let userId: string | null = null
  let username: string | null = null
  if (session?.user?.email) {
    const sb = createAdminClient()
    const { data } = await sb
      .from('profiles')
      .select('id, username')
      .eq('email', session.user.email)
      .maybeSingle()
    userId = data?.id || null
    username = data?.username || null
  }
  const anonId = userId ? null : await readAnonCookie()

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

  let streak = { current: 0, total_xp: 0, longest: 0 }
  if (userId || anonId) {
    const sb = createAdminClient()
    const filter = userId ? { user_id: userId } : { anon_id: anonId! }
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

  return {
    isAuthenticated: !!userId,
    username,
    image: imageDrop,
    duel: duelDrop,
    verdict: verdictDrop,
    videos: videoDrops,
    completions,
    streak,
  }
}

export default async function BoomboxPage() {
  const data = await loadInitial()
  return <BoomboxClient {...data} />
}
