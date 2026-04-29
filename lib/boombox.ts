// lib/boombox.ts
//
// Boombox engagement zonos shared helpers: anon-id cookie management,
// today's date in LT timezone, drop fetching by date, completion stats.

import { cookies } from 'next/headers'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase'

export const BOOMBOX_ANON_COOKIE = 'ml_anon_id'
export const ANON_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function isValidUuid(v: string | undefined | null): v is string {
  return !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

/** Today's date in Lithuania timezone, as YYYY-MM-DD. */
export function todayLT(): string {
  return new Date().toLocaleDateString('lt-LT', {
    timeZone: 'Europe/Vilnius',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).split('.').reverse().join('-')
}

export async function readAnonCookie(): Promise<string | null> {
  const store = await cookies()
  const v = store.get(BOOMBOX_ANON_COOKIE)?.value
  return isValidUuid(v) ? v : null
}

export async function ensureAnonCookie(): Promise<string> {
  const store = await cookies()
  const existing = store.get(BOOMBOX_ANON_COOKIE)?.value
  if (isValidUuid(existing)) return existing
  const fresh = randomUUID()
  store.set(BOOMBOX_ANON_COOKIE, fresh, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: ANON_COOKIE_MAX_AGE,
    path: '/',
  })
  return fresh
}

// ── Track / artist subselects ──

const TRACK_SELECT = `
  id, slug, title, cover_url, video_url,
  artists:artist_id ( id, slug, name, cover_image_url )
`

function normalizeJoined<T>(raw: any): T | null {
  if (!raw) return null
  return Array.isArray(raw) ? (raw[0] ?? null) : raw
}

function normalizeTrack(raw: any) {
  const t = normalizeJoined<any>(raw)
  if (!t) return null
  return {
    ...t,
    artists: normalizeJoined<any>(t.artists),
  }
}

// ── Drops fetching ──

export type ImageDrop = {
  id: number
  image_url: string
  difficulty: number
  correct: { id: number; title: string; artist: string }
  options: Array<{ id: number; title: string; artist: string; isCorrect: boolean }>
}

export type DuelDrop = {
  id: number
  matchup_type: 'old_vs_old' | 'new_vs_new' | 'old_vs_new'
  track_a: { id: number; slug: string; title: string; artist: string; year?: number; cover_url?: string; video_url?: string }
  track_b: { id: number; slug: string; title: string; artist: string; year?: number; cover_url?: string; video_url?: string }
}

export type VerdictDrop = {
  id: number
  track: { id: number; slug: string; title: string; artist: string; cover_url?: string; video_url?: string }
}

export type VideoDrop = {
  id: number
  source: 'tiktok' | 'reels' | 'shorts' | 'youtube'
  source_url: string
  embed_id: string | null
  caption: string
  related_artist?: { id: number; slug: string; name: string } | null
  related_track?: { id: number; slug: string; title: string } | null
}

/**
 * Pick today's drop from queue:
 *   1. If something already published today → return that (sticky 24h)
 *   2. Else: pick next ready+unpublished by sort_order ASC, mark published_at=NOW
 *
 * Generic helper used by all 4 drop types.
 */
async function pickTodayQueued(
  sb: ReturnType<typeof createAdminClient>,
  table: string,
  selectCols: string,
): Promise<any | null> {
  const today = todayLT()

  // 1. Already published today?
  const { data: published } = await sb
    .from(table)
    .select(selectCols)
    .eq('status', 'ready')
    .gte('published_at', `${today}T00:00:00`)
    .lte('published_at', `${today}T23:59:59`)
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (published) return published

  // 2. Else: take next from queue + mark published
  const { data: next } = await sb
    .from(table)
    .select(selectCols)
    .eq('status', 'ready')
    .is('published_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!next) return null

  await sb.from(table).update({ published_at: new Date().toISOString() }).eq('id', (next as any).id)
  return next
}

export async function fetchTodayImageDrop(): Promise<ImageDrop | null> {
  const sb = createAdminClient()
  const drop: any = await pickTodayQueued(
    sb,
    'boombox_image_drops',
    'id, image_url, difficulty, correct_track_id, decoy_track_ids'
  )
  if (!drop) return null

  const allTrackIds = [drop.correct_track_id, ...(drop.decoy_track_ids || [])]
  const { data: tracks } = await sb
    .from('tracks')
    .select(TRACK_SELECT)
    .in('id', allTrackIds)

  const byId = new Map<number, any>()
  for (const t of tracks || []) {
    const norm = normalizeTrack(t)
    if (norm) byId.set(norm.id, norm)
  }

  const correct = byId.get(drop.correct_track_id)
  if (!correct) return null

  const options = allTrackIds
    .map(id => {
      const t = byId.get(id)
      if (!t) return null
      return {
        id: t.id,
        title: t.title,
        artist: t.artists?.name || '—',
        isCorrect: id === drop.correct_track_id,
      }
    })
    .filter(Boolean) as ImageDrop['options']

  // Shuffle so correct isn't always first
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]]
  }

  return {
    id: drop.id,
    image_url: drop.image_url,
    difficulty: drop.difficulty,
    correct: {
      id: correct.id,
      title: correct.title,
      artist: correct.artists?.name || '—',
    },
    options,
  }
}

export async function fetchTodayDuelDrop(): Promise<DuelDrop | null> {
  const sb = createAdminClient()
  const drop: any = await pickTodayQueued(
    sb,
    'boombox_duel_drops',
    'id, matchup_type, track_a_id, track_b_id'
  )
  if (!drop) return null

  const { data: tracks } = await sb
    .from('tracks')
    .select(TRACK_SELECT)
    .in('id', [drop.track_a_id, drop.track_b_id])

  const byId = new Map<number, any>()
  for (const t of tracks || []) {
    const norm = normalizeTrack(t)
    if (norm) byId.set(norm.id, norm)
  }

  const ta = byId.get(drop.track_a_id)
  const tb = byId.get(drop.track_b_id)
  if (!ta || !tb) return null

  return {
    id: drop.id,
    matchup_type: drop.matchup_type,
    track_a: {
      id: ta.id,
      slug: ta.slug,
      title: ta.title,
      artist: ta.artists?.name || '—',
      cover_url: ta.cover_url,
      video_url: ta.video_url,
    },
    track_b: {
      id: tb.id,
      slug: tb.slug,
      title: tb.title,
      artist: tb.artists?.name || '—',
      cover_url: tb.cover_url,
      video_url: tb.video_url,
    },
  }
}

export async function fetchTodayVerdictDrop(): Promise<VerdictDrop | null> {
  const sb = createAdminClient()
  const drop: any = await pickTodayQueued(
    sb,
    'boombox_verdict_drops',
    'id, track_id'
  )
  if (!drop) return null

  const { data: track } = await sb
    .from('tracks')
    .select(TRACK_SELECT)
    .eq('id', drop.track_id)
    .maybeSingle()
  const norm = normalizeTrack(track)
  if (!norm) return null

  return {
    id: drop.id,
    track: {
      id: norm.id,
      slug: norm.slug,
      title: norm.title,
      artist: norm.artists?.name || '—',
      cover_url: norm.cover_url,
      video_url: norm.video_url,
    },
  }
}

export async function fetchTodayVideoDrops(limit = 5): Promise<VideoDrop[]> {
  const sb = createAdminClient()
  const today = todayLT()
  const sel = `
    id, source, source_url, embed_id, caption,
    artist:related_artist_id ( id, slug, name ),
    track:related_track_id ( id, slug, title )
  `

  // 1. Already published today?
  const { data: todays } = await sb
    .from('boombox_video_drops')
    .select(sel)
    .eq('status', 'ready')
    .gte('published_at', `${today}T00:00:00`)
    .lte('published_at', `${today}T23:59:59`)
    .order('sort_order', { ascending: true })
    .limit(limit)

  if (todays && todays.length > 0) {
    return todays.map((d: any) => ({
      id: d.id,
      source: d.source,
      source_url: d.source_url,
      embed_id: d.embed_id,
      caption: d.caption,
      related_artist: normalizeJoined<any>(d.artist),
      related_track: normalizeJoined<any>(d.track),
    }))
  }

  // 2. Else: take next batch from queue + mark published
  const { data: next } = await sb
    .from('boombox_video_drops')
    .select(sel)
    .eq('status', 'ready')
    .is('published_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(limit)

  if (!next || next.length === 0) return []

  const ids = next.map((d: any) => d.id)
  await sb.from('boombox_video_drops')
    .update({ published_at: new Date().toISOString() })
    .in('id', ids)

  return next.map((d: any) => ({
    id: d.id,
    source: d.source,
    source_url: d.source_url,
    embed_id: d.embed_id,
    caption: d.caption,
    related_artist: normalizeJoined<any>(d.artist),
    related_track: normalizeJoined<any>(d.track),
  }))
}

// ── Stats / completions ──

export type DropCompletionLookup = {
  image: { dropId: number; payload: any; isCorrect: boolean | null } | null
  duel: { dropId: number; payload: any } | null
  verdict: { dropId: number; payload: any } | null
  videos: Array<{ dropId: number; payload: any }>
}

export async function fetchCompletionsForViewer({
  userId, anonId, dropIds,
}: {
  userId: string | null
  anonId: string | null
  dropIds: { image?: number; duel?: number; verdict?: number; videos?: number[] }
}): Promise<DropCompletionLookup> {
  const empty: DropCompletionLookup = { image: null, duel: null, verdict: null, videos: [] }
  if (!userId && !anonId) return empty

  const sb = createAdminClient()
  let q = sb
    .from('boombox_completions')
    .select('drop_table, drop_id, payload, is_correct')

  if (userId) q = q.eq('user_id', userId)
  else if (anonId) q = q.eq('anon_id', anonId)

  const allDropIds = [
    ...(dropIds.image ? [dropIds.image] : []),
    ...(dropIds.duel ? [dropIds.duel] : []),
    ...(dropIds.verdict ? [dropIds.verdict] : []),
    ...(dropIds.videos || []),
  ]
  if (allDropIds.length === 0) return empty
  q = q.in('drop_id', allDropIds)

  const { data } = await q

  const result: DropCompletionLookup = { image: null, duel: null, verdict: null, videos: [] }
  for (const row of data || []) {
    if (row.drop_table === 'boombox_image_drops' && row.drop_id === dropIds.image) {
      result.image = { dropId: row.drop_id, payload: row.payload, isCorrect: row.is_correct }
    } else if (row.drop_table === 'boombox_duel_drops' && row.drop_id === dropIds.duel) {
      result.duel = { dropId: row.drop_id, payload: row.payload }
    } else if (row.drop_table === 'boombox_verdict_drops' && row.drop_id === dropIds.verdict) {
      result.verdict = { dropId: row.drop_id, payload: row.payload }
    } else if (row.drop_table === 'boombox_video_drops' && (dropIds.videos || []).includes(row.drop_id)) {
      result.videos.push({ dropId: row.drop_id, payload: row.payload })
    }
  }
  return result
}

export type DropStats = {
  totalCompletions: number
  correctPct: number | null
  choiceDistribution: Record<string, number>
  emojiDistribution: Record<string, number>
}

export async function fetchDropStats(
  dropTable: 'boombox_image_drops' | 'boombox_duel_drops' | 'boombox_verdict_drops' | 'boombox_video_drops',
  dropId: number,
): Promise<DropStats> {
  const sb = createAdminClient()
  const { data } = await sb
    .from('boombox_completions')
    .select('payload, is_correct')
    .eq('drop_table', dropTable)
    .eq('drop_id', dropId)

  const stats: DropStats = {
    totalCompletions: data?.length || 0,
    correctPct: null,
    choiceDistribution: {},
    emojiDistribution: {},
  }

  if (!data || data.length === 0) return stats

  let correct = 0
  for (const row of data) {
    if (row.is_correct === true) correct++
    const p = row.payload || {}
    if (typeof p.choice === 'string') {
      stats.choiceDistribution[p.choice] = (stats.choiceDistribution[p.choice] || 0) + 1
    }
    if (typeof p.emoji === 'string') {
      stats.emojiDistribution[p.emoji] = (stats.emojiDistribution[p.emoji] || 0) + 1
    }
  }

  if (stats.totalCompletions > 0 && correct > 0) {
    stats.correctPct = Math.round((correct / stats.totalCompletions) * 100)
  }
  return stats
}

// ── Streak update ──

export async function bumpStreakAndXp({
  userId, anonId, xp,
}: {
  userId: string | null
  anonId: string | null
  xp: number
}): Promise<{ current: number; total_xp: number }> {
  if (!userId && !anonId) return { current: 0, total_xp: 0 }
  const sb = createAdminClient()
  const today = todayLT()

  const filter = userId
    ? { user_id: userId }
    : { anon_id: anonId }

  const { data: existing } = await sb
    .from('boombox_streaks')
    .select('id, current_streak, longest_streak, last_active_date, total_xp, total_completions')
    .match(filter)
    .maybeSingle()

  if (!existing) {
    const insertRow: any = {
      ...filter,
      current_streak: 1,
      longest_streak: 1,
      last_active_date: today,
      total_xp: xp,
      total_completions: 1,
    }
    await sb.from('boombox_streaks').insert(insertRow)
    return { current: 1, total_xp: xp }
  }

  // Compute new streak based on last_active_date
  const last = existing.last_active_date
  let newCurrent = existing.current_streak

  if (last !== today) {
    const lastDate = last ? new Date(last) : null
    const todayDate = new Date(today)
    if (lastDate) {
      const diffDays = Math.round((todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
      newCurrent = diffDays === 1 ? existing.current_streak + 1 : 1
    } else {
      newCurrent = 1
    }
  }

  const newLongest = Math.max(existing.longest_streak, newCurrent)
  const newXp = existing.total_xp + xp
  const newCompletions = existing.total_completions + 1

  await sb
    .from('boombox_streaks')
    .update({
      current_streak: newCurrent,
      longest_streak: newLongest,
      last_active_date: today,
      total_xp: newXp,
      total_completions: newCompletions,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)

  return { current: newCurrent, total_xp: newXp }
}
