import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !['admin', 'super_admin'].includes(session.user.role))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const entityType = searchParams.get('entity_type')
  const reported = searchParams.get('reported') === 'true'
  const deleted = searchParams.get('deleted') === 'true'
  const limit = parseInt(searchParams.get('limit') || '100')
  const offset = parseInt(searchParams.get('offset') || '0')

  const supabase = createAdminClient()

  let query = supabase
    .from('comments')
    .select('id, entity_type, entity_id, parent_id, depth, user_id, author_name, body, is_deleted, is_archived, reported_count, like_count, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (entityType) query = query.eq('entity_type', entityType)
  if (reported) query = query.gt('reported_count', 0).eq('is_deleted', false)
  else if (deleted) query = query.eq('is_deleted', true)
  else query = query.eq('is_deleted', false)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ comments: data || [], total: count || 0 })
}
