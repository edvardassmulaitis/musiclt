import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') || '50')
  const since = searchParams.get('since')
  const supabase = createAdminClient()

  let query = supabase
    .from('activity_events')
    .select('id, event_type, user_id, actor_name, actor_avatar, entity_type, entity_id, entity_title, entity_url, metadata, created_at')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (since) query = query.gt('created_at', since)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ events: data || [] })
}
