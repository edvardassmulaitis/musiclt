// app/api/chat/conversations/route.ts
//
// GET  — list mano pokalbiai (sidebar feed su unread + dalyviais)
// POST — sukurti naują:
//        body: { type: 'dm', user_id: string }
//        body: { type: 'group', name?, topic?, member_ids: string[] }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { listMyConversations, getOrCreateDM, createGroup } from '@/lib/chat'

function isMissingTable(msg: string | null | undefined) {
  return !!msg && /relation .* does not exist|chat_user_conversations/i.test(msg)
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id
  if (!userId) return NextResponse.json({ conversations: [], authenticated: false })

  try {
    const conversations = await listMyConversations(userId)
    return NextResponse.json({ conversations, authenticated: true })
  } catch (e: any) {
    if (isMissingTable(e?.message)) {
      return NextResponse.json({ conversations: [], authenticated: true })
    }
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id
  if (!userId) return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  try {
    if (body.type === 'dm') {
      if (!body.user_id || typeof body.user_id !== 'string') {
        return NextResponse.json({ error: 'user_id būtinas' }, { status: 400 })
      }
      const id = await getOrCreateDM(userId, body.user_id)
      return NextResponse.json({ id })
    }

    if (body.type === 'group') {
      const memberIds: string[] = Array.isArray(body.member_ids) ? body.member_ids.filter((x: any) => typeof x === 'string') : []
      if (memberIds.length === 0) {
        return NextResponse.json({ error: 'Pridėk bent vieną narį' }, { status: 400 })
      }
      const id = await createGroup({
        creatorId: userId,
        name: body.name || null,
        topic: body.topic || null,
        memberIds,
      })
      return NextResponse.json({ id })
    }

    return NextResponse.json({ error: 'Nežinomas type' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
