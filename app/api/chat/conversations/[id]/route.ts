// GET   — vienas pokalbis su dalyvių sąrašu
// PATCH — pervadinti grupę / pakeisti topic / photo_url (admin only, body: { name?, topic?, photo_url? })
// DELETE — palikti pokalbį (soft leave)

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getConversation, renameGroup, leaveConversation, resolveViewerId } from '@/lib/chat'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const convId = Number(id)
  const session = await getServerSession(authOptions)
  const userId = await resolveViewerId(session)
  if (!userId) return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  try {
    const conv = await getConversation(convId, userId)
    return NextResponse.json(conv)
  } catch (e: any) {
    if (e?.code === 'FORBIDDEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const convId = Number(id)
  const session = await getServerSession(authOptions)
  const userId = await resolveViewerId(session)
  if (!userId) return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  try {
    await renameGroup(convId, userId, {
      name: body.name,
      topic: body.topic,
      photo_url: body.photo_url,
    })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    const code = e?.code === 'FORBIDDEN' ? 403 : e?.code === 'BAD_REQUEST' ? 400 : 500
    return NextResponse.json({ error: e?.message }, { status: code })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const convId = Number(id)
  const session = await getServerSession(authOptions)
  const userId = await resolveViewerId(session)
  if (!userId) return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  try {
    await leaveConversation(convId, userId)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
