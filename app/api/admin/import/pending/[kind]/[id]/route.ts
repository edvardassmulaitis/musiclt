// app/api/admin/import/pending/[kind]/[id]/route.ts
//
// Approve/reject pending review entry (track or album).
//   PATCH  → SET source='legacy_scrape' (visible publicly)
//   DELETE → DELETE row + cascade likes/comments
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  return session?.user && ['admin', 'super_admin'].includes(session.user.role || '')
}

type RouteParams = { params: Promise<{ kind: string; id: string }> }

function tableFor(kind: string): 'albums' | 'tracks' | null {
  if (kind === 'album') return 'albums'
  if (kind === 'track') return 'tracks'
  return null
}

export async function PATCH(_req: NextRequest, { params }: RouteParams) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { kind, id } = await params
  const table = tableFor(kind)
  const numId = parseInt(id, 10)
  if (!table || !numId) {
    return NextResponse.json({ error: 'Bad params' }, { status: 400 })
  }

  const sb = createAdminClient()
  // Approve = pakeičiam source iš 'legacy_scrape_pending' į 'legacy_scrape'
  // (bus matomas viešai per default filter). Tikrinam, kad eilutė tikrai
  // pending status'o — nesilaikant source check'o, accidental PATCH ant
  // jau approved įrašo nebūtų pavojinga, bet aiškumo dėliai filtruojam.
  const { error } = await sb
    .from(table)
    .update({ source: 'legacy_scrape' })
    .eq('id', numId)
    .eq('source', 'legacy_scrape_pending')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, action: 'approved', kind, id: numId })
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { kind, id } = await params
  const table = tableFor(kind)
  const numId = parseInt(id, 10)
  if (!table || !numId) {
    return NextResponse.json({ error: 'Bad params' }, { status: 400 })
  }

  const sb = createAdminClient()
  // Saugumo dėliai REIKIA, kad eilutė būtų pending — neištriname jau
  // approved entry net jei kažkas kvies šitą endpoint'ą.
  // 1. Verify eilutė yra pending
  const { data: row } = await sb
    .from(table).select('id, source').eq('id', numId).maybeSingle()
  const r: any = row
  if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (r.source !== 'legacy_scrape_pending') {
    return NextResponse.json({ error: 'Not pending — refuse delete' }, { status: 400 })
  }

  // 2. Manually clean up dependent data (likes + comments) — DB cascade
  // priklauso nuo migration'ų, gali būti nepritaikyta.
  const entityType = kind === 'album' ? 'album' : 'track'
  await sb.from('likes').delete()
    .eq('entity_type', entityType).eq('entity_id', numId)
  if (kind === 'album') {
    await sb.from('comments').delete().eq('album_id', numId)
    await sb.from('album_tracks').delete().eq('album_id', numId)
  } else {
    await sb.from('comments').delete().eq('track_id', numId)
    await sb.from('album_tracks').delete().eq('track_id', numId)
    await sb.from('track_artists').delete().eq('track_id', numId)
  }

  // 3. Finally — delete the row
  const { error: delErr } = await sb.from(table).delete().eq('id', numId)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
  return NextResponse.json({ ok: true, action: 'rejected', kind, id: numId })
}
