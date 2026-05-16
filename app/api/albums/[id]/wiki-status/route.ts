import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

// PATCH /api/albums/[id]/wiki-status — soft review state toggle.
//
// Naudojama Wiki Discography Import modal'e: admin paslepia DB album'ą kaip
// "reviewed/cleared" kad future importai jo nepristatytų kaip needing-attention.
// Pvz Queen 1973 — admin patvirtina, kad current state OK, gauname wiki_review_status='cleared'.
//
// Body: { status: 'cleared' | null }
// Response: { ok: true } arba { ok: true, migration_pending: true } jei
// migracija 20260515h dar neaplikuota (column'as neegzistuoja).
//
// Frontend gali rodyti vartotojui kad migraciją reikia paleisti, BET nelaužia
// flow'o.

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin','super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id: idStr } = await params
  const albumId = parseInt(idStr)
  if (!Number.isFinite(albumId)) {
    return NextResponse.json({ error: 'Bad album id' }, { status: 400 })
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }
  const status = body?.status === null || body?.status === 'cleared' ? body.status : null

  const sb = createAdminClient()
  const { error } = await sb
    .from('albums')
    .update({ wiki_review_status: status })
    .eq('id', albumId)
  if (error) {
    if (/wiki_review_status/.test(error.message) && /does not exist/.test(error.message)) {
      return NextResponse.json({
        ok: false,
        migration_pending: true,
        error: 'Migracija 20260515h dar neaplikuota — taikomi `supabase/migrations/20260515h_wiki_album_review.sql`'
      }, { status: 412 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, status })
}
