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
  try {
    const result = await getArtists(limit, offset, search)
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
    const d = await req.json()
    const supabase = createAdminClient()

    // ── Slug ──────────────────────────────────────────────────────────────────
    const baseSlug = slugify(d.name || '')
    let slug = baseSlug
    const { data: existing } = await supabase.from('artists').select('id').eq('slug', slug).maybeSingle()
    if (existing) slug = `${baseSlug}-${Date.now().toString(36)}`

    // ── Datos ─────────────────────────────────────────────────────────────────
    const birthDate = d.birthYear
      ? `${d.birthYear}-${String(d.birthMonth || 1).padStart(2,'0')}-${String(d.birthDay || 1).padStart(2,'0')}`
      : null
    const deathDate = d.deathYear
      ? `${d.deathYear}-${String(d.deathMonth || 1).padStart(2,'0')}-${String(d.deathDay || 1).padStart(2,'0')}`
      : null

    // ── Tik žinomi DB laukai ──────────────────────────────────────────────────
    const insertPayload = {
      slug,
      name:               d.name || '',
      type:               d.type || 'group',
      country:            d.country || 'Lietuva',
      active_from:        d.yearStart ? parseInt(d.yearStart) : (d.active_from || null),
      active_until:       d.yearEnd   ? parseInt(d.yearEnd)   : (d.active_until || null),
      description:        d.description || null,
      cover_image_url:    d.avatar || d.cover_image_url || null,
      cover_image_wide_url: d.avatarWide || d.cover_image_wide_url || null,
      gender:             d.gender || null,
      birth_date:         birthDate,
      death_date:         deathDate,
      website:            d.website || null,
      subdomain:          d.subdomain || null,
      spotify_id:         d.spotify_id || null,
      youtube_channel_id: d.youtube_channel_id || null,
      is_active:          d.is_active ?? true,
      is_verified:        d.is_verified ?? false,
      type_music:         d.type_music ?? true,
      type_film:          d.type_film ?? false,
      type_dance:         d.type_dance ?? false,
      type_books:         d.type_books ?? false,
      photos:             d.photos || [],
      show_updated:       d.show_updated ?? false,
      hide_mp3:           d.hide_mp3 ?? false,
    }

    const { data: newArtist, error: insertError } = await supabase
      .from('artists')
      .insert(insertPayload)
      .select('id, slug')
      .single()

    if (insertError || !newArtist) {
      console.error('[POST /api/artists] INSERT ERROR:', JSON.stringify(insertError))
      return NextResponse.json({ error: insertError?.message || 'Insert failed' }, { status: 500 })
    }

    const artistId = newArtist.id

    // ── Žanras ────────────────────────────────────────────────────────────────
    const genreName: string = d.genre || ''
    if (genreName) {
      const { data: genreRow } = await supabase.from('genres').select('id').ilike('name', genreName).maybeSingle()
      if (genreRow?.id) {
        await supabase.from('artist_genres').insert({ artist_id: artistId, genre_id: genreRow.id })
      }
    }

    // ── Stiliai ───────────────────────────────────────────────────────────────
    const styleNames: string[] = d.substyles || d.substyleNames || []
    for (const name of styleNames) {
      if (!name?.trim()) continue
      try {
        let { data: styleRow } = await supabase.from('substyles').select('id').eq('name', name).maybeSingle()
        if (!styleRow) {
          const { data: ns } = await supabase.from('substyles').insert({ name, slug: slugify(name) }).select('id').single()
          styleRow = ns
        }
        if (styleRow?.id) {
          await supabase.from('artist_substyles').insert({ artist_id: artistId, substyle_id: styleRow.id }).throwOnError()
        }
      } catch {}
    }

    // ── Nariai ────────────────────────────────────────────────────────────────
    const members: any[] = d.members || []
    const validMembers = members.filter((m: any) => m?.id)
    if (validMembers.length > 0) {
      const rows = validMembers.map((m: any) => ({
        group_id:   artistId,
        member_id:  m.id,
        year_from:  m.yearFrom ? parseInt(m.yearFrom) : null,
        year_to:    m.yearTo   ? parseInt(m.yearTo)   : null,
        is_current: !m.yearTo,
      }))
      const { error: me } = await supabase.from('artist_members').insert(rows)
      if (me) console.error('[POST /api/artists] members error:', me.message)
    }

    // ── Pertraukos ────────────────────────────────────────────────────────────
    const breaks: any[] = d.breaks || []
    if (breaks.length > 0) {
      try {
        await supabase.from('artist_breaks').insert(
          breaks.map((b: any) => ({ artist_id: artistId, year_from: b.from ? parseInt(b.from) : null, year_to: b.to ? parseInt(b.to) : null }))
        )
      } catch {}
    }

    // ── Nuorodos ──────────────────────────────────────────────────────────────
    const linkKeys = ['facebook','instagram','youtube','tiktok','spotify','soundcloud','bandcamp','twitter']
    const linkRows = linkKeys
      .filter(k => d[k] && typeof d[k] === 'string' && d[k].startsWith('http'))
      .map(k => ({ artist_id: artistId, link_type: k, url: d[k] }))
    if (linkRows.length > 0) {
      try { await supabase.from('artist_links').insert(linkRows) } catch {}
    }

    return NextResponse.json({ id: artistId, slug: newArtist.slug })

  } catch (e: any) {
    console.error('[POST /api/artists] CATCH:', e.message)
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
