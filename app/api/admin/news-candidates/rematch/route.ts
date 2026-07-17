/**
 * Admin: pakartotinis atlikėjų priskyrimas nepriskirtiems kandidatams.
 *
 * POST /api/admin/news-candidates/rematch
 *   → suranda preview/pending kandidatus BE atlikėjo (primary_artist_id null ir
 *     tuščias suggested_artist_ids), kiekvienam iš naujo paleidžia
 *     detectArtistMentions(ai_title + raw_text) → matchArtists ir atnaujina
 *     suggested_artist_ids / primary_artist_id.
 *
 * Naudojama po hint praplėtimo (500→3000), kad senesni gmail kandidatai, kurių
 * atlikėjas buvo už tuometinio lango (pvz. Gogol Bordello, The Cinematic
 * Orchestra), gautų priskyrimą be re-ingestijos. Idempotent — jei nieko nerandama,
 * kandidatas paliekamas kaip buvo.
 */

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { detectArtistMentions, matchArtists } from '@/lib/entity-matcher'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['editor', 'admin', 'super_admin'].includes((session.user.role as string) || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Kandidatai be atlikėjo (preview+pending).
  const { data: rows, error } = await supabase
    .from('news_candidates')
    .select('id, ai_title, raw_text, suggested_artist_ids, primary_artist_id')
    .in('status', ['preview', 'pending'])
    .is('primary_artist_id', null)
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const candidates = (rows || []).filter(
    (c: any) => !c.suggested_artist_ids || (c.suggested_artist_ids as any[]).length === 0
  )

  let scanned = 0
  let updated = 0
  const results: Array<{ id: number; matched: string[] }> = []

  for (const c of candidates as any[]) {
    scanned++
    const text = `${c.ai_title || ''} ${c.raw_text || ''}`
    const mentions = await detectArtistMentions(text)
    if (mentions.length === 0) continue
    const matches = await matchArtists(mentions)
    if (matches.length === 0) continue
    const artistIds = matches.map(m => m.artist_id)
    const primary = artistIds[0]
    const { error: upErr } = await supabase
      .from('news_candidates')
      .update({
        suggested_artist_ids: artistIds,
        primary_artist_id: primary,
      })
      .eq('id', c.id)
    if (!upErr) {
      updated++
      results.push({ id: c.id, matched: matches.map(m => m.name) })
    }
  }

  return NextResponse.json({ ok: true, scanned, updated, results })
}
