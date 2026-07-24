import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
// (dienos daina winner: proposer + comment resolve, finalize self-heal)

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') || '14')
  const offset = parseInt(searchParams.get('offset') || '0')
  const date = searchParams.get('date')
  const supabase = createAdminClient()

  // Self-heal: užfiksuoti VISAS praėjusias dienas, kurios turi nominacijų bet
  // dar neturi laimėtojo (ne tik vakar — kad daugiadienės spragos užsipildytų
  // savaime, jei niekas nelankė puslapio). finalize_daily_winners_due() yra
  // idempotentinis ir pigus (apdoroja tik neužfiksuotas dienas).
  await supabase.rpc('finalize_daily_winners_due')

  // Gauti nugalėtojus
  let query = supabase
    .from('daily_song_winners')
    .select(`
      id, date, track_id, total_votes, weighted_votes, winning_comment, winning_user_id,
      tracks!track_id (
        id, slug, title, cover_url, spotify_id, video_url,
        artists!artist_id ( id, slug, name, cover_image_url )
      )
    `)
    .order('date', { ascending: false })

  if (date) query = query.eq('date', date)
  else query = query.range(offset, offset + limit - 1)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Kas pasiūlė laimėjusią dainą — winning_user_id dažnai NULL (FK→auth.users,
  // ghost id). Todėl resolve'inam per nominaciją (date+track_id) → proposer
  // profilis. Batch query. 2026-06-01.
  const winners = (data || []) as any[]
  if (winners.length > 0) {
    try {
      const dates = Array.from(new Set(winners.map(w => w.date)))
      const trackIds = Array.from(new Set(winners.map(w => w.track_id)))
      const { data: noms } = await supabase
        .from('daily_song_nominations')
        .select('date, track_id, comment, proposer:profiles!daily_song_nominations_user_id_fkey ( username, full_name, avatar_url )')
        .in('date', dates)
        .in('track_id', trackIds)
        .is('removed_at', null)
      const byKey: Record<string, any> = {}
      for (const n of (noms || []) as any[]) {
        byKey[`${n.date}|${n.track_id}`] = n
      }
      for (const w of winners) {
        const n = byKey[`${w.date}|${w.track_id}`]
        if (n) {
          w.proposer = Array.isArray(n.proposer) ? n.proposer[0] : n.proposer
          if (!w.winning_comment && n.comment) w.winning_comment = n.comment
        }
      }
    } catch {}

    // Legacy laimėtojai (scrape) neturi daily_song_nominations → siūlytoją imam iš
    // daily_song_picks (tos dienos + tos dainos pick'o autorius). (Edvardo 2026-07-24.)
    try {
      const need = winners.filter(w => !w.proposer && w.track_id && w.date)
      if (need.length > 0) {
        const dts = Array.from(new Set(need.map(w => w.date)))
        const tids = Array.from(new Set(need.map(w => w.track_id)))
        const { data: picks } = await supabase
          .from('daily_song_picks')
          .select('picked_on, track_id, author_id, profiles:profiles!daily_song_picks_author_id_fkey ( username, full_name, avatar_url )')
          .in('picked_on', dts)
          .in('track_id', tids)
        const pByKey: Record<string, any> = {}
        for (const p of (picks || []) as any[]) pByKey[`${p.picked_on}|${p.track_id}`] = p
        for (const w of need) {
          const p = pByKey[`${w.date}|${w.track_id}`]
          if (p) w.proposer = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles
        }
      }
    } catch {}
  }

  return NextResponse.json({ winners })
}
