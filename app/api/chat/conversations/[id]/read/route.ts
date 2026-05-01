// POST — pažymėti pokalbį kaip skaitytą (atnaujina last_read_at = now)

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { markRead, resolveViewerId } from '@/lib/chat'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const convId = Number(id)
  const session = await getServerSession(authOptions)
  const userId = await resolveViewerId(session)
  if (!userId) return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  try {
    await markRead(convId, userId)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
