// app/api/news/[id]/comments/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: comments } = await supabase
    .from('news_comments')
    .select('id, content, created_at, user_name, user_image')
    .eq('news_id', id)
    .order('created_at', { ascending: true })

  return NextResponse.json({ comments: comments || [] })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { content } = await req.json()
  if (!content?.trim() || content.trim().length > 2000) {
    return NextResponse.json({ error: 'Invalid content' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: comment, error } = await supabase
    .from('news_comments')
    .insert({
      news_id:    Number(id),
      user_id:    (session.user as any).id ?? session.user.email ?? null,
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
  _ctx: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { commentId } = await req.json()
  const supabase = createAdminClient()

  const isAdmin = ['admin', 'super_admin'].includes((session.user as any).role)
  const userId = (session.user as any).id ?? session.user.email ?? ''
  const query = supabase.from('news_comments').delete().eq('id', commentId)
  if (!isAdmin) await query.eq('user_id', userId)
  else await query

  return NextResponse.json({ ok: true })
}
