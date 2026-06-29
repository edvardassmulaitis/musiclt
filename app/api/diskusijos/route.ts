import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { logActivity as logActivityShared } from '@/lib/activity-logger'

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

  // Diskusijų puslapis rodo TIK tikras diskusijas — ne news, events,
  // user_diary ir t.t. (legacy_kind='discussion' arba modern-created NULL).
  // News persikėlę į /naujienos, events — į /renginiai. Be šito filter'o
  // visi music.lt scraped news threads (legacy_kind='news') lįsdavo į
  // diskusijų sąrašą ir maišydavo realų pokalbio turinį.
  let query = supabase
    .from('discussions')
    .select('id, slug, title, body, user_id, author_name, author_avatar, tag, tags, is_pinned, is_locked, comment_count, like_count, view_count, last_comment_at, created_at, artist:artist_id(name, slug, cover_image_url)', { count: 'exact' })
    .eq('is_deleted', false)
    .or('legacy_kind.is.null,legacy_kind.eq.discussion')
    .range(offset, offset + limit - 1)

  // Kategorija saugoma `tag` (text) stulpelyje — backfill'inta heuristiškai
  // (legacy forum_id migracijoje prarastas). Senasis `tags` array filtras
  // visada grąžindavo tuščią, nes nei vienas įrašas neturi tags.
  if (tag && tag !== 'all') query = query.eq('tag', tag)
  if (sort === 'newest') query = query.order('is_pinned', { ascending: false }).order('created_at', { ascending: false })
  else if (sort === 'popular') query = query.order('is_pinned', { ascending: false }).order('like_count', { ascending: false })
  else query = query.order('is_pinned', { ascending: false }).order('last_comment_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // CDN edge cache — homepage'as kviečia /api/diskusijos kelis kartus per
  // load'ą (CommunityDiscussionsCard + CommunityUserPostsCard naudoja tą
  // patį response'ą). Be cache'o tai = 2 DB hit'ai per anonimą.
  return NextResponse.json({ discussions: data || [], total: count || 0 }, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      'CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      'Vercel-CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const body = await req.json()
  const { title, text, tags, tag } = body
  const category = (typeof tag === 'string' && tag.trim()) ? tag.trim() : 'Kita'

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
      tag: category,
      tags: (tags || []).slice(0, 5),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log activity per shared logger (event_type='thread_created' kad UI
  // grąžintų teisingą ikoną + tekstą).
  await logActivityShared({
    event_type: 'thread_created',
    user_id: session.user.id,
    actor_name: session.user.name || session.user.email || 'Vartotojas',
    actor_avatar: session.user.image || null,
    entity_type: 'discussion',
    entity_id: (data as any).id,
    entity_title: title.trim(),
    entity_url: `/diskusijos/${slug}`,
  })

  return NextResponse.json({ discussion: data })
}
