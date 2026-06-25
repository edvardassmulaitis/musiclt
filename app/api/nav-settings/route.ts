// app/api/nav-settings/route.ts
//
// Viešas endpoint'as — grąžina, kuriuos top-nav punktus PASLĖPTI ESAMAM
// vartotojui (pagal sesiją). Allowlist'ai NEnutekinami klientui — paslėpimas
// apskaičiuojamas serveryje. Filtruoja SiteHeader.
//
// no-store: rezultatas priklauso nuo vartotojo (restricted punktai).

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { hiddenKeysFor, type NavSettingRow } from '@/lib/nav-settings'

export const dynamic = 'force-dynamic'

export async function GET() {
  const sb = createAdminClient()
  const { data } = await sb.from('nav_settings').select('key, visibility, allowlist')
  const rows = ((data as any[]) || []) as NavSettingRow[]

  // Greitas kelias: jei viskas public — net sesijos netikrinam.
  if (!rows.some(r => r.visibility !== 'public')) {
    return NextResponse.json({ hidden: [] }, { headers: { 'Cache-Control': 'private, no-store' } })
  }

  const session = await getServerSession(authOptions)
  const email = session?.user?.email || null
  const uid = (session?.user as any)?.id as string | undefined

  let username: string | null = null
  if (uid && rows.some(r => r.visibility === 'restricted')) {
    const { data: prof } = await sb.from('profiles').select('username').eq('id', uid).maybeSingle()
    username = (prof as any)?.username || null
  }

  const hidden = hiddenKeysFor(rows, { email, username })
  return NextResponse.json({ hidden }, { headers: { 'Cache-Control': 'private, no-store' } })
}
