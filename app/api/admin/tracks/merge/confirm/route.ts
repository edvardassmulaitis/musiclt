/**
 * POST /api/admin/tracks/merge/confirm
 *
 * Executes the merge atomically via the merge_tracks() Postgres RPC.
 *
 * Body:
 *   {
 *     winner_id: number,
 *     loser_id: number,
 *     field_choices: { [field]: 'winner' | 'loser' },
 *     confirm: true   // required safety gate — client must explicitly confirm
 *   }
 *
 * Side effects:
 *   - Loser row is hard-deleted.
 *   - Winner row gets chosen field values.
 *   - Winner inherits loser's album links and featuring artists (unioned).
 *   - Loser's main artist is added to winner's featuring if not already there.
 *   - A row is written to track_merges with a full JSON snapshot for revert.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ALLOWED_FIELDS = new Set([
  'title', 'type', 'is_single',
  'release_date', 'release_year', 'release_month', 'release_day',
  'video_url', 'spotify_id', 'lyrics', 'chords', 'cover_url', 'description',
])

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const winnerId = Number(body.winner_id)
  const loserId  = Number(body.loser_id)
  const rawChoices: Record<string, string> = body.field_choices || {}
  const confirm = body.confirm === true

  if (!winnerId || !loserId) return NextResponse.json({ error: 'winner_id and loser_id required' }, { status: 400 })
  if (winnerId === loserId)   return NextResponse.json({ error: 'winner and loser must differ' }, { status: 400 })
  if (!confirm)               return NextResponse.json({ error: 'confirm flag required — merge is irreversible without admin re-invoke' }, { status: 400 })

  // Sanitize field_choices — only keep known fields, only accept 'winner' | 'loser'.
  const fieldChoices: Record<string, 'winner' | 'loser'> = {}
  for (const [k, v] of Object.entries(rawChoices)) {
    if (!ALLOWED_FIELDS.has(k)) continue
    if (v === 'winner' || v === 'loser') fieldChoices[k] = v
  }

  // session.user.id may or may not be a UUID depending on auth config. If it
  // looks like a UUID, pass it; otherwise pass null (merged_by is nullable).
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const mergedBy = uuidRe.test(String(session.user.id || '')) ? String(session.user.id) : null

  const { data, error } = await supabase.rpc('merge_tracks', {
    p_winner_id:     winnerId,
    p_loser_id:      loserId,
    p_field_choices: fieldChoices,
    p_merged_by:     mergedBy,
  })

  if (error) {
    return NextResponse.json({ error: error.message || 'Merge failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, result: data })
}
