/**
 * POST /api/albums/[id]/page-view — toks pat kaip /api/tracks/[id]/page-view,
 * tik albumams. Žr. komentarą tame faile.
 *
 * Migracija: 20260506b_album_artist_page_views.sql
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { rateLimit, clientIp } from '@/lib/rate-limit'

const DEDUP_WINDOW_MS = 30 * 60_000

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const albumId = Number(id)
  if (!Number.isFinite(albumId) || albumId <= 0) {
    return NextResponse.json({ error: 'Bad album id' }, { status: 400 })
  }

  const cookieName = `apv_${albumId}`
  const cookieHeader = req.headers.get('cookie') || ''
  const hasCookie = cookieHeader.split(/;\s*/).some(c => c.startsWith(cookieName + '='))
  if (hasCookie) return NextResponse.json({ ok: true, skipped: 'dedup' })

  // ANTI-CHEAT: serverio pusės dedup pagal IP (cookie numetimas nebeapeina).
  // 1 skaičiavimas / IP / albumas / 30 min.
  if (!(await rateLimit(`apv:${clientIp(req)}:${albumId}`, 1, 1800))) {
    return NextResponse.json({ ok: true, skipped: 'dedup-ip' })
  }

  const sb = createAdminClient()
  const { data, error } = await (sb as any).rpc('increment_album_page_view', { p_album_id: albumId })
  if (error) {
    console.warn('[album-page-view] RPC error:', error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
  }

  const res = NextResponse.json({ ok: true, count: data ?? null })
  res.cookies.set(cookieName, '1', { httpOnly: true, sameSite: 'lax', maxAge: DEDUP_WINDOW_MS / 1000, path: '/' })
  return res
}
