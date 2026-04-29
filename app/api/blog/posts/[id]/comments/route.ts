import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPostComments, addComment } from '@/lib/supabase-blog'
import { createAdminClient } from '@/lib/supabase'
import { notifyFromSession } from '@/lib/notifications'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const comments = await getPostComments(id)
    return NextResponse.json(comments)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Prisijunk, kad galėtum komentuoti' }, { status: 401 })
  const { id } = await params
  const { content } = await req.json()
  if (!content?.trim()) return NextResponse.json({ error: 'Tuščias komentaras' }, { status: 400 })
  try {
    const comment = await addComment(id, session.user.id, content.trim())

    // ── Notification: pranešam blog post autoriui ────────────────────
    try {
      const sb = createAdminClient()
      const { data: post } = await sb
        .from('blog_posts')
        .select('id, slug, title, blogs:blog_id(user_id, slug)')
        .eq('id', id)
        .maybeSingle() as { data: any }
      const recipientId = post?.blogs?.user_id
      if (recipientId && recipientId !== session.user.id) {
        const blogSlug = post?.blogs?.slug
        const postSlug = post?.slug
        const url = blogSlug && postSlug ? `/blogas/${blogSlug}/${postSlug}` : '/blogas'
        await notifyFromSession({
          recipientUserId: recipientId,
          actorSession: session,
          type: 'blog_comment',
          entity_type: 'blog',
          entity_id: typeof post?.id === 'number' ? post.id : null,
          url,
          title: `Naujas komentaras prie „${post?.title || 'tavo įrašo'}"`,
          snippet: content.trim().slice(0, 200),
          data: { post_title: post?.title || null },
        })
      }
    } catch (e: any) {
      console.error('[notifications] blog_comment failed:', e?.message || e)
    }

    return NextResponse.json(comment)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
