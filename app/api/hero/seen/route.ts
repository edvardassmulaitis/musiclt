// app/api/hero/seen/route.ts
//
// Per-vartotoją „peržiūrėtų" hero kortelių sekimas — kad „neskaityta" oranžinis
// borderis būtų SURIŠTAS tarp įrenginių (mobile ↔ desktop), o ne tik localStorage
// per naršyklę. Raktas = slideKey (`${type}::${href}`), tas pat kaip kliente.
//
//   GET  → { keys: string[] }  — visi šio vartotojo peržiūrėti raktai (max 500).
//   POST → body { key } arba { keys: [] } — upsert'ina (idempotentiškai).
//
// Neprisijungusiems — grąžina tuščią / no-op (klientas naudoja localStorage).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { resolveAuthorId } from '@/lib/resolve-author'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ keys: [] }, { headers: { 'Cache-Control': 'private, no-store' } })
  const sb = createAdminClient()
  const userId = await resolveAuthorId(sb, session)
  if (!userId) return NextResponse.json({ keys: [] }, { headers: { 'Cache-Control': 'private, no-store' } })
  const { data } = await sb
    .from('hero_seen')
    .select('slide_key')
    .eq('user_id', userId)
    .order('seen_at', { ascending: false })
    .limit(500)
  return NextResponse.json(
    { keys: (data || []).map((r: any) => r.slide_key) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ ok: false })
  const sb = createAdminClient()
  const userId = await resolveAuthorId(sb, session)
  if (!userId) return NextResponse.json({ ok: false })

  let body: any = {}
  try { body = await req.json() } catch { /* tuščias */ }
  const clean = (k: any) => (typeof k === 'string' && k.length ? k.slice(0, 300) : null)
  const keys: string[] = Array.isArray(body?.keys)
    ? body.keys.map(clean).filter(Boolean).slice(0, 300)
    : [clean(body?.key)].filter(Boolean) as string[]
  if (!keys.length) return NextResponse.json({ ok: false })

  const rows = keys.map((slide_key) => ({ user_id: userId, slide_key }))
  const { error } = await sb.from('hero_seen').upsert(rows, { onConflict: 'user_id,slide_key', ignoreDuplicates: true })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
