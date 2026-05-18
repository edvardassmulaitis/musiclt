/**
 * POST /api/admin/news-candidates/backfill-gmail-attachments
 *
 * Reprocess'ina esamus Gmail-source candidate'us, kurie buvo ingest'inti su
 * senu endpoint'u kuris attachment'us ignoravo. Fetch'ina latest message thread'e
 * per Gmail API, extract'ina image attachments + EXIF, upload'ina į Supabase
 * Storage ir įdeda į news_candidate_images.
 *
 * Body (optional):
 *   { limit?: number (default 10, max 25), candidate_id?: number (only this one) }
 *
 * Vercel function timeout = 60s, todėl batch'inam (kiekvienas candidate'as
 * ~2-5s su Gmail API + EXIF + upload). Pakartotinai paleidi kol grąžinas
 * processed=0.
 *
 * Skipina candidate'us, kurie jau turi news_candidate_images rows
 * (idempotent — saugu paleist daug kartų).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { getThread } from '@/lib/gmail-client'
import { processMessageAttachments } from '@/lib/gmail-attachments'

export const runtime = 'nodejs'
export const maxDuration = 60

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user.role as string) || '')) return null
  return session
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const limit = Math.max(1, Math.min(25, typeof body.limit === 'number' ? body.limit : 10))
  const onlyId: number | undefined = typeof body.candidate_id === 'number' ? body.candidate_id : undefined

  const supabase = createAdminClient()

  // Suranda Gmail candidate'us, kurie dar nepatikrinti.
  // Filter:
  //   - pending status (aktyvioj inbox queue)
  //   - source_type='gmail'
  //   - source_email_thread_id NOT NULL
  //   - attachments_checked_at IS NULL (nepatikrintas → reikia bandyti)
  // Manual override: jei onlyId pateikta, ignorinam checked_at filter'į
  // (force re-check tam vienam).
  let q = supabase
    .from('news_candidates')
    .select('id, source_email_thread_id, status, ai_title')
    .eq('source_type', 'gmail')
    .eq('status', 'pending')
    .not('source_email_thread_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (onlyId) {
    q = q.eq('id', onlyId)
  } else {
    q = q.is('attachments_checked_at', null)
  }

  const { data: cands, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!cands || cands.length === 0) {
    return NextResponse.json({ message: 'No pending Gmail candidates needing backfill', candidates_scanned: 0, candidates_processed: 0, processed: 0, failed: 0, candidates_with_images: 0 })
  }

  const toProcess = cands

  const results: Array<{
    candidate_id: number
    title: string
    thread_id: string
    message_id: string | null
    processed: number
    failed: number
    attachments_found: number   // image attachments aptiktų Gmail API'aj prieš filtravimą
    error?: string
  }> = []

  for (const cand of toProcess) {
    const tid = cand.source_email_thread_id as string
    const entry: any = {
      candidate_id: cand.id,
      title: cand.ai_title || '(no title)',
      thread_id: tid,
      message_id: null,
      processed: 0,
      failed: 0,
      attachments_found: 0,
    }
    try {
      const thread = await getThread(tid)
      const messages = thread.messages || []
      if (messages.length === 0) {
        entry.error = 'Empty thread'
        results.push(entry)
        continue
      }
      // Iteruojam VISUS thread message'us — kartais press release'ai turi
      // attachment'us pirmame message'e, ne paskutiniame (ypač jei buvo
      // forward'inta / reply'inta su atskirais attachment'ais).
      let totalProcessed = 0
      let totalFailed = 0
      let totalRaw = 0
      let totalImage = 0
      let totalSizePassed = 0
      const allDetails: any[] = []
      const messageIdsUsed: string[] = []
      for (const m of messages) {
        const r = await processMessageAttachments(supabase, cand.id, m.id)
        totalProcessed += r.processed
        totalFailed += r.failed
        totalRaw += r.raw_count
        totalImage += r.image_count
        totalSizePassed += r.size_passed
        allDetails.push(...r.details.map(d => ({ ...d, message_id: m.id })))
        if (r.processed > 0) messageIdsUsed.push(m.id)
        if (r.errors.length > 0) {
          entry.error = (entry.error ? entry.error + '; ' : '') + r.errors.join('; ').slice(0, 200)
        }
      }
      entry.message_id = messageIdsUsed[messageIdsUsed.length - 1] || messages[messages.length - 1].id
      entry.processed = totalProcessed
      entry.failed = totalFailed
      entry.attachments_found = totalProcessed + totalFailed
      entry.raw_count = totalRaw
      entry.image_count = totalImage
      entry.size_passed = totalSizePassed
      entry.details = allDetails.slice(0, 20)  // cap kad response nebūtų milžiniškas
    } catch (e: any) {
      entry.error = e?.message || String(e)
    }

    // Pažymim attachments_checked_at NOW() nepriklausomai nuo rezultato
    // (success or empty). Tai apsaugo nuo re-process'inimo — Gmail API quota'os
    // ir prevent'ina infinite-loop iteracijas.
    await supabase
      .from('news_candidates')
      .update({ attachments_checked_at: new Date().toISOString() })
      .eq('id', cand.id)

    results.push(entry)
  }

  const totals = results.reduce(
    (acc, r) => ({
      processed: acc.processed + r.processed,
      failed: acc.failed + r.failed,
      candidates_with_images: acc.candidates_with_images + (r.processed > 0 ? 1 : 0),
    }),
    { processed: 0, failed: 0, candidates_with_images: 0 },
  )

  return NextResponse.json({
    candidates_scanned: cands.length,
    candidates_processed: results.length,
    ...totals,
    results,
  })
}
