/**
 * POST /api/admin/news-candidates/[id]/rewrite
 *
 * On-demand LT rewrite ant preview candidate'o.
 *
 * Kontekstas: scout cron'as nebedaro pilno LT rewrite'o — per brangu kiekvienam
 * candidate'ui, ir Haiku 4.5 LT vertime daro per daug halucinacijų/calque'ų.
 * Vietoj to candidates'ai pateikiami EN title preview'u, o admin'as spaudžia
 * „Perrašyti į LT" /admin/inbox'e, kad paleist Sonnet ant atrinktų candidate'ų.
 *
 * Žr. LT_TRANSLATION_IMPROVEMENT_PLAN.md (v2) — lazy rewrite arkitektūra.
 *
 * Side-effect'as DB:
 *   - status: 'preview' → 'pending'
 *   - ai_title, ai_body, ai_summary, ai_model, ai_confidence užpildomi
 *   - suggested_artist_ids/track_ids, embed_urls, ai_tracks_mentioned atnaujinami
 *     iš Sonnet'o extract'into rezultato
 *
 * Idempotency: galima paleist pakartotinai net pending candidate'ui (overrides
 * AI content nauja Sonnet generacija). Naudinga jei reikia regen po prompt fixų.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { normalizeArticle } from '@/lib/ai-normalize'
import { extractFromUrl } from '@/lib/url-extract'
import { matchArtists, matchTracks, getTopArtistsForHint } from '@/lib/entity-matcher'
import { ALLOWED_CATEGORIES } from '@/lib/news-categories'

export const runtime = 'nodejs'
export const maxDuration = 60  // single Sonnet rewrite ≤ 30s typiškai

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['editor', 'admin', 'super_admin'].includes((session.user.role as string) || '')) {
    return null
  }
  return session
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Next.js 15: params yra Promise (žr. kitus /admin/news-candidates/[id] endpoint'us)
  const { id: idParam } = await params
  const id = parseInt(idParam, 10)
  if (!id) return NextResponse.json({ error: 'Bad id' }, { status: 400 })

  const supabase = createAdminClient()

  // Load candidate
  const { data: candidate, error: loadErr } = await supabase
    .from('news_candidates')
    .select('*')
    .eq('id', id)
    .single()
  if (loadErr || !candidate) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Fetch full article — visad re-fetch, kad gautume šviežią raw_text
  // (scout saugojo tik 20K chars, bet Sonnet'as gali naudoti iki 6K limit'o).
  let article
  try {
    article = await extractFromUrl(candidate.source_url)
  } catch (e: any) {
    return NextResponse.json({ error: `Fetch source failed: ${e.message}` }, { status: 502 })
  }

  // Run Sonnet normalize su improved prompt'u
  const artistHint = await getTopArtistsForHint(500)
  const embedHint = article.embed_urls.length > 0
    ? `\n\nSOURCE'E RASTI EMBED'AI (YT/Spotify/SoundCloud/Bandcamp) — ĮDĖK į embed_urls output'ą:\n${article.embed_urls.join('\n')}`
    : ''

  let ai
  try {
    ai = await normalizeArticle({
      full_text: article.text + embedHint,
      source_lang: article.source_lang || candidate.raw_lang || 'en',
      source_name: candidate.source_portal,
      source_url: candidate.source_url,
      artist_whitelist: artistHint,
    })
  } catch (e: any) {
    return NextResponse.json({ error: `AI rewrite failed: ${e.message}` }, { status: 502 })
  }

  // Fallback embed'ai jei Sonnet'as nepasiūlė
  if ((!ai.embed_urls || ai.embed_urls.length === 0) && article.embed_urls.length > 0) {
    ai.embed_urls = article.embed_urls
  }

  if (!ALLOWED_CATEGORIES.has(ai.category as any)) {
    return NextResponse.json({
      error: `AI rejected as "${ai.category}"`,
      detail: (ai.raw_response || '').slice(0, 300),
    }, { status: 422 })
  }

  // Re-match entities su Sonnet'o extract'intais vardais (gali būti tikslesni
  // nei Haiku classify mentions)
  const artistMatches = await matchArtists(ai.artists_mentioned)
  const primaryArtist = artistMatches[0]
  const trackMatches = primaryArtist
    ? await matchTracks(ai.tracks_mentioned, [primaryArtist.artist_id])
    : []

  // ai_tracks_mentioned su match status'u (UI'e rodysim matched ✓ ir unmatched ⚠)
  const matchedByTitle = new Map<string, number>()
  for (const m of trackMatches) {
    matchedByTitle.set(m.title.toLowerCase().trim(), m.track_id)
  }
  // 2026-06-11 fix: anksčiau VISIEMS mention'ams būdavo priskiriamas tas pats
  // PIRMAS YT embed'as — klaidinantis kai straipsnyje keli video. Dabar:
  // 1 mention + N embed'ų → pirmas embed; N mentions → embed pagal indeksą
  // (straipsniuose embed'ai dažniausiai eina ta pačia tvarka kaip paminėjimai),
  // jei embed'ų trūksta → null (admin'as pasirinks per TrackSuggestPicker).
  const ytEmbeds = (ai.embed_urls || []).filter(u => /youtube\.com|youtu\.be/.test(u))
  const aiTracksMentioned = (ai.tracks_mentioned || []).map((t, i) => {
    const key = (t.title || '').toLowerCase().trim()
    const matched = matchedByTitle.get(key) || null
    const youtubeUrl = (ai.tracks_mentioned || []).length === 1
      ? (ytEmbeds[0] || null)
      : (ytEmbeds[i] || null)
    return {
      title: t.title,
      artist: t.artist,
      matched_track_id: matched,
      youtube_url: youtubeUrl,
    }
  })

  // Primary artist preference: išlaikom scout'inį match'ą (jis pasekė per score
  // gate), bet jei Sonnet'as identifikavo geresnį (su aukštesniu confidence) —
  // pasiimam jo. Realiame use'e dažniausiai būna tas pats artist'as.
  const newPrimary = primaryArtist?.artist_id || candidate.primary_artist_id

  // Update candidate — preview → pending
  const { data: updated, error: updErr } = await supabase
    .from('news_candidates')
    .update({
      ai_category: ai.category,
      ai_title: ai.title,
      ai_body: ai.body_html,
      ai_summary: ai.summary,
      ai_confidence: ai.confidence,
      ai_model: ai.model,
      suggested_artist_ids: artistMatches.length > 0
        ? artistMatches.map(a => a.artist_id)
        : candidate.suggested_artist_ids,
      suggested_track_ids: trackMatches.map(t => t.track_id),
      primary_artist_id: newPrimary,
      embed_urls: (ai.embed_urls && ai.embed_urls.length > 0)
        ? ai.embed_urls
        : candidate.embed_urls,
      ai_tracks_mentioned: aiTracksMentioned,
      status: 'pending',
    })
    .eq('id', id)
    .select('*')
    .single()

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, candidate: updated })
}
