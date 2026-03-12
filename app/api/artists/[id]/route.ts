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

  const { data: artist, error } = await supabase
    .from('artists')
    .select(`
      *,
      artist_genres(genre_id, genres(id, name, slug)),
      artist_substyles:artist_substyles(substyle_id, substyles(id, name))
    `)
    .eq('id', id)
    .single()

  console.error(`[GET /api/artists/${id}] query1 error:`, error?.message || 'none')

  if (error || !artist) {
    // Bandome be substyles jei lentelės nėra
    const { data: artist2, error: error2 } = await supabase
      .from('artists')
      .select('*, artist_genres(genre_id, genres(id, name, slug))')
      .eq('id', id)
      .single()

    console.error(`[GET /api/artists/${id}] query2 error:`, error2?.message || 'none', '| found:', !!artist2)

    if (error2 || !artist2) {
      console.error('GET artist error:', error2 || error)
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ artist: { ...artist2, artist_members: [], artist_groups: [] } })
  }

  // Nariai — try/catch jei lentelės nėra
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

  return NextResponse.json({
    artist: { ...artist, artist_members: membersRaw, artist_groups: groupsRaw }
  })
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
  const body = await req.json()

  const { members, genres, substyleNames, ...artistFields } = body

  if (Object.keys(artistFields).length > 0) {
    const { error } = await supabase.from('artists').update(artistFields).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Nariai
  if (members !== undefined) {
    try {
      await supabase.from('artist_members').delete().eq('group_id', id)
      if (Array.isArray(members) && members.length > 0) {
        const rows = members
          .filter((m: any) => m.id)
          .map((m: any) => ({
            group_id: parseInt(id),
            member_id: m.id,
            year_from: m.yearFrom ? parseInt(m.yearFrom) : null,
            year_to: m.yearTo ? parseInt(m.yearTo) : null,
            is_current: !m.yearTo,
          }))
        if (rows.length > 0) {
          const { error: me } = await supabase.from('artist_members').insert(rows)
          if (me) console.error('Members insert error:', me)
        }
      }
    } catch (e) {
      console.error('artist_members table error:', e)
    }
  }

  // Žanrai
  if (genres !== undefined && Array.isArray(genres)) {
    await supabase.from('artist_genres').delete().eq('artist_id', id)
    if (genres.length > 0) {
      await supabase.from('artist_genres').insert(
        genres.map((genreId: number) => ({ artist_id: parseInt(id), genre_id: genreId }))
      )
    }
  }

  // Stiliai
  if (substyleNames !== undefined && Array.isArray(substyleNames)) {
    try {
      await supabase.from('artist_substyles').delete().eq('artist_id', id)
      for (const name of substyleNames) {
        if (!name?.trim()) continue
        let { data: existing } = await supabase.from('substyles').select('id').eq('name', name).single()
        if (!existing) {
          const { data: newStyle } = await supabase.from('substyles')
            .insert({ name, slug: slugify(name) }).select('id').single()
          existing = newStyle
        }
        if (existing?.id) {
          await supabase.from('artist_substyles').insert({ artist_id: parseInt(id), substyle_id: existing.id })
        }
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
  await supabase.from('artist_photos').delete().eq('artist_id', artistId)
  await supabase.from('artist_links').delete().eq('artist_id', artistId)
  await supabase.from('artist_breaks').delete().eq('artist_id', artistId)

  const { error } = await supabase.from('artists').delete().eq('id', artistId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
