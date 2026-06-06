// app/api/follow/route.ts
//
// „Sekti" (follow) API.
//   GET  ?target=<profileId>  → { following: bool, count: number }
//   POST { target: profileId } → toggle; grąžina { following, count }
//
// Auth per next-auth (session.user.id = profiles.id). Rašymas per service
// role (createAdminClient), nes user_follows RLS leidžia tik public read.
// Resilient: jei migracija dar neaplikuota (table missing), grąžina count=0
// be 500, kad UI nesugriūtų.

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function followCount(sb: any, target: string): Promise<number> {
  const { count } = await sb
    .from('user_follows')
    .select('id', { count: 'exact', head: true })
    .eq('following_id', target)
  return count || 0
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const target = url.searchParams.get('target')
  if (!target) return NextResponse.json({ error: 'target required' }, { status: 400 })

  const session = await getServerSession(authOptions)
  const userId = session?.user?.id ?? null
  const sb = createAdminClient()

  try {
    const count = await followCount(sb, target)
    let following = false
    if (userId && userId !== target) {
      const { data } = await sb
        .from('user_follows')
        .select('id')
        .eq('follower_id', userId)
        .eq('following_id', target)
        .maybeSingle()
      following = !!data
    }
    return NextResponse.json({ following, count })
  } catch {
    return NextResponse.json({ following: false, count: 0 })
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id ?? null
  if (!userId) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const target: string | undefined = body?.target
  if (!target) return NextResponse.json({ error: 'target required' }, { status: 400 })
  if (target === userId) {
    return NextResponse.json({ error: 'cannot_follow_self' }, { status: 400 })
  }

  const sb = createAdminClient()

  try {
    const { data: existing } = await sb
      .from('user_follows')
      .select('id')
      .eq('follower_id', userId)
      .eq('following_id', target)
      .maybeSingle()

    let following: boolean
    if (existing) {
      await sb.from('user_follows').delete().eq('id', existing.id)
      following = false
    } else {
      await sb.from('user_follows').insert({ follower_id: userId, following_id: target })
      following = true
    }

    const count = await followCount(sb, target)
    return NextResponse.json({ following, count })
  } catch (e) {
    console.error('[follow] POST error', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
