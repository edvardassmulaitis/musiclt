// lib/zaidimai.ts
//
// Žaidimų zonos (/zaidimai) shared helpers.
//
// Principai (testuotojo įžvalga 2026-07): taškai skiriami UŽ ŽAIDIMUS, ne už
// įrašus/komentarus — todėl visi rezultatai skaičiuojami SERVER-side:
//   * Kvizo raundai pasirašomi HMAC token'ais (klientas teisingo atsakymo
//     nežino ir negali suklastoti submit'o).
//   * Dienos XP limitai (anti-farm) tikrinami iš game_scores/completions.
//   * Bendras taškų balansas — boombox_streaks.total_xp (istoriškai jau
//     naudotas boombox misijoms; žaidimai tęsia tą pačią sąskaitą).

import { createHmac, createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { readAnonCookie, ensureAnonCookie, todayLT, ltDayStartUtc } from '@/lib/boombox'

// ── Viewer ────────────────────────────────────────────────────────────────

export type GameViewer = {
  userId: string | null
  anonId: string | null
  username: string | null
  isAuthenticated: boolean
}

/** Server komponentams — NEsukuria anon cookie (RSC negali rašyti). */
export async function resolveViewerReadonly(): Promise<GameViewer> {
  const session = await getServerSession(authOptions)
  let userId: string | null = null
  let username: string | null = null
  if (session?.user?.email) {
    const sb = createAdminClient()
    const { data } = await sb
      .from('profiles')
      .select('id, username, full_name')
      .eq('email', session.user.email)
      .maybeSingle()
    userId = data?.id || null
    username = data?.username || data?.full_name || null
  }
  const anonId = userId ? null : await readAnonCookie()
  return { userId, anonId, username, isAuthenticated: !!userId }
}

/** Route handler'iams — sukuria anon cookie jei jos nėra. */
export async function resolveViewer(): Promise<GameViewer> {
  const v = await resolveViewerReadonly()
  if (!v.userId && !v.anonId) {
    const anonId = await ensureAnonCookie()
    return { ...v, anonId }
  }
  return v
}

// ── HMAC token'ai (stateless server-side atsakymų apsauga) ────────────────

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!s) throw new Error('NEXTAUTH_SECRET (arba SUPABASE_SERVICE_ROLE_KEY) būtinas žaidimų HMAC token\'ams')
  return s
}

export function signPayload(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const mac = createHmac('sha256', secret()).update(body).digest('base64url')
  return `${body}.${mac}`
}

export function verifyPayload<T = any>(token: string): T | null {
  if (typeof token !== 'string') return null
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const mac = token.slice(dot + 1)
  const expect = createHmac('sha256', secret()).update(body).digest('base64url')
  if (mac.length !== expect.length || mac !== expect) return null
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (parsed && typeof parsed.exp === 'number' && parsed.exp < Date.now()) return null
    return parsed as T
  } catch {
    return null
  }
}

// ── Užšifruoti „vokai" (AES-256-GCM) ─────────────────────────────────────
// signPayload turinys naršyklėje PERSKAITOMAS (base64) — kvizo raundų
// token'ams to negana, nes juose yra teisingas atsakymas. sealPayload
// užšifruoja: klientas mato tik neperskaitomą voką, serveris atplėšia.

function sealKey(): Buffer {
  return createHash('sha256').update(secret()).digest()
}

export function sealPayload(payload: object): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', sealKey(), iv)
  const enc = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64url')
}

export function openPayload<T = any>(sealed: string): T | null {
  try {
    const buf = Buffer.from(sealed, 'base64url')
    if (buf.length < 29) return null
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const enc = buf.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', sealKey(), iv)
    decipher.setAuthTag(tag)
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
    const parsed = JSON.parse(dec)
    if (parsed && typeof parsed.exp === 'number' && parsed.exp < Date.now()) return null
    return parsed as T
  } catch {
    return null
  }
}

// ── Dienos limitai / XP ───────────────────────────────────────────────────

/** Kiek kartų viewer'is šiandien (LT laiku) jau žaidė šį žaidimą (scored runs). */
export async function countRunsToday(
  viewer: GameViewer,
  game: 'kvizas' | 'dvikovos' | 'vadybininkas' | 'vaizdas' | 'sekundes' | 'metai',
  category?: { eq?: string; neq?: string },
): Promise<number> {
  const sb = createAdminClient()
  let q = sb
    .from('game_scores')
    .select('id', { count: 'exact', head: true })
    .eq('game', game)
    .gte('created_at', ltDayStartUtc())
  if (category?.eq) q = q.eq('category', category.eq)
  if (category?.neq) q = q.neq('category', category.neq)
  if (viewer.userId) q = q.eq('user_id', viewer.userId)
  else if (viewer.anonId) q = q.eq('anon_id', viewer.anonId)
  else return 0
  const { count } = await q
  return count || 0
}

/** Deterministinis seed'as iš LT dienos (dienos iššūkiui — visiems tas pats). */
export function dailySeed(salt = 'musiclt-dienos'): number {
  const s = `${todayLT()}|${salt}`
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Seeded shuffle (deterministinis — dienos iššūkio raundams). */
export function seededShuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export async function insertGameScore(row: {
  viewer: GameViewer
  game: 'kvizas' | 'dvikovos' | 'vadybininkas' | 'vaizdas' | 'sekundes' | 'metai'
  category?: string | null
  score: number
  maxScore?: number | null
  correctCount?: number | null
  roundCount?: number | null
  xpEarned: number
  details?: any
}): Promise<void> {
  const sb = createAdminClient()
  await sb.from('game_scores').insert({
    user_id: row.viewer.userId,
    anon_id: row.viewer.userId ? null : row.viewer.anonId,
    game: row.game,
    category: row.category || null,
    score: row.score,
    max_score: row.maxScore ?? null,
    correct_count: row.correctCount ?? null,
    round_count: row.roundCount ?? null,
    xp_earned: row.xpEarned,
    details: row.details ?? null,
  })
}

// ── YouTube ───────────────────────────────────────────────────────────────

export function ytIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

// ── Kvizo kategorijos ─────────────────────────────────────────────────────

export type QuizCategory = {
  key: string
  label: string
  desc: string
  accent: string
  scope: 'lt' | 'foreign'
  yearFrom?: number
  yearTo?: number
  poolSize: number
}

const CURRENT_YEAR = new Date().getFullYear()

export const QUIZ_CATEGORIES: QuizCategory[] = [
  {
    key: 'lt-mix',
    label: 'Lietuviškas mišinys',
    desc: 'Visa lietuviška muzika — nuo klasikos iki šios dienos hitų',
    accent: '#f59e0b',
    scope: 'lt',
    poolSize: 500,
  },
  {
    key: 'lt-nauja',
    label: 'Nauja banga',
    desc: `Šviežia lietuviška muzika (${CURRENT_YEAR - 3}+)`,
    accent: '#10b981',
    scope: 'lt',
    yearFrom: CURRENT_YEAR - 3,
    poolSize: 300,
  },
  {
    key: 'lt-klasika',
    label: 'Lietuviška klasika',
    desc: 'Dainos, kurias žino visi — iki 2015 m.',
    accent: '#8b5cf6',
    scope: 'lt',
    yearTo: 2015,
    poolSize: 400,
  },
  {
    key: 'pasaulis',
    label: 'Pasaulio hitai',
    desc: 'Užsienio scena — nuo legendų iki topų viršūnių',
    accent: '#3b82f6',
    scope: 'foreign',
    poolSize: 600,
  },
]

export function quizCategory(key: string): QuizCategory | null {
  return QUIZ_CATEGORIES.find(c => c.key === key) || null
}

// ── Kvizo track pool (in-memory cache per lambda) ─────────────────────────

export type PoolTrack = {
  id: number
  title: string
  artist: string
  artist_id: number
  ytId: string
  year: number | null
}

const poolCache = new Map<string, { at: number; tracks: PoolTrack[] }>()
const POOL_TTL_MS = 10 * 60 * 1000

export async function loadQuizPool(cat: QuizCategory): Promise<PoolTrack[]> {
  const cached = poolCache.get(cat.key)
  if (cached && Date.now() - cached.at < POOL_TTL_MS) return cached.tracks

  const sb = createAdminClient()
  let q = sb
    .from('tracks')
    .select('id, title, video_url, video_views, video_embeddable, release_year, artist_id, artists:artist_id!inner ( id, name, country )')
    .not('video_url', 'is', null)
    .or('video_embeddable.is.null,video_embeddable.eq.true')
    .order('video_views', { ascending: false, nullsFirst: false })
    .limit(cat.poolSize)

  if (cat.scope === 'lt') q = q.eq('artists.country', 'Lietuva')
  else q = q.neq('artists.country', 'Lietuva')
  if (cat.yearFrom) q = q.gte('release_year', cat.yearFrom)
  if (cat.yearTo) q = q.lte('release_year', cat.yearTo)

  const { data, error } = await q
  if (error || !data) return []

  const tracks: PoolTrack[] = []
  for (const row of data as any[]) {
    const ytId = ytIdFromUrl(row.video_url)
    if (!ytId) continue
    const a = Array.isArray(row.artists) ? row.artists[0] : row.artists
    if (!a?.name) continue
    tracks.push({
      id: row.id,
      title: row.title,
      artist: a.name,
      artist_id: row.artist_id,
      ytId,
      year: row.release_year || null,
    })
  }
  poolCache.set(cat.key, { at: Date.now(), tracks })
  return tracks
}

export function shuffleArr<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Deterministinis RNG (vadybininko simuliacijai) ────────────────────────

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
