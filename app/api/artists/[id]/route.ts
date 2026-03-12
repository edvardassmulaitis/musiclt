import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

function slugify(text: string): string {
  return text.toLowerCase()
    .replace(/[ąä]/g, 'a').replace(/[čç]/g, 'c').replace(/[ęè]/g, 'e')
    .replace(/[ėé]/g, 'e').replace(/[į]/g, 'i').replace(/[š]/g, 's')
    .replace(/[ų]/g, 'u').replace(/[ū]/g, 'u').replace(/[ž]/g, 'z')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// ── GET /api/artists/[id] ─────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()

  // 1. Pagrindinis atlikėjas + žanrai
  const { data: artist, error } = await supabase
    .from('artists')
    .select('*, artist_genres(genre_id, genres(id, name, slug))')
    .eq('id', id)
    .single()

  if (error || !artist) {
    // 2. Fallback — tik pats atlikėjas
    const { data: a2, error: e2 } = await supabase
      .from('artists')
      .select('*')
      .eq('id', id)
      .single()

    if (e2 || !a2) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ artist: { ...a2, artist_genres: [], artist_members: [], artist_groups: [] } })
  }

  // 3. Nariai (try/catch — lentelė gali neegzistuoti)
  let membersRaw: any[] = []
  let groupsRaw: any[] = []

  try {
    const { data } = await supabase
      .from('artist_members')
      .select('member_id, year_from, year_to, is_current, artists!artist_members_member_id_fkey(id, name, slug, cover_image_url)')
      .eq('group_id', id)
    membersRaw = data || []
  } catch {}

  try {
    const { data } = await supabase
      .from('artist_members')
      .select('group_id, year_from, year_to, is_current, artists!artist_members_group_id_fkey(id, name, slug, cover_image_url)')
      .eq('member_id', id)
    groupsRaw = data || []
  } catch {}

  return NextResponse.json({ artist: { ...artist, artist_members: membersRaw, artist_groups: groupsRaw } })
}

// ── PATCH /api/artists/[id] ───────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !['admin', 'super_admin'].includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const supabase = createAdminClient()
  const d = await req.json()

  // Tik žinomi DB laukai
  const updatePayload: any = {}
  const dbFields = ['name','type','country','description','cover_image_url','cover_image_wide_url',
    'gender','birth_date','death_date','website','subdomain','spotify_id','youtube_channel_id',
    'is_active','is_verified','type_music','type_film','type_dance','type_books',
    'photos','show_updated','hide_mp3','active_from','active_until','slug']

  for (const f of dbFields) {
    if (d[f] !== undefined) updatePayload[f] = d[f]
  }
  if (d.yearStart !== undefined) updatePayload.active_from = d.yearStart ? parseInt(d.yearStart) : null
  if (d.yearEnd   !== undefined) updatePayload.active_until = d.yearEnd ? parseInt(d.yearEnd) : null
  if (d.avatar    !== undefined) updatePayload.cover_image_url = d.avatar

  if (Object.keys(updatePayload).length > 0) {
    const { error } = await supabase.from('artists').update(updatePayload).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Nariai
  if (d.members !== undefined) {
    try {
      await supabase.from('artist_members').delete().eq('group_id', id)
      const validMembers = (d.members as any[]).filter((m: any) => m?.id)
      if (validMembers.length > 0) {
        await supabase.from('artist_members').insert(
          validMembers.map((m: any) => ({
            group_id: parseInt(id), member_id: m.id,
            year_from: m.yearFrom ? parseInt(m.yearFrom) : null,
            year_to:   m.yearTo   ? parseInt(m.yearTo)   : null,
            is_current: !m.yearTo,
          }))
        )
      }
    } catch (e: any) { console.error('PATCH members error:', e.message) }
  }

  // Žanras
  if (d.genre !== undefined) {
    await supabase.from('artist_genres').delete().eq('artist_id', id)
    if (d.genre) {
      const { data: genreRow } = await supabase.from('genres').select('id').ilike('name', d.genre).maybeSingle()
      if (genreRow?.id) await supabase.from('artist_genres').insert({ artist_id: parseInt(id), genre_id: genreRow.id })
    }
  }

  // Stiliai
  if (d.substyles !== undefined || d.substyleNames !== undefined) {
    const names: string[] = d.substyles || d.substyleNames || []
    try {
      await supabase.from('artist_substyles').delete().eq('artist_id', id)
      for (const name of names) {
        if (!name?.trim()) continue
        let { data: sr } = await supabase.from('substyles').select('id').eq('name', name).maybeSingle()
        if (!sr) {
          const { data: ns } = await supabase.from('substyles').insert({ name, slug: slugify(name) }).select('id').single()
          sr = ns
        }
        if (sr?.id) await supabase.from('artist_substyles').insert({ artist_id: parseInt(id), substyle_id: sr.id })
      }
    } catch {}
  }

  return NextResponse.json({ ok: true })
}

// ── DELETE /api/artists/[id] — tik super_admin ─────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const supabase = createAdminClient()
  const artistId = parseInt(id)

  try { await supabase.from('artist_members').delete().or(`group_id.eq.${artistId},member_id.eq.${artistId}`) } catch {}
  await supabase.from('artist_genres').delete().eq('artist_id', artistId)
  try { await supabase.from('artist_substyles').delete().eq('artist_id', artistId) } catch {}
  await supabase.from('artist_photos').delete().eq('artist_id', artistId)
  try { await supabase.from('artist_links').delete().eq('artist_id', artistId) } catch {}
  try { await supabase.from('artist_breaks').delete().eq('artist_id', artistId) } catch {}

  const { error } = await supabase.from('artists').delete().eq('id', artistId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
