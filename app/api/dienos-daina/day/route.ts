import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

// /api/dienos-daina/day — vienos dienos PILNI dalyviai „Dienos daina" archyvui.
// Pagrindinis šaltinis: daily_song_picks (legacy scrape — kiekvieno nario tos
// dienos daina + komentaras + palaikymų skaičius). Modernioms dienoms (be picks,
// tik balsavimas) — fallback į daily_song_nominations. Laimėtojas pažymimas pagal
// daily_song_winners.track_id (NE tiesiog daugiausiai palaikymų — būna lygiųjų).
// 2026-06-23.

export const dynamic = 'force-dynamic'

function normTrack(raw: any) {
  const t = Array.isArray(raw) ? raw[0] ?? null : raw
  if (!t) return null
  return { ...t, artists: Array.isArray(t.artists) ? t.artists[0] ?? null : t.artists }
}

const TRACK_SEL = `id, slug, title, cover_url, spotify_id, video_url, artists:artist_id ( id, slug, name, cover_image_url )`

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return NextResponse.json({ error: 'Bad date' }, { status: 400 })
  const supabase = createAdminClient()

  // Tos dienos laimėtojo daina (pažymėjimui).
  const { data: winRow } = await supabase
    .from('daily_song_winners').select('track_id').eq('date', date).maybeSingle()
  const winnerTrackId = (winRow as any)?.track_id ?? null

  // 1) Legacy picks.
  const { data: picks } = await supabase
    .from('daily_song_picks')
    .select(`id, comment, like_count, author_id, track_id, tracks:track_id ( ${TRACK_SEL} )`)
    .eq('picked_on', date)
    .order('like_count', { ascending: false })

  if (picks && picks.length > 0) {
    const authorIds = Array.from(new Set((picks as any[]).map(p => p.author_id).filter(Boolean)))
    const profById: Record<string, any> = {}
    if (authorIds.length) {
      const { data: profs } = await supabase
        .from('profiles').select('id, username, full_name, avatar_url').in('id', authorIds)
      for (const p of (profs || []) as any[]) profById[p.id] = { username: p.username, full_name: p.full_name, avatar_url: p.avatar_url }
    }
    const participants = (picks as any[])
      .filter(p => p.tracks)
      .map(p => ({
        id: p.id,
        tracks: normTrack(p.tracks),
        proposer: p.author_id ? profById[p.author_id] || null : null,
        comment: p.comment || null,
        points: p.like_count || 0,
        likes: p.like_count || 0,
        is_winner: winnerTrackId != null && p.track_id === winnerTrackId,
      }))
      .sort((a, b) => (b.is_winner ? 1 : 0) - (a.is_winner ? 1 : 0) || b.points - a.points)
    return NextResponse.json({ date, participants, source: 'picks' })
  }

  // 2) Fallback: modernios balsavimo nominacijos.
  const { data: noms } = await supabase
    .from('daily_song_nominations')
    .select(`id, comment, track_id, user_id, tracks:track_id ( ${TRACK_SEL} ), proposer:profiles!daily_song_nominations_user_id_fkey ( username, full_name, avatar_url )`)
    .eq('date', date)
    .is('removed_at', null)

  if (!noms || noms.length === 0) return NextResponse.json({ date, participants: [], source: 'none' })

  const nomIds = (noms as any[]).map(n => n.id)
  const voteCounts: Record<number, { total: number; weighted: number }> = {}
  const voterIdsByNom: Record<number, string[]> = {}
  const anonByNom: Record<number, number> = {}
  const { data: votes } = await supabase
    .from('daily_song_votes').select('nomination_id, weight, user_id').eq('date', date).in('nomination_id', nomIds)
  for (const v of (votes || []) as any[]) {
    if (!voteCounts[v.nomination_id]) voteCounts[v.nomination_id] = { total: 0, weighted: 0 }
    voteCounts[v.nomination_id].total += 1
    voteCounts[v.nomination_id].weighted += v.weight
    if (v.user_id) (voterIdsByNom[v.nomination_id] ||= []).push(v.user_id)
    else anonByNom[v.nomination_id] = (anonByNom[v.nomination_id] || 0) + 1
  }
  const allVoterIds = Array.from(new Set(Object.values(voterIdsByNom).flat()))
  const profById: Record<string, any> = {}
  if (allVoterIds.length) {
    const { data: profs } = await supabase.from('profiles').select('id, username, full_name, avatar_url').in('id', allVoterIds)
    for (const p of (profs || []) as any[]) profById[p.id] = { username: p.username, full_name: p.full_name, avatar_url: p.avatar_url }
  }
  const participants = (noms as any[])
    .filter(n => n.tracks)
    .map(n => ({
      id: n.id,
      tracks: normTrack(n.tracks),
      proposer: Array.isArray(n.proposer) ? n.proposer[0] || null : n.proposer || null,
      comment: n.comment || null,
      points: voteCounts[n.id]?.weighted || 0,
      voters: (voterIdsByNom[n.id] || []).map(uid => profById[uid]).filter(Boolean),
      anon_votes: anonByNom[n.id] || 0,
      is_winner: winnerTrackId != null && n.track_id === winnerTrackId,
    }))
    .sort((a, b) => (b.is_winner ? 1 : 0) - (a.is_winner ? 1 : 0) || b.points - a.points)
  return NextResponse.json({ date, participants, source: 'nominations' })
}
