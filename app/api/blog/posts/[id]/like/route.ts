import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { togglePostLike } from '@/lib/supabase-blog'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const { id } = await params
  try {
    const liked = await togglePostLike(id, session.user.id)
    return NextResponse.json({ liked })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
