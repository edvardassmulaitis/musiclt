import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { togglePostLike } from '@/lib/supabase-blog'
import { createAdminClient } from '@/lib/supabase'
import { notifyFromSession } from '@/lib/notifications'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const { id } = await params
  try {
    const liked = await togglePostLike(id, session.user.id)

    // ── Notification: tik kai naujas like (ne unlike). Pranešam autoriui. ──
    if (liked) {
      try {
        const sb = createAdminClient()
        const { data: post } = await sb
          .from('blog_posts')
          .select('id, slug, title, blogs:blog_id(user_id, slug, profiles:user_id(email))')
          .eq('id', id)
          .maybeSingle() as { data: any }
        const recipientId = post?.blogs?.user_id
        const recipientEmail = post?.blogs?.profiles?.email || null
        if (recipientId && recipientId !== session.user.id) {
          const blogSlug = post?.blogs?.slug
          const postSlug = post?.slug
          const url = blogSlug && postSlug ? `/blogas/${blogSlug}/${postSlug}` : '/blogas'
          await notifyFromSession({
            recipientUserId: recipientId,
            recipientEmail,
            actorSession: session,
            type: 'blog_like',
            entity_type: 'blog',
            entity_id: typeof post?.id === 'number' ? post.id : null,
            url,
            title: `Tavo įrašui „${post?.title || ''}" patiko`,
            snippet: post?.title || null,
            data: { post_title: post?.title || null },
          })
        }
      } catch (e: any) {
        console.error('[notifications] blog_like failed:', e?.message || e)
      }
    }

    return NextResponse.json({ liked })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
