// POST   — pridėti narius (admin only). body: { user_ids: string[] }
// DELETE — pašalinti vieną narį (admin only). ?user_id=<uuid>

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { addParticipants, removeParticipant } from '@/lib/chat'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const convId = Number(id)
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id
  if (!userId) return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const userIds: string[] = Array.isArray(body.user_ids) ? body.user_ids.filter((x: any) => typeof x === 'string') : []
  if (userIds.length === 0) return NextResponse.json({ error: 'user_ids privalomas' }, { status: 400 })

  try {
    await addParticipants(convId, userId, userIds)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    const code = e?.code === 'FORBIDDEN' ? 403 : e?.code === 'BAD_REQUEST' ? 400 : 500
    return NextResponse.json({ error: e?.message }, { status: code })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const convId = Number(id)
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id
  if (!userId) return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const targetId = searchParams.get('user_id')
  if (!targetId) return NextResponse.json({ error: 'user_id privalomas' }, { status: 400 })

  try {
    await removeParticipant(convId, userId, targetId)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    const code = e?.code === 'FORBIDDEN' ? 403 : e?.code === 'BAD_REQUEST' ? 400 : 500
    return NextResponse.json({ error: e?.message }, { status: code })
  }
}
