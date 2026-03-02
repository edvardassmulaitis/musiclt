// app/api/blog/route.ts — Create blog
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createBlog, isBlogSlugTaken, getBlogByUserId } from '@/lib/supabase-blog'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  const existing = await getBlogByUserId(session.user.id)
  if (existing) return NextResponse.json({ error: 'Jau turi blogą' }, { status: 400 })

  const { slug, title, description } = await req.json()
  if (!slug || !title) return NextResponse.json({ error: 'Trūksta pavadinimo arba slug' }, { status: 400 })

  const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40)
  if (cleanSlug.length < 3) return NextResponse.json({ error: 'Slug per trumpas (min 3 simboliai)' }, { status: 400 })

  if (await isBlogSlugTaken(cleanSlug)) return NextResponse.json({ error: 'Šis slug jau užimtas' }, { status: 400 })

  try {
    const blog = await createBlog(session.user.id, cleanSlug, title, description)
    return NextResponse.json(blog)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
