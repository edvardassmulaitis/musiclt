/**
 * GET /api/admin/wiki-album-candidates/[id]/preview
 *
 * Praturtina vieną kandidatą BE priklausomybės nuo Wikipedia straipsnio:
 * pagal atlikėją (matched_artist arba artist_raw) + albumo pavadinimą + metus
 * grąžina MusicBrainz/Apple viršelį, datą, tracklist'ą (jei yra). Naudojama
 * redizainuotame review UI, kad admin matytų ką kuria PRIEŠ patvirtindamas.
 *
 * Best-effort: išorinių šaltinių klaidos negriauna atsakymo (confidence='low').
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { enrichAlbum } from '@/lib/album-enrich'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['editor', 'admin', 'super_admin'].includes((session.user.role as string) || '')) return null
  return session
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const candidateId = parseInt((await params).id, 10)
  if (Number.isNaN(candidateId)) return NextResponse.json({ error: 'Bad ID' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: cand, error } = await supabase
    .from('wiki_album_candidates')
    .select('id, artist_raw, album_title, release_year, matched_artist_id, matched_artist:artists!wiki_album_candidates_matched_artist_id_fkey(name)')
    .eq('id', candidateId)
    .single()
  if (error || !cand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const artistName = ((cand as any).matched_artist?.name as string) || cand.artist_raw || ''
  const enrichment = await enrichAlbum(artistName, cand.album_title, cand.release_year)

  return NextResponse.json({ ok: true, candidate_id: candidateId, artist_name: artistName, enrichment })
}
