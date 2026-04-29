// app/api/boombox/submit/route.ts
//
// Vartotojas atliko vieną iš Boombox misijų — POST'inam completion'ą.
// Body:
//   {
//     missionType: 'image_guess' | 'duel' | 'verdict' | 'video_react',
//     dropId: number,
//     payload: { ... },                    // mission-specific
//     guessTrackId?: number                // image_guess only — checks correctness server-side
//   }
//
// Server:
//   1. Validate'ina, kad drop'as egzistuoja ir publikuotas (status='ready', scheduled<=today)
//   2. Image_guess atveju — patikrina, ar guess teisingas iš drop'o correct_track_id
//   3. Apskaičiuoja XP (image: 80 jei teisingas / 30 jei ne; duel: 40; verdict: 40; video: 20)
//   4. INSERT'inasi į boombox_completions (UNIQUE constraint apsaugo nuo duplo)
//   5. Atnaujina streak'ą + XP

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { ensureAnonCookie, todayLT, bumpStreakAndXp } from '@/lib/boombox'

export const dynamic = 'force-dynamic'

const MISSION_TO_TABLE: Record<string, string> = {
  image_guess: 'boombox_image_drops',
  duel: 'boombox_duel_drops',
  verdict: 'boombox_verdict_drops',
  video_react: 'boombox_video_drops',
}

const MISSION_BASE_XP: Record<string, number> = {
  image_guess: 30,        // base; +50 if correct
  duel: 40,
  verdict: 40,
  video_react: 20,
}

function jsonErr(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return jsonErr('Invalid JSON', 400)

  const { missionType, dropId, payload, guessTrackId } = body as {
    missionType: string
    dropId: number
    payload: Record<string, unknown>
    guessTrackId?: number
  }

  if (!missionType || !MISSION_TO_TABLE[missionType]) return jsonErr('Bad missionType')
  if (typeof dropId !== 'number' || isNaN(dropId)) return jsonErr('Bad dropId')
  if (!payload || typeof payload !== 'object') return jsonErr('Bad payload')

  const sb = createAdminClient()
  const dropTable = MISSION_TO_TABLE[missionType]
  const today = todayLT()

  // Verify drop exists and is published.
  // Image_guess'ui reikia ir correct_track_id — paimam atskiru SELECT'u.
  const { data: dropRaw, error: dropErr } = await sb
    .from(dropTable)
    .select('*')
    .eq('id', dropId)
    .maybeSingle()
  if (dropErr || !dropRaw) return jsonErr('Drop nerastas', 404)
  const drop = dropRaw as unknown as { status: string; scheduled_for: string | null; correct_track_id?: number }
  if (drop.status !== 'ready') return jsonErr('Dropas nepublikuotas', 400)
  if (drop.scheduled_for && drop.scheduled_for > today) return jsonErr('Dropas dar neatėjo', 400)

  // Determine correctness for image_guess
  let isCorrect: boolean | null = null
  if (missionType === 'image_guess') {
    const correctId = drop.correct_track_id
    if (typeof correctId !== 'number') return jsonErr('Drop be teisingo track', 500)
    if (typeof guessTrackId !== 'number') return jsonErr('Trūksta guessTrackId')
    isCorrect = guessTrackId === correctId
    payload.guessTrackId = guessTrackId
    payload.correctTrackId = correctId
  }

  // Calculate XP
  let xp = MISSION_BASE_XP[missionType] || 0
  if (missionType === 'image_guess' && isCorrect) xp += 50

  // Resolve viewer
  const session = await getServerSession(authOptions)
  let userId: string | null = null
  if (session?.user?.email) {
    const { data } = await sb.from('profiles').select('id').eq('email', session.user.email).maybeSingle()
    userId = data?.id || null
  }
  const anonId = userId ? null : await ensureAnonCookie()
  if (!userId && !anonId) return jsonErr('Negalima identifikuoti', 500)

  // Insert (UNIQUE will reject double-submission)
  const insertRow: any = {
    user_id: userId,
    anon_id: anonId,
    mission_type: missionType,
    drop_id: dropId,
    drop_table: dropTable,
    payload,
    is_correct: isCorrect,
    xp_earned: xp,
  }
  const { error: insertErr } = await sb.from('boombox_completions').insert(insertRow)
  if (insertErr) {
    if (insertErr.code === '23505') {
      // Already submitted — return success-ish with prior state? For now, just OK.
      return NextResponse.json({ duplicate: true, isCorrect, xp: 0 })
    }
    return jsonErr('Nepavyko įrašyti: ' + insertErr.message, 500)
  }

  // Bump streak (only for one of the daily missions, not videos — video reacts don't extend streak)
  let streakInfo = { current: 0, total_xp: 0 }
  if (missionType !== 'video_react') {
    streakInfo = await bumpStreakAndXp({ userId, anonId, xp })
  }

  // Compute live stats for this drop
  const { data: allCompletions } = await sb
    .from('boombox_completions')
    .select('payload, is_correct')
    .eq('drop_table', dropTable)
    .eq('drop_id', dropId)

  const total = allCompletions?.length || 0
  const correctCount = (allCompletions || []).filter(r => r.is_correct === true).length
  const choiceDist: Record<string, number> = {}
  const emojiDist: Record<string, number> = {}
  for (const r of allCompletions || []) {
    const p: any = r.payload || {}
    if (typeof p.choice === 'string') choiceDist[p.choice] = (choiceDist[p.choice] || 0) + 1
    if (typeof p.emoji === 'string') emojiDist[p.emoji] = (emojiDist[p.emoji] || 0) + 1
  }

  return NextResponse.json({
    ok: true,
    isCorrect,
    xp,
    streak: streakInfo.current,
    totalXp: streakInfo.total_xp,
    stats: {
      total,
      correctPct: total > 0 ? Math.round((correctCount / total) * 100) : null,
      choiceDistribution: choiceDist,
      emojiDistribution: emojiDist,
    },
  })
}
