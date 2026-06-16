import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { loadSubstyleRows, resolveSubstyle } from '@/lib/substyle-resolve'

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
    .select('*')
    .eq('id', id)
    .single()

  if (error || !artist) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let genres: number[] = []
  try {
    const { data: genreRows } = await supabase
      .from('artist_genres').select('genre_id').eq('artist_id', id)
    genres = (genreRows || []).map((ag: any) => ag.genre_id).filter(Boolean)
  } catch {}

  let substyleNames: string[] = []
  try {
    const { data: subs } = await supabase
      .from('artist_substyles').select('substyles(name)').eq('artist_id', id)
    substyleNames = (subs || []).map((s: any) => s.substyles?.name).filter(Boolean)
  } catch {}

  let related: any[] = []
  try {
    const { data: members } = await supabase
      .from('artist_members')
      .select('member_id, year_from, year_to, is_current, artists!artist_members_member_id_fkey(id, name, type, slug, cover_image_url)')
      .eq('group_id', id)
    for (const m of members || []) {
      const a = (m as any).artists
      // isCurrent flag'as — kritinis past_members atskyrimui form'oje.
      // Anksčiau GET'as jo negrąžindavo, todėl po save'inimo visi tapdavo „Dabartiniai".
      if (a) related.push({ id: m.member_id, name: a.name, type: a.type || 'solo', slug: a.slug, cover_image_url: a.cover_image_url, yearFrom: m.year_from ? String(m.year_from) : '', yearTo: m.year_to ? String(m.year_to) : '', isCurrent: (m as any).is_current !== false })
    }
  } catch {}
  try {
    const { data: groups } = await supabase
      .from('artist_members')
      .select('group_id, year_from, year_to, is_current, artists!artist_members_group_id_fkey(id, name, type, slug, cover_image_url)')
      .eq('member_id', id)
    for (const g of groups || []) {
      const a = (g as any).artists
      if (a) related.push({ id: g.group_id, name: a.name, type: a.type || 'group', slug: a.slug, cover_image_url: a.cover_image_url, yearFrom: g.year_from ? String(g.year_from) : '', yearTo: g.year_to ? String(g.year_to) : '', isCurrent: (g as any).is_current !== false })
    }
  } catch {}

  const links: Record<string, string> = {
    facebook:   artist.facebook   || '',
    instagram:  artist.instagram  || '',
    youtube:    artist.youtube    || '',
    tiktok:     artist.tiktok     || '',
    spotify:    artist.spotify    || '',
    soundcloud: artist.soundcloud || '',
    bandcamp:   artist.bandcamp   || '',
    twitter:    artist.twitter    || '',
  }

  let breaks: any[] = []
  try {
    const { data: breakRows } = await supabase.from('artist_breaks').select('year_from, year_to').eq('artist_id', id)
    breaks = (breakRows || []).map((b: any) => ({ from: b.year_from ? String(b.year_from) : '', to: b.year_to ? String(b.year_to) : '' }))
  } catch {}

  // Photos: artist_photos lentelė yra vienintelis šaltinis. Legacy JSON
  // kolumna `artists.photos` jau drop'inta (db-cleanup-atlanta.sql).
  let photosForUi: any[] = []
  try {
    const { data: photoRows } = await supabase
      .from('artist_photos')
      .select('id, url, caption, sort_order, is_active, photographer_id, license, source_url, taken_at, place')
      .eq('artist_id', id)
      .order('sort_order', { ascending: true })
    photosForUi = (photoRows || []).map((p: any) => {
      // Decode legacy JSON caption ({a, s}) → author + sourceUrl
      let author = ''
      let sourceUrl = p.source_url || ''
      let caption = p.caption || ''
      if (caption && caption.startsWith('{') && caption.endsWith('}')) {
        try {
          const j = JSON.parse(caption)
          author = j.a || ''
          if (!sourceUrl) sourceUrl = j.s || ''
          caption = ''
        } catch {}
      }
      // Legacy split: kai author saugotas kaip 'Name · License' (one string),
      // perskirti į name + license atskirai. Tik jei p.license dar tuščia
      // (kitaip DB license imama tiesiogiai).
      let license = p.license || ''
      if (!license && author) {
        const m = author.match(/^(.+?)\s*[·•|]\s*(.+)$/)
        if (m) {
          author = m[1].trim()
          license = m[2].trim()
        }
      }
      return {
        id: p.id,
        url: p.url,
        author,
        sourceUrl,
        license,
        takenAt: p.taken_at || '',
        place: p.place || '',
        caption,
        is_active: p.is_active !== false, // null/undef treat as active
        sort_order: p.sort_order,
      }
    })
  } catch (e: any) {
    console.error('[GET /artists/:id] photos query failed:', e?.message)
  }

  return NextResponse.json({
    ...artist,
    photos: photosForUi,
    genres,
    substyleNames,
    related,
    links,
    breaks,
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
  const d = await req.json()

  const updatePayload: any = {}
  const dbFields = [
    'name','type','country','description','cover_image_url','cover_image_wide_url','cover_image_position',
    'gender','birth_date','death_date','website','subdomain',
    'is_active','is_verified','type_music','type_film','type_dance','type_books',
    'show_updated','active_from','active_until','slug',
    // NB: 'photos' column DROPPED (db-cleanup-atlanta.sql). Photo data
    // dabar gyvena tik artist_photos lentelėje per /api/artists/[id]/photos PUT.
    'facebook','instagram','youtube','tiktok','spotify','soundcloud','bandcamp','twitter',
    // Solo atlikėjų papildomi infobox laukai (text[] tipai DB'ėje):
    //   roles — Singer, Songwriter, Producer, ...
    //   instruments — Vocals, Guitar, Piano, ...
    // Wiki import (WikipediaImport.tsx) pildo iš {{occupation}}/{{instrument}}
    // infobox laukų; admin form'a leidžia rankiniam editavimui.
    'roles','instruments',
  ]

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

  // Nariai (grupės nariai) + Grupės (solo atlikėjo grupės)
  const membersSource = d.related !== undefined ? d.related : d.members
  const groupsSource: any[] = d.groups || []

  if (membersSource !== undefined || groupsSource.length > 0) {
    try {
      await supabase.from('artist_members').delete().eq('group_id', id)
      await supabase.from('artist_members').delete().eq('member_id', id)

      // Fetch parent (this) artist info — country fallback'ui kuriam naują
      // member'į (kad jis paveldėtų grupės country, ne klaidingai gautų LT)
      // ir type-check'ui (kad neinsert'intume backwards rows į artist_members)
      const { data: parentArtist } = await supabase
        .from('artists')
        .select('id,type,country')
        .eq('id', parseInt(id))
        .maybeSingle()
      const parentCountry = parentArtist?.country || null
      const parentType = parentArtist?.type || null

      const memberRows: any[] = []

      // Nariai (šis atlikėjas yra grupė) — sukuriame jei nėra DB
      // Helper: Wiki member info → partial UPDATE payload (only non-empty values
      // from m, skip empty/null). Naudojam tiek backfill'ui, tiek INSERT'ui.
      const memberPayloadFromWiki = (m: any, parentCountry: string | null) => {
        const birthDate = m.birthYear
          ? `${m.birthYear}-${String(m.birthMonth||1).padStart(2,'0')}-${String(m.birthDay||1).padStart(2,'0')}`
          : null
        const deathDate = m.deathYear
          ? `${m.deathYear}-${String(m.deathMonth||1).padStart(2,'0')}-${String(m.deathDay||1).padStart(2,'0')}`
          : null
        return {
          country: m.country || parentCountry || null,
          cover_image_url: m.avatar || null,
          active_from: m.yearStart ? parseInt(m.yearStart) : null,
          active_until: m.yearEnd ? parseInt(m.yearEnd) : null,
          description: m.description || null,
          gender: m.gender || null,
          birth_date: birthDate,
          death_date: deathDate,
          website: m.website || null,
          facebook: m.facebook || null, instagram: m.instagram || null,
          twitter: m.twitter || null, spotify: m.spotify || null,
          youtube: m.youtube || null, soundcloud: m.soundcloud || null,
          tiktok: m.tiktok || null, bandcamp: m.bandcamp || null,
          roles: Array.isArray(m.roles) ? m.roles : null,
        }
      }

      for (const m of (membersSource as any[] || [])) {
        if (!m?.name && !m?.id) continue
        let memberId = m.id ? (typeof m.id === 'string' ? parseInt(m.id) : Number(m.id)) : null
        // Reuse existing member by name (case-insensitive solo match).
        if (!memberId && m.name) {
          try {
            const { data: existing } = await supabase.from('artists').select('id').ilike('name', m.name).eq('type', 'solo').maybeSingle()
            if (existing?.id) memberId = existing.id
          } catch {}
        }
        // Backfill: jei member'is JAU egzistuoja, užpildom tuščius DB laukus
        // Wiki info (nieko nepertašom, kas turi value). Tai svarbu re-import'ui
        // — Brian May Wiki'oj turi country=UK, birth_date 1947-07-19, bet jei
        // DB row'as šiuo metu turi tuščius laukus, importas užpildo.
        if (memberId && (m.country || m.avatar || m.birthYear || m.deathYear || m.gender || m.roles?.length)) {
          try {
            const { data: cur } = await supabase
              .from('artists')
              .select('country, cover_image_url, birth_date, death_date, gender, roles, description, website')
              .eq('id', memberId)
              .single()
            if (cur) {
              const wiki = memberPayloadFromWiki(m, parentCountry)
              const backfill: Record<string, any> = {}
              if (!cur.country && wiki.country) backfill.country = wiki.country
              if (!cur.cover_image_url && wiki.cover_image_url) backfill.cover_image_url = wiki.cover_image_url
              if (!cur.birth_date && wiki.birth_date) backfill.birth_date = wiki.birth_date
              if (!cur.death_date && wiki.death_date) backfill.death_date = wiki.death_date
              if (!cur.gender && wiki.gender) backfill.gender = wiki.gender
              if ((!cur.roles || (cur.roles as any[]).length === 0) && wiki.roles?.length) backfill.roles = wiki.roles
              if (!cur.description && wiki.description) backfill.description = wiki.description
              if (!cur.website && wiki.website) backfill.website = wiki.website
              if (Object.keys(backfill).length > 0) {
                await supabase.from('artists').update(backfill).eq('id', memberId)
              }
            }
          } catch (e: any) { console.warn('[PATCH member backfill] failed:', e?.message) }
        }
        // Sukuriame naują member'į jei dar neegzistuoja DB
        if (!memberId && m.name) {
          try {
            const mSlug = m.name.toLowerCase().replace(/[ąä]/g,'a').replace(/[čç]/g,'c').replace(/[ęèėé]/g,'e').replace(/[į]/g,'i').replace(/[š]/g,'s').replace(/[ųū]/g,'u').replace(/[ž]/g,'z').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')
            let finalSlug = mSlug
            const { data: sc } = await supabase.from('artists').select('id').eq('slug', finalSlug).maybeSingle()
            if (sc) finalSlug = `${mSlug}-${Date.now().toString(36)}`
            const wiki = memberPayloadFromWiki(m, parentCountry)
            const { data: newMember } = await supabase.from('artists').insert({
              slug: finalSlug, name: m.name, type: 'solo',
              ...wiki,
              is_active: true, is_verified: false, show_updated: false,
              type_music: true, type_film: false, type_dance: false, type_books: false,
            }).select('id').single()
            if (newMember?.id) memberId = newMember.id
          } catch (e: any) { console.error('PATCH create member error:', e.message) }
        }
        if (memberId) {
          memberRows.push({
            group_id: parseInt(id), member_id: memberId,
            year_from: m.yearFrom ? parseInt(m.yearFrom) : null,
            year_to:   m.yearTo   ? parseInt(m.yearTo)   : null,
            // Respect'inam explicit isCurrent flag'ą (iš form/Wiki import);
            // fallback į !yearTo tik jei flag'as nepateiktas. Kitaip
            // past_members be year'ų visi tampa current.
            is_current: m.isCurrent !== undefined ? !!m.isCurrent : !m.yearTo,
          })
        }
      }

      // Grupės (šis atlikėjas yra narys)
      for (const g of groupsSource) {
        let groupId = g.id ? Number(g.id) : null
        // Jei grupės nėra DB - sukuriam
        if (!groupId && g.name) {
          const gSlug = g.name.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
          const { data: existing } = await supabase.from('artists').select('id').ilike('name', g.name).maybeSingle()
          if (existing?.id) {
            groupId = existing.id
          } else {
            let slug = gSlug
            const { data: slugCheck } = await supabase.from('artists').select('id').eq('slug', slug).maybeSingle()
            if (slugCheck) slug = `${gSlug}-${Date.now().toString(36)}`
            const { data: newGroup } = await supabase.from('artists').insert({
              slug, name: g.name, type: 'group',
              is_active: true, is_verified: false, show_updated: false,
              type_music: true, type_film: false, type_dance: false, type_books: false,
            }).select('id').single()
            if (newGroup?.id) groupId = newGroup.id
          }
        }
        if (groupId) {
          // Sanity check — neinsert'inti backwards row, jei `groupId` faktiškai
          // yra solo atlikėjas. Anksčiau Wiki SPARQL P361 (part_of) kartais
          // grąžindavo grupės narius kaip "groups where artist is member" →
          // Metallica DB pateko į artist_members 6 backwards rows. Dabar
          // patikrinam target type pirma; jei solo, skipinam.
          const { data: targetArtist } = await supabase
            .from('artists').select('type').eq('id', groupId).maybeSingle()
          if (targetArtist?.type === 'solo') {
            console.warn(`[artist_members] skip backwards: parent=${id} (${parentType}), target=${groupId} (solo)`)
            continue
          }
          // Plus: neinsert'inti save į save (atlikėjas ne savo paties narys)
          if (groupId === parseInt(id)) continue
          memberRows.push({
            group_id: groupId, member_id: parseInt(id),
            year_from: g.yearFrom ? parseInt(g.yearFrom) : null,
            year_to:   g.yearTo   ? parseInt(g.yearTo)   : null,
            is_current: !g.yearTo,
          })
        }
      }

      if (memberRows.length > 0) {
        await supabase.from('artist_members').insert(memberRows)
      }
    } catch (e: any) { console.error('PATCH members/groups error:', e.message) }
  }

  // Žanras
  let artistGenreId: number | null = null
  if (d.genres !== undefined || d.genre !== undefined) {
    await supabase.from('artist_genres').delete().eq('artist_id', id)
    if (Array.isArray(d.genres) && d.genres.length > 0) {
      artistGenreId = (d.genres as number[])[0] ?? null
      await supabase.from('artist_genres').insert(
        (d.genres as number[]).map((genre_id: number) => ({ artist_id: parseInt(id), genre_id }))
      )
    } else if (d.genre) {
      const { data: genreRow } = await supabase.from('genres').select('id').ilike('name', d.genre).maybeSingle()
      if (genreRow?.id) {
        artistGenreId = genreRow.id
        await supabase.from('artist_genres').insert({ artist_id: parseInt(id), genre_id: genreRow.id })
      }
    }
  }

  // Stiliai — per resolver (fuzzy match arba 'pending', jokių dublikatų)
  if (d.substyles !== undefined || d.substyleNames !== undefined) {
    const names: string[] = d.substyles || d.substyleNames || []
    try {
      await supabase.from('artist_substyles').delete().eq('artist_id', id)
      // Jei žanras nekeistas šiame PATCH'e — paimam esamą main genre naujiems pending
      if (artistGenreId === null) {
        const { data: gr } = await supabase.from('artist_genres').select('genre_id').eq('artist_id', id).limit(1).maybeSingle()
        artistGenreId = gr?.genre_id ?? null
      }
      const subRows = await loadSubstyleRows(supabase)
      const seen = new Set<number>()
      for (const name of names) {
        if (!name?.trim()) continue
        const r = await resolveSubstyle(supabase, name, subRows, { artistGenreId, source: 'admin_edit' })
        if (r.id && !seen.has(r.id)) {
          seen.add(r.id)
          await supabase.from('artist_substyles').insert({ artist_id: parseInt(id), substyle_id: r.id })
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
  try { await supabase.from('artist_substyles').delete().eq('artist_id', artistId) } catch {}
  await supabase.from('artist_photos').delete().eq('artist_id', artistId)
  try { await supabase.from('artist_links').delete().eq('artist_id', artistId) } catch {}
  try { await supabase.from('artist_breaks').delete().eq('artist_id', artistId) } catch {}

  const { error } = await supabase.from('artists').delete().eq('id', artistId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

// ── PUT — alias for PATCH ─────────────────────────────────────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return PATCH(req, { params })
}
