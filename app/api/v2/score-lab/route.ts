// app/api/v2/score-lab/route.ts
// LAIKINAS prototipo endpoint'as (/v2 scoring eksperimentui). Grąžina atlikėjo
// per-dainos peržiūras + įkėlimo datas, kad Claude galėtų susimuliuoti naują
// per-dainos / velocity metriką. NEnaudojamas prodakšeno UI. Galima ištrinti.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const revalidate = 0

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const sb = createAdminClient()

  // Top trending leaderboard: ?top=1&scope=world|lt&limit=25
  if (sp.get('top')) {
    const scope = sp.get('scope') === 'lt' ? 'lt' : 'world'
    const limit = Math.min(40, Number(sp.get('limit') || 25))
    let q = sb.from('artists')
      .select('id, name, country, score, score_trending, score_trending_breakdown')
      .not('score_trending', 'is', null)
      .order('score_trending', { ascending: false })
      .limit(limit)
    q = scope === 'lt' ? q.eq('country', 'Lietuva') : q.neq('country', 'Lietuva')
    const { data } = await q
    const rows = ((data || []) as any[]).map((a) => {
      const c = (a.score_trending_breakdown?.categories) || {}
      return { id: a.id, name: a.name, country: a.country, alltime: a.score, trending: a.score_trending, charts: c.charts?.points ?? null, perday: c.pop_perday?.points ?? null, fresh: c.freshness?.points ?? null, chartDetail: c.charts?.details ?? null }
    })
    return NextResponse.json({ scope, rows })
  }

  const id = Number(sp.get('id') || 0)
  if (!id) return NextResponse.json({ error: 'id or top required' }, { status: 400 })
  const [{ data: artist }, { data: tracks }] = await Promise.all([
    sb.from('artists').select('id, name, country, score, score_trending, legacy_likes, wiki_pageviews').eq('id', id).single(),
    sb.from('tracks').select('video_views, video_uploaded_at, release_year').eq('artist_id', id).not('video_views', 'is', null),
  ])
  const rows = ((tracks || []) as any[])
    .map((t) => ({ v: Number(t.video_views) || 0, d: t.video_uploaded_at || (t.release_year ? `${t.release_year}-01-01` : null) }))
    .filter((t) => t.v > 0)
    .sort((a, b) => b.v - a.v)
  return NextResponse.json({
    id,
    name: artist?.name || null,
    country: artist?.country || null,
    score: artist?.score ?? null,
    trending: artist?.score_trending ?? null,
    legacy: artist?.legacy_likes ?? null,
    wiki: artist?.wiki_pageviews ?? null,
    n: rows.length,
    total: rows.reduce((s, r) => s + r.v, 0),
    tracks: rows.slice(0, 60),
  })
}
