import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

/**
 * Admin search-stats endpoint'as.
 *
 * Grąžina visus skaičius reikalingus admin'ui patikrinti ar
 * search-clicks logging veikia:
 *   - totals: per 24h / 7d / 30d
 *   - byType: kiek click'ų per kategoriją (artists/tracks/...)
 *   - topEntities: top 20 entity pagal click count + jų metadata
 *   - topQueries: top 30 paieškos užklausos pagal volume
 *   - recent: last 50 click events su entity title'ais
 *   - daily: per-dienos serijos (last 30d) total chart'ui
 *
 * Auth: tik admin/super_admin.
 */

const slugTrack = (artistSlug: string | null | undefined, trackSlug: string, id: number) =>
  artistSlug ? `/dainos/${artistSlug}-${trackSlug}-${id}` : `/dainos/${trackSlug}-${id}`

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!role || !['admin', 'super_admin'].includes(role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = createAdminClient()
  const now = Date.now()
  const since30 = new Date(now - 30 * 24 * 3600 * 1000).toISOString()
  const since7  = new Date(now -  7 * 24 * 3600 * 1000).toISOString()
  const since1  = new Date(now -      24 * 3600 * 1000).toISOString()

  // Visi 30d click'ai į atmintį (priimtina kol volume mažas; vėliau —
  // RPC su pre-agg).
  const { data: rows, error } = await sb
    .from('search_clicks')
    .select('id, entity_type, entity_id, entity_uuid, query, user_id, created_at')
    .gte('created_at', since30)
    .order('created_at', { ascending: false })
    .limit(5000)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const all = (rows || []) as any[]

  // Totals (per skirtingą periodą)
  const totals = {
    h24: all.filter(r => r.created_at >= since1).length,
    d7:  all.filter(r => r.created_at >= since7).length,
    d30: all.length,
  }

  // By entity type (last 30d)
  const byType = new Map<string, number>()
  for (const r of all) byType.set(r.entity_type, (byType.get(r.entity_type) || 0) + 1)
  const byTypeArr = Array.from(byType.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)

  // Top entities (last 30d)
  const entityCounts = new Map<string, { type: string; id: any; count: number }>()
  for (const r of all) {
    const key = `${r.entity_type}:${r.entity_id || r.entity_uuid}`
    const ex = entityCounts.get(key)
    if (ex) ex.count++
    else entityCounts.set(key, { type: r.entity_type, id: r.entity_id || r.entity_uuid, count: 1 })
  }
  const topRaw = Array.from(entityCounts.values()).sort((a, b) => b.count - a.count).slice(0, 20)

  // Fetch'iname metadata pagal tipus (artists, tracks, albums, news)
  const idsByType = new Map<string, any[]>()
  for (const x of topRaw) {
    if (!idsByType.has(x.type)) idsByType.set(x.type, [])
    idsByType.get(x.type)!.push(x.id)
  }

  const metadata = new Map<string, { title: string; subtitle?: string | null; href: string }>()

  if (idsByType.has('artists')) {
    const { data } = await sb
      .from('artists').select('id,slug,name')
      .in('id', idsByType.get('artists')!.filter(x => typeof x === 'number'))
    for (const a of (data || []) as any[]) {
      metadata.set(`artists:${a.id}`, { title: a.name, href: `/atlikejai/${a.slug}` })
    }
  }
  if (idsByType.has('tracks')) {
    const { data } = await sb
      .from('tracks').select('id,slug,title,artist_id,artists:artist_id(name,slug)')
      .in('id', idsByType.get('tracks')!.filter(x => typeof x === 'number'))
    for (const t of (data || []) as any[]) {
      metadata.set(`tracks:${t.id}`, {
        title: t.title,
        subtitle: t.artists?.name ?? null,
        href: slugTrack(t.artists?.slug, t.slug, t.id),
      })
    }
  }
  if (idsByType.has('albums')) {
    const { data } = await sb
      .from('albums').select('id,slug,title,artist_id,artists:artist_id(name,slug)')
      .in('id', idsByType.get('albums')!.filter(x => typeof x === 'number'))
    for (const al of (data || []) as any[]) {
      metadata.set(`albums:${al.id}`, {
        title: al.title,
        subtitle: al.artists?.name ?? null,
        href: `/albumai/${al.slug}-${al.id}`,
      })
    }
  }
  if (idsByType.has('news')) {
    const { data } = await sb
      .from('news').select('id,slug,title')
      .in('id', idsByType.get('news')!.filter(x => typeof x === 'number'))
    for (const n of (data || []) as any[]) {
      metadata.set(`news:${n.id}`, { title: n.title, href: `/news/${n.slug}` })
    }
  }
  if (idsByType.has('events')) {
    const { data } = await sb
      .from('events').select('id,slug,title,city')
      .in('id', idsByType.get('events')!.filter(x => typeof x === 'string'))
    for (const e of (data || []) as any[]) {
      metadata.set(`events:${e.id}`, { title: e.title, subtitle: e.city, href: `/renginiai/${e.slug}` })
    }
  }
  if (idsByType.has('discussions')) {
    const { data } = await sb
      .from('discussions').select('id,slug,title')
      .in('id', idsByType.get('discussions')!.filter(x => typeof x === 'number'))
    for (const d of (data || []) as any[]) {
      metadata.set(`discussions:${d.id}`, { title: d.title, href: `/diskusijos/${d.slug}` })
    }
  }

  const topEntities = topRaw.map(x => {
    const meta = metadata.get(`${x.type}:${x.id}`)
    return {
      type: x.type,
      id: x.id,
      count: x.count,
      title: meta?.title || `(${x.type} #${x.id} — be metadata)`,
      subtitle: meta?.subtitle || null,
      href: meta?.href || null,
    }
  })

  // Top queries (last 30d)
  const queryCounts = new Map<string, number>()
  for (const r of all) {
    const q = (r.query || '').trim().toLowerCase()
    if (!q) continue
    queryCounts.set(q, (queryCounts.get(q) || 0) + 1)
  }
  const topQueries = Array.from(queryCounts.entries())
    .map(([query, count]) => ({ query, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30)

  // Recent (last 50)
  const recent = all.slice(0, 50).map(r => {
    const m = metadata.get(`${r.entity_type}:${r.entity_id || r.entity_uuid}`)
    return {
      id: r.id,
      type: r.entity_type,
      entity_id: r.entity_id || r.entity_uuid,
      query: r.query,
      created_at: r.created_at,
      title: m?.title || null,
      href: m?.href || null,
    }
  })

  // Daily series (last 30d)
  const dailyMap = new Map<string, number>()
  for (const r of all) {
    const day = String(r.created_at).slice(0, 10)
    dailyMap.set(day, (dailyMap.get(day) || 0) + 1)
  }
  const daily: { date: string; count: number }[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 24 * 3600 * 1000)
    const key = d.toISOString().slice(0, 10)
    daily.push({ date: key, count: dailyMap.get(key) || 0 })
  }

  return NextResponse.json({
    totals,
    byType: byTypeArr,
    topEntities,
    topQueries,
    recent,
    daily,
  }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
