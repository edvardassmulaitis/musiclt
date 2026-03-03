import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { user_id, minutes, reason } = body

  const muteUntil = new Date(Date.now() + (minutes || 60) * 60000).toISOString()
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('shoutbox_mutes')
    .upsert({
      user_id,
      muted_by: session.user.id,
      muted_until: muteUntil,
      reason: reason || null,
    }, { onConflict: 'user_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, muted_until: muteUntil })
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('user_id')
  const supabase = createAdminClient()

  await supabase.from('shoutbox_mutes').delete().eq('user_id', userId!)
  return NextResponse.json({ ok: true })
}
