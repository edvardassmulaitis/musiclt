// app/api/skelbimai/route.ts
//
// GET  — filtruojamas aktyvių skelbimų sąrašas (CategoryBrowser client'ui).
// POST — naujo skelbimo kūrimas (auth).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { resolveAuthorId } from '@/lib/resolve-author'
import {
  listListings, createListing, typeFromSlug,
  type ListingType, type CreateListingInput, type ListFilters,
} from '@/lib/skelbimai'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const rawType = sp.get('type')
  const type = rawType ? typeFromSlug(rawType) ?? undefined : undefined

  const num = (k: string): number | undefined => {
    const v = sp.get(k)
    if (v == null || v === '') return undefined
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }

  const filters: ListFilters = {
    type,
    subtype: sp.get('subtype') || undefined,
    city: sp.get('city') || undefined,
    instrument: sp.get('instrument') || undefined,
    genre: sp.get('genre') || undefined,
    priceMin: num('priceMin'),
    priceMax: num('priceMax'),
    q: sp.get('q') || undefined,
    sort: (sp.get('sort') as ListFilters['sort']) || 'newest',
    limit: num('limit') ?? 40,
    offset: num('offset') ?? 0,
  }

  try {
    const listings = await listListings(filters)
    return NextResponse.json({ listings })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error', listings: [] }, { status: 500 })
  }
}

const VALID_TYPES: ListingType[] = ['ploksteles', 'instrumentai', 'paslaugos', 'rysiai', 'kita']
// Visos kategorijos aktyvios.
const CREATABLE: ListingType[] = ['ploksteles', 'instrumentai', 'paslaugos', 'rysiai', 'kita']

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const sb = createAdminClient()
  const authorId = await resolveAuthorId(sb, session)
  if (!authorId) return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Neteisingi duomenys' }, { status: 400 })
  }

  const type = typeFromSlug(String(body.type || '')) || (VALID_TYPES.includes(body.type) ? body.type : null)
  if (!type) return NextResponse.json({ error: 'Nežinomas skelbimo tipas' }, { status: 400 })
  if (!CREATABLE.includes(type)) {
    return NextResponse.json({ error: 'Šis skelbimų tipas dar neaktyvus' }, { status: 400 })
  }

  const title = String(body.title || '').trim()
  if (title.length < 4) return NextResponse.json({ error: 'Pavadinimas per trumpas' }, { status: 400 })
  if (title.length > 140) return NextResponse.json({ error: 'Pavadinimas per ilgas (max 140)' }, { status: 400 })

  const priceEur = body.price === '' || body.price == null ? null : Number(body.price)
  const price_cents = priceEur != null && Number.isFinite(priceEur) && priceEur >= 0
    ? Math.round(priceEur * 100) : null

  const intOrNull = (v: any): number | null => {
    if (v === '' || v == null) return null
    const n = parseInt(String(v), 10)
    return Number.isFinite(n) ? n : null
  }

  const input: CreateListingInput = {
    type,
    subtype: body.subtype || null,
    title,
    description: typeof body.description === 'string' ? body.description.slice(0, 5000) : null,
    city: body.city || null,
    genre: body.genre || null,
    photos: Array.isArray(body.photos) ? body.photos.filter((p: any) => typeof p === 'string').slice(0, 12) : [],
    price_cents,
    price_unit: type === 'paslaugos' ? (body.price_unit || null) : null,
    is_free: !!body.is_free,
    // rysiai
    instrument: body.instrument || null,
    experience: body.experience || null,
    looking_for: typeof body.looking_for === 'boolean' ? body.looking_for : null,
    // ploksteles
    format: body.format || null,
    media_cond: body.media_cond || null,
    sleeve_cond: body.sleeve_cond || null,
    release_year: intOrNull(body.release_year),
    release_country: body.release_country || null,
    catalog_no: body.catalog_no || null,
    artist_id: intOrNull(body.artist_id),
    album_id: intOrNull(body.album_id),
    // instrumentai
    brand: body.brand || null,
    model: body.model || null,
    item_cond: body.item_cond || null,
    item_year: intOrNull(body.item_year),
  }

  try {
    const listing = await createListing(authorId, input)
    return NextResponse.json({ listing })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Nepavyko sukurti skelbimo' }, { status: 500 })
  }
}
