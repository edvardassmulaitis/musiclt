// app/api/news/[slug]/comments/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const supabase = createAdminClient()

  // Get news id from slug
  const { data: news } = await supabase
    .from('news')
    .select('id')
    .eq('slug', slug)
    .single()

  if (!news) return NextResponse.json({ comments: [] })

  const { data: comments } = await supabase
    .from('news_comments')
    .select('id, content, created_at, user_name, user_image')
    .eq('news_id', news.id)
    .order('created_at', { ascending: true })

  return NextResponse.json({ comments: comments || [] })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { content } = await req.json()
  if (!content?.trim() || content.trim().length > 2000) {
    return NextResponse.json({ error: 'Invalid content' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: news } = await supabase
    .from('news')
    .select('id')
    .eq('slug', slug)
    .single()

  if (!news) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: comment, error } = await supabase
    .from('news_comments')
    .insert({
      news_id:    news.id,
      user_id:    session.user.id ?? null,
      user_name:  session.user.name  || 'Vartotojas',
      user_image: session.user.image || null,
      content:    content.trim(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ comment })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { commentId } = await req.json()
  const supabase = createAdminClient()

  // Only allow deleting own comment (or admin)
  const isAdmin = ['admin', 'super_admin'].includes((session.user as any).role)
  const filter = supabase.from('news_comments').delete().eq('id', commentId)
  if (!isAdmin) filter.eq('user_id', session.user.id ?? '')

  await filter
  return NextResponse.json({ ok: true })
}
