import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getArtists } from '@/lib/supabase-artists'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

function slugify(text: string): string {
  return text.toLowerCase()
    .replace(/[ąä]/g, 'a').replace(/[čç]/g, 'c').replace(/[ęè]/g, 'e')
    .replace(/[ėé]/g, 'e').replace(/[į]/g, 'i').replace(/[š]/g, 's')
    .replace(/[ų]/g, 'u').replace(/[ū]/g, 'u').replace(/[ž]/g, 'z')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')
  const search = searchParams.get('search') || ''
  const includeInactive = searchParams.get('includeInactive') === 'true'
  try {
    const result = await getArtists(limit, offset, search, includeInactive)
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const data = await req.json()
    const supabase = createAdminClient()

    // Ištraukiame ne-DB laukus
    const {
      members,
      genres,
      substyleNames,
      genre,       // ArtistForm siunčia genre (string), ne genres (array)
      substyles,   // ArtistForm siunčia substyles (string[])
      breaks,
      photos,
      links,
      // socialiniai tinklai
      website, facebook, instagram, youtube, tiktok, spotify, soundcloud, bandcamp, twitter,
      // ignoruojami
      groups,
      ...artistFields
    } = data

    // Slug
    const baseSlug = slugify(artistFields.name || '')
    let slug = baseSlug
    const { data: existing } = await supabase
      .from('artists')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
    if (existing) slug = `${baseSlug}-${Date.now().toString(36)}`

    // Pagrindinis insert
    const insertPayload: any = {
      ...artistFields,
      slug,
      is_active: artistFields.is_active ?? true,
      is_verified: artistFields.is_verified ?? false,
      type_music: artistFields.type_music ?? true,
      type_film: artistFields.type_film ?? false,
      type_dance: artistFields.type_dance ?? false,
      type_books: artistFields.type_books ?? false,
      photos: photos || [],
    }

    // Pašaliname laukus kurių nėra DB
    delete insertPayload.yearStart
    delete insertPayload.yearEnd
    delete insertPayload.yearFrom
    delete insertPayload.yearTo

    // active_from iš yearStart
    if (data.yearStart && !insertPayload.active_from) {
      insertPayload.active_from = parseInt(data.yearStart) || null
    }
    if (data.yearEnd && !insertPayload.active_until) {
      insertPayload.active_until = parseInt(data.yearEnd) || null
    }

    const { data: newArtist, error: insertError } = await supabase
      .from('artists')
      .insert(insertPayload)
      .select('id, slug')
      .single()

    if (insertError || !newArtist) {
      console.error('Artist insert error:', insertError)
      return NextResponse.json({ error: insertError?.message || 'Insert failed' }, { status: 500 })
    }

    const artistId = newArtist.id

    // ── Žanrai ──────────────────────────────────────────────────────────────
    // ArtistForm siunčia `genre` (string pavadinimas) ir `genres` (id masyvą)
    if (Array.isArray(genres) && genres.length > 0) {
      await supabase.from('artist_genres').insert(
        genres.map((gid: number) => ({ artist_id: artistId, genre_id: gid }))
      )
    } else if (genre) {
      // Ieškome genre pagal pavadinimą
      const { data: genreRow } = await supabase
        .from('genres')
        .select('id')
        .ilike('name', genre)
        .maybeSingle()
      if (genreRow?.id) {
        await supabase.from('artist_genres').insert({ artist_id: artistId, genre_id: genreRow.id })
      }
    }

    // ── Stiliai ──────────────────────────────────────────────────────────────
    const styleNames: string[] = substyleNames || substyles || []
    if (styleNames.length > 0) {
      try {
        for (const name of styleNames) {
          if (!name?.trim()) continue
          let { data: styleRow } = await supabase.from('substyles').select('id').eq('name', name).maybeSingle()
          if (!styleRow) {
            const { data: newStyle } = await supabase.from('substyles')
              .insert({ name, slug: slugify(name) }).select('id').single()
            styleRow = newStyle
          }
          if (styleRow?.id) {
            await supabase.from('artist_substyles').insert({ artist_id: artistId, substyle_id: styleRow.id })
          }
        }
      } catch (e) {
        console.error('Substyles error:', e)
      }
    }

    // ── Nariai ───────────────────────────────────────────────────────────────
    if (Array.isArray(members) && members.length > 0) {
      try {
        const rows = members
          .filter((m: any) => m.id)
          .map((m: any) => ({
            group_id: artistId,
            member_id: m.id,
            year_from: m.yearFrom ? parseInt(m.yearFrom) : null,
            year_to: m.yearTo ? parseInt(m.yearTo) : null,
            is_current: !m.yearTo,
          }))
        if (rows.length > 0) {
          const { error: me } = await supabase.from('artist_members').insert(rows)
          if (me) console.error('artist_members insert error:', me)
        }
      } catch (e) {
        console.error('artist_members error:', e)
      }
    }

    // ── Pertraukos ───────────────────────────────────────────────────────────
    if (Array.isArray(breaks) && breaks.length > 0) {
      try {
        await supabase.from('artist_breaks').insert(
          breaks.map((b: any) => ({
            artist_id: artistId,
            year_from: b.from ? parseInt(b.from) : null,
            year_to: b.to ? parseInt(b.to) : null,
          }))
        )
      } catch {}
    }

    // ── Nuorodos ─────────────────────────────────────────────────────────────
    const linkMap: Record<string, string> = {
      website, facebook, instagram, youtube, tiktok, spotify, soundcloud, bandcamp, twitter
    }
    const linkEntries = links ? Object.entries(links) : Object.entries(linkMap)
    const validLinks = linkEntries.filter(([, v]) => v && typeof v === 'string' && v.startsWith('http'))
    if (validLinks.length > 0) {
      try {
        await supabase.from('artist_links').insert(
          validLinks.map(([type, url]) => ({ artist_id: artistId, link_type: type, url }))
        )
      } catch {}
    }

    return NextResponse.json({ id: artistId, slug: newArtist.slug })

  } catch (e: any) {
    console.error('[POST /api/artists]', e)
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
