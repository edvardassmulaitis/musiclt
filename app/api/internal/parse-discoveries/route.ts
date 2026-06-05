// app/api/internal/parse-discoveries/route.ts
//
// Batch: embed-less forumo komentarus (gija 47) klasifikuoja Haiku — ar tai
// muzikinis atradimas? Jei taip, sukuria discoveries įrašą (be embed'o, su
// atlikėju/daina iš teksto). Žurnalas discovery_parse_log saugo peržiūrėtus.
//
// Auth: Bearer INTERNAL_CRON_TOKEN arba admin sesija.
//   GET  → { remaining }
//   POST { batch?: number } → { processed, found, remaining, done }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { classifyDiscovery } from '@/lib/discovery-parse'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function authorize(req: NextRequest): Promise<NextResponse | null> {
  const expected = process.env.INTERNAL_CRON_TOKEN
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (expected && token && token === expected) return null
  const session = await getServerSession(authOptions)
  if (session?.user && ['admin', 'super_admin'].includes((session.user as any).role || '')) return null
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export async function GET(req: NextRequest) {
  const unauth = await authorize(req); if (unauth) return unauth
  const sb = createAdminClient()
  const { data } = await sb.rpc('discoveries_parse_remaining')
  return NextResponse.json({ remaining: data ?? null })
}

export async function POST(req: NextRequest) {
  const unauth = await authorize(req); if (unauth) return unauth
  const body = await req.json().catch(() => ({}))
  const batch = Math.max(1, Math.min(20, parseInt(String(body?.batch)) || 12))

  const sb = createAdminClient()
  const { data: rows, error } = await sb.rpc('discoveries_to_parse', { p_limit: batch })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const cands = (rows || []) as any[]

  let found = 0
  const sample: any[] = []
  for (const c of cands) {
    let parse
    try { parse = await classifyDiscovery(c.body) }
    catch { parse = { is_discovery: false, artist: null, track: null } }

    await sb.from('discovery_parse_log').upsert({ comment_id: c.id, is_discovery: parse.is_discovery }, { onConflict: 'comment_id' })

    if (parse.is_discovery && parse.artist) {
      const { error: insErr } = await sb.from('discoveries').insert({
        comment_id: c.id, legacy_msg_id: c.legacy_id, discussion_id: 47, thread_id: 128402,
        author_id: c.author_id, artist_name: parse.artist, track_name: parse.track,
        resolve_state: 'pending', source: 'forum', created_at: c.created_at,
      })
      if (!insErr) { found++; if (sample.length < 5) sample.push({ artist: parse.artist, track: parse.track }) }
    }
  }

  const { data: rem } = await sb.rpc('discoveries_parse_remaining')
  return NextResponse.json({ processed: cands.length, found, remaining: rem ?? null, done: cands.length === 0, sample })
}
