// app/api/admin/kolekcijos/route.ts
//
// Teminių kolekcijų (collections lentelė) CRUD adminui.
//   GET                      — visos kolekcijos (song + album), sort tvarka
//   POST   { ...fields }     — sukurti
//   PATCH  { id, ...fields } — atnaujinti (įsk. is_active, sort)
//   DELETE { id }            — ištrinti
//
// Po kiekvieno pakeitimo revalidate'inam /muzika hub'ą, kolekcijos puslapį ir
// sitemap'ą, kad SEO + generateStaticParams atsinaujintų be pilno rebuild'o.

import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { slugify } from '@/lib/slugify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['editor', 'admin', 'super_admin'].includes((session.user as any).role || '')) return null
  return session
}

const FIELDS = ['slug', 'kind', 'title', 'emoji', 'meta_title', 'description', 'intro', 'grp', 'genre_name', 'scope', 'substyle_slug', 'sort', 'is_active'] as const

function pick(body: any) {
  const out: Record<string, any> = {}
  for (const f of FIELDS) if (body[f] !== undefined) out[f] = body[f]
  return out
}

/** Revalidate visi paveikti keliai pagal kolekcijos tipą/slug. */
function revalidateCollection(kind: string, slug?: string) {
  revalidatePath('/muzika', 'layout')
  revalidatePath('/sitemap.xml')
  if (slug) {
    if (kind === 'album') revalidatePath(`/albumai/geriausi/${slug}`)
    else revalidatePath(`/dainos/${slug}`)
  }
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('collections')
      .select('id, slug, kind, title, emoji, meta_title, description, intro, grp, genre_name, scope, substyle_slug, sort, is_active, created_at')
      .order('kind', { ascending: true })
      .order('sort', { ascending: true })
    return NextResponse.json({ ok: true, items: data || [] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Klaida' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const kind = body.kind === 'album' ? 'album' : 'song'
  const title = (body.title || '').toString().trim()
  if (!title) return NextResponse.json({ ok: false, error: 'Trūksta pavadinimo' }, { status: 400 })

  const sb = createAdminClient()
  let slug = (body.slug || '').toString().trim() || slugify(title, 60)
  // Unikalumas per (kind, slug)
  const { data: exists } = await sb.from('collections').select('id').eq('kind', kind).eq('slug', slug).maybeSingle()
  if (exists) slug = `${slug}-${Date.now().toString(36).slice(-4)}`

  // Kitas sort = max+1 to kind
  const { data: last } = await sb.from('collections').select('sort').eq('kind', kind).order('sort', { ascending: false }).limit(1).maybeSingle()
  const nextSort = ((last?.sort as number) ?? -1) + 1

  const row = { ...pick(body), kind, slug, title, sort: body.sort ?? nextSort, is_active: body.is_active ?? true }
  const { data, error } = await sb.from('collections').insert(row).select('id, slug, kind').single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  revalidateCollection(kind, slug)
  return NextResponse.json({ ok: true, item: data })
}

export async function PATCH(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const id = Number(body.id)
  if (!id) return NextResponse.json({ ok: false, error: 'Trūksta id' }, { status: 400 })

  const sb = createAdminClient()
  const patch = pick(body)
  delete (patch as any).kind // kind nekeičiamas po sukūrimo
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: false, error: 'Nieko keisti' }, { status: 400 })

  const { data, error } = await sb.from('collections').update(patch).eq('id', id).select('kind, slug').single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  revalidateCollection(data.kind, data.slug)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const id = Number(body.id)
  if (!id) return NextResponse.json({ ok: false, error: 'Trūksta id' }, { status: 400 })

  const sb = createAdminClient()
  const { data: row } = await sb.from('collections').select('kind, slug').eq('id', id).maybeSingle()
  const { error } = await sb.from('collections').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (row) revalidateCollection(row.kind, row.slug)
  return NextResponse.json({ ok: true })
}
