import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') || '50')
  const since = searchParams.get('since')
  const supabase = createAdminClient()

  // entity_image — snapshot artist/album/track cover URL'as. Pre-migration
  // deploy'uose šios column'os dar nėra → fallback'inam be jos.
  async function fetchWith(includeImage: boolean) {
    const cols = includeImage
      ? 'id, event_type, user_id, actor_name, actor_avatar, entity_type, entity_id, entity_title, entity_url, entity_image, metadata, created_at'
      : 'id, event_type, user_id, actor_name, actor_avatar, entity_type, entity_id, entity_title, entity_url, metadata, created_at'
    let q = supabase
      .from('activity_events')
      .select(cols)
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (since) q = q.gt('created_at', since)
    return await q
  }

  let { data, error } = await fetchWith(true)
  if (error && /entity_image/.test(error.message || '')) {
    const fb = await fetchWith(false)
    data = fb.data
    error = fb.error
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ events: data || [] })
}
