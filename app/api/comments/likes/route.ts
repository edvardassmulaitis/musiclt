import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { headers } from 'next/headers'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const body = await req.json()
  const { comment_id, fingerprint } = body

  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const userId = session?.user?.id ?? null
  const weight = userId ? 2 : 1

  const supabase = createAdminClient()

  // Patikrinti ar jau patiko
  if (userId) {
    const { data: existing } = await supabase
      .from('comment_likes')
      .select('id')
      .eq('comment_id', comment_id)
      .eq('user_id', userId)
      .maybeSingle()

    if (existing) {
      // Toggle off
      await supabase.from('comment_likes').delete().eq('id', existing.id)
      return NextResponse.json({ liked: false })
    }
  } else {
    const { data: existing } = await supabase
      .from('comment_likes')
      .select('id')
      .eq('comment_id', comment_id)
      .eq('voter_ip', ip)
      .maybeSingle()

    if (existing) return NextResponse.json({ error: 'Jau patiko' }, { status: 400 })
  }

  const { error } = await supabase.from('comment_likes').insert({
    comment_id,
    user_id: userId,
    voter_ip: ip,
    voter_fingerprint: fingerprint || null,
    weight,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ liked: true, weight })
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  const { searchParams } = new URL(req.url)
  const commentIds = searchParams.get('ids')?.split(',').map(Number) || []
  if (!commentIds.length) return NextResponse.json({ liked_ids: [] })

  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const userId = session?.user?.id ?? null
  const supabase = createAdminClient()

  const { data } = userId
    ? await supabase.from('comment_likes').select('comment_id').eq('user_id', userId).in('comment_id', commentIds)
    : await supabase.from('comment_likes').select('comment_id').eq('voter_ip', ip).in('comment_id', commentIds)

  return NextResponse.json({ liked_ids: (data || []).map(l => l.comment_id) })
}
