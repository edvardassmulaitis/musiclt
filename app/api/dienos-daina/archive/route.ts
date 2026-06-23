import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

// /api/dienos-daina/archive — pilnas „Dienos daina" laimėtojų archyvas
// (visų laikų istorija, paginuota). Grąžina kiekvienai dienai: laimėjusią
// dainą, komentarą, kas pasiūlė ir tos dienos dalyvių skaičių. Palaiko
// filtrą pagal metus (`year`) ir paiešką pagal dainą/atlikėją (`q`).
// `meta=1` papildomai grąžina prieinamų metų sąrašą + bendrą laimėtojų skaičių.
// 2026-06-23.

export const dynamic = 'force-dynamic'

function normTrack(raw: any) {
  const t = Array.isArray(raw) ? raw[0] ?? null : raw
  if (!t) return null
  return { ...t, artists: Array.isArray(t.artists) ? t.artists[0] ?? null : t.artists }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const limit = Math.min(60, Math.max(1, parseInt(searchParams.get('limit') || '24')))
  const offset = Math.max(0, parseInt(searchParams.get('offset') || '0'))
  const year = searchParams.get('year')
  const q = (searchParams.get('q') || '').trim()
  const wantMeta = searchParams.get('meta') === '1'
  const supabase = createAdminClient()

  // Pigus self-heal: užfiksuoti praėjusias dienas be laimėtojo (idempotentinis).
  try { await supabase.rpc('finalize_daily_winners_due') } catch {}

  // Paieška → išspręsti track_id rinkinį (pagal dainos pavadinimą + atlikėjo vardą).
  let trackFilter: number[] | null = null
  if (q.length >= 2) {
    const ids = new Set<number>()
    const like = `%${q}%`
    const { data: byTitle } = await supabase.from('tracks').select('id').ilike('title', like).limit(1000)
    for (const t of (byTitle || []) as any[]) ids.add(t.id)
    const { data: byArtist } = await supabase.from('artists').select('id').ilike('name', like).limit(200)
    const artistIds = (byArtist || []).map((a: any) => a.id)
    if (artistIds.length) {
      const { data: at } = await supabase.from('tracks').select('id').in('artist_id', artistIds).limit(3000)
      for (const t of (at || []) as any[]) ids.add(t.id)
    }
    trackFilter = Array.from(ids)
    if (trackFilter.length === 0)
      return NextResponse.json({ winners: [], has_more: false, total: 0, ...(wantMeta ? { years: [] } : {}) })
  }

  let pageQ = supabase
    .from('daily_song_winners')
    .select(`
      id, date, track_id, total_votes, weighted_votes, winning_comment, winning_user_id,
      tracks!track_id (
        id, slug, title, cover_url, spotify_id, video_url,
        artists!artist_id ( id, slug, name, cover_image_url )
      )
    `, { count: 'exact' })
    .order('date', { ascending: false })

  if (year && /^\d{4}$/.test(year)) pageQ = pageQ.gte('date', `${year}-01-01`).lte('date', `${year}-12-31`)
  if (trackFilter) pageQ = pageQ.in('track_id', trackFilter)
  pageQ = pageQ.range(offset, offset + limit - 1)

  const { data, error, count } = await pageQ
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const winners = (data || []) as any[]

  // Tos pačios dienos nominacijos → laimėtojo proposer/komentaras + dalyvių sk.
  if (winners.length > 0) {
    try {
      const dates = Array.from(new Set(winners.map(w => w.date)))
      const { data: noms } = await supabase
        .from('daily_song_nominations')
        .select('date, track_id, comment, proposer:profiles!daily_song_nominations_user_id_fkey ( username, full_name, avatar_url )')
        .in('date', dates)
        .is('removed_at', null)
      const byKey: Record<string, any> = {}
      const countByDate: Record<string, number> = {}
      for (const n of (noms || []) as any[]) {
        countByDate[n.date] = (countByDate[n.date] || 0) + 1
        byKey[`${n.date}|${n.track_id}`] = n
      }
      for (const w of winners) {
        const n = byKey[`${w.date}|${w.track_id}`]
        if (n) {
          w.proposer = Array.isArray(n.proposer) ? n.proposer[0] : n.proposer
          if (!w.winning_comment && n.comment) w.winning_comment = n.comment
        }
        w.nom_count = countByDate[w.date] || 0
        w.tracks = normTrack(w.tracks)
      }
    } catch {
      for (const w of winners) { w.nom_count = 0; w.tracks = normTrack(w.tracks) }
    }
  }

  const resp: any = {
    winners,
    total: count ?? 0,
    has_more: offset + winners.length < (count ?? 0),
  }

  if (wantMeta) {
    const { data: alld } = await supabase
      .from('daily_song_winners')
      .select('date')
      .order('date', { ascending: false })
      .limit(20000)
    resp.years = (Array.from(new Set((alld || []).map((r: any) => String(r.date).slice(0, 4)))) as string[])
      .sort((a, b) => b.localeCompare(a))
  }

  return NextResponse.json(resp)
}
