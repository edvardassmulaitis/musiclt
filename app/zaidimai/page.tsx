// app/zaidimai/page.tsx
//
// Žaidimų zonos MASTER LANDING — daily-first (Wordle formulė):
// viršuje Dienos iššūkis, po juo šiandienos žaidimai su likusiais taškais,
// apačioje šiandienos + visų laikų lyderiai. Maksimaliai paprasta.

import { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase'
import { resolveViewerReadonly } from '@/lib/zaidimai'
import { todayLT } from '@/lib/boombox'
import ZaidimaiHubClient from './ZaidimaiHubClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Žaidimai — dienos iššūkis, atspėk dainą, dvikovos | music.lt',
  description: 'Kasdieniai muzikos žaidimai: dienos iššūkis (visiems tas pats!), atspėk dainą, dainų dvikovos, muzikos vadybininkas. Rink taškus ir kilk lyderių lentelėje.',
}

export type LeaderRow = {
  name: string
  isAnon: boolean
  totalXp: number
  streak: number
}

export type DailyTopRow = {
  name: string
  isAnon: boolean
  score: number
}

async function namesFor(sb: ReturnType<typeof createAdminClient>, userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const ids = userIds.filter(Boolean)
  if (!ids.length) return map
  const { data } = await sb.from('profiles').select('id, username, full_name').in('id', ids)
  for (const p of data || []) map.set(p.id, p.username || p.full_name || 'Narys')
  return map
}

async function loadHub() {
  const viewer = await resolveViewerReadonly()
  const sb = createAdminClient()
  const today = todayLT()
  const dayStart = `${today}T00:00:00+03:00`

  const viewerFilter = (q: any) => {
    if (viewer.userId) return q.eq('user_id', viewer.userId)
    if (viewer.anonId) return q.eq('anon_id', viewer.anonId)
    return null
  }

  // Lygiagrečiai: balansas, lyderiai, dienos TOP, viewer'io dienos būsena
  const [meRes, leadersRes, dailyTopRes, myDailyRes, myQuizRes, myVadybRes, myVotesRes, duelsRes] = await Promise.all([
    (viewer.userId || viewer.anonId)
      ? sb.from('boombox_streaks').select('current_streak, total_xp')
          .match(viewer.userId ? { user_id: viewer.userId } : { anon_id: viewer.anonId! }).maybeSingle()
      : Promise.resolve({ data: null }),
    sb.from('boombox_streaks').select('user_id, anon_id, total_xp, current_streak')
      .order('total_xp', { ascending: false }).limit(8),
    sb.from('game_scores').select('user_id, anon_id, score')
      .eq('game', 'kvizas').eq('category', 'dienos').gte('created_at', dayStart)
      .order('score', { ascending: false }).limit(5),
    (() => {
      const q = viewerFilter(sb.from('game_scores').select('id', { count: 'exact', head: true })
        .eq('game', 'kvizas').eq('category', 'dienos').gte('created_at', dayStart))
      return q || Promise.resolve({ count: 0 })
    })(),
    (() => {
      const q = viewerFilter(sb.from('game_scores').select('id', { count: 'exact', head: true })
        .eq('game', 'kvizas').neq('category', 'dienos').gte('created_at', dayStart))
      return q || Promise.resolve({ count: 0 })
    })(),
    (() => {
      const q = viewerFilter(sb.from('game_scores').select('id', { count: 'exact', head: true })
        .eq('game', 'vadybininkas').gte('created_at', dayStart))
      return q || Promise.resolve({ count: 0 })
    })(),
    (() => {
      const q = viewerFilter(sb.from('boombox_completions').select('id', { count: 'exact', head: true })
        .eq('mission_type', 'duel').gte('completed_at', dayStart))
      return q || Promise.resolve({ count: 0 })
    })(),
    sb.from('boombox_duel_drops').select('id', { count: 'exact', head: true }).eq('status', 'ready'),
  ])

  const me = {
    totalXp: (meRes as any).data?.total_xp || 0,
    streak: (meRes as any).data?.current_streak || 0,
  }

  const leaderRows = ((leadersRes as any).data || []).filter((r: any) => (r.total_xp || 0) > 0)
  const dailyRows = (dailyTopRes as any).data || []
  const allUserIds = [
    ...leaderRows.map((r: any) => r.user_id),
    ...dailyRows.map((r: any) => r.user_id),
  ].filter(Boolean) as string[]
  const nameById = await namesFor(sb, allUserIds)

  const leaders: LeaderRow[] = leaderRows.map((r: any) => ({
    name: r.user_id ? (nameById.get(r.user_id) || 'Narys') : 'Svečias',
    isAnon: !r.user_id,
    totalXp: r.total_xp || 0,
    streak: r.current_streak || 0,
  }))

  const dailyTop: DailyTopRow[] = dailyRows.map((r: any) => ({
    name: r.user_id ? (nameById.get(r.user_id) || 'Narys') : 'Svečias',
    isAnon: !r.user_id,
    score: r.score || 0,
  }))

  return {
    isAuthenticated: viewer.isAuthenticated,
    username: viewer.username,
    me,
    leaders,
    dailyTop,
    today: {
      dailyPlayed: ((myDailyRes as any).count || 0) > 0,
      quizRunsLeft: Math.max(0, 3 - ((myQuizRes as any).count || 0)),
      vadybRunsLeft: Math.max(0, 2 - ((myVadybRes as any).count || 0)),
      duelVotesLeft: Math.max(0, 10 - ((myVotesRes as any).count || 0)),
      duelPool: (duelsRes as any).count || 0,
    },
  }
}

export default async function ZaidimaiPage() {
  const data = await loadHub()
  return <ZaidimaiHubClient {...data} />
}
