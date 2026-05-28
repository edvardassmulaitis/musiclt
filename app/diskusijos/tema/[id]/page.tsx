// Legacy URL: /diskusijos/tema/{legacy_id} arba /diskusijos/tema/{legacy_id}/{slug}
//
// Eiga:
// 1. Bandom rasti modern `discussions` (jau migruotoms temoms) — redirect'inam į /diskusijos/{slug}.
// 2. Jei nerandam — fallback: paimam iš `forum_threads` + `forum_posts` (legacy
//    music.lt scrape duomenys, dar ne migruoti į discussions). Renderinam pilną
//    ThreadPageClient su likes, post likers, avatar'ais.
import { notFound, redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import ThreadPageClient from './thread-page-client'
import type { LikeUser } from '@/components/LikesModal'

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function LegacyThreadPage({ params, searchParams }: Props) {
  const { id } = await params
  const sp = await searchParams
  const legacyId = Number(id)
  if (!Number.isFinite(legacyId) || legacyId <= 0) notFound()

  const sb = createAdminClient()

  // 1. Try modern discussions table first
  const { data: modernDisc } = await sb
    .from('discussions')
    .select('slug')
    .eq('legacy_id', legacyId)
    .eq('is_deleted', false)
    .maybeSingle()
  const modernSlug = (modernDisc as { slug?: string } | null)?.slug
  if (modernSlug) {
    redirect(`/diskusijos/${modernSlug}`)
  }

  // 2. Fallback — legacy forum_threads + forum_posts
  const { data: thread } = await sb
    .from('forum_threads')
    .select('legacy_id, slug, source_url, kind, title, post_count, pagination_count, first_post_at, last_post_at, like_count, artist_id')
    .eq('legacy_id', legacyId)
    .maybeSingle()
  if (!thread) notFound()

  const sortParam = String(sp.sort || 'oldest')

  // Posts — order'inam pagal sort (default oldest first chronologically)
  let postsQuery = sb
    .from('forum_posts')
    .select('legacy_id, page_number, author_username, author_numeric_id, author_avatar_url, created_at, content_html, content_text, like_count, parent_post_legacy_id, music_attachments')
    .eq('thread_legacy_id', legacyId)
    .eq('is_deleted', false)
  if (sortParam === 'top') {
    postsQuery = postsQuery.order('like_count', { ascending: false, nullsFirst: false })
  } else if (sortParam === 'newest') {
    postsQuery = postsQuery.order('created_at', { ascending: false, nullsFirst: false })
  } else {
    postsQuery = postsQuery.order('created_at', { ascending: true, nullsFirst: true })
  }
  const { data: postsData } = await postsQuery.limit(2000)
  const posts = (postsData || []) as any[]

  // Avatars per username — paimam tiek iš user_ghosts, tiek iš pačių post'ų author_avatar_url
  const usernames = Array.from(new Set(
    posts.map((p) => p.author_username).filter((u: string | null): u is string => !!u)
  ))
  const avatars: Record<string, string> = {}
  // Pirma — author_avatar_url tiesiogiai iš forum_posts
  for (const p of posts) {
    if (p.author_username && p.author_avatar_url && !avatars[p.author_username]) {
      avatars[p.author_username] = p.author_avatar_url
    }
  }
  // Likę — iš user_ghosts (jei lentelė egzistuoja) arba likes
  if (usernames.length > 0) {
    const missing = usernames.filter((u: string) => !avatars[u])
    if (missing.length > 0) {
      // Po 2026-05-28c slim-down: avatar_url dabar iš profiles, ne iš likes
      const { data: avatarRows } = await sb
        .from('profiles')
        .select('username, avatar_url')
        .in('username', missing)
        .not('avatar_url', 'is', null)
        .limit(missing.length * 2)
      for (const r of (avatarRows || []) as any[]) {
        if (r.username && r.avatar_url && !avatars[r.username]) {
          avatars[r.username] = r.avatar_url
        }
      }
    }
  }

  // Post likers — iš `likes` lentelės su entity_type='forum_post'.
  // Po slim-down: profiles JOIN per user_id (avatar_url, rank).
  const postLikers: Record<number, LikeUser[]> = {}
  const postIdsWithLikes = posts.filter((p) => (p.like_count ?? 0) > 0).map((p) => p.legacy_id)
  if (postIdsWithLikes.length > 0) {
    const { data: likers } = await sb
      .from('likes')
      .select('entity_legacy_id, user_username, profiles:user_id(avatar_url, rank)')
      .eq('entity_type', 'forum_post')
      .in('entity_legacy_id', postIdsWithLikes)
      .limit(5000)
    for (const l of (likers || []) as any[]) {
      const pid = l.entity_legacy_id
      if (!postLikers[pid]) postLikers[pid] = []
      postLikers[pid].push({
        user_username: l.user_username || '',
        user_rank: l.profiles?.rank || null,
        user_avatar_url: l.profiles?.avatar_url || null,
      })
    }
  }

  // Thread likers — entity_type='thread' (jei migruota) arba pasiliekam tuščią
  // (legacy forum_threads neturi attached likers iš naujos sistemos)
  const threadLikers: LikeUser[] = []

  // Artist link — jei thread.artist_id užpildytas, surenkam pagrindinę info
  let artist: any = null
  if (thread.artist_id) {
    const { data: a } = await sb
      .from('artists')
      .select('id, slug, name, cover_image_url, cover_image_wide_url, legacy_id')
      .eq('id', thread.artist_id)
      .maybeSingle()
    artist = a
  }

  const session = await getServerSession(authOptions)
  const isAdmin = !!session?.user && ['admin', 'super_admin'].includes(session.user.role || '')
  const currentUser = session?.user
    ? {
        email: session.user.email || null,
        name: session.user.name || null,
        image: (session.user as any).image || null,
      }
    : null

  return (
    <ThreadPageClient
      thread={thread as any}
      posts={posts as any}
      avatars={avatars}
      attachmentSlugs={{}}
      artist={artist as any}
      threadLikers={threadLikers}
      postLikers={postLikers}
      isAdmin={isAdmin}
      currentUser={currentUser}
      sortParam={sortParam}
    />
  )
}
