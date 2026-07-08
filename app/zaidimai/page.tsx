// app/zaidimai/page.tsx
//
// Žaidimų DASHBOARD — dienos-first, be scroll'o ant mobile:
//   * viena aiški CTA į dienos iššūkį + checklist (kas jau atlikta)
//   * kompaktiškas šiandienos scoreboard
//   * muzikos vadybininkas — atskiras veiksmas
// Pavieniai greitieji žaidimai čia NEBERODOMI (fokusas į kasdienį žaidimą).

import { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase'
import { resolveViewerReadonly } from '@/lib/zaidimai'
import {
  fetchTodayImageDrop,
  fetchTodayDuelDrop,
  fetchTodayVerdictDrop,
  fetchCompletionsForViewer,
  ltDayStartUtc,
  todayLT,
} from '@/lib/boombox'
import ZaidimaiHubClient from './ZaidimaiHubClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Žaidimai — dienos iššūkis | music.lt',
  description: 'Kasdienis muzikos iššūkis: tas pats visiems, rink taškus ir augink seriją. Plius muzikos vadybininko lyga.',
}

export type DailyStep = { key: string; label: string; present: boolean; done: boolean }
export type DailyTopRow = { name: string; isAnon: boolean; score: number }

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

  const [imageDrop, duelDrop, verdictDrop] = await Promise.all([
    fetchTodayImageDrop(),
    fetchTodayDuelDrop(),
    fetchTodayVerdictDrop(),
  ])

  const completionsP = fetchCompletionsForViewer({
    userId: viewer.userId,
    anonId: viewer.anonId,
    dropIds: { image: imageDrop?.id, duel: duelDrop?.id, verdict: verdictDrop?.id },
  })

  const viewerFilter = (q: any) => {
    if (viewer.userId) return q.eq('user_id', viewer.userId)
    if (viewer.anonId) return q.eq('anon_id', viewer.anonId)
    return null
  }

  const [meRes, dailyTopRes, myDailyScoreRes, dailyTotalRes, myTeamRes, completions] = await Promise.all([
    (viewer.userId || viewer.anonId)
      ? sb.from('boombox_streaks').select('current_streak, total_xp')
          .match(viewer.userId ? { user_id: viewer.userId } : { anon_id: viewer.anonId! }).maybeSingle()
      : Promise.resolve({ data: null }),
    sb.from('game_scores').select('user_id, anon_id, score')
      .eq('game', 'kvizas').eq('category', 'dienos').gte('created_at', dayStart)
      .order('score', { ascending: false }).limit(5),
    (() => {
      const q = viewerFilter(sb.from('game_scores').select('score')
        .eq('game', 'kvizas').eq('category', 'dienos').gte('created_at', dayStart)
        .order('score', { ascending: false }).limit(1))
      return q ? q.maybeSingle() : Promise.resolve({ data: null })
    })(),
    sb.from('game_scores').select('id', { count: 'exact', head: true })
      .eq('game', 'kvizas').eq('category', 'dienos').gte('created_at', dayStart),
    (() => {
      let q = sb.from('fantasy_teams').select('id, name')
      if (viewer.userId) q = q.eq('user_id', viewer.userId)
      else if (viewer.anonId) q = q.eq('anon_id', viewer.anonId)
      else return Promise.resolve({ data: null })
      return q.maybeSingle()
    })(),
    completionsP,
  ])

  const quizDone = !!(myDailyScoreRes as any).data
  const quizScore = ((myDailyScoreRes as any).data?.score as number) ?? null

  // Dienos iššūkio žingsniai — checklist
  const steps: DailyStep[] = [
    { key: 'kvizas', label: 'Atspėk 5 dainas', present: true, done: quizDone },
    { key: 'duel', label: 'Dienos dvikova', present: !!duelDrop, done: !!(completions as any).duel },
    { key: 'verdict', label: 'Palik verdiktą', present: !!verdictDrop, done: !!(completions as any).verdict },
    { key: 'image', label: 'Atspėk iš vaizdo', present: !!imageDrop, done: !!(completions as any).image },
  ].filter(s => s.present)
  const doneCount = steps.filter(s => s.done).length
  const allDone = doneCount === steps.length

  // Dienos rangas (jei žaista)
  let dailyRank: { score: number; rank: number; total: number } | null = null
  if (quizDone && quizScore !== null) {
    const { count: better } = await sb.from('game_scores').select('id', { count: 'exact', head: true })
      .eq('game', 'kvizas').eq('category', 'dienos').gte('created_at', dayStart)
      .gt('score', quizScore)
    dailyRank = { score: quizScore, rank: (better || 0) + 1, total: (dailyTotalRes as any).count || 1 }
  }

  const dailyRows = (dailyTopRes as any).data || []
  const nameById = await namesFor(sb, dailyRows.map((r: any) => r.user_id).filter(Boolean))
  const todayTop: DailyTopRow[] = dailyRows.map((r: any) => ({
    name: r.user_id ? (nameById.get(r.user_id) || 'Narys') : 'Svečias',
    isAnon: !r.user_id,
    score: r.score || 0,
  }))

  return {
    isAuthenticated: viewer.isAuthenticated,
    streak: (meRes as any).data?.current_streak || 0,
    totalXp: (meRes as any).data?.total_xp || 0,
    daily: { steps, doneCount, total: steps.length, allDone, rank: dailyRank },
    todayTop,
    fantasyTeam: ((myTeamRes as any).data?.name as string) || null,
  }
}

export default async function ZaidimaiPage() {
  const data = await loadHub()
  return <ZaidimaiHubClient {...data} />
}
