import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { computeAlbumCompleteness } from '@/lib/album-completeness'

// GET /api/albums/[id]/completeness — read-only album/track pilnatvos check.
//
// Naudojama Wiki Discography Import modal'e: kai admin išskleidžia jau
// egzistuojantį album'ą (duplicate=true), auto-fetch'inam šį endpoint'ą,
// kad galėtume rodyti per-track ✓/⚠ badges BEFORE enrich (kad admin matytų
// ką reikia papildyti).
//
// Atsakymas — toks pats shape kaip enrich endpoint'o `completeness` lauke:
//   { has_cover, has_year, substyles_count, tracks_count, all_tracks_complete,
//     fully_complete, tracks: [{ id, title, complete, missing: [...] }] }

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin','super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id: idStr } = await params
  const albumId = parseInt(idStr)
  if (!Number.isFinite(albumId)) {
    return NextResponse.json({ error: 'Bad album id' }, { status: 400 })
  }
  const sb = createAdminClient()
  const completeness = await computeAlbumCompleteness(sb, albumId)
  if (!completeness) {
    return NextResponse.json({ error: 'Album not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true, completeness })
}
