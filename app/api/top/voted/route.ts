import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getCurrentVoteWeekId } from '@/lib/top-week'

export const dynamic = 'force-dynamic'

/**
 * GET /api/top/voted?type=lt_top30|top40 — ar ŠIS vartotojas (pagal user_id arba
 * IP) jau balsavo einamojoj vote savaitėj tam tikrame tope. Naudojama hero feed'ui,
 * kad prabalsuoto topo kortelė pasislėptų PAGAL SERVERĮ (ne tik localStorage) —
 * tada ir incognito (tas pats IP) neatrodo „šviežias". (Edvardo spec 2026-07-24.)
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const topType = searchParams.get('type') || 'top40'
  const supabase = createAdminClient()
  const voteWeekId = await getCurrentVoteWeekId(supabase, topType)
  if (!voteWeekId) return NextResponse.json({ voted: false, count: 0 })

  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id || null
  let q = supabase.from('top_votes').select('id', { count: 'exact', head: true })
    .eq('week_id', voteWeekId).eq('vote_type', 'like')
  if (userId) {
    q = q.eq('user_id', userId)
  } else {
    const h = await headers()
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    q = q.eq('voter_ip', ip).is('user_id', null)
  }
  const { count } = await q
  return NextResponse.json({ voted: (count || 0) > 0, count: count || 0 })
}
