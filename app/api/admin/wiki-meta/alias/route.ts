// POST/DELETE /api/admin/wiki-meta/alias — add/remove Wiki single alias
// from a tracker. Body: { track_id, alias }.
//
// Naudojama WikipediaImportDiscography'oje, kai admin'as paspaud'a
// „Susieti su DB daina" prie naujo Wiki single suggestion'o ir per picker'į
// pasirenka esamą tracką (pvz Wiki „Angel" → DB „Angel in the Snow").

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) return null
  return session
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { track_id, alias } = await req.json()
  const trackId = Number(track_id)
  const aliasClean = String(alias || '').trim()
  if (!trackId || !aliasClean) {
    return NextResponse.json({ error: 'track_id ir alias privalomi' }, { status: 400 })
  }

  const supabase = createAdminClient()
  // Load current aliases
  const { data: t } = await supabase
    .from('tracks')
    .select('wiki_aliases')
    .eq('id', trackId)
    .single()
  if (!t) return NextResponse.json({ error: 'Track nerastas' }, { status: 404 })

  const current: string[] = t.wiki_aliases || []
  // Idempotent — case-insensitive dedup
  const existsCI = current.some(a => a.toLowerCase() === aliasClean.toLowerCase())
  const updated = existsCI ? current : [...current, aliasClean]

  if (!existsCI) {
    const { error } = await supabase
      .from('tracks')
      .update({ wiki_aliases: updated })
      .eq('id', trackId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, aliases: updated })
}

export async function DELETE(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { track_id, alias } = await req.json()
  const trackId = Number(track_id)
  const aliasClean = String(alias || '').trim().toLowerCase()
  if (!trackId || !aliasClean) {
    return NextResponse.json({ error: 'track_id ir alias privalomi' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: t } = await supabase
    .from('tracks')
    .select('wiki_aliases')
    .eq('id', trackId)
    .single()
  if (!t) return NextResponse.json({ error: 'Track nerastas' }, { status: 404 })

  const updated = (t.wiki_aliases || []).filter((a: string) => a.toLowerCase() !== aliasClean)
  const { error } = await supabase
    .from('tracks')
    .update({ wiki_aliases: updated })
    .eq('id', trackId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, aliases: updated })
}
