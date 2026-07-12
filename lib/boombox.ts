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

/** Europe/Vilnius offset minutėmis duotai akimirkai (DST-aware: +120/+180). */
function ltOffsetMinutes(d: Date): number {
  const tz = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Vilnius', timeZoneName: 'longOffset' })
    .formatToParts(d).find(p => p.type === 'timeZoneName')?.value || 'GMT+03:00'
  const m = tz.match(/GMT([+-])(\d{2}):(\d{2})/)
  return m ? (m[1] === '-' ? -1 : 1) * (parseInt(m[2]) * 60 + parseInt(m[3])) : 180
}

/**
 * LT paros pradžia (00:00 Vilniaus laiku) kaip UTC ISO (…Z).
 * Naudoti VISUR, kur timestamptz lyginamas su „šiandien LT" riba —
 * plikas `${today}T00:00:00` Postgres'e interpretuojamas kaip UTC ir
 * naktį (00–03 LT) duoda neteisingus rezultatus.
 */
export function ltDayStartUtc(dateStr: string = todayLT()): string {
  const approx = new Date(`${dateStr}T00:00:00+02:00`)
  const off = ltOffsetMinutes(approx)
  return new Date(Date.parse(`${dateStr}T00:00:00Z`) - off * 60000).toISOString()
}

/** Kita LT diena (YYYY-MM-DD) po duotos. */
export function nextDayLT(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
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
  correct: { id: number; slug?: string; title: string; artist: string; cover_url?: string; video_url?: string }
  options: Array<{ id: number; title: string; artist: string; isCorrect: boolean }>
}

export type DuelDrop = {
  id: number
  matchup_type: 'old_vs_old' | 'new_vs_new' | 'old_vs_new'
  blurb: string
  track_a: { id: number; slug: string; title: string; artist: string; year?: number; cover_url?: string; video_url?: string }
  track_b: { id: number; slug: string; title: string; artist: string; year?: number; cover_url?: string; video_url?: string }
}

export type VerdictDrop = {
  id: number
  track: {
    id: number
    slug: string
    title: string
    artist: string
    artist_slug?: string
    artist_image?: string | null
    cover_url?: string
    video_url?: string
    release_date?: string | null
    release_year?: number | null
  }
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

  // 1. Already published today? (LT paros ribos konvertuotos į UTC — kitaip
  // naktį 00–03 LT kiekvienas request'as „paskelbdavo" naują drop'ą ir
  // degindavo eilę.)
  const { data: published } = await sb
    .from(table)
    .select(selectCols)
    .eq('status', 'ready')
    .gte('published_at', ltDayStartUtc(today))
    .lt('published_at', ltDayStartUtc(nextDayLT(today)))
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
      slug: correct.slug,
      title: correct.title,
      artist: correct.artists?.name || '—',
      cover_url: correct.cover_url,
      video_url: correct.video_url,
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
    .select('id, slug, title, cover_url, video_url, release_year, artist_id, artists:artist_id ( id, slug, name, country )')
    .in('id', [drop.track_a_id, drop.track_b_id])

  const byId = new Map<number, any>()
  for (const t of tracks || []) {
    const norm = normalizeTrack(t)
    if (norm) byId.set(norm.id, norm)
  }

  const ta = byId.get(drop.track_a_id)
  const tb = byId.get(drop.track_b_id)
  if (!ta || !tb) return null

  // Bendras stilius (jei abu atlikėjai jį turi) — aprašymui
  let sharedGenre: string | null = null
  try {
    const { data: ag } = await sb
      .from('artist_genres')
      .select('artist_id, genres:genre_id ( name )')
      .in('artist_id', [ta.artist_id, tb.artist_id])
    const byArtist = new Map<number, Set<string>>()
    for (const r of (ag as any[]) || []) {
      const nm = normalizeJoined<any>(r.genres)?.name
      if (!nm) continue
      if (!byArtist.has(r.artist_id)) byArtist.set(r.artist_id, new Set())
      byArtist.get(r.artist_id)!.add(nm)
    }
    const sa = byArtist.get(ta.artist_id), sb2 = byArtist.get(tb.artist_id)
    if (sa && sb2) { for (const g of sa) if (sb2.has(g)) { sharedGenre = g.replace(/ muzika$/i, '').replace(/'o$/, ''); break } }
  } catch { /* nebūtina */ }

  const isLt = (c?: string | null) => ['LT', 'LIETUVA', 'LITHUANIA', ''].includes((c || '').trim().toUpperCase())
  const bothLt = isLt(ta.artists?.country) && isLt(tb.artists?.country)
  const bothForeign = !isLt(ta.artists?.country) && !isLt(tb.artists?.country)
  const scope = bothLt ? '🇱🇹 Lietuviška' : bothForeign ? '🌍 Pasaulio' : 'LT prieš pasaulį'
  const eraLabel = drop.matchup_type === 'new_vs_new' ? 'naujausi hitai'
    : drop.matchup_type === 'old_vs_old' ? 'klasika' : 'klasika prieš naujieną'
  // Metus rodom tik kai jie artimi (ta pati era) — plati praraja (pvz. 1993 vs
  // 2005) atrodo nelogiškai, tad tada paliekam tik eros etiketę.
  const yearPart = ta.release_year && tb.release_year && Math.abs(ta.release_year - tb.release_year) <= 4
    ? ` · ${Math.min(ta.release_year, tb.release_year)}–${Math.max(ta.release_year, tb.release_year)}`
    : ''
  let blurb = `${scope} · ${eraLabel}${sharedGenre ? ` · ${sharedGenre}` : ''}${yearPart}`

  // Turnyro dvikova — blurb'e rodom turnyrą ir ratą vietoj erų etikečių
  if (drop.matchup_type === 'tournament') {
    try {
      const { data: m } = await sb
        .from('boombox_tournament_matches')
        .select('round, tournament:tournament_id ( title, size, scope )')
        .eq('duel_drop_id', drop.id)
        .maybeSingle()
      const tour = normalizeJoined<any>((m as any)?.tournament)
      if (m && tour) {
        const left = tour.size / Math.pow(2, (m as any).round - 1)
        const roundName = left === 2 ? 'Finalas'
          : left === 4 ? 'Pusfinalis'
          : left === 8 ? 'Ketvirtfinalis'
          : `1/${left / 2} ratas`
        blurb = `🏆 ${tour.scope === 'lt' ? '🇱🇹' : '🌍'} ${tour.title} · ${roundName}`
      }
    } catch { /* nebūtina */ }
  }

  return {
    id: drop.id,
    matchup_type: drop.matchup_type,
    blurb,
    track_a: {
      id: ta.id, slug: ta.slug, title: ta.title, artist: ta.artists?.name || '—',
      year: ta.release_year || undefined, cover_url: ta.cover_url, video_url: ta.video_url,
    },
    track_b: {
      id: tb.id, slug: tb.slug, title: tb.title, artist: tb.artists?.name || '—',
      year: tb.release_year || undefined, cover_url: tb.cover_url, video_url: tb.video_url,
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
    .select('id, slug, title, cover_url, video_url, release_date, release_year, artists:artist_id ( id, slug, name, cover_image_url )')
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
      artist_slug: norm.artists?.slug,
      artist_image: norm.artists?.cover_image_url || null,
      cover_url: norm.cover_url,
      video_url: norm.video_url,
      release_date: norm.release_date,
      release_year: norm.release_year,
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

  // 1. Already published today? (LT ribos UTC formatu — žr. pickTodayQueued)
  const { data: todays } = await sb
    .from('boombox_video_drops')
    .select(sel)
    .eq('status', 'ready')
    .gte('published_at', ltDayStartUtc(today))
    .lt('published_at', ltDayStartUtc(nextDayLT(today)))
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

  // Atominis kaupimas per DB funkciją (FOR UPDATE) — lygiagretūs užskaitymai
  // (pvz. dvi misijos vienu metu) nebepameta XP. Žr. 20260706b migraciją.
  const { data, error } = await sb.rpc('game_bump_streak', {
    p_user: userId,
    p_anon: userId ? null : anonId,
    p_xp: xp,
    p_today: todayLT(),
  })
  if (error || !data || !(data as any[]).length) {
    console.error('game_bump_streak klaida:', error?.message)
    return { current: 0, total_xp: 0 }
  }
  const row = (data as any[])[0]
  return { current: row.out_streak || 0, total_xp: row.out_total_xp || 0 }
}
