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
      artist_substyles(substyle_id, substyles(id, name)),
      artist_members!artist_members_group_id_fkey(
        member_id, year_from, year_to, is_current,
        artists!artist_members_member_id_fkey(id, name, slug, cover_image_url)
      ),
      artist_groups:artist_members!artist_members_member_id_fkey(
        group_id, year_from, year_to, is_current,
        artists!artist_members_group_id_fkey(id, name, slug, cover_image_url)
      )
    `)
    .eq('id', id)
    .single()

  if (error || !artist) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ artist })
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

  // Išskiriame members ir genres iš pagrindinių laukų
  const {
    members, genres, substyleNames,
    // Laukai kurie nesaugomos į artists lentelę tiesiogiai
    ...artistFields
  } = body

  // Atnaujinti pagrindinius artisto laukus
  if (Object.keys(artistFields).length > 0) {
    const { error } = await supabase.from('artists').update(artistFields).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ── Atnaujinti narius (artist_members) ──────────────────────────────────────
  if (members !== undefined) {
    // Pirma ištrinti senus ryšius kur šis atlikėjas = grupė
    await supabase.from('artist_members').delete().eq('group_id', id)

    // Sukurti naujus
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
        const { error: membersError } = await supabase.from('artist_members').insert(rows)
        if (membersError) console.error('Members insert error:', membersError)
      }
    }
  }

  // ── Atnaujinti žanrus ────────────────────────────────────────────────────────
  if (genres !== undefined && Array.isArray(genres)) {
    await supabase.from('artist_genres').delete().eq('artist_id', id)
    if (genres.length > 0) {
      await supabase.from('artist_genres').insert(
        genres.map((genreId: number) => ({ artist_id: parseInt(id), genre_id: genreId }))
      )
    }
  }

  // ── Atnaujinti substilus ────────────────────────────────────────────────────
  if (substyleNames !== undefined && Array.isArray(substyleNames)) {
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

  // Ištriname susijusius įrašus (cascade jei nėra DB lygyje)
  await supabase.from('artist_members').delete().or(`group_id.eq.${artistId},member_id.eq.${artistId}`)
  await supabase.from('artist_genres').delete().eq('artist_id', artistId)
  await supabase.from('artist_substyles').delete().eq('artist_id', artistId)
  await supabase.from('photos').delete().eq('artist_id', artistId)

  // Galiausiai ištriname patį atlikėją
  const { error } = await supabase.from('artists').delete().eq('id', artistId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
