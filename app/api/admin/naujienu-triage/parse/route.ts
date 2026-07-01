import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'
import { parseReviewAuthor } from '@/lib/parse-review-author'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/admin/naujienu-triage/parse
//
// Body (visi neprivalomi):
//   { ids?: number[], reparse?: boolean }
//
// Praeina per RECENZIJA discussions, parsina autorių iš body byline'o
// (lib/parse-review-author.ts) ir upsert'ina news_review_triage eilutes.
// Jei parsintas author_key jau yra review_author_map atmintyje — iškart
// priskiria narį (status='linked').
//
// APSAUGA: NEperrašo rankiniu būdu tvarkytų eilučių — status 'converted',
// 'dismissed' ir 'linked' (rankinis) paliekamos ramybėje, nebent reparse=true
// (net tada 'converted'/'dismissed' saugomos).
export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  let body: any = {}
  try { body = await req.json() } catch { /* tuščias body ok */ }
  const explicitIds: number[] | null = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean) : null
  const reparse = !!body.reparse

  const sb = createAdminClient()
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const actorId = String((session.user as any)?.id || '')
  const updatedBy = uuidRe.test(actorId) ? actorId : null

  // 1. Recenzijų kūnai (su body — reikalingi parsinimui).
  let query = sb
    .from('discussions')
    .select('id, title, body')
    .eq('is_legacy', true)
    .eq('legacy_kind', 'news')
    .ilike('title', '%recenzij%')
    .limit(2000)
  if (explicitIds && explicitIds.length) query = query.in('id', explicitIds)
  const { data: reviews, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows = reviews || []
  const ids = rows.map((r) => r.id)
  if (!ids.length) return NextResponse.json({ parsed: 0, with_author: 0, linked_from_memory: 0, skipped_locked: 0 })

  // 2. Esamos triage būsenos — kad neperrašytume rankinio darbo.
  const existing = new Map<number, string>()
  {
    const { data } = await sb.from('news_review_triage').select('discussion_id, status').in('discussion_id', ids)
    for (const t of data || []) existing.set(t.discussion_id, t.status)
  }
  const LOCKED = new Set(['converted', 'dismissed'])
  // 'linked' laikom užrakinta tik jei NE reparse (nenorim nutrinti rankinio susiejimo).

  // 3. Autorių susiejimo atmintis (author_key → profile_id).
  const memory = new Map<string, string>()
  {
    const { data } = await sb.from('review_author_map').select('author_key, profile_id')
    for (const m of data || []) if (m.author_key && m.profile_id) memory.set(m.author_key, m.profile_id)
  }

  // 4. Parsinam ir renkam upsert eilutes.
  const now = new Date().toISOString()
  const upserts: any[] = []
  let withAuthor = 0
  let linkedFromMemory = 0
  let skippedLocked = 0

  for (const r of rows) {
    const cur = existing.get(r.id)
    if (cur && (LOCKED.has(cur) || (cur === 'linked' && !reparse))) { skippedLocked++; continue }

    const parsed = parseReviewAuthor(r.body, r.title)
    const memProfile = parsed.key ? memory.get(parsed.key) : undefined
    if (parsed.name) withAuthor++

    const row: any = {
      discussion_id: r.id,
      author_raw: parsed.name,
      author_key: parsed.key,
      parse_method: parsed.method,
      parse_conf: parsed.confidence || null,
      parsed_at: now,
      updated_at: now,
      updated_by: updatedBy,
    }
    if (memProfile) {
      row.author_profile_id = memProfile
      row.status = 'linked'
      linkedFromMemory++
    } else {
      row.author_profile_id = null
      row.status = 'pending'
    }
    upserts.push(row)
  }

  // 5. Upsert paketais.
  let parsed = 0
  for (let i = 0; i < upserts.length; i += 200) {
    const chunk = upserts.slice(i, i + 200)
    const { error: upErr } = await sb.from('news_review_triage').upsert(chunk, { onConflict: 'discussion_id' })
    if (upErr) return NextResponse.json({ error: upErr.message, parsed }, { status: 500 })
    parsed += chunk.length
  }

  return NextResponse.json({ parsed, with_author: withAuthor, linked_from_memory: linkedFromMemory, skipped_locked: skippedLocked })
}
