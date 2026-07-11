// app/zaidimai/dienos/page.tsx
//
// DIENOS IŠŠŪKIS — vienas jungiantis wizard'as (buvusio Boombox įpėdinis):
//   1. Atspėk dainą (5 raundai, visiems tas pats, ×2 taškai)
//   2. Dienos dvikova
//   3. Dienos verdiktas
//   4. Atspėk iš AI vaizdo (kai admin'as įkėlęs — premium misija)
//   → suvestinė su bendru taškų krepšiu ir serija.
//
// Server'is atveža dienos turinį iš boombox eilės + viewer'io būseną.

import { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase'
import {
  fetchTodayImageDrop,
  fetchTodayDuelDrop,
  fetchTodayVerdictDrop,
  fetchCompletionsForViewer,
  todayLT,
  ltDayStartUtc,
} from '@/lib/boombox'
import { resolveViewerReadonly } from '@/lib/zaidimai'
import DienosClient from './DienosClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Dienos iššūkis — kasdienis muzikos žaidimas | music.lt',
  description: 'Vienas iššūkis per dieną, tas pats visiems: atspėk 5 dainas, balsuok dienos dvikovoje, palik verdiktą. Rink taškus ir augink seriją!',
}

// Dienos rotacija — kasdien 2 iš 3 papildomų žaidimų (deterministiškai pagal datą)
const ROTATION_POOL = ['metai', 'vaizdas', 'sekundes']
function dailyExtras(dateStr: string): string[] {
  let h = 0
  for (const ch of dateStr) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const start = h % ROTATION_POOL.length
  return [ROTATION_POOL[start], ROTATION_POOL[(start + 1) % ROTATION_POOL.length]]
}

async function loadInitial() {
  const viewer = await resolveViewerReadonly()
  const sb = createAdminClient()
  const today = todayLT()

  const [imageDrop, duelDrop, verdictDrop] = await Promise.all([
    fetchTodayImageDrop(),
    fetchTodayDuelDrop(),
    fetchTodayVerdictDrop(),
  ])

  const completions = await fetchCompletionsForViewer({
    userId: viewer.userId,
    anonId: viewer.anonId,
    dropIds: {
      image: imageDrop?.id,
      duel: duelDrop?.id,
      verdict: verdictDrop?.id,
    },
  })

  // Dienos rotacija: kasdien 2 iš 3 „papildomų" žaidimų (kad būtų nauja)
  const activeExtras = dailyExtras(today)
  const extraQuizId: Record<string, string> = { metai: `m-d${today}`, vaizdas: `v-d${today}`, sekundes: `s-d${today}` }

  // Ar dienos kvizas jau užskaitytas + kurie papildomi žaidimai atlikti
  let quizPlayed = false
  let quizScore: number | null = null
  const extrasDone: Record<string, boolean> = { metai: false, vaizdas: false, sekundes: false }
  const extrasScore: Record<string, number> = {}
  if (viewer.userId || viewer.anonId) {
    const f = viewer.userId ? { user_id: viewer.userId } : { anon_id: viewer.anonId! }
    let q = sb
      .from('game_scores')
      .select('score')
      .eq('game', 'kvizas')
      .eq('category', 'dienos')
      .gte('created_at', ltDayStartUtc(today))
      .order('score', { ascending: false })
      .limit(1)
    if (viewer.userId) q = q.eq('user_id', viewer.userId)
    else q = q.eq('anon_id', viewer.anonId!)
    const extraChecks = activeExtras.map(g =>
      sb.from('game_scores').select('score').eq('game', g).eq('quiz_id', extraQuizId[g]).match(f).maybeSingle())
    const [{ data }, ...extraRes] = await Promise.all([q.maybeSingle(), ...extraChecks])
    if (data) { quizPlayed = true; quizScore = data.score }
    activeExtras.forEach((g, i) => {
      const d = (extraRes[i] as any).data
      extrasDone[g] = !!d
      if (d) extrasScore[g] = d.score || 0
    })
  }

  // Streak
  let streak = { current: 0, total_xp: 0 }
  if (viewer.userId || viewer.anonId) {
    const filter = viewer.userId ? { user_id: viewer.userId } : { anon_id: viewer.anonId! }
    const { data } = await sb.from('boombox_streaks').select('current_streak, total_xp').match(filter).maybeSingle()
    if (data) streak = { current: data.current_streak || 0, total_xp: data.total_xp || 0 }
  }

  return {
    isAuthenticated: viewer.isAuthenticated,
    duel: duelDrop,
    verdict: verdictDrop,
    image: imageDrop,
    completions,
    quizPlayed,
    quizScore,
    activeExtras,
    extrasDone,
    extrasScore,
    streak,
  }
}

export default async function DienosPage() {
  const data = await loadInitial()
  return <DienosClient {...data} />
}
