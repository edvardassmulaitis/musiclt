// app/api/admin/teritorijos/route.ts
// Gilyn v3 muzikos žemėlapis — admino duomenys.
//
// GET                → pasauliai + teritorijos su statistika (bendra peržiūra)
// GET ?terr=<id>     → vienos teritorijos gylis: atlikėjai, trūkstami, kaimynės
// GET ?artist=<id>   → atlikėjo teritorijos (naudojama ir atlikėjo puslapyje)
// POST               → teritorijos redagavimas (status, priority, aprašymas)

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role || ''
  return ['admin', 'super_admin', 'editor'].includes(role)
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const sb = createAdminClient()
  const terrId = req.nextUrl.searchParams.get('terr')
  const artistId = req.nextUrl.searchParams.get('artist')

  // ── Atlikėjo teritorijos (laiko juosta) ────────────────────────────────
  if (artistId) {
    const { data } = await sb
      .from('gilyn_artist_terr')
      .select('terr_id, year_from, year_to, source, gilyn_terr(id, name, era_from, era_to, region, essence, world_id, gilyn_worlds(name, color))')
      .eq('artist_id', Number(artistId))
    const items = (data || []).map((r: any) => ({
      id: r.terr_id,
      name: r.gilyn_terr?.name,
      world: r.gilyn_terr?.gilyn_worlds?.name,
      color: r.gilyn_terr?.gilyn_worlds?.color,
      region: r.gilyn_terr?.region,
      essence: r.gilyn_terr?.essence,
      from: r.year_from,
      to: r.year_to,
      source: r.source,
    })).sort((a: any, b: any) => (a.from || 0) - (b.from || 0))
    const { data: fame } = await sb.from('artist_fame').select('fame').eq('artist_id', Number(artistId)).maybeSingle()
    return NextResponse.json({ items, fame: fame?.fame ?? null })
  }

  // ── Vienos teritorijos gylis ───────────────────────────────────────────
  if (terrId) {
    const [{ data: terr }, { data: rows }, { data: missing }, { data: edges }] = await Promise.all([
      sb.from('gilyn_terr').select('*, gilyn_worlds(name, color)').eq('id', terrId).maybeSingle(),
      sb.from('gilyn_artist_terr')
        .select('artist_id, year_from, year_to, source, artists(id, name, slug, country, cover_image_url)')
        .eq('terr_id', terrId).limit(400),
      sb.from('gilyn_missing')
        .select('id, artist_name, fame, status, request_id')
        .eq('terr_id', terrId).eq('status', 'pending').order('fame', { ascending: false }).limit(120),
      sb.from('gilyn_terr_edges')
        .select('b_id, shared, colike, weight, gilyn_terr!gilyn_terr_edges_b_id_fkey(name, world_id)')
        .eq('a_id', terrId).order('weight', { ascending: false }).limit(10),
    ])

    const ids = (rows || []).map((r: any) => r.artist_id)
    const { data: fames } = ids.length
      ? await sb.from('artist_fame').select('artist_id, fame').in('artist_id', ids)
      : { data: [] as any[] }
    const fameMap = new Map((fames || []).map((f: any) => [f.artist_id, f.fame]))

    const artists = (rows || []).map((r: any) => ({
      id: r.artist_id,
      name: r.artists?.name,
      slug: r.artists?.slug,
      country: r.artists?.country,
      cover: r.artists?.cover_image_url,
      from: r.year_from,
      to: r.year_to,
      source: r.source,
      fame: fameMap.get(r.artist_id) ?? 1,
    })).sort((a: any, b: any) => (b.fame - a.fame) || (a.from || 0) - (b.from || 0))

    return NextResponse.json({
      terr: terr ? { ...terr, world: (terr as any).gilyn_worlds?.name, color: (terr as any).gilyn_worlds?.color } : null,
      artists,
      missing: missing || [],
      neighbours: (edges || []).map((e: any) => ({
        id: e.b_id, name: e.gilyn_terr?.name, shared: e.shared, colike: e.colike, weight: e.weight,
      })),
    })
  }

  // ── Bendra peržiūra: pasauliai + teritorijos ───────────────────────────
  const [{ data: worlds }, { data: terrs }] = await Promise.all([
    sb.from('gilyn_worlds').select('*').order('sort'),
    sb.from('gilyn_terr').select('id, world_id, name, era_from, era_to, region, essence, n_artists, n_known, n_missing, status, priority, merge_into').order('n_known', { ascending: false }),
  ])

  const byWorld: Record<string, any[]> = {}
  for (const t of terrs || []) (byWorld[t.world_id] ||= []).push(t)

  const stats = {
    teritorijos: (terrs || []).length,
    veikia: (terrs || []).filter((t: any) => t.n_known >= 5).length,
    plonos: (terrs || []).filter((t: any) => t.n_known > 0 && t.n_known < 5).length,
    tuscios: (terrs || []).filter((t: any) => t.n_known === 0).length,
    truksta: (terrs || []).reduce((s: number, t: any) => s + (t.n_missing || 0), 0),
  }

  return NextResponse.json({
    worlds: (worlds || []).map((w: any) => ({
      ...w,
      terrs: byWorld[w.id] || [],
      n_terr: (byWorld[w.id] || []).length,
      n_artists: (byWorld[w.id] || []).reduce((s: number, t: any) => s + t.n_artists, 0),
      n_missing: (byWorld[w.id] || []).reduce((s: number, t: any) => s + t.n_missing, 0),
    })),
    stats,
  })
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const sb = createAdminClient()
  const body = await req.json().catch(() => ({}))
  const { action, id } = body

  if (action === 'update-terr') {
    const patch: any = {}
    for (const k of ['name', 'essence', 'description', 'status', 'priority', 'merge_into', 'region']) {
      if (body[k] !== undefined) patch[k] = body[k]
    }
    const { error } = await sb.from('gilyn_terr').update(patch).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  // Trūkstamą atlikėją atmesti (nereikalingas šioje teritorijoje)
  if (action === 'reject-missing') {
    await sb.from('gilyn_missing').update({ status: 'rejected', resolved_at: new Date().toISOString() }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  // Rankinis atlikėjo priskyrimas / atjungimas
  if (action === 'link-artist') {
    const { error } = await sb.from('gilyn_artist_terr').upsert({
      artist_id: body.artist_id, terr_id: body.terr_id,
      year_from: body.from ?? null, year_to: body.to ?? null, source: 'rankinis',
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    await sb.rpc('gilyn_refresh_terr_stats')
    return NextResponse.json({ ok: true })
  }
  if (action === 'unlink-artist') {
    await sb.from('gilyn_artist_terr').delete().eq('artist_id', body.artist_id).eq('terr_id', body.terr_id)
    await sb.rpc('gilyn_refresh_terr_stats')
    return NextResponse.json({ ok: true })
  }

  if (action === 'refresh-stats') {
    await sb.rpc('gilyn_refresh_terr_stats')
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'nežinomas veiksmas' }, { status: 400 })
}
