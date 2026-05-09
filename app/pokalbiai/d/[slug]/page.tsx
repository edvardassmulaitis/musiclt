// /pokalbiai/d/[slug] — diskusija rodoma kaip chat'as. Komentarai = žinutės.
// Composer'is post'ina į /api/comments (entity_type=discussion).

import { redirect, notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { listMyConversations, resolveViewerId } from '@/lib/chat'
import { createAdminClient } from '@/lib/supabase'
import { DiscussionChatLayout } from '@/components/chat/DiscussionChatLayout'

export const dynamic = 'force-dynamic'

export default async function PokalbisDiscussionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const session = await getServerSession(authOptions)
  const userId = await resolveViewerId(session)
  if (!userId) redirect(`/auth/signin?callbackUrl=/pokalbiai/d/${slug}`)

  const sb = createAdminClient()

  // Diskusijos info.
  const { data: discussion, error: dErr } = await sb
    .from('discussions')
    .select('id, slug, title, body, user_id, author_name, author_avatar, tags, is_pinned, is_locked, comment_count, like_count, view_count, last_comment_at, created_at')
    .eq('slug', slug)
    .eq('is_deleted', false)
    .single()
  if (dErr || !discussion) notFound()

  // Komentarai — su author profile join (tas pats SELECT kaip /api/comments).
  const { data: comments } = await sb
    .from('comments')
    .select('id, parent_id, author_id, body, like_count, is_deleted, created_at, updated_at, profiles:author_id(username, full_name, avatar_url, email)')
    .eq('discussion_id', discussion.id)
    .order('created_at', { ascending: true })
    .limit(200)

  // Sidebar feed (DM/grupės) — kad išliktų sidebar lygiai kaip /pokalbiai page'e.
  let conversations: any[] = []
  try {
    conversations = await listMyConversations(userId)
  } catch (e: any) {
    if (!/relation .* does not exist|chat_user_conversations/i.test(e?.message || '')) throw e
  }

  return (
    <DiscussionChatLayout
      viewerId={userId}
      initialConversations={conversations}
      discussion={discussion as any}
      initialComments={(comments || []) as any}
    />
  )
}
