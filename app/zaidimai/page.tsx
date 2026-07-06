// app/zaidimai/page.tsx
//
// Žaidimų zonos MASTER LANDING — daily-first (Wordle formulė):
// viršuje Dienos iššūkis, po juo šiandienos žaidimai su likusiais taškais,
// apačioje šiandienos + visų laikų lyderiai. Maksimaliai paprasta.

import { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase'
import { resolveViewerReadonly } from '@/lib/zaidimai'
import { ltDayStartUtc, nextDayLT, todayLT } from '@/lib/boombox'
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
  const dayStart = ltDayStartUtc()

  const viewerFilter = (q: any) => {
    if (viewer.userId) return q.eq('user_id', viewer.userId)
    if (viewer.anonId) return q.eq('anon_id', viewer.anonId)
    return null
  }

  // Lygiagrečiai: balansas, lyderiai, dienos TOP, viewer'io dienos būsena
  const [meRes, leadersRes, dailyTopRes, myDailyRes, myQuizRes, myVadybRes, myVotesRes, duelsRes, myTeamRes, myVaizdasRes, mySekundesRes, myMetaiRes, myDailyScoreRes, dailyTotalRes] = await Promise.all([
    (viewer.userId || viewer.anonId)
      ? sb.from('boombox_streaks').select('current_streak, total_xp')
          .match(viewer.userId ? { user_id: viewer.userId } : { anon_id: viewer.anonId! }).maybeSingle()
      : Promise.resolve({ data: null }),
    (async () => {
      // ŠIOS SAVAITĖS taškai (7 d.): game_scores + boombox_completions xp
      const weekAgo = ltDayStartUtc(nextDayLT(todayLT()).slice(0, 10))
      const from = new Date(Date.parse(weekAgo) - 7 * 864e5).toISOString()
      const agg = new Map<string, { user_id: string | null; anon_id: string | null; xp: number }>()
      const add = (uid: string | null, aid: string | null, xp: number) => {
        const k = uid ? `u${uid}` : `a${aid}`
        const cur = agg.get(k) || { user_id: uid, anon_id: aid, xp: 0 }
        cur.xp += xp
        agg.set(k, cur)
      }
      for (const table of ['game_scores', 'boombox_completions'] as const) {
        const timeCol = table === 'game_scores' ? 'created_at' : 'completed_at'
        for (let off = 0; off < 5000; off += 1000) {
          const { data: rows } = await sb.from(table)
            .select(`user_id, anon_id, xp_earned`)
            .gte(timeCol, from)
            .range(off, off + 999)
          for (const r of (rows as any[]) || []) add(r.user_id, r.anon_id, r.xp_earned || 0)
          if (!rows || rows.length < 1000) break
        }
      }
      const data = Array.from(agg.values())
        .filter(r => r.xp > 0)
        .sort((a, b) => b.xp - a.xp)
        .slice(0, 8)
        .map(r => ({ user_id: r.user_id, anon_id: r.anon_id, total_xp: r.xp, current_streak: 0 }))
      return { data }
    })(),
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
    (() => {
      let q = sb.from('fantasy_teams').select('id, name')
      if (viewer.userId) q = q.eq('user_id', viewer.userId)
      else if (viewer.anonId) q = q.eq('anon_id', viewer.anonId)
      else return Promise.resolve({ data: null })
      return q.maybeSingle()
    })(),
    (() => {
      const q = viewerFilter(sb.from('game_scores').select('id', { count: 'exact', head: true })
        .eq('game', 'vaizdas').gte('created_at', dayStart))
      return q || Promise.resolve({ count: 0 })
    })(),
    (() => {
      const q = viewerFilter(sb.from('game_scores').select('id', { count: 'exact', head: true })
        .eq('game', 'sekundes').gte('created_at', dayStart))
      return q || Promise.resolve({ count: 0 })
    })(),
    (() => {
      const q = viewerFilter(sb.from('game_scores').select('id', { count: 'exact', head: true })
        .eq('game', 'metai').gte('created_at', dayStart))
      return q || Promise.resolve({ count: 0 })
    })(),
    (() => {
      const q = viewerFilter(sb.from('game_scores').select('score, max_score')
        .eq('game', 'kvizas').eq('category', 'dienos').gte('created_at', dayStart).limit(1))
      return q ? q.maybeSingle() : Promise.resolve({ data: null })
    })(),
    sb.from('game_scores').select('id', { count: 'exact', head: true })
      .eq('game', 'kvizas').eq('category', 'dienos').gte('created_at', dayStart),
  ])

  // Dienos rangas: kiek dalyvių šiandien surinko daugiau už mane
  const myDailyScore = (myDailyScoreRes as any).data as { score: number; max_score: number | null } | null
  let dailyRank: { score: number; maxScore: number | null; rank: number; total: number } | null = null
  if (myDailyScore) {
    const { count: better } = await sb.from('game_scores').select('id', { count: 'exact', head: true })
      .eq('game', 'kvizas').eq('category', 'dienos').gte('created_at', dayStart)
      .gt('score', myDailyScore.score)
    dailyRank = {
      score: myDailyScore.score,
      maxScore: myDailyScore.max_score,
      rank: (better || 0) + 1,
      total: (dailyTotalRes as any).count || 1,
    }
  }

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

  void myVadybRes // (legacy quick-sim limitas — nebeaktualus fantasy lygoje)

  return {
    isAuthenticated: viewer.isAuthenticated,
    username: viewer.username,
    me,
    leaders,
    dailyTop,
    fantasyTeam: ((myTeamRes as any).data?.name as string) || null,
    dailyRank,
    today: {
      dailyPlayed: ((myDailyRes as any).count || 0) > 0,
      quizRunsLeft: Math.max(0, 3 - ((myQuizRes as any).count || 0)),
      vaizdasRunsLeft: Math.max(0, 3 - ((myVaizdasRes as any).count || 0)),
      sekundesRunsLeft: Math.max(0, 3 - ((mySekundesRes as any).count || 0)),
      metaiRunsLeft: Math.max(0, 3 - ((myMetaiRes as any).count || 0)),
      duelVotesLeft: Math.max(0, 10 - ((myVotesRes as any).count || 0)),
      duelPool: (duelsRes as any).count || 0,
    },
  }
}

export default async function ZaidimaiPage() {
  const data = await loadHub()
  return <ZaidimaiHubClient {...data} />
}
