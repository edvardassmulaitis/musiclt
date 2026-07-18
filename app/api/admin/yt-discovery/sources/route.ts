/**
 * /api/admin/yt-discovery/sources — redaguojamas YouTube playlist'ų sąrašas
 * (discovery šaltiniai). Po dangčiu — scout_sources WHERE category='yt_discovery'.
 *
 * GET    → sąrašas
 * POST   { url, name? }   → pridėti playlist'ą (feed_url=url, parser_key=yt_disc_<id>)
 * PATCH  { id, is_active } → įjungti/išjungti
 * DELETE ?id=             → pašalinti
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export const runtime = 'nodejs'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user as any).role || '')) return null
  return session
}

function playlistId(s: string): string | null {
  if (!s) return null
  const m = s.match(/[?&]list=([\w-]+)/)
  if (m) return m[1]
  if (/^(PL|OLAK|RD|UU|FL|LL)[\w-]{5,}$/.test(s.trim())) return s.trim()
  return null
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('scout_sources')
    .select('id, name, feed_url, is_active, last_fetched_at, last_error')
    .eq('category', 'yt_discovery')
    .order('id', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sources: data || [] })
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const url = String(body.url || '').trim()
  const pid = playlistId(url)
  if (!pid) return NextResponse.json({ error: 'Nurodyk YouTube playlist nuorodą (su ?list=...) arba ID' }, { status: 400 })
  const name = String(body.name || '').trim() || `YouTube playlist ${pid.slice(0, 10)}`

  const sb = createAdminClient()
  const { data, error } = await sb.from('scout_sources').insert({
    name,
    category: 'yt_discovery',
    feed_url: url,
    parser_key: `yt_disc_${pid}`,
    is_active: true,
    fetch_interval_min: 10080, // ~1 sav.
    notes: 'Kuruotas playlist (Data API, be 15 ribos). Punktas A discovery.',
  }).select('id, name, feed_url, is_active').maybeSingle()

  if (error) {
    if (String(error.message).includes('duplicate')) return NextResponse.json({ error: 'Toks playlist jau pridėtas' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, source: data })
}

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const id = Number(body.id)
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const sb = createAdminClient()
  const { error } = await sb.from('scout_sources').update({ is_active: !!body.is_active }).eq('id', id).eq('category', 'yt_discovery')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = Number(new URL(req.url).searchParams.get('id'))
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const sb = createAdminClient()
  const { error } = await sb.from('scout_sources').delete().eq('id', id).eq('category', 'yt_discovery')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
