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

/** Strip Wikipedia disambiguation suffixes like (singer), (rapper), etc. */
function cleanArtistName(raw: string): string {
  return raw
    .replace(/\s*\(\s*(?:singer|rapper|musician|entertainer|DJ|band|group|American|British|record producer|songwriter|actor|actress|performer|vocalist|artist|composer|producer)\s*\)/gi, '')
    .replace(/_/g, ' ')
    .trim()
}

export async function GET(req: NextRequest) {
  const supabase = createAdminClient()
  const check = req.nextUrl.searchParams.get('check')

  // ?check= → admin-only duplicate check (used in admin form when creating)
  if (check) {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const q = check.trim()
    const baseSlug = slugify(q)
    // Ieškome pagal slug panašumą arba vardą (ilike su wildcards)
    const { data } = await supabase
      .from('artists')
      .select('id, name, slug, type, country, cover_image_url')
      .or(`slug.ilike.${baseSlug}%,name.ilike.%${q}%`)
      .limit(5)
    return NextResponse.json(data || [])
  }

  // Public listing — homepage'o "Atrask atlikėjus" + atlikėjų katalogas.
  // Anksčiau visa GET buvo auth-gated, todėl anonimams homepage rodė tuščią
  // sekciją (401 silently swallow'inamas client'e). Dabar listing'as public.
  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')
  const search = searchParams.get('search') || ''
  const sort = searchParams.get('sort') || 'name'
  try {
    const result = await getArtists(limit, offset, search, sort)
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    })
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

    // ── Clean name (strip Wikipedia disambiguation) ─────────────────────────
    const artistName = cleanArtistName(d.name || '')
    if (!artistName) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    // ── Slug ──────────────────────────────────────────────────────────────────
    const baseSlug = slugify(artistName)
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
      name:               artistName,
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
      is_active:          d.is_active ?? true,
      is_verified:        d.is_verified ?? false,
      type_music:         d.type_music ?? true,
      type_film:          d.type_film ?? false,
      type_dance:         d.type_dance ?? false,
      type_books:         d.type_books ?? false,
      photos:             d.photos || [],
      show_updated:       d.show_updated ?? false,
      // ── Social links ────────────────────────────────────────────────────────
      facebook:           d.facebook   || null,
      youtube:            d.youtube    || null,
      tiktok:             d.tiktok     || null,
      spotify:            d.spotify    || null,
      soundcloud:         d.soundcloud || null,
      bandcamp:           d.bandcamp   || null,
      twitter:            d.twitter    || null,
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
    const memberRows: any[] = []
    for (const m of members) {
      if (!m?.name && !m?.id) continue
      // Clean disambiguation from member name
      if (m.name) m.name = cleanArtistName(m.name)
      let memberId = m.id ? (typeof m.id === 'string' ? parseInt(m.id) : Number(m.id)) : null
      // Jei nario nėra DB - sukuriame dabar kartu su grupe
      if (!memberId && m.name) {
        try {
          // First check if artist already exists by name (case-insensitive)
          const { data: existingByName } = await supabase.from('artists').select('id').ilike('name', m.name).maybeSingle()
          if (existingByName?.id) {
            memberId = existingByName.id
          }
        } catch {}
      }
      if (!memberId && m.name) {
        try {
          const memberSlug = slugify(m.name)
          let mSlug = memberSlug
          const { data: existingSlug } = await supabase.from('artists').select('id').eq('slug', mSlug).maybeSingle()
          if (existingSlug) { memberId = existingSlug.id }
          if (memberId) { /* Already exists, skip creation */ } else {
          const birthDate = m.birthYear
            ? `${m.birthYear}-${String(m.birthMonth||1).padStart(2,'0')}-${String(m.birthDay||1).padStart(2,'0')}`
            : null
          const deathDate = m.deathYear
            ? `${m.deathYear}-${String(m.deathMonth||1).padStart(2,'0')}-${String(m.deathDay||1).padStart(2,'0')}`
            : null
          const { data: newMember } = await supabase.from('artists').insert({
            slug: mSlug, name: m.name, type: 'solo',
            country: m.country || 'Lietuva',
            active_from:  m.yearStart ? parseInt(m.yearStart) : null,
            active_until: m.yearEnd   ? parseInt(m.yearEnd)   : null,
            cover_image_url: m.avatar || null,
            description: m.description || null,
            gender: m.gender || null,
            birth_date: birthDate,
            death_date: deathDate,
            website: m.website || null,
            facebook: m.facebook || null,
            youtube: m.youtube || null,
            tiktok: m.tiktok || null,
            spotify: m.spotify || null,
            soundcloud: m.soundcloud || null,
            bandcamp: m.bandcamp || null,
            twitter: m.twitter || null,
            is_active: true, is_verified: false, show_updated: false,
            type_music: true, type_film: false, type_dance: false, type_books: false,
            photos: [],
          }).select('id').single()
          if (newMember?.id) {
            memberId = newMember.id
            // Žanras
            if (m.genre) {
              const { data: gr } = await supabase.from('genres').select('id').ilike('name', m.genre).maybeSingle()
              if (gr?.id) { try { await supabase.from('artist_genres').insert({ artist_id: memberId, genre_id: gr.id }) } catch {} }
            }
            // Stiliai
            const mStyles: string[] = m.substyles || []
            for (const sname of mStyles) {
              if (!sname?.trim()) continue
              try {
                let { data: sr } = await supabase.from('substyles').select('id').eq('name', sname).maybeSingle()
                if (!sr) { const { data: ns } = await supabase.from('substyles').insert({ name: sname, slug: slugify(sname) }).select('id').single(); sr = ns }
                if (sr?.id) await supabase.from('artist_substyles').insert({ artist_id: memberId, substyle_id: sr.id })
              } catch {}
            }
          }
          } // close else (not existing)
        } catch (e: any) { console.error('[POST /api/artists] create member error:', (e as any).message) }
      }
      if (memberId) {
        memberRows.push({
          group_id: artistId, member_id: memberId,
          year_from: m.yearFrom ? parseInt(m.yearFrom) : null,
          year_to:   m.yearTo   ? parseInt(m.yearTo)   : null,
          is_current: !m.yearTo,
        })
      }
    }
    if (memberRows.length > 0) {
      const { error: me } = await supabase.from('artist_members').insert(memberRows)
      if (me) console.error('[POST /api/artists] members insert error:', me.message)
    }

    // ── Grupės (solo atlikėjui) ───────────────────────────────────────────────────
    const groupsSource: any[] = d.groups || []
    for (const g of groupsSource) {
      if (!g?.name && !g?.id) continue
      // Clean disambiguation from group name
      if (g.name) g.name = cleanArtistName(g.name)
      let groupId = g.id ? (typeof g.id === 'string' ? parseInt(g.id) : Number(g.id)) : null
      if (!groupId && g.name) {
        try {
          const { data: existingGroup } = await supabase.from('artists').select('id').ilike('name', g.name).eq('type', 'group').maybeSingle()
          if (existingGroup?.id) {
            groupId = existingGroup.id
          } else {
            const gSlug = slugify(g.name)
            let finalGSlug = gSlug
            const { data: slugCheck } = await supabase.from('artists').select('id').eq('slug', finalGSlug).maybeSingle()
            if (slugCheck) finalGSlug = `${gSlug}-${Date.now().toString(36)}`
            const { data: newGroup } = await supabase.from('artists').insert({
              slug: finalGSlug, name: g.name, type: 'group',
              country: g.country || 'Lietuva',
              cover_image_url: g.avatar || null,
              active_from:  g.yearStart ? parseInt(g.yearStart) : null,
              active_until: g.yearEnd   ? parseInt(g.yearEnd)   : null,
              description: g.description || null,
              website: g.website || null,
              facebook: g.facebook || null,
              twitter: g.twitter || null, spotify: g.spotify || null,
              youtube: g.youtube || null, soundcloud: g.soundcloud || null,
              tiktok: g.tiktok || null, bandcamp: g.bandcamp || null,
              is_active: true, is_verified: false, show_updated: false,
              type_music: true, type_film: false, type_dance: false, type_books: false,
              photos: [],
            }).select('id').single()
            // Žanras
            if (newGroup?.id && g.genre) {
              const { data: gr } = await supabase.from('genres').select('id').ilike('name', g.genre).maybeSingle()
              if (gr?.id) { try { await supabase.from('artist_genres').insert({ artist_id: newGroup.id, genre_id: gr.id }) } catch {} }
            }
            // Stiliai
            if (newGroup?.id) {
              const gStyles: string[] = g.substyles || []
              for (const sname of gStyles) {
                if (!sname?.trim()) continue
                try {
                  let { data: sr } = await supabase.from('substyles').select('id').eq('name', sname).maybeSingle()
                  if (!sr) { const { data: ns } = await supabase.from('substyles').insert({ name: sname, slug: slugify(sname) }).select('id').single(); sr = ns }
                  if (sr?.id) await supabase.from('artist_substyles').insert({ artist_id: newGroup.id, substyle_id: sr.id })
                } catch {}
              }
            }
            if (newGroup?.id) groupId = newGroup.id
          }
        } catch (e: any) { console.error('[POST /api/artists] create group error:', e.message) }
      }
      if (groupId) {
        try {
          await supabase.from('artist_members').insert({
            group_id: groupId,
            member_id: artistId,
            year_from: g.yearFrom ? parseInt(g.yearFrom) : null,
            year_to:   g.yearTo   ? parseInt(g.yearTo)   : null,
            is_current: !g.yearTo,
          })
        } catch (e: any) { console.error('[POST /api/artists] group member insert error:', e.message) }
      }
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

    return NextResponse.json({ id: artistId, slug: newArtist.slug })

  } catch (e: any) {
    console.error('[POST /api/artists] CATCH:', e.message)
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
