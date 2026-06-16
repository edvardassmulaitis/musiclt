// app/api/admin/substiliai/route.ts
//
// Admin'as: substilių peržiūros eilė. Importai/kūrimas nerastiems žanrams
// kuria 'pending' substilius (priskirtus atlikėjo žanrui). Čia adminas:
//   • merge — sujungia su esamu kanoniniu (perveda artist/album ryšius, ištrina)
//   • approve — patvirtina kaip naują kanoninį (status='approved' + genre_id)
//   • delete — ištrina (su ryšiais) — šiukšlėms
//
// GET grąžina pending sąrašą su ryšių skaičiumi + auto-pasiūlymais
// (merge target per genre-match, suggested genre per heuristiką).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { matchGenreToSubstyle, type SubstyleRow } from '@/lib/genre-match'
import { GENRE_IDS } from '@/lib/constants'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) return null
  return session
}

/** Žodžių heuristika → siūlomas pagrindinis žanras nerastam substiliui. */
function suggestGenreId(name: string): number | null {
  const s = name.toLowerCase()
  if (/\bmetal|doom|grind|core(?!\w)|black\b|death\b/.test(s)) return GENRE_IDS['Sunkioji muzika']
  if (/\b(rap|trap|hip[- ]?hop|drill|grime)\b/.test(s)) return GENRE_IDS["Hip-hop'o muzika"]
  if (/\b(house|techno|electro|edm|trance|synth|wave|dnb|dubstep|rave|disco)\b/.test(s)) return GENRE_IDS['Elektroninė, šokių muzika']
  if (/\b(jazz|blues|classic(al)?|opera|gospel|swing|baroque)\b/.test(s)) return GENRE_IDS['Rimtoji muzika']
  if (/\b(rock|rokas|punk|grunge|britpop|shoegaz)\b/.test(s)) return GENRE_IDS['Roko muzika']
  if (/\b(pop|r&b|soul|funk|estrada|disco)\b/.test(s)) return GENRE_IDS['Pop, R&B muzika']
  if (/\b(folk|world|reggae|latin|country|ethnic|film|theatre|soundtrack)\b/.test(s)) return GENRE_IDS['Kitų stilių muzika']
  if (/\b(experiment|avant|noise|ambient|drone|indie|alt)\b/.test(s)) return GENRE_IDS['Alternatyvioji muzika']
  return null
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sb = createAdminClient()

  const [{ data: pendingRows }, { data: approvedRows }, { data: genres }, { data: links }] = await Promise.all([
    sb.from('substyles').select('id, name, slug, genre_id, review_note').eq('status', 'pending').order('name'),
    sb.from('substyles').select('id, name, slug').eq('status', 'approved'),
    sb.from('genres').select('id, name').order('name'),
    sb.from('artist_substyles').select('substyle_id'),
  ])

  // ryšių skaičius
  const counts: Record<number, number> = {}
  for (const l of (links || []) as any[]) counts[l.substyle_id] = (counts[l.substyle_id] || 0) + 1

  const approved = (approvedRows || []) as SubstyleRow[]
  const items = (pendingRows || []).map((p: any) => {
    const m = matchGenreToSubstyle(p.name, approved)
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      genre_id: p.genre_id,
      review_note: p.review_note,
      links: counts[p.id] || 0,
      suggestMergeId: m?.id ?? null,
      suggestMergeName: m?.name ?? null,
      suggestGenreId: p.genre_id ?? suggestGenreId(p.name),
    }
  })

  return NextResponse.json({ items, approved, genres: genres || [] })
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sb = createAdminClient()
  const session = await getServerSession(authOptions)
  const reviewer = session?.user?.email || session?.user?.name || 'admin'
  const body = await req.json()
  const action = body.action as string

  try {
    if (action === 'merge') {
      const id = Number(body.id), targetId = Number(body.targetId)
      if (!id || !targetId || id === targetId) return NextResponse.json({ error: 'blogi id' }, { status: 400 })
      const moved = await repoint(sb, id, targetId)
      await sb.from('substyles').delete().eq('id', id)
      return NextResponse.json({ ok: true, merged: moved })
    }

    if (action === 'approve') {
      const id = Number(body.id), genreId = body.genreId ? Number(body.genreId) : null
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
      const { error } = await sb.from('substyles')
        .update({ status: 'approved', genre_id: genreId, review_note: null, reviewed_at: new Date().toISOString(), reviewed_by: reviewer })
        .eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'rename') {
      const id = Number(body.id), name = String(body.name || '').trim()
      if (!id || !name) return NextResponse.json({ error: 'id+name required' }, { status: 400 })
      const { error } = await sb.from('substyles').update({ name }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'delete') {
      const id = Number(body.id)
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
      await sb.from('artist_substyles').delete().eq('substyle_id', id)
      await sb.from('album_substyles').delete().eq('substyle_id', id)
      await sb.from('substyles').delete().eq('id', id)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'nežinomas action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/** Perveda artist_substyles + album_substyles ryšius iš fromId į toId
 *  (be dublikatų), grąžina perkeltų ryšių sk. */
async function repoint(sb: ReturnType<typeof createAdminClient>, fromId: number, toId: number): Promise<number> {
  let moved = 0
  // artists
  const { data: aRows } = await sb.from('artist_substyles').select('artist_id').eq('substyle_id', fromId)
  for (const r of (aRows || []) as any[]) {
    await sb.from('artist_substyles').upsert({ artist_id: r.artist_id, substyle_id: toId }, { onConflict: 'artist_id,substyle_id', ignoreDuplicates: true })
    moved++
  }
  await sb.from('artist_substyles').delete().eq('substyle_id', fromId)
  // albums
  const { data: alRows } = await sb.from('album_substyles').select('album_id').eq('substyle_id', fromId)
  for (const r of (alRows || []) as any[]) {
    await sb.from('album_substyles').upsert({ album_id: r.album_id, substyle_id: toId }, { onConflict: 'album_id,substyle_id', ignoreDuplicates: true })
  }
  await sb.from('album_substyles').delete().eq('substyle_id', fromId)
  return moved
}
