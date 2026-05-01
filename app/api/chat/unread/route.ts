// GET — nav badge total unread count.
// Defensive: jei migracija dar neaplikuota, grąžina 0 (nesiunčia 500).

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { totalUnread, resolveViewerId } from '@/lib/chat'

function isMissingTable(msg: string | null | undefined) {
  return !!msg && /relation .* does not exist|chat_total_unread|chat_user_conversations/i.test(msg)
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const userId = await resolveViewerId(session)
  if (!userId) return NextResponse.json({ unread: 0, authenticated: false })

  try {
    const unread = await totalUnread(userId)
    return NextResponse.json({ unread, authenticated: true })
  } catch (e: any) {
    if (isMissingTable(e?.message)) return NextResponse.json({ unread: 0, authenticated: true })
    return NextResponse.json({ error: e?.message, unread: 0 }, { status: 500 })
  }
}
