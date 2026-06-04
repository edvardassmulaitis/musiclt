// app/api/skelbimai/[id]/save/route.ts
//
// POST — toggle „Įsiminti". Grąžina { saved: boolean }.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { resolveAuthorId } from '@/lib/resolve-author'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const session = await getServerSession(authOptions)
  const sb = createAdminClient()
  const userId = await resolveAuthorId(sb, session)
  if (!userId) return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  try {
    const { data: existing } = await sb.from('listing_saves')
      .select('listing_id').eq('listing_id', id).eq('user_id', userId).maybeSingle()

    if (existing) {
      const { error } = await sb.from('listing_saves').delete()
        .eq('listing_id', id).eq('user_id', userId)
      if (error) throw error
      return NextResponse.json({ saved: false })
    } else {
      const { error } = await sb.from('listing_saves').insert({ listing_id: id, user_id: userId })
      if (error) throw error
      return NextResponse.json({ saved: true })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
