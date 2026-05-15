// POST/DELETE /api/admin/wiki-meta/ignore — add/remove Wiki single
// from per-artist ignore list. Body: { artist_id, wiki_title }.
//
// Naudojama, kai admin'as paspaud'a „Ignoruoti" prie naujo Wiki single
// suggestion'o — tas single dingsta iš sąrašo ir ateityje nebebus rodomas.

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

  const { artist_id, wiki_title } = await req.json()
  const artistId = Number(artist_id)
  const wikiTitle = String(wiki_title || '').trim()
  if (!artistId || !wikiTitle) {
    return NextResponse.json({ error: 'artist_id ir wiki_title privalomi' }, { status: 400 })
  }

  const supabase = createAdminClient()
  // Idempotent — onConflict PK (artist_id, wiki_title) → do nothing
  const { error } = await supabase
    .from('wiki_single_ignores')
    .upsert({ artist_id: artistId, wiki_title: wikiTitle }, { onConflict: 'artist_id,wiki_title', ignoreDuplicates: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { artist_id, wiki_title } = await req.json()
  const artistId = Number(artist_id)
  const wikiTitle = String(wiki_title || '').trim()
  if (!artistId || !wikiTitle) {
    return NextResponse.json({ error: 'artist_id ir wiki_title privalomi' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('wiki_single_ignores')
    .delete()
    .eq('artist_id', artistId)
    .eq('wiki_title', wikiTitle)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
