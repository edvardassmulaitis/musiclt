import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET /api/admin/duplikatai-atlikejai/list
//
// Grąžina atlikėjų dublikatų grupes (tas pats slug ≥2) su turinio statistika,
// kad admin galėtų pasirinkti keeper'į ir sujungti (merge_artists).
type Row = {
  slug: string; id: number; name: string; score: number | null
  legacy_id: number | null; cover_image_url: string | null; tracks: number; albums: number
}

export async function GET(_req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const sb = createAdminClient()
  const { data, error } = await sb.rpc('list_artist_duplicates')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Grupuojam pagal slug; siūlomas keeper = daugiausiai turinio (tracks+albums),
  // tada score, tada mažesnis id. RPC jau surikiuota score desc — imam pirmą kaip default.
  const groups = new Map<string, Row[]>()
  for (const r of (data || []) as Row[]) {
    if (!groups.has(r.slug)) groups.set(r.slug, [])
    groups.get(r.slug)!.push(r)
  }

  const result = Array.from(groups.entries()).map(([slug, artists]) => {
    const ranked = [...artists].sort((a, b) =>
      (b.tracks + b.albums) - (a.tracks + a.albums) ||
      (b.score ?? 0) - (a.score ?? 0) || a.id - b.id)
    return { slug, count: artists.length, suggested_keeper_id: ranked[0]?.id ?? null, artists: ranked }
  })
  // Sudėtingesnės grupės (daugiau turinio konfliktų) pirmos — reikia daugiau dėmesio.
  result.sort((a, b) =>
    (b.artists.filter(x => x.tracks + x.albums > 0).length) -
    (a.artists.filter(x => x.tracks + x.albums > 0).length) || a.slug.localeCompare(b.slug))

  return NextResponse.json({ groups: result, total_groups: result.length, total_artists: (data || []).length })
}
