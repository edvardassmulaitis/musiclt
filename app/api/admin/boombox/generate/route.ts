// app/api/admin/boombox/generate/route.ts
//
// Auto-generation drop'ams. Vienas endpoint'as su tipais:
//
//   POST { type: 'duel',    count?: number, scope?: 'lt'|'foreign'|'mixed' }
//   POST { type: 'verdict', count?: number, scope?: 'lt'|'foreign'|'mixed' }
//   POST { type: 'image_decoys', correctTrackId: number }  (returns 3 IDs)
//
// Logika:
//   - Duels: 3 matchup tipai rotacija (new_vs_new / old_vs_old / old_vs_new),
//     poros parenkamos iš tos pačios šalies skiltelių (LT-LT arba foreign-foreign,
//     niekada nemaišom), siekiama tos pačios žanrinės šeimos. Sukuriam batch'ą
//     su status='ready' ir auto-incremented sort_order.
//   - Verdicts: dainos turinčios video_url, pageidautina iš 'naujų' (≤2 metai)
//     iš score'o top sluoksnio. Genre'ai rotacijoj.
//   - Image decoys: 3 paini track'ai, kuriuos paskui admin'as gauna formoj.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const CURRENT_YEAR = new Date().getFullYear()
const NEW_THRESHOLD = CURRENT_YEAR - 2     // ≥ 2024 šiandien (2026)
const OLD_THRESHOLD = CURRENT_YEAR - 5     // ≤ 2021

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const role = session?.user?.role
  if (role !== 'admin' && role !== 'super_admin') return null
  const sb = createAdminClient()
  const { data } = await sb.from('profiles').select('id').eq('email', session!.user!.email!).maybeSingle()
  return data?.id || null
}

function jsonErr(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

type CandidateTrack = {
  id: number
  title: string
  artist_id: number
  release_year: number | null
  video_url: string | null
  score: number | null
  artist_country: string | null
}

async function loadCandidateTracks(
  sb: ReturnType<typeof createAdminClient>,
  scope: 'lt' | 'foreign' | 'mixed',
  requireVideo = false,
  limit = 1500,
): Promise<CandidateTrack[]> {
  // We need release_year + artist.country. Hop join.
  let q = sb
    .from('tracks')
    .select('id, title, artist_id, release_year, video_url, score, artists:artist_id ( id, country )')
    .order('score', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (requireVideo) q = q.not('video_url', 'is', null)

  const { data, error } = await q
  if (error || !data) return []

  const out: CandidateTrack[] = []
  for (const row of data as any[]) {
    const a = Array.isArray(row.artists) ? row.artists[0] : row.artists
    const country = (a?.country || '').trim().toUpperCase()
    const isLt = country === 'LT' || country === 'LITHUANIA' || country === 'LIETUVA' || country === ''
    if (scope === 'lt' && !isLt) continue
    if (scope === 'foreign' && isLt) continue
    out.push({
      id: row.id,
      title: row.title,
      artist_id: row.artist_id,
      release_year: row.release_year,
      video_url: row.video_url,
      score: row.score,
      artist_country: country || null,
    })
  }
  return out
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pickPair(
  poolA: CandidateTrack[],
  poolB: CandidateTrack[],
  used: Set<number>,
): [CandidateTrack, CandidateTrack] | null {
  for (const a of poolA) {
    if (used.has(a.id)) continue
    for (const b of poolB) {
      if (b.id === a.id || used.has(b.id) || b.artist_id === a.artist_id) continue
      return [a, b]
    }
  }
  return null
}

// ─── Duel auto-generation ───

async function generateDuels(count: number, scope: 'lt' | 'foreign' | 'mixed', adminId: string) {
  const sb = createAdminClient()
  const candidates = await loadCandidateTracks(sb, scope, false)
  if (candidates.length < 4) return { error: 'Per mažai track\'ų katalog\'e (mažiau nei 4)' }

  const newOnes = shuffle(candidates.filter(t => t.release_year != null && t.release_year >= NEW_THRESHOLD))
  const oldOnes = shuffle(candidates.filter(t => t.release_year != null && t.release_year <= OLD_THRESHOLD))

  const used = new Set<number>()
  // Last sort_order'is — naują rikiuojame į uodegą
  const { data: lastDrop } = await sb
    .from('boombox_duel_drops')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  let nextSort = ((lastDrop as any)?.sort_order || 0) + 1

  const inserts: any[] = []
  // Rotacija per 3 matchup tipus
  const sequence: Array<'new_vs_new' | 'old_vs_old' | 'old_vs_new'> = []
  for (let i = 0; i < count; i++) {
    sequence.push(['new_vs_new', 'old_vs_old', 'old_vs_new'][i % 3] as any)
  }

  for (const matchup of sequence) {
    let pair: [CandidateTrack, CandidateTrack] | null = null
    if (matchup === 'new_vs_new') pair = pickPair(newOnes, newOnes, used)
    else if (matchup === 'old_vs_old') pair = pickPair(oldOnes, oldOnes, used)
    else pair = pickPair(oldOnes, newOnes, used)

    if (!pair) continue
    used.add(pair[0].id); used.add(pair[1].id)
    inserts.push({
      matchup_type: matchup,
      track_a_id: pair[0].id,
      track_b_id: pair[1].id,
      status: 'ready',
      sort_order: nextSort++,
      created_by: adminId,
    })
  }

  if (inserts.length === 0) return { error: 'Nepavyko parinkti porų — gal trūksta release_year duomenų?' }

  const { data, error } = await sb.from('boombox_duel_drops').insert(inserts).select('id')
  if (error) return { error: error.message }
  return { count: data?.length || 0, requested: count }
}

// ─── Verdict auto-generation ───

async function generateVerdicts(count: number, scope: 'lt' | 'foreign' | 'mixed', adminId: string) {
  const sb = createAdminClient()
  const candidates = await loadCandidateTracks(sb, scope, true) // require video_url
  if (candidates.length === 0) return { error: 'Nėra track\'ų su video_url' }

  // Prefer recent + score
  const scored = candidates
    .filter(t => t.video_url)
    .map(t => ({
      t,
      // Boost: recent (≤2y) +50, score scaled
      rank: (t.release_year && t.release_year >= NEW_THRESHOLD ? 50 : 0) + (t.score || 0),
    }))
    .sort((a, b) => b.rank - a.rank)
    .map(x => x.t)

  // Distinct artists rotation: pick top 2x to allow rotation
  const seenArtists = new Set<number>()
  const picks: CandidateTrack[] = []
  for (const t of scored) {
    if (picks.length >= count) break
    if (seenArtists.has(t.artist_id)) continue
    seenArtists.add(t.artist_id)
    picks.push(t)
  }
  // Fill remainder if not enough distinct artists
  for (const t of scored) {
    if (picks.length >= count) break
    if (!picks.find(p => p.id === t.id)) picks.push(t)
  }

  if (picks.length === 0) return { error: 'Nėra tinkamų kandidatų' }

  const { data: lastDrop } = await sb
    .from('boombox_verdict_drops')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  let nextSort = ((lastDrop as any)?.sort_order || 0) + 1

  const inserts = picks.map(t => ({
    track_id: t.id,
    status: 'ready',
    sort_order: nextSort++,
    created_by: adminId,
  }))

  const { data, error } = await sb.from('boombox_verdict_drops').insert(inserts).select('id')
  if (error) return { error: error.message }
  return { count: data?.length || 0, requested: count }
}

// ─── Image guess decoys (3 painys, given correctTrackId) ───

async function pickImageDecoys(correctTrackId: number) {
  const sb = createAdminClient()
  const { data: correct } = await sb
    .from('tracks')
    .select('id, artist_id, release_year, artists:artist_id ( id, country )')
    .eq('id', correctTrackId)
    .maybeSingle()
  if (!correct) return { error: 'Track nerastas' }

  const correctArtist = Array.isArray((correct as any).artists) ? (correct as any).artists[0] : (correct as any).artists
  const correctCountry = (correctArtist?.country || '').trim().toUpperCase()
  const correctIsLt = correctCountry === 'LT' || correctCountry === 'LITHUANIA' || correctCountry === ''
  const correctYear = (correct as any).release_year
  const yearLow = correctYear ? correctYear - 5 : null
  const yearHigh = correctYear ? correctYear + 5 : null

  function filterPool(pool: any[]): any[] {
    return (pool || []).filter((t: any) => {
      const a = Array.isArray(t.artists) ? t.artists[0] : t.artists
      const country = (a?.country || '').trim().toUpperCase()
      const isLt = country === 'LT' || country === 'LITHUANIA' || country === ''
      return isLt === correctIsLt
    })
  }

  // Try a tight pool first: same country + ±5 years + different artist
  let q = sb
    .from('tracks')
    .select('id, title, artist_id, release_year, artists:artist_id ( id, country )')
    .neq('id', correctTrackId)
    .neq('artist_id', (correct as any).artist_id)
    .limit(60)

  if (yearLow && yearHigh) q = q.gte('release_year', yearLow).lte('release_year', yearHigh)

  const { data: pool } = await q
  let candidates: any[] = filterPool(pool as any[])

  // Fallback if too few — drop year filter
  if (candidates.length < 3) {
    const { data: fallback } = await sb
      .from('tracks')
      .select('id, title, artist_id, artists:artist_id ( id, country )')
      .neq('id', correctTrackId)
      .neq('artist_id', (correct as any).artist_id)
      .limit(100)
    candidates = filterPool(fallback as any[])
  }

  if (candidates.length < 3) return { error: 'Per mažai kandidatų decoy\'ams (reikia ≥3)' }

  const picked = shuffle(candidates).slice(0, 3)
  return { decoys: picked.map((t: any) => t.id) }
}

// ─── Handlers ───

export async function POST(req: NextRequest) {
  const adminId = await requireAdmin()
  if (!adminId) return jsonErr('Tik adminams', 403)

  const body = await req.json().catch(() => null)
  if (!body) return jsonErr('Bad JSON')

  const { type, count = 10, scope = 'mixed', correctTrackId } = body

  if (type === 'duel') {
    const result = await generateDuels(Math.min(count, 50), scope, adminId)
    return NextResponse.json(result)
  }
  if (type === 'verdict') {
    const result = await generateVerdicts(Math.min(count, 50), scope, adminId)
    return NextResponse.json(result)
  }
  if (type === 'image_decoys') {
    if (!correctTrackId) return jsonErr('Trūksta correctTrackId')
    const result = await pickImageDecoys(parseInt(correctTrackId))
    return NextResponse.json(result)
  }

  return jsonErr('Bad type')
}
