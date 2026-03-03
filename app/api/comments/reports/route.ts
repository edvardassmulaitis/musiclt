import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const body = await req.json()
  const { comment_id, reason, note } = body

  if (!['spam', 'offensive', 'misinformation', 'other'].includes(reason))
    return NextResponse.json({ error: 'Neteisinga priežastis' }, { status: 400 })

  const supabase = createAdminClient()

  const { error } = await supabase.from('comment_reports').insert({
    comment_id,
    user_id: session.user.id,
    reason,
    note: note || null,
  })

  if (error?.code === '23505')
    return NextResponse.json({ error: 'Jau pranešei apie šį komentarą' }, { status: 400 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Padidinti reported_count
  await supabase.rpc('increment_reported_count', { comment_id_arg: comment_id }).catch(() => {
    // Fallback jei funkcija neegzistuoja
    supabase.from('comments')
      .update({ reported_count: supabase.rpc('greatest', {}) })
      .eq('id', comment_id)
  })

  return NextResponse.json({ ok: true })
}
