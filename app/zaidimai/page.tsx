// app/zaidimai/page.tsx
//
// Žaidimų zona — atskira sritis su muzikiniais žaidimais (testuotojo idėja:
// aktyvumo paskata per žaidimus ir taškus, ne per įrašų spam'inimą).
//
// Server'is atveža: viewer'io taškų balansą (boombox_streaks), lyderių
// lentelę, šiandienos kvizo rekordus ir turinio kiekius. Žaidimai patys —
// atskiruose sub-route'uose.

import { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase'
import { resolveViewerReadonly } from '@/lib/zaidimai'
import { todayLT } from '@/lib/boombox'
import ZaidimaiHubClient from './ZaidimaiHubClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Žaidimai — atspėk dainą, dvikovos, muzikos vadybininkas | music.lt',
  description: 'Muzikiniai žaidimai: atspėk dainą iš ištraukos, balsuok dainų dvikovose, tapk muzikos vadybininku. Rink taškus ir kilk lyderių lentelėje.',
}

export type LeaderRow = {
  name: string
  isAnon: boolean
  totalXp: number
  streak: number
}

async function loadHub() {
  const viewer = await resolveViewerReadonly()
  const sb = createAdminClient()

  // Viewer'io balansas
  let me = { totalXp: 0, streak: 0 }
  if (viewer.userId || viewer.anonId) {
    const filter = viewer.userId ? { user_id: viewer.userId } : { anon_id: viewer.anonId! }
    const { data } = await sb
      .from('boombox_streaks')
      .select('current_streak, total_xp')
      .match(filter)
      .maybeSingle()
    if (data) me = { totalXp: data.total_xp || 0, streak: data.current_streak || 0 }
  }

  // Lyderių lentelė (visų laikų taškai)
  const { data: streakRows } = await sb
    .from('boombox_streaks')
    .select('user_id, anon_id, total_xp, current_streak')
    .order('total_xp', { ascending: false })
    .limit(10)

  const userIds = (streakRows || []).map(r => r.user_id).filter(Boolean) as string[]
  const nameById = new Map<string, string>()
  if (userIds.length) {
    const { data: profiles } = await sb
      .from('profiles')
      .select('id, username, full_name')
      .in('id', userIds)
    for (const p of profiles || []) {
      nameById.set(p.id, p.username || p.full_name || 'Narys')
    }
  }

  const leaders: LeaderRow[] = (streakRows || [])
    .filter(r => (r.total_xp || 0) > 0)
    .map(r => ({
      name: r.user_id ? (nameById.get(r.user_id) || 'Narys') : 'Svečias',
      isAnon: !r.user_id,
      totalXp: r.total_xp || 0,
      streak: r.current_streak || 0,
    }))

  // Šiandienos kvizo rekordas
  const today = todayLT()
  const { data: topToday } = await sb
    .from('game_scores')
    .select('score, correct_count, round_count, category')
    .eq('game', 'kvizas')
    .gte('created_at', `${today}T00:00:00+03:00`)
    .order('score', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Kiek dvikovų archyve
  const { count: duelCount } = await sb
    .from('boombox_duel_drops')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'ready')

  return {
    isAuthenticated: viewer.isAuthenticated,
    username: viewer.username,
    me,
    leaders,
    todayBest: topToday ? { score: topToday.score, correct: topToday.correct_count, rounds: topToday.round_count } : null,
    duelCount: duelCount || 0,
  }
}

export default async function ZaidimaiPage() {
  const data = await loadHub()
  return <ZaidimaiHubClient {...data} />
}
