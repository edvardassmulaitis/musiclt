// app/api/threads/[legacy_id]/posts/route.ts
//
// Returns all posts for a forum_thread (legacy or modern). Used by the
// in-page slide-in DiscussionThreadModal on the artist profile, so the
// reader can scan the full thread without navigating to /diskusijos/tema/...
//
// Avatars: forum_posts seniai neturėjo avatar_url stulpelio, todėl avatarus
// užpildom iš `likes` lentelės (kur scrape'as pagavo avatar URL'us
// bendruomenės narių like'ams). Jei username'ą jau pamatėm su avatar — toks
// pat avatar'as ir komentaruose. Tai yra single SELECT su IN(usernames).

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

type Post = {
  legacy_id: number
  author_username: string | null
  author_avatar_url: string | null
  created_at: string | null
  content_text: string
  content_html: string | null
  parent_post_legacy_id: number | null
  like_count: number
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ legacy_id: string }> }
) {
  const { legacy_id } = await params
  const tid = parseInt(legacy_id)
  if (isNaN(tid)) {
    return NextResponse.json({ error: 'Invalid legacy_id' }, { status: 400 })
  }

  const sb = createAdminClient()

  // Thread metadata — kad modal'as galėtų rodyti title + post_count be
  // papildomos užklausos.
  const { data: threadRow } = await sb
    .from('forum_threads')
    .select('legacy_id, slug, title, post_count, kind')
    .eq('legacy_id', tid)
    .maybeSingle()

  if (!threadRow) {
    return NextResponse.json({ error: 'Not found', posts: [] }, { status: 404 })
  }

  // Visos žinutės — chronologiškai (seniausias viršuje, kaip įprastame
  // diskusijų UI'aje). Cap 500 — labai senose temose būna 600-800 postų.
  const { data: postRows } = await sb
    .from('forum_posts')
    .select('legacy_id, author_username, author_avatar_url, content_text, content_html, created_at, parent_post_legacy_id, like_count')
    .eq('thread_legacy_id', tid)
    .order('created_at', { ascending: true })
    .limit(500)

  const posts = (postRows || []) as any[]

  // Surenkam unikalius autorių username'us avatar lookup'ui.
  const usernames = Array.from(new Set(
    posts.map(p => p.author_username).filter((u): u is string => !!u)
  ))

  const avatars = new Map<string, string>()
  if (usernames.length > 0) {
    // Pirmiau bandom forum_posts.author_avatar_url (jei scrape'as jį užfiksavo);
    // fallback'as — likes lentelės denormalized user_avatar_url. Single SELECT
    // per turimą set'ą.
    for (const p of posts) {
      if (p.author_username && p.author_avatar_url && !avatars.has(p.author_username)) {
        avatars.set(p.author_username, p.author_avatar_url)
      }
    }
    const missing = usernames.filter(u => !avatars.has(u))
    if (missing.length > 0) {
      const { data: avatarRows } = await sb
        .from('likes')
        .select('user_username, user_avatar_url')
        .in('user_username', missing)
        .not('user_avatar_url', 'is', null)
        .limit(2000)
      for (const r of (avatarRows || []) as any[]) {
        if (r.user_username && r.user_avatar_url && !avatars.has(r.user_username)) {
          avatars.set(r.user_username, r.user_avatar_url)
        }
      }
    }
  }

  const out: Post[] = posts.map((p: any) => ({
    legacy_id: p.legacy_id,
    author_username: p.author_username || null,
    author_avatar_url: p.author_username ? (avatars.get(p.author_username) || null) : null,
    created_at: p.created_at || null,
    content_text: p.content_text || '',
    content_html: p.content_html || null,
    parent_post_legacy_id: p.parent_post_legacy_id || null,
    like_count: typeof p.like_count === 'number' ? p.like_count : 0,
  }))

  return NextResponse.json({
    thread: {
      legacy_id: threadRow.legacy_id,
      slug: threadRow.slug,
      title: threadRow.title,
      post_count: threadRow.post_count,
      kind: threadRow.kind,
    },
    posts: out,
  })
}
