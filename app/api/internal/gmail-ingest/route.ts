/**
 * POST /api/internal/gmail-ingest
 *
 * Endpoint'as Gmail worker'iui (Edvardo Claude.ai project'e). Priima
 * press release tekstą iš music.lt.naujienos@gmail.com inbox'o ir leidžia
 * jį per ai-normalize pipeline kaip naujieną candidate.
 *
 * Bearer auth: INTERNAL_CRON_TOKEN (tas pats kaip news/events scout cron'ams).
 *
 * Body:
 * {
 *   thread_id: string,           // Gmail thread ID (dedupe key)
 *   message_id?: string,         // v2 — paskutinio message ID thread'e. Jei pateikta,
 *                                // endpoint'as pats fetch'ina image attachments per Gmail API.
 *   from: string,                // sender email
 *   subject: string,
 *   raw_body: string,            // pilnas press release tekstas (po Gmail markup strip)
 *   detected_artists?: string[], // worker'is gali pre-extract'inti
 *   detected_dates?: string[],
 *   detected_venue?: string,
 *   attachments?: Array<{        // v2 (2026-05-18) — fallback'as jei worker'is jau
 *     filename: string,           // base64 encoded'ino (po pas Gmail MCP retention).
 *     mime_type: string,          // Server-side fetch (per message_id) yra preferred path.
 *     base64: string,             // Foto uploadinami į 'news-attachments' Storage bucket'ą,
 *   }>,                           // EXIF extract → news_candidate_images.
 * }
 *
 * Returns:
 * {
 *   candidate_id: number,
 *   status: 'pending' | 'already_seen',
 *   ai_category?: string,
 *   ai_confidence?: number,
 * }
 *
 * Dedupe: jei thread_id jau seen, grąžinam existing candidate_id (jeigu yra)
 * arba 200 su skipped flag'u.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { classifyMusicRelevance } from '@/lib/ai-normalize'
import { matchArtists, matchTracks, getTopArtistsForHint } from '@/lib/entity-matcher'
import { extractExifFromBuffer } from '@/lib/exif-extract'
import { extractDocxFromBuffer } from '@/lib/docx-extract'
import { getMessageAttachments, getAttachmentBuffer } from '@/lib/gmail-client'
import { processMessageAttachments, ATTACHMENTS_BUCKET } from '@/lib/gmail-attachments'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
const MAX_ATTACHMENTS_PER_CANDIDATE = 8

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'attachment'
}

function canonicalHash(s: string): string {
  // Light hash — naudojam SHA-1 hex iš thread_id substring'o. Realiai
  // thread_id pakanka — jis unikalus per Gmail.
  return s.slice(0, 64)
}

export async function POST(req: NextRequest) {
  // Auth — Bearer INTERNAL_CRON_TOKEN
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  const expected = process.env.INTERNAL_CRON_TOKEN
  if (!expected) return NextResponse.json({ error: 'INTERNAL_CRON_TOKEN not configured' }, { status: 503 })
  if (!token || token !== expected) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as any
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const threadId: string | undefined = typeof body.thread_id === 'string' ? body.thread_id.trim() : undefined
  const fromEmail: string | undefined = typeof body.from === 'string' ? body.from.trim() : undefined
  const subject: string | undefined = typeof body.subject === 'string' ? body.subject.trim() : undefined
  const rawBody: string | undefined = typeof body.raw_body === 'string' ? body.raw_body.trim() : undefined

  if (!threadId) return NextResponse.json({ error: 'thread_id required' }, { status: 400 })
  if (!rawBody || rawBody.length < 50) {
    return NextResponse.json({ error: 'raw_body too short (min 50 chars)' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // 1) Dedupe check — ar šis thread_id jau seen?
  const { data: seen } = await supabase
    .from('gmail_seen_messages')
    .select('thread_id, candidate_id, filter_reason')
    .eq('thread_id', threadId)
    .maybeSingle()
  if (seen) {
    return NextResponse.json({
      candidate_id: seen.candidate_id,
      status: seen.filter_reason ? 'rejected' : 'already_seen',
      filter_reason: seen.filter_reason,
    })
  }

  // 2) Haiku classify — filter not_music + gauti kategoriją (release/performance/etc)
  //    Single Haiku call duoda mums abu duomenis kuriuos reikia: filter verdict +
  //    category passthrough'ui (step 3 metu).
  let haikuCategory: string = 'other'
  let haikuConfidence: number = 0.85
  try {
    const verdicts = await classifyMusicRelevance([{
      idx: 0,
      title: subject || 'Press release',
      summary: rawBody.slice(0, 500),
    }])
    const verdict = verdicts[0]
    if (verdict && (verdict.category === 'none' || verdict.confidence < 0.4)) {
      // Mark seen su filter_reason kad nepraeitų antrą kartą
      await supabase.from('gmail_seen_messages').insert({
        thread_id: threadId,
        from_email: fromEmail || null,
        subject: subject || null,
        filter_reason: 'not_music',
      })
      return NextResponse.json({
        status: 'rejected',
        filter_reason: 'not_music',
        reason: verdict.brief_why || 'Haiku classifier rejected',
      })
    }
    if (verdict) {
      haikuCategory = verdict.category || 'other'
      haikuConfidence = verdict.confidence || 0.85
    }
  } catch (e: any) {
    console.warn('[gmail-ingest] Haiku classify failed:', e.message)
  }

  // 3) Press release PASSTHROUGH — Gmail šaltinis turi originalų press release tekstą.
  //
  //    PRIORITETAS:
  //      A) .docx attachment (oficialus press release dokumentas su antrašte) — jei yra
  //      B) Email subject + raw_body fallback
  //
  //    Sonnet rewrite'as praleidžiamas — visi tekstai naudojami originaliame
  //    formate (taupymas + tikslesnis tekstas). Entity matching daromas paprasta
  //    substring paieška prieš top 500 atlikėjų sąrašą; admin'as gali pritempt'i
  //    daugiau per UI.

  const messageIdForDocx: string | undefined = typeof body.message_id === 'string' ? body.message_id.trim() : undefined

  // A) Bandom rasti .docx press release attachment'ą thread'e
  let docxTitle: string | null = null
  let docxBodyHtml: string | null = null
  let docxBodyText: string | null = null

  if (messageIdForDocx) {
    try {
      const metas = await getMessageAttachments(messageIdForDocx)
      const docxMeta = metas.find(m =>
        /^application\/(vnd\.openxmlformats-officedocument\.wordprocessingml\.document|msword)$/i.test(m.mimeType)
        && m.size > 1000 && m.size < 10 * 1024 * 1024
      )
      if (docxMeta) {
        const buf = await getAttachmentBuffer(messageIdForDocx, docxMeta.attachmentId)
        const extracted = await extractDocxFromBuffer(buf)
        if (extracted.has_content) {
          docxTitle = extracted.title
          docxBodyHtml = extracted.body_html
          docxBodyText = extracted.body_text
        }
      }
    } catch (e: any) {
      console.warn('[gmail-ingest] docx extract failed:', e?.message || e)
    }
  }

  // Title — docx pirmiausia, tada subject su cleanup'u
  const cleanSubject = (subject || '')
    .replace(/^\s*(pranešimas spaudai|press release|spaudai|fwd?:?|re:?)\s*[:\-–—]?\s*/i, '')
    .trim()
  const cleanTitle = docxTitle || cleanSubject || 'Be antraštės'

  // Body — docx HTML pirmiausia (turi heading + paragraphus), tada raw_body
  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const bodyHtml = docxBodyHtml || rawBody
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n')

  // Summary — pirmas paragrafas iš docx text arba raw_body (max 280 chars)
  const summarySource = docxBodyText || rawBody
  const firstPara = summarySource.split(/\n\s*\n/).map(p => p.trim()).find(p => p.length > 20) || summarySource.slice(0, 300)
  const summary = firstPara.slice(0, 280).replace(/\s+\S*$/, '').trim() + (firstPara.length > 280 ? '…' : '')

  // Embed URLs — YouTube/Spotify links iš teksto
  const urlMatches = (`${subject || ''} ${rawBody}`).match(/https?:\/\/[^\s<>"]+/gi) || []
  const embedUrls = Array.from(new Set(urlMatches.filter(u =>
    /(youtube\.com\/watch|youtu\.be\/|spotify\.com\/(track|album|artist|playlist))/i.test(u)
  )))

  // Artist scan — substring match prieš top 500 (case-insensitive, žodžio ribos)
  const artistHint = await getTopArtistsForHint(500)
  const fullText = `${subject || ''} ${rawBody}`.toLowerCase()
  const artistsMentioned: Array<{ name: string }> = []
  for (const a of artistHint as any[]) {
    const name = (a?.name || '').toLowerCase()
    if (!name || name.length < 3) continue
    // Word-boundary check kad „bo" nematchintų į „bonus"
    const pattern = new RegExp(`(^|\\W)${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}(\\W|$)`)
    if (pattern.test(fullText)) {
      artistsMentioned.push({ name: a.name })
      if (artistsMentioned.length >= 5) break
    }
  }

  // Category — iš anksčiau gauto Haiku verdict'o (step 2)
  const ai = {
    category: haikuCategory,
    title: cleanTitle,
    body_html: bodyHtml,
    summary,
    confidence: haikuConfidence,
    model: 'gmail-passthrough',
    artists_mentioned: artistsMentioned,
    tracks_mentioned: [] as Array<{ title: string; artist: string }>,
    embed_urls: embedUrls,
  }

  // 4) Entity matching
  const artistMatches = await matchArtists(ai.artists_mentioned)
  const primaryArtist = artistMatches[0]
  const trackMatches = primaryArtist
    ? await matchTracks(ai.tracks_mentioned, [primaryArtist.artist_id])
    : []

  // 5) Insert candidate
  const aiTracksMentioned = (ai.tracks_mentioned || []).map(t => {
    const matched = trackMatches.find(m => m.title.toLowerCase().trim() === t.title.toLowerCase().trim())
    const ytUrl = (ai.embed_urls || []).find(u => /youtube\.com|youtu\.be/.test(u)) || null
    return {
      title: t.title,
      artist: t.artist,
      matched_track_id: matched?.track_id || null,
      youtube_url: ytUrl,
    }
  })

  const { data: inserted, error: insErr } = await supabase
    .from('news_candidates')
    .insert({
      source_type: 'gmail',
      source_id: null, // Gmail nėra scout_sources entry
      source_url: null,
      source_portal: 'gmail',
      source_email_thread_id: threadId,
      source_email_from: fromEmail || null,
      source_published_at: null, // Gmail received time gali ateit per worker'į, v1 NULL
      raw_text: rawBody.slice(0, 20_000),
      raw_html: null,
      raw_lang: (subject && /[ąčęėįšųūž]/i.test(subject)) || /[ąčęėįšųūž]/i.test(rawBody) ? 'lt' : 'en',
      ai_category: ai.category,
      ai_title: ai.title,
      ai_body: ai.body_html,
      ai_summary: ai.summary,
      ai_confidence: ai.confidence,
      ai_model: ai.model,
      suggested_artist_ids: artistMatches.map(a => a.artist_id),
      suggested_track_ids: trackMatches.map(t => t.track_id),
      primary_artist_id: primaryArtist?.artist_id || null,
      suggested_image_url: null,
      embed_urls: ai.embed_urls || [],
      ai_tracks_mentioned: aiTracksMentioned,
      url_canonical_hash: canonicalHash(`gmail:${threadId}`),
      title_fingerprint: (ai.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 100),
      status: 'pending',
    })
    .select('id')
    .single()

  if (insErr) {
    return NextResponse.json({ error: `Candidate insert failed: ${insErr.message}` }, { status: 500 })
  }

  // 6) Mark seen
  await supabase.from('gmail_seen_messages').insert({
    thread_id: threadId,
    candidate_id: inserted.id,
    from_email: fromEmail || null,
    subject: subject || null,
    filter_reason: null,
  })

  // 7) Image attachments — preferred path: body.message_id, endpoint'as pats
  //    fetch'ina per Gmail API (server-side, mažas POST payload).
  //    Fallback: body.attachments[] su base64 — jeigu worker'is jau encoded.
  let attachmentsProcessed = 0
  let attachmentsFailed = 0

  const messageId: string | undefined = typeof body.message_id === 'string' ? body.message_id.trim() : undefined

  const hasOAuth = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN)

  if (messageId && hasOAuth) {
    const r = await processMessageAttachments(supabase, inserted.id, messageId)
    attachmentsProcessed = r.processed
    attachmentsFailed = r.failed
    if (r.errors.length > 0) {
      console.warn('[gmail-ingest] attachment errors:', r.errors)
    }
  } else if (messageId && !hasOAuth) {
    // Tylus skip — be OAuth Gmail API neveiks, paliekam attachmentsProcessed=0.
    // Foto vis tiek galima pridėt manualiai per /admin/inbox modal'ą.
    console.warn('[gmail-ingest] Gmail OAuth not configured — skipping attachment fetch')
  } else {
    // Fallback'as — base64 array iš worker'io
    const inlineAttachments: any[] = Array.isArray(body.attachments) ? body.attachments : []
    if (inlineAttachments.length > 0) {
      const cap = Math.min(inlineAttachments.length, MAX_ATTACHMENTS_PER_CANDIDATE)
      let firstImageUrl: string | null = null
      for (let i = 0; i < cap; i++) {
        const att = inlineAttachments[i]
        try {
          const filename: string = typeof att?.filename === 'string' ? att.filename : `attachment-${i}`
          const mimeType: string = typeof att?.mime_type === 'string' ? att.mime_type : ''
          const b64: string = typeof att?.base64 === 'string' ? att.base64 : ''
          if (!/^image\//i.test(mimeType) || !b64) continue
          const buf = Buffer.from(b64, 'base64')
          if (buf.length === 0 || buf.length > MAX_ATTACHMENT_BYTES) {
            attachmentsFailed++
            continue
          }
          const exif = await extractExifFromBuffer(buf, mimeType)
          const safeName = sanitizeFilename(filename)
          const storagePath = `gmail/${inserted.id}/${Date.now()}-${i}-${safeName}`
          const { error: uploadErr } = await supabase.storage
            .from(ATTACHMENTS_BUCKET)
            .upload(storagePath, buf, { contentType: mimeType, upsert: false })
          if (uploadErr) {
            attachmentsFailed++
            continue
          }
          const { data: pubData } = supabase.storage
            .from(ATTACHMENTS_BUCKET)
            .getPublicUrl(storagePath)
          const publicUrl = pubData.publicUrl
          const { error: imgInsErr } = await supabase
            .from('news_candidate_images')
            .insert({
              candidate_id: inserted.id,
              storage_path: storagePath,
              public_url: publicUrl,
              filename, mime_type: mimeType, file_size: buf.length,
              photographer: exif.photographer,
              copyright: exif.copyright,
              year_taken: exif.year_taken,
              caption_exif: exif.caption_exif,
              caption: exif.caption_exif,
              source: 'email_attachment',
              sort_order: i,
            })
          if (imgInsErr) { attachmentsFailed++; continue }
          attachmentsProcessed++
          if (!firstImageUrl) firstImageUrl = publicUrl
        } catch (e: any) {
          attachmentsFailed++
          console.warn(`[gmail-ingest] inline attachment ${i} error:`, e?.message || e)
        }
      }
      if (firstImageUrl) {
        await supabase
          .from('news_candidates')
          .update({ suggested_image_url: firstImageUrl })
          .eq('id', inserted.id)
      }
    }
  }

  // Mark candidate'as kaip patikrintas attachment'ų atžvilgiu (success or empty)
  // — apsaugo nuo re-process'inimo per backfill endpoint'ą.
  await supabase
    .from('news_candidates')
    .update({ attachments_checked_at: new Date().toISOString() })
    .eq('id', inserted.id)

  return NextResponse.json({
    candidate_id: inserted.id,
    status: 'pending',
    ai_category: ai.category,
    ai_confidence: ai.confidence,
    artist_matches: artistMatches.length,
    track_matches: trackMatches.length,
    attachments_processed: attachmentsProcessed,
    attachments_failed: attachmentsFailed,
  })
}
