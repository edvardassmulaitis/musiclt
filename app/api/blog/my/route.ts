import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getBlogByUserId, updateBlog } from '@/lib/supabase-blog'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const blog = await getBlogByUserId(session.user.id)
  if (!blog) return NextResponse.json({ error: 'No blog' }, { status: 404 })
  return NextResponse.json(blog)
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const blog = await getBlogByUserId(session.user.id)
  if (!blog) return NextResponse.json({ error: 'No blog' }, { status: 404 })
  const body = await req.json()
  const allowed = ['title', 'description', 'cover_image_url', 'logo_url', 'theme']
  const updates: Record<string, any> = {}
  for (const k of allowed) if (body[k] !== undefined) updates[k] = body[k]
  try {
    await updateBlog(blog.id, updates)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
