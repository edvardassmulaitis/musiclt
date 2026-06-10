/**
 * POST /api/internal/gmail-poll — Gmail inbox polling cron endpoint.
 *
 * Kviečiamas iš GitHub Actions cron'o (2x/d). Tikrina Gmail inbox'ą už
 * naujus unread laiškus, filtruoja sender'iui pagal blocklist'ą, ekstraktina
 * tekstą ir POST'ina į /api/internal/gmail-ingest (kuris paleidžia visą
 * AI pipeline'ą).
 *
 * Pavadinime 'poll' nereiškia continuous polling — vienas batch per call'ą.
 *
 * Auth: Bearer INTERNAL_CRON_TOKEN.
 *
 * Setup reqs (žr. docs/GMAIL_SETUP.md):
 *   - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN env vars
 *   - Gmail label 'music-press-imported' (auto-sukuriama jei nėra)
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  listUnreadMessages,
  getMessage,
  applyLabelAndRead,
  ensureLabel,
  type GmailMessage,
} from '@/lib/gmail-client'

export const runtime = 'nodejs'
export const maxDuration = 60

const PROCESSED_LABEL = 'music-press-imported'
const MAX_MESSAGES_PER_RUN = 10

// Sender'ių blocklist'as — automated, newsletter'iai, ne press releases
const SENDER_BLOCKLIST = [
  /noreply@/i,
  /no-reply@/i,
  /donotreply@/i,
  /@accounts\.google\.com/i,
  /@google\.com$/i,
  /@facebook(?:mail)?\.com/i,
  /@instagram\.com/i,
  /@spotify\.com/i,
  /@apple\.com/i,
  /security@/i,
  /support@/i,
  /notification@/i,
  /newsletter@/i,
  /\bunsubscribe\b/i, // not exact but tipiškai newsletter'iai
]

function isBlockedSender(from: string): boolean {
  if (!from) return true
  return SENDER_BLOCKLIST.some(re => re.test(from))
}

type RunCounters = {
  fetched: number
  skipped_blocked: number
  posted: number
  rejected_by_ingest: number
  errors: number
  error_details: string[]
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  const expected = process.env.INTERNAL_CRON_TOKEN
  if (!expected) return NextResponse.json({ error: 'INTERNAL_CRON_TOKEN not configured' }, { status: 503 })
  if (!token || token !== expected) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const counters: RunCounters = {
    fetched: 0,
    skipped_blocked: 0,
    posted: 0,
    rejected_by_ingest: 0,
    errors: 0,
    error_details: [],
  }

  let labelId: string | null = null
  try {
    labelId = await ensureLabel(PROCESSED_LABEL)
  } catch (e: any) {
    return NextResponse.json({
      error: `Gmail label setup failed: ${e.message}`,
      help: 'Patikrink GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN env vars',
    }, { status: 503 })
  }

  let messages
  try {
    // Filter Gmail-side: ne tik unread, bet ir not yet labeled (kad cron'as
    // nekartotų to paties laiško, jei kažkas pamiršo ar fail'ino labeling)
    const query = `is:unread in:inbox -label:${PROCESSED_LABEL}`
    messages = await listUnreadMessages(MAX_MESSAGES_PER_RUN, query)
  } catch (e: any) {
    return NextResponse.json({ error: `Gmail list failed: ${e.message}` }, { status: 500 })
  }

  counters.fetched = messages.length

  // Base URL — Vercel deploy URL arba production
  const baseUrl = process.env.MUSICLT_BASE_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL || 'musiclt.vercel.app'}`
    : 'https://musiclt.vercel.app'

  for (const meta of messages) {
    let msg: GmailMessage
    try {
      msg = await getMessage(meta.id)
    } catch (e: any) {
      counters.errors++
      counters.error_details.push(`getMessage ${meta.id}: ${e.message}`)
      continue
    }

    // Sender filter
    if (isBlockedSender(msg.from)) {
      counters.skipped_blocked++
      try {
        // Mark as read + label kad ateityje nepasitaikytų
        await applyLabelAndRead(msg.id, labelId)
      } catch {}
      continue
    }

    // Trumpas body — skip
    if (!msg.body || msg.body.length < 100) {
      counters.skipped_blocked++
      try { await applyLabelAndRead(msg.id, labelId) } catch {}
      continue
    }

    // POST į ingest endpoint'ą
    try {
      const res = await fetch(`${baseUrl}/api/internal/gmail-ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.INTERNAL_CRON_TOKEN}`,
        },
        body: JSON.stringify({
          thread_id: msg.threadId,
          // 2026-06-11 KRITINIS FIX: message_id anksčiau NEBUVO siunčiamas,
          // todėl gmail-ingest niekada nepasiekdavo .docx attachment kelio
          // (press release dokumentas) ir naudodavo tik subject+body.
          message_id: msg.id,
          from: msg.from,
          subject: msg.subject,
          raw_body: msg.body.slice(0, 20_000),
          received_at: msg.receivedAt || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        counters.errors++
        counters.error_details.push(`ingest ${meta.id} HTTP ${res.status}: ${data.error || 'unknown'}`)
        continue
      }
      if (data.status === 'rejected') {
        counters.rejected_by_ingest++
      } else {
        counters.posted++
      }
      // Apply label + mark read NEPRIKLAUSOMAI nuo accepted/rejected — kad
      // kitas cron'as nebenuskaitytų to paties laiško
      try {
        await applyLabelAndRead(msg.id, labelId)
      } catch (e: any) {
        counters.error_details.push(`label apply ${meta.id}: ${e.message}`)
      }
    } catch (e: any) {
      counters.errors++
      counters.error_details.push(`fetch ingest ${meta.id}: ${e.message}`)
    }
  }

  return NextResponse.json({
    ok: true,
    summary: counters,
  })
}
