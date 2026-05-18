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

  // Suranda Gmail candidate'us, kurie dar neturi attachment'ų.
  // Pirma — pending status (active inbox). Senesni: archived/approved/rejected jau
  // status'as pakeistas, juos backfill'inti būtų futile.
  let q = supabase
    .from('news_candidates')
    .select('id, source_email_thread_id, status, ai_title')
    .eq('source_type', 'gmail')
    .eq('status', 'pending')
    .not('source_email_thread_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit * 3)  // pull more, then filter by image count

  if (onlyId) q = q.eq('id', onlyId)

  const { data: cands, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!cands || cands.length === 0) {
    return NextResponse.json({ message: 'No pending Gmail candidates', candidates_scanned: 0 })
  }

  // Filter — tik tie, kurie dar neturi news_candidate_images rows
  const candIds = cands.map(c => c.id)
  const { data: existing } = await supabase
    .from('news_candidate_images')
    .select('candidate_id')
    .in('candidate_id', candIds)
  const withImages = new Set((existing || []).map((r: any) => r.candidate_id))
  const toProcess = cands.filter(c => !withImages.has(c.id)).slice(0, limit)

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
      const messageIdsUsed: string[] = []
      for (const m of messages) {
        const r = await processMessageAttachments(supabase, cand.id, m.id)
        totalProcessed += r.processed
        totalFailed += r.failed
        if (r.processed > 0) messageIdsUsed.push(m.id)
        if (r.errors.length > 0) {
          entry.error = (entry.error ? entry.error + '; ' : '') + r.errors.join('; ').slice(0, 200)
        }
      }
      entry.message_id = messageIdsUsed[messageIdsUsed.length - 1] || messages[messages.length - 1].id
      entry.processed = totalProcessed
      entry.failed = totalFailed
      entry.attachments_found = totalProcessed + totalFailed
    } catch (e: any) {
      entry.error = e?.message || String(e)
    }
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
