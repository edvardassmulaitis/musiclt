// app/api/blog/posts/route.ts — List + Create posts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getBlogByUserId, createPost, getAllUserPosts } from '@/lib/supabase-blog'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const posts = await getAllUserPosts(session.user.id)
    return NextResponse.json(posts)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  const blog = await getBlogByUserId(session.user.id)
  if (!blog) return NextResponse.json({ error: 'Pirma sukurk blogą' }, { status: 400 })

  const body = await req.json()
  const { title, content, summary, cover_image_url, status: postStatus } = body
  if (!title) return NextResponse.json({ error: 'Trūksta pavadinimo' }, { status: 400 })

  const slug = title.toLowerCase()
    .replace(/[ąčęėįšųūž]/g, (c: string) => ({ 'ą': 'a', 'č': 'c', 'ę': 'e', 'ė': 'e', 'į': 'i', 'š': 's', 'ų': 'u', 'ū': 'u', 'ž': 'z' }[c] || c))
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)

  try {
    const post = await createPost(blog.id, session.user.id, {
      title, slug, content, summary, cover_image_url,
      status: postStatus || 'draft',
      published_at: postStatus === 'published' ? new Date().toISOString() : undefined,
    })
    return NextResponse.json(post)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
