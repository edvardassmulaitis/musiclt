// POST — toggle reakciją. body: { emoji: string }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { toggleReaction, resolveViewerId } from '@/lib/chat'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const messageId = Number(id)
  const session = await getServerSession(authOptions)
  const userId = await resolveViewerId(session)
  if (!userId) return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  if (typeof body.emoji !== 'string') return NextResponse.json({ error: 'emoji privalomas' }, { status: 400 })

  try {
    const result = await toggleReaction(messageId, userId, body.emoji)
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
