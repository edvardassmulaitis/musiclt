// PATCH  — redaguoti žinutę (autorius only). body: { body: string }
// DELETE — soft delete (autorius only)

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { editMessage, deleteMessage } from '@/lib/chat'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const messageId = Number(id)
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id
  if (!userId) return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  if (typeof body.body !== 'string') return NextResponse.json({ error: 'body privalomas' }, { status: 400 })

  try {
    const message = await editMessage(messageId, userId, body.body)
    return NextResponse.json({ message })
  } catch (e: any) {
    const code = e?.code === 'FORBIDDEN' ? 403 : 500
    return NextResponse.json({ error: e?.message }, { status: code })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const messageId = Number(id)
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id
  if (!userId) return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  try {
    await deleteMessage(messageId, userId)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    const code = e?.code === 'FORBIDDEN' ? 403 : 500
    return NextResponse.json({ error: e?.message }, { status: code })
  }
}
