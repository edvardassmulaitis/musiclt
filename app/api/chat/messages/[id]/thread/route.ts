// GET — root + visi atsakymai
// POST — naujas atsakymas thread'e (paprasčiausia: redirect'inam į pagrindinę
//        sendMessage logiką, bet su parent_message_id auto-set'inta).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchThread, sendMessage, resolveViewerId } from '@/lib/chat'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const messageId = Number(id)
  const session = await getServerSession(authOptions)
  const userId = await resolveViewerId(session)
  if (!userId) return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  try {
    const thread = await fetchThread(messageId, userId)
    return NextResponse.json(thread)
  } catch (e: any) {
    const code = e?.code === 'FORBIDDEN' ? 403 : 500
    return NextResponse.json({ error: e?.message }, { status: code })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parentId = Number(id)
  const session = await getServerSession(authOptions)
  const userId = await resolveViewerId(session)
  if (!userId) return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  if (typeof body.body !== 'string') return NextResponse.json({ error: 'body privalomas' }, { status: 400 })

  // Reikia conversation_id — gaunam iš parent.
  const { createAdminClient } = await import('@/lib/supabase')
  const sb = createAdminClient()
  const { data: parent } = await sb.from('chat_messages').select('conversation_id').eq('id', parentId).single()
  if (!parent) return NextResponse.json({ error: 'Parent message nerasta' }, { status: 404 })

  try {
    const message = await sendMessage({
      convId: parent.conversation_id,
      userId,
      body: body.body,
      parentMessageId: parentId,
    })
    return NextResponse.json({ message })
  } catch (e: any) {
    const code = e?.code === 'FORBIDDEN' ? 403 : 500
    return NextResponse.json({ error: e?.message }, { status: code })
  }
}
