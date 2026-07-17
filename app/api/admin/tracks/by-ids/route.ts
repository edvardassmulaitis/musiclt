/**
 * GET /api/admin/tracks/by-ids?ids=1,2,3
 *
 * Grąžina TIKRUS DB dainų duomenis (news Muzikos žingsnio „Prie playerio"
 * sąrašui): id, title, artist_name, video_url, cover_url, release_year.
 * Naudojama, kad rodytume realų dainos vaizdą + užpildymą (ar turi video),
 * o NE straipsnio embed'ą.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['editor', 'admin', 'super_admin'].includes((session.user.role as string) || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const idsRaw = (req.nextUrl.searchParams.get('ids') || '').trim()
  const ids = idsRaw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n))
  if (ids.length === 0) return NextResponse.json({ tracks: [] })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('tracks')
    .select('id, title, slug, video_url, cover_url, release_year, artists!tracks_artist_id_fkey(name)')
    .in('id', ids)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Išlaikom paduotą tvarką.
  const byId = new Map<number, any>()
  for (const t of (data || []) as any[]) byId.set(t.id, t)
  const tracks = ids
    .map(id => byId.get(id))
    .filter(Boolean)
    .map((t: any) => ({
      id: t.id,
      title: t.title,
      slug: t.slug,
      artist_name: (t.artists as any)?.name || '',
      video_url: t.video_url || null,
      cover_url: t.cover_url || null,
      release_year: t.release_year || null,
    }))

  return NextResponse.json({ tracks })
}
