import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import ThreadPageClient from './thread-page-client'

type Props = {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ sort?: string }>
}

type ThreadRow = {
  legacy_id: number
  slug: string | null
  source_url: string | null
  kind: string | null
  title: string | null
  post_count: number | null
  pagination_count: number | null
  first_post_at: string | null
  last_post_at: string | null
  like_count: number | null
  artist_id: number | null
}

type PostRow = {
  legacy_id: number
  page_number: number | null
  author_username: string | null
  author_numeric_id: number | null
  author_avatar_url: string | null
  created_at: string | null
  content_html: string | null
  content_text: string | null
  like_count: number | null
  parent_post_legacy_id: number | null
}

type ArtistLink = {
  id: number
  slug: string
  name: string
  cover_image_url: string | null
  cover_image_wide_url: string | null
  legacy_id: number | null
}

/** Strip accents & normalize to URL-safe lowercase slug. */
function toSlug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/„|"|"|'|'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

async function getThread(legacyId: number): Promise<ThreadRow | null> {
  const sb = createAdminClient()
  const { data } = await sb
    .from('forum_threads')
    .select(
      'legacy_id,slug,source_url,kind,title,post_count,pagination_count,first_post_at,last_post_at,like_count,artist_id',
    )
    .eq('legacy_id', legacyId)
    .maybeSingle()
  return (data as ThreadRow | null) ?? null
}

async function getArtist(id: number): Promise<ArtistLink | null> {
  const sb = createAdminClient()
  const { data } = await sb
    .from('artists')
    .select('id,slug,name,cover_image_url,cover_image_wide_url,legacy_id')
    .eq('id', id)
    .maybeSingle()
  return (data as ArtistLink | null) ?? null
}

type ThreadLikeUser = { user_username: string; user_rank?: string | null; user_avatar_url?: string | null }

async function getThreadLikers(threadLegacyId: number): Promise<ThreadLikeUser[]> {
  const sb = createAdminClient()
  const { data } = await sb
    .from('legacy_likes')
    .select('user_username,user_rank,user_avatar_url')
    .eq('entity_type', 'thread')
    .eq('entity_legacy_id', threadLegacyId)
  return (data as ThreadLikeUser[] | null) ?? []
}

async function getPosts(threadLegacyId: number): Promise<PostRow[]> {
  const sb = createAdminClient()
  const { data } = await sb
    .from('forum_posts')
    .select(
      'legacy_id,page_number,author_username,author_numeric_id,author_avatar_url,created_at,content_html,content_text,like_count,parent_post_legacy_id',
    )
    .eq('thread_legacy_id', threadLegacyId)
    .order('created_at', { ascending: true })
  return (data as PostRow[] | null) ?? []
}

/** All likers keyed by post legacy_id, for modal on each comment. */
async function getPostLikers(postLegacyIds: number[]): Promise<Record<number, import('@/components/LikesModal').LikeUser[]>> {
  if (postLegacyIds.length === 0) return {}
  const sb = createAdminClient()
  const { data } = await sb
    .from('legacy_likes')
    .select('entity_legacy_id,user_username,user_rank,user_avatar_url')
    .eq('entity_type', 'post')
    .in('entity_legacy_id', postLegacyIds)
  const out: Record<number, import('@/components/LikesModal').LikeUser[]> = {}
  for (const row of (data as Array<{ entity_legacy_id: number; user_username: string; user_rank: string | null; user_avatar_url: string | null }> | null) ?? []) {
    if (!out[row.entity_legacy_id]) out[row.entity_legacy_id] = []
    out[row.entity_legacy_id].push({
      user_username: row.user_username,
      user_rank: row.user_rank,
      user_avatar_url: row.user_avatar_url,
    })
  }
  return out
}

async function getGhostAvatars(usernames: string[]): Promise<Record<string, string>> {
  if (usernames.length === 0) return {}
  const sb = createAdminClient()
  const { data } = await sb
    .from('user_ghosts')
    .select('username,avatar_url')
    .in('username', usernames)
  const out: Record<string, string> = {}
  for (const row of (data as Array<{ username: string; avatar_url: string | null }> | null) ?? []) {
    if (row.avatar_url) out[row.username] = row.avatar_url
  }
  return out
}

/** Match legacy music attachment IDs to real tables → return slug map. */
async function resolveAttachments(
  attachmentIds: { type: 'daina' | 'albumas' | 'grupe'; legacy_id: number }[],
): Promise<Record<string, { slug: string; id: number }>> {
  const sb = createAdminClient()
  const byType: Record<string, number[]> = { daina: [], albumas: [], grupe: [] }
  for (const a of attachmentIds) {
    if (byType[a.type]) byType[a.type].push(a.legacy_id)
  }
  const out: Record<string, { slug: string; id: number }> = {}
  if (byType.daina.length) {
    const { data } = await sb
      .from('tracks')
      .select('id,slug,legacy_id')
      .in('legacy_id', byType.daina)
    for (const r of (data as Array<{ id: number; slug: string; legacy_id: number }> | null) ?? []) {
      out[`daina:${r.legacy_id}`] = { slug: r.slug, id: r.id }
    }
  }
  if (byType.albumas.length) {
    const { data } = await sb
      .from('albums')
      .select('id,slug,legacy_id')
      .in('legacy_id', byType.albumas)
    for (const r of (data as Array<{ id: number; slug: string; legacy_id: number }> | null) ?? []) {
      out[`albumas:${r.legacy_id}`] = { slug: r.slug, id: r.id }
    }
  }
  if (byType.grupe.length) {
    const { data } = await sb
      .from('artists')
      .select('id,slug,legacy_id')
      .in('legacy_id', byType.grupe)
    for (const r of (data as Array<{ id: number; slug: string; legacy_id: number }> | null) ?? []) {
      out[`grupe:${r.legacy_id}`] = { slug: r.slug, id: r.id }
    }
  }
  return out
}

export default async function LegacyDiscussionPage({ params, searchParams }: Props) {
  const { id } = await params
  const sp = searchParams ? await searchParams : {}

  // /diskusijos/tema/<numeric>  →  canonical redirect /diskusijos/tema/<numeric>/<slug>
  const legacyId = parseInt(id)
  if (!legacyId) notFound()
  const thread = await getThread(legacyId)
  if (!thread) notFound()

  const displayTitle = thread.title || (thread.slug || '').replace(/\/$/, '').replace(/-/g, ' ')
  const slugSeg = toSlug(displayTitle)
  if (slugSeg) {
    const canonical = `/diskusijos/tema/${legacyId}/${slugSeg}`
    redirect(canonical + (sp.sort ? `?sort=${sp.sort}` : ''))
  }

  // Fallback (slug can't be derived) — render without redirect
  return renderThread(thread, sp.sort)
}

export async function renderThread(thread: ThreadRow, sortParam?: string) {
  const posts = await getPosts(thread.legacy_id)
  const usernames = Array.from(
    new Set(posts.map((p) => p.author_username).filter(Boolean)),
  ) as string[]
  const avatars = await getGhostAvatars(usernames)

  // Parse attachments from every post to resolve in bulk
  const allAttachments: { type: 'daina' | 'albumas' | 'grupe'; legacy_id: number }[] = []
  for (const p of posts) {
    const items = extractAttachmentItems(p.content_html ?? '')
    for (const a of items) allAttachments.push({ type: a.type, legacy_id: a.legacy_id })
  }
  const attachmentSlugs = await resolveAttachments(allAttachments)

  const artist = thread.artist_id ? await getArtist(thread.artist_id) : null
  const threadLikers = await getThreadLikers(thread.legacy_id)
  const postLikers = await getPostLikers(posts.map((p) => p.legacy_id))
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  const isAdmin = role === 'admin' || role === 'super_admin'

  return (
    <ThreadPageClient
      thread={thread}
      posts={posts}
      avatars={avatars}
      attachmentSlugs={attachmentSlugs}
      artist={artist}
      threadLikers={threadLikers}
      postLikers={postLikers}
      isAdmin={isAdmin}
      currentUser={
        session?.user
          ? {
              email: session.user.email ?? null,
              name: session.user.name ?? null,
              image: session.user.image ?? null,
            }
          : null
      }
      sortParam={sortParam ?? 'desc'}
    />
  )
}

/** Parse attachment JSON markers out of content_html. Shared with client. */
export function extractAttachmentItems(html: string) {
  if (!html) return []
  const match = html.match(/<div class="music-attachments" data-items='([^']*)'><\/div>/)
  if (!match) return []
  try {
    return JSON.parse(match[1].replace(/&apos;/g, "'")) as Array<{
      type: 'daina' | 'albumas' | 'grupe'
      legacy_id: number
      title: string | null
      artist: string | null
      image_url: string | null
      fav_count: number | null
    }>
  } catch {
    return []
  }
}
