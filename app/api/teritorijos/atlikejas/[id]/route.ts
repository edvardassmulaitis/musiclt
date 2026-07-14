// app/api/teritorijos/atlikejas/[id]/route.ts
// Viešas endpointas: atlikėjo teritorijos muzikos žemėlapyje (laiko juosta).

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const revalidate = 3600

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const artistId = Number(id)
  if (!Number.isFinite(artistId)) return NextResponse.json({ items: [] })

  const sb = createAdminClient()
  const { data } = await sb
    .from('gilyn_artist_terr')
    .select('terr_id, year_from, year_to, source, gilyn_terr(id, name, region, essence, status, gilyn_worlds(name, color))')
    .eq('artist_id', artistId)

  const items = (data || [])
    .filter((r: any) => r.gilyn_terr && r.gilyn_terr.status !== 'drop')
    .map((r: any) => ({
      id: r.terr_id,
      name: r.gilyn_terr.name,
      world: r.gilyn_terr.gilyn_worlds?.name ?? null,
      color: r.gilyn_terr.gilyn_worlds?.color ?? '#888',
      region: r.gilyn_terr.region,
      essence: r.gilyn_terr.essence,
      from: r.year_from,
      to: r.year_to,
      source: r.source,
    }))
    .sort((a: any, b: any) => (a.from || 9999) - (b.from || 9999))

  return NextResponse.json({ items })
}
