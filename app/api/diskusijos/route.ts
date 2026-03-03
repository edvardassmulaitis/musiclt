import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[aceeisUuz]/g, c => ({a:'a',c:'c',e:'e',e2:'e',i:'i',s:'s',u:'u',u2:'u',z:'z'}[c] || c))
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
}

async function logActivity(supabase: any, session: any, entityId: number, title: string, slug: string) {
  try {
    await supabase.from('activity_events').insert({
      event_type: 'discussion_post',
      user_id: session.user.id,
      actor_name: session.user.name || session.user.email || 'Vartotojas',
      actor_avatar: session.user.image || null,
      entity_type: 'discussion',
      entity_id: entityId,
      entity_title: title,
      entity_url: `/diskusijos/${slug}`,
      is_public: true,
    })
  } catch (e) {}
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const sort = searchParams.get('sort') || 'activity'
  const tag = searchParams.get('tag')
  const limit = parseInt(searchParams.get('limit') || '20')
  const offset = parseInt(searchParams.get('offset') || '0')
  const supabase = createAdminClient()

  let query = supabase
    .from('discussions')
    .select('id, slug, title, body, user_id, author_name, author_avatar, tags, is_pinned, is_locked, comment_count, like_count, view_count, last_comment_at, created_at', { count: 'exact' })
    .eq('is_deleted', false)
    .range(offset, offset + limit - 1)

  if (tag) query = query.contains('tags', [tag])
  if (sort === 'newest') query = query.order('is_pinned', { ascending: false }).order('created_at', { ascending: false })
  else if (sort === 'popular') query = query.order('is_pinned', { ascending: false }).order('like_count', { ascending: false })
  else query = query.order('is_pinned', { ascending: false }).order('last_comment_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ discussions: data || [], total: count || 0 })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const body = await req.json()
  const { title, text, tags } = body

  if (!title?.trim() || title.trim().length < 5)
    return NextResponse.json({ error: 'Pavadinimas per trumpas' }, { status: 400 })
  if (!text?.trim() || text.trim().length < 10)
    return NextResponse.json({ error: 'Turinys per trumpas' }, { status: 400 })

  const supabase = createAdminClient()
  const baseSlug = slugify(title.trim())
  let slug = baseSlug
  let counter = 0
  while (true) {
    const { data: exists } = await supabase
      .from('discussions').select('id').eq('slug', slug).maybeSingle()
    if (!exists) break
    counter++
    slug = `${baseSlug}-${counter}`
  }

  const { data, error } = await supabase
    .from('discussions')
    .insert({
      slug,
      title: title.trim(),
      body: text.trim(),
      user_id: session.user.id,
      author_name: session.user.name || session.user.email || 'Vartotojas',
      author_avatar: session.user.image || null,
      tags: (tags || []).slice(0, 5),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log activity
  await logActivity(supabase, session, (data as any).id, title.trim(), slug)

  return NextResponse.json({ discussion: data })
}
