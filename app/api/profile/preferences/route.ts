// app/api/profile/preferences/route.ts
// GET  → { hide_from_homepage: boolean }
// PATCH → { hide_from_homepage: boolean } → 200

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sb = createAdminClient()
  const { data } = await sb.from('profiles').select('hide_from_homepage').eq('id', session.user.id).maybeSingle()
  return NextResponse.json({ hide_from_homepage: (data as any)?.hide_from_homepage ?? false })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const hide = !!body.hide_from_homepage
  const sb = createAdminClient()
  const { error } = await sb.from('profiles').update({ hide_from_homepage: hide }).eq('id', session.user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, hide_from_homepage: hide })
}
