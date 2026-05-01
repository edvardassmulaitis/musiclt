// GET  — paginate'inta history (?before=<id>&limit=50)
// POST — siųsti naują žinutę  (body: { body: string, parent_message_id?: number })

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchMessages, sendMessage, resolveViewerId } from '@/lib/chat'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const convId = Number(id)
  const session = await getServerSession(authOptions)
  const userId = await resolveViewerId(session)
  if (!userId) return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const beforeId = searchParams.get('before') ? Number(searchParams.get('before')) : undefined
  const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined

  try {
    const messages = await fetchMessages({ convId, viewerId: userId, beforeId, limit })
    return NextResponse.json({ messages })
  } catch (e: any) {
    if (e?.code === 'FORBIDDEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const convId = Number(id)
  const session = await getServerSession(authOptions)
  const userId = await resolveViewerId(session)
  if (!userId) return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  if (!body || typeof body.body !== 'string') {
    return NextResponse.json({ error: 'body privalomas' }, { status: 400 })
  }

  try {
    const message = await sendMessage({
      convId,
      userId,
      body: body.body,
      parentMessageId: body.parent_message_id || null,
    })
    return NextResponse.json({ message })
  } catch (e: any) {
    if (e?.code === 'FORBIDDEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
