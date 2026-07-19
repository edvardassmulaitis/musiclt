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
import { enrichAlbum, type AlbumEnrichment } from '@/lib/album-enrich'
import { enrichAlbumFromWiki } from '@/lib/quick-add'

function albumWikiUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
}
function isUpcoming(y: number | null, m: number | null, d: number | null): boolean {
  if (!y) return false
  return Date.UTC(y, (m || 1) - 1, d || 1) > Date.now()
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['editor', 'admin', 'super_admin'].includes((session.user.role as string) || '')) return null
  return session
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const candidateId = parseInt((await params).id, 10)
  if (Number.isNaN(candidateId)) return NextResponse.json({ error: 'Bad ID' }, { status: 400 })

  const force = req.nextUrl.searchParams.get('force') === '1'
  const supabase = createAdminClient()
  const { data: cand, error } = await supabase
    .from('wiki_album_candidates')
    .select('id, artist_raw, album_title, release_year, album_wiki_link, matched_artist_id, preview_payload, preview_at, matched_artist:artists!wiki_album_candidates_matched_artist_id_fkey(name)')
    .eq('id', candidateId)
    .single()
  if (error || !cand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // ── Cache: jei jau praturtinta ir dar šviežia (< 14 d.) — grąžinam iš karto ──
  const FRESH_MS = 14 * 24 * 60 * 60 * 1000
  const cachedAt = (cand as any).preview_at ? Date.parse((cand as any).preview_at) : 0
  const cached = (cand as any).preview_payload
  if (!force && cached && cachedAt && (Date.now() - cachedAt) < FRESH_MS) {
    return NextResponse.json({ ok: true, candidate_id: candidateId, enrichment: cached, cached: true })
  }

  const artistName = ((cand as any).matched_artist?.name as string) || cand.artist_raw || ''

  // Jei yra Wikipedia straipsnis — jis AUTORITETINGAS (pririštas prie konkretaus
  // albumo; MB paieška pagal vardą gali pataikyti į kitą to paties vardo atlikėją).
  let enrichment: AlbumEnrichment | null = null
  if ((cand as any).album_wiki_link) {
    const w = await enrichAlbumFromWiki(albumWikiUrl((cand as any).album_wiki_link), req.nextUrl.origin).catch(() => null)
    if (w) {
      enrichment = {
        source: 'wikipedia',
        source_url: albumWikiUrl((cand as any).album_wiki_link),
        cover_url: w.cover_url,
        year: w.year, month: w.month, day: w.day,
        tracks: w.tracks,
        track_count: w.tracks.length,
        mb_release_id: null,
        primary_type: w.types[0] || null,
        types: w.types,
        is_upcoming: isUpcoming(w.year, w.month, w.day),
        confidence: w.tracks.length > 0 ? 'high' : 'low',
      }
    }
  }
  if (!enrichment) enrichment = await enrichAlbum(artistName, cand.album_title, cand.release_year)

  // Įrašom į cache — kad kitą kartą nekartotume išorinių fetch'ų.
  supabase.from('wiki_album_candidates')
    .update({ preview_payload: enrichment, preview_at: new Date().toISOString() })
    .eq('id', candidateId).then(() => {})

  return NextResponse.json({ ok: true, candidate_id: candidateId, artist_name: artistName, enrichment, cached: false })
}
