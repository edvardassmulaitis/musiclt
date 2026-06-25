// app/api/admin/nav-settings/route.ts
//
// Admin (full) — top-nav punktų matomumo skaitymas + įrašymas.
// GET  → visi 6 valdomi punktai su visibility + allowlist.
// POST → upsert vieno punkto { key, visibility, allowlist }.

import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { requireFullAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase'
import {
  getNavSettings,
  MANAGEABLE_NAV_KEYS,
  NAV_SETTINGS_TAG,
  normIdentity,
  type NavVisibility,
} from '@/lib/nav-settings'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await requireFullAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  const settings = await getNavSettings()
  return NextResponse.json({ settings })
}

export async function POST(req: Request) {
  const session = await requireFullAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const body = await req.json().catch(() => ({} as any))
  const key = String(body?.key || '')
  if (!MANAGEABLE_NAV_KEYS.includes(key)) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 400 })
  }

  const visibility = String(body?.visibility || 'public') as NavVisibility
  if (!['public', 'hidden', 'restricted'].includes(visibility)) {
    return NextResponse.json({ error: 'Invalid visibility' }, { status: 400 })
  }

  const allowlist: string[] = Array.isArray(body?.allowlist)
    ? Array.from(
        new Set(
          (body.allowlist as any[])
            .map(s => normIdentity(String(s)))
            .filter(Boolean),
        ),
      ).slice(0, 200)
    : []

  const sb = createAdminClient()
  const { error } = await sb
    .from('nav_settings')
    .upsert(
      { key, visibility, allowlist, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidateTag(NAV_SETTINGS_TAG)
  return NextResponse.json({ ok: true })
}
