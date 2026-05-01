// GET — paieška naujam DM/grupei. ?q=<text>&limit=12

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { searchUsers, resolveViewerId } from '@/lib/chat'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = await resolveViewerId(session)
  if (!userId) return NextResponse.json({ users: [] })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const limit = Number(searchParams.get('limit') || 12)

  try {
    const users = await searchUsers(q, userId, limit)
    return NextResponse.json({ users })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message, users: [] }, { status: 500 })
  }
}
