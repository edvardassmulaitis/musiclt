import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPostComments, addComment } from '@/lib/supabase-blog'

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
    return NextResponse.json(comment)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
