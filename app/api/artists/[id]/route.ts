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
      .select('member_id, year_from, year_to, artists!artist_members_member_id_fkey(id, name, type, slug, cover_image_url)')
      .eq('group_id', id)
    for (const m of members || []) {
      const a = (m as any).artists
      if (a) related.push({ id: m.member_id, name: a.name, type: a.type || 'solo', slug: a.slug, cover_image_url: a.cover_image_url, yearFrom: m.year_from ? String(m.year_from) : '', yearTo: m.year_to ? String(m.year_to) : '' })
    }
  } catch {}
  try {
    const { data: groups } = await supabase
      .from('artist_members')
      .select('group_id, year_from, year_to, artists!artist_members_group_id_fkey(id, name, type, slug, cover_image_url)')
      .eq('member_id', id)
    for (const g of groups || []) {
      const a = (g as any).artists
      if (a) related.push({ id: g.group_id, name: a.name, type: a.type || 'group', slug: a.slug, cover_image_url: a.cover_image_url, yearFrom: g.year_from ? String(g.year_from) : '', yearTo: g.year_to ? String(g.year_to) : '' })
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

  return NextResponse.json({ ...artist, genres, substyleNames, related, links, breaks })
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
    'name','type','country','description','cover_image_url','cover_image_wide_url',
    'gender','birth_date','death_date','website','subdomain',
    'is_active','is_verified','type_music','type_film','type_dance','type_books',
    'photos','show_updated','active_from','active_until','slug',
    'facebook','instagram','youtube','tiktok','spotify','soundcloud','bandcamp','twitter',
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

  // Nariai
  const membersSource = d.related !== undefined ? d.related : d.members
  if (membersSource !== undefined) {
    try {
      await supabase.from('artist_members').delete().eq('group_id', id)
      await supabase.from('artist_members').delete().eq('member_id', id)
      const validMembers = (membersSource as any[]).filter((m: any) => m?.id)
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
  if (d.genres !== undefined || d.genre !== undefined) {
    await supabase.from('artist_genres').delete().eq('artist_id', id)
    if (Array.isArray(d.genres) && d.genres.length > 0) {
      await supabase.from('artist_genres').insert(
        (d.genres as number[]).map((genre_id: number) => ({ artist_id: parseInt(id), genre_id }))
      )
    } else if (d.genre) {
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

// ── PUT — alias for PATCH ─────────────────────────────────────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return PATCH(req, { params })
}
