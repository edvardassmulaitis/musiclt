/**
 * POST /api/tracks/[id]/page-view
 *
 * Inkrementuoja `tracks.page_view_count` atomic'iškai per RPC.
 * Vadinamas iš track puslapio (`/lt/daina/[slug]/[id]`) on mount.
 * Dedup'as — 30 min cookie, kad page reload'ai netaškytų counter'io.
 *
 * Auth: optional. Veikia ir anon vartotojams.
 *
 * Migracijos prereq: 20260506_page_view_tracking.sql
 *   (jei migracija dar neaplikuota, RPC kvietimas grąžins error,
 *    ir mes silently failinam'a — UI'ui matomas kaip 0)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

const DEDUP_WINDOW_MS = 30 * 60_000 // 30 min

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const trackId = Number(id)
  if (!Number.isFinite(trackId) || trackId <= 0) {
    return NextResponse.json({ error: 'Bad track id' }, { status: 400 })
  }

  // Dedup per cookie — kiekvienam track'ui atskiras short-lived cookie.
  // Jei naršyklė turi mūsų cookie tvarka — request'as šiame lange jau
  // count'ed, praleidžiam. Tai paprasčiau už server-side last_seen_at
  // lentelę ir veikia gerai per session.
  const cookieName = `tpv_${trackId}`
  const cookieHeader = req.headers.get('cookie') || ''
  const hasCookie = cookieHeader.split(/;\s*/).some(c => c.startsWith(cookieName + '='))

  if (hasCookie) {
    return NextResponse.json({ ok: true, skipped: 'dedup' })
  }

  const sb = createAdminClient()
  const { data, error } = await (sb as any).rpc('increment_track_page_view', { p_track_id: trackId })
  if (error) {
    // Migracija dar neaplikuota arba RPC neegzistuoja — silently OK.
    // UI vis tiek rodys 0 ir žmogus pamatys "—".
    console.warn('[track-page-view] RPC error:', error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
  }

  // Set cookie su 30 min TTL — daugiau view neskaitysim
  const res = NextResponse.json({ ok: true, count: data ?? null })
  res.cookies.set(cookieName, '1', {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: DEDUP_WINDOW_MS / 1000,
    path: '/',
  })
  return res
}
