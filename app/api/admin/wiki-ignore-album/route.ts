import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

// POST /api/admin/wiki-ignore-album — pridėti Wiki-only album'ą į ignore list.
// DELETE /api/admin/wiki-ignore-album — atšaukti.
// GET /api/admin/wiki-ignore-album?artist_id=N — gauti visus paslėptus
// (Wiki Discography Import modal kelia ant init'o, kad filtruotų suggestion'us).
//
// Body (POST): { artist_id, wiki_title, reason? }
// Body (DELETE): { artist_id, wiki_title }
//
// Migration 20260515h reikalauja wiki_ignored_albums table'o. Jei migracija
// neaplikuota — endpoint'as grąžina 412 su migration_pending=true, frontend
// gali parodyti vartotojui kad reikia paleisti migraciją.

async function checkAuth() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin','super_admin'].includes(session.user.role || '')) {
    return null
  }
  return session
}

export async function GET(req: NextRequest) {
  if (!await checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const artistId = parseInt(searchParams.get('artist_id') || '')
  if (!Number.isFinite(artistId)) return NextResponse.json({ error: 'Bad artist_id' }, { status: 400 })
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('wiki_ignored_albums')
    .select('wiki_title, ignored_at, reason')
    .eq('artist_id', artistId)
  if (error) {
    if (/wiki_ignored_albums/.test(error.message)) {
      return NextResponse.json({ ok: true, ignored: [], migration_pending: true })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, ignored: data || [] })
}

export async function POST(req: NextRequest) {
  const session = await checkAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }
  const artistId = parseInt(String(body?.artist_id))
  const title = String(body?.wiki_title || '').trim()
  if (!Number.isFinite(artistId) || !title) {
    return NextResponse.json({ error: 'Reikalingi artist_id ir wiki_title' }, { status: 400 })
  }
  const sb = createAdminClient()
  const { error } = await sb
    .from('wiki_ignored_albums')
    .upsert({
      artist_id: artistId,
      wiki_title: title,
      ignored_by: (session as any).user?.email || (session as any).user?.name || 'admin',
      reason: body?.reason || null,
    }, { onConflict: 'artist_id,wiki_title' })
  if (error) {
    if (/wiki_ignored_albums/.test(error.message)) {
      return NextResponse.json({
        ok: false, migration_pending: true,
        error: 'Migracija 20260515h dar neaplikuota — `supabase/migrations/20260515h_wiki_album_review.sql`'
      }, { status: 412 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  if (!await checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }
  const artistId = parseInt(String(body?.artist_id))
  const title = String(body?.wiki_title || '').trim()
  if (!Number.isFinite(artistId) || !title) {
    return NextResponse.json({ error: 'Reikalingi artist_id ir wiki_title' }, { status: 400 })
  }
  const sb = createAdminClient()
  const { error } = await sb
    .from('wiki_ignored_albums')
    .delete()
    .eq('artist_id', artistId)
    .eq('wiki_title', title)
  if (error && !/wiki_ignored_albums/.test(error.message)) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
