// lib/skelbimai.ts
//
// Skelbimų (bendruomenės prekyvietė / ryšių lenta) duomenų sluoksnis.
// Vienas `listings` storage'as visiems 4 tipams; čia gyvena konstantos
// (tipai, potipiai, miestai, instrumentai...) ir query helper'iai.
//
// PostgREST pastabos (projekto patirtis):
//   • async/await + try/catch, NE .catch() (builder = PromiseLike, laužo tsc).
//   • >1000 eilučių — paginate (čia listing'ai maži, limit cap = 200).

import { createAdminClient } from '@/lib/supabase'
import { slugify } from '@/lib/slugify'

// ── Tipai ─────────────────────────────────────────────────────────────────────
// DB `type` reikšmės nekeičiamos (jau deploy'inta: ploksteles|instrumentai|
// paslaugos|rysiai|kita). Keičiasi tik DISPLAY label'ai + URL slug'ai.
export type ListingType = 'ploksteles' | 'instrumentai' | 'paslaugos' | 'rysiai' | 'kita'
export type ListingStatus = 'active' | 'reserved' | 'closed' | 'expired' | 'hidden'

export type ListingTypeMeta = {
  type: ListingType
  slug: string            // URL segmentas
  label: string           // trumpas pavadinimas (nav/eilutės antraštė)
  subtitle: string        // potipių eilutė po antrašte
  h1: string              // kategorijos H1
  seoTitle: string
  desc: string
  accent: string
  /** 1 etape įjungta UI'e? (kiti — „greitai") */
  live: boolean
}

// SEO/vartosena (skelbiu.lt — dominuojantis LT portalas — naudoja
// „Muzikos įrašai" ir „Muzikos instrumentai", tad sekam ta taksonomija):
//   • Plokštelės → „Įrašai" (umbrella: vinilai/CD/kasetės)
//   • Ryšiai → „Muzikantai" (aiškiau + SEO „ieškau muzikanto/grupės nario")
export const LISTING_TYPES: Record<ListingType, ListingTypeMeta> = {
  ploksteles: {
    type: 'ploksteles', slug: 'irasai', label: 'Įrašai',
    subtitle: 'Vinilai · CD · kasetės',
    h1: 'Muzikos įrašai — vinilai, CD, kasetės',
    seoTitle: 'Muzikos įrašai — vinilai, vinilinės plokštelės, CD pirk/parduok',
    desc: 'Vinilai, CD ir kasetės — parduok, pirk arba mainykis. Prisek prie music.lt katalogo.',
    accent: '#0ea5e9', live: false,
  },
  instrumentai: {
    type: 'instrumentai', slug: 'instrumentai', label: 'Instrumentai',
    subtitle: 'Gitaros · būgnai · klavišiniai · garso technika',
    h1: 'Muzikos instrumentai',
    seoTitle: 'Muzikos instrumentai — gitaros, būgnai, klavišiniai',
    desc: 'Gitaros, bosinės, būgnai, klavišiniai, pučiamieji, garso technika — pirk ir parduok.',
    accent: '#f59e0b', live: false,
  },
  paslaugos: {
    type: 'paslaugos', slug: 'paslaugos', label: 'Paslaugos',
    subtitle: 'Pamokos · įrašymas · remontas · repeticijos',
    h1: 'Muzikos paslaugos',
    seoTitle: 'Muzikos pamokos, įrašymas, remontas — Skelbimai',
    desc: 'Muzikos pamokos, garso įrašymas, instrumentų remontas, repeticijų bazės ir daugiau.',
    accent: '#14b8a6', live: true,
  },
  rysiai: {
    type: 'rysiai', slug: 'muzikantai', label: 'Muzikantai',
    subtitle: 'Grupės nariai · bendraautoriai · repeticijos · jam\'ai',
    h1: 'Muzikantai ir grupės',
    seoTitle: 'Ieškau grupės nario, muzikanto, bendraautorio — Skelbimai',
    desc: 'Ieškai grupės nario ar grupės? Bendraautorio, repeticijų bazės, jam\'ų? Susirask muzikantų.',
    accent: '#8b5cf6', live: true,
  },
  kita: {
    type: 'kita', slug: 'kita', label: 'Kita',
    subtitle: 'Atributika · gaidos · kolekcijos',
    h1: 'Kita — muzikos atributika ir kolekcijos',
    seoTitle: 'Kita — muzikos atributika, gaidos, kolekcijos | Skelbimai',
    desc: 'Muzikos atributika, gaidos, plakatai, kolekciniai daiktai ir viskas, kas netelpa kitur.',
    accent: '#64748b', live: false,
  },
}

/** Eiliškumas hub'e ir nav'e. */
export const LISTING_TYPE_ORDER: ListingType[] = ['ploksteles', 'instrumentai', 'paslaugos', 'rysiai', 'kita']

/** URL slug → type (priima senus/alternatyvius aliasus). */
export function typeFromSlug(slug: string): ListingType | null {
  const ALIAS: Record<string, ListingType> = {
    irasai: 'ploksteles', vinilai: 'ploksteles', ploksteles: 'ploksteles',
    instrumentai: 'instrumentai',
    paslaugos: 'paslaugos',
    muzikantai: 'rysiai', rysiai: 'rysiai',
    kita: 'kita',
  }
  return ALIAS[slug] ?? null
}

// ── Potipiai ────────────────────────────────────────────────────────────────
export type Option = { value: string; label: string }

export const SUBTYPES: Record<ListingType, Option[]> = {
  rysiai: [
    { value: 'iesko-grupes-nario', label: 'Grupė ieško nario' },
    { value: 'iesko-grupes', label: 'Ieškau grupės' },
    { value: 'bendraautoris', label: 'Bendraautoris / kūryba' },
    { value: 'repeticiju-baze', label: 'Repeticijų bazė' },
    { value: 'jamai', label: 'Jam\'ai / projektai' },
  ],
  paslaugos: [
    { value: 'pamokos', label: 'Muzikos pamokos' },
    { value: 'irasymas', label: 'Garso įrašymas / studija' },
    { value: 'miksavimas', label: 'Miksavimas / mastering' },
    { value: 'remontas', label: 'Remontas / derinimas' },
    { value: 'repeticiju-baze', label: 'Repeticijų bazės nuoma' },
    { value: 'kita', label: 'Kita' },
  ],
  instrumentai: [
    { value: 'gitaros', label: 'Gitaros' },
    { value: 'bosines', label: 'Bosinės gitaros' },
    { value: 'bugnai', label: 'Būgnai / perkusija' },
    { value: 'klavisiniai', label: 'Klavišiniai' },
    { value: 'puciamieji', label: 'Pučiamieji' },
    { value: 'styginiai', label: 'Styginiai' },
    { value: 'garso-technika', label: 'Garso technika' },
    { value: 'priedai', label: 'Priedai / aksesuarai' },
  ],
  ploksteles: [
    { value: 'lp', label: 'LP (vinilas)' },
    { value: 'ep', label: 'EP' },
    { value: 'single', label: 'Singlas 7"' },
    { value: 'cd', label: 'CD' },
    { value: 'kasete', label: 'Kasetė' },
  ],
  kita: [
    { value: 'atributika', label: 'Atributika / marškinėliai' },
    { value: 'gaidos', label: 'Gaidos / knygos' },
    { value: 'plakatai', label: 'Plakatai / menas' },
    { value: 'kolekcijos', label: 'Kolekciniai daiktai' },
    { value: 'kita', label: 'Kita' },
  ],
}

export const CITIES: string[] = [
  'Vilnius', 'Kaunas', 'Klaipėda', 'Šiauliai', 'Panevėžys',
  'Alytus', 'Marijampolė', 'Mažeikiai', 'Jonava', 'Utena',
  'Nuotoliu', 'Kita',
]

export const INSTRUMENTS: Option[] = [
  { value: 'vokalas', label: 'Vokalas' },
  { value: 'gitara', label: 'Gitara' },
  { value: 'bosine', label: 'Bosinė gitara' },
  { value: 'bugnai', label: 'Būgnai' },
  { value: 'klavisiniai', label: 'Klavišiniai' },
  { value: 'puciamieji', label: 'Pučiamieji' },
  { value: 'styginiai', label: 'Styginiai' },
  { value: 'dj', label: 'DJ / prodiuseris' },
  { value: 'kita', label: 'Kita' },
]

export const EXPERIENCE: Option[] = [
  { value: 'pradedantis', label: 'Pradedantis' },
  { value: 'vidutinis', label: 'Vidutinis' },
  { value: 'patyres', label: 'Patyręs' },
  { value: 'profesionalas', label: 'Profesionalas' },
]

export const CONDITIONS: Option[] = [
  { value: 'Mint', label: 'Mint (M)' },
  { value: 'NM', label: 'Near Mint (NM)' },
  { value: 'VG+', label: 'Very Good Plus (VG+)' },
  { value: 'VG', label: 'Very Good (VG)' },
  { value: 'G', label: 'Good (G)' },
]

export const ITEM_CONDITIONS: Option[] = [
  { value: 'naujas', label: 'Naujas' },
  { value: 'kaip-naujas', label: 'Kaip naujas' },
  { value: 'geras', label: 'Geras' },
  { value: 'naudotas', label: 'Naudotas' },
  { value: 'remontui', label: 'Remontui' },
]

export const PRICE_UNITS: Option[] = [
  { value: 'val', label: '€/val.' },
  { value: 'projektas', label: '€/projektas' },
  { value: 'menesis', label: '€/mėn.' },
]

export const GENRES: string[] = [
  'Rock', 'Pop', 'Metal', 'Punk', 'Indie', 'Jazz', 'Blues', 'Folk',
  'Elektroninė', 'Hip-hop / Rap', 'Klasika', 'Reggae', 'Kita',
]

// ── Helper'iai ──────────────────────────────────────────────────────────────
export function labelFor(opts: Option[], value: string | null | undefined): string | null {
  if (!value) return null
  return opts.find(o => o.value === value)?.label ?? value
}

export function subtypeLabel(type: ListingType, value: string | null | undefined): string | null {
  return labelFor(SUBTYPES[type] || [], value)
}

/** Kaina centais → „25 €" / „nemokama" / null. */
export function formatPrice(cents: number | null | undefined, unit?: string | null, isFree?: boolean): string | null {
  if (isFree) return 'Nemokama'
  if (cents == null) return null
  const eur = cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2)
  const suffix = unit === 'val' ? '/val.' : unit === 'menesis' ? '/mėn.' : unit === 'projektas' ? '/projektas' : ''
  return `${eur} €${suffix}`
}

// ── Tipai DB eilutėms ─────────────────────────────────────────────────────────
export type Listing = {
  id: string
  type: ListingType
  subtype: string | null
  author_id: string
  title: string
  slug: string | null
  description: string | null
  city: string | null
  genre: string | null
  photos: string[]
  price_cents: number | null
  price_unit: string | null
  is_free: boolean
  instrument: string | null
  experience: string | null
  looking_for: boolean | null
  artist_id: number | null
  album_id: number | null
  format: string | null
  media_cond: string | null
  sleeve_cond: string | null
  release_year: number | null
  release_country: string | null
  catalog_no: string | null
  brand: string | null
  model: string | null
  item_cond: string | null
  item_year: number | null
  status: ListingStatus
  is_promoted: boolean
  promoted_until: string | null
  view_count: number
  save_count: number
  created_at: string
  updated_at: string
  // JOIN'ai (optional)
  author?: { id: string; username: string | null; full_name: string | null; avatar_url: string | null } | null
}

const SELECT_COLS =
  'id,type,subtype,author_id,title,slug,description,city,genre,photos,price_cents,price_unit,is_free,' +
  'instrument,experience,looking_for,artist_id,album_id,format,media_cond,sleeve_cond,release_year,' +
  'release_country,catalog_no,brand,model,item_cond,item_year,status,is_promoted,promoted_until,' +
  'view_count,save_count,created_at,updated_at,' +
  'author:profiles!listings_author_id_fkey(id,username,full_name,avatar_url)'

export type ListFilters = {
  type?: ListingType
  subtype?: string
  city?: string
  instrument?: string
  genre?: string
  priceMin?: number     // eur
  priceMax?: number     // eur
  q?: string
  sort?: 'newest' | 'price_asc' | 'price_desc'
  limit?: number
  offset?: number
}

/** Aktyvių skelbimų sąrašas su filtrais. Featured (promoted) — pirmi. */
export async function listListings(f: ListFilters = {}): Promise<Listing[]> {
  const sb = createAdminClient()
  const limit = Math.min(Math.max(f.limit ?? 40, 1), 200)
  const offset = Math.max(f.offset ?? 0, 0)

  let q = sb.from('listings').select(SELECT_COLS).eq('status', 'active')

  if (f.type) q = q.eq('type', f.type)
  if (f.subtype) q = q.eq('subtype', f.subtype)
  if (f.city) q = q.eq('city', f.city)
  if (f.instrument) q = q.eq('instrument', f.instrument)
  if (f.genre) q = q.eq('genre', f.genre)
  if (typeof f.priceMin === 'number') q = q.gte('price_cents', Math.round(f.priceMin * 100))
  if (typeof f.priceMax === 'number') q = q.lte('price_cents', Math.round(f.priceMax * 100))
  if (f.q && f.q.trim()) {
    const term = f.q.trim().replace(/[%,]/g, ' ')
    q = q.or(`title.ilike.%${term}%,description.ilike.%${term}%,brand.ilike.%${term}%,model.ilike.%${term}%`)
  }

  if (f.sort === 'price_asc') q = q.order('price_cents', { ascending: true, nullsFirst: false })
  else if (f.sort === 'price_desc') q = q.order('price_cents', { ascending: false, nullsFirst: false })
  else q = q.order('is_promoted', { ascending: false }).order('created_at', { ascending: false })

  q = q.range(offset, offset + limit - 1)

  const { data, error } = await q
  if (error) {
    if (isMissingTable(error.message)) return []
    throw error
  }
  return (data || []) as unknown as Listing[]
}

/** Featured blokas hub'ui: promoted pirmi, papildyti naujausiais (hibridas). */
export async function listFeatured(limit = 4): Promise<Listing[]> {
  const sb = createAdminClient()
  try {
    const { data: pinned } = await sb.from('listings').select(SELECT_COLS)
      .eq('status', 'active').eq('is_promoted', true)
      .order('created_at', { ascending: false }).limit(limit)
    const out = (pinned || []) as unknown as Listing[]
    if (out.length >= limit) return out.slice(0, limit)
    const { data: fresh } = await sb.from('listings').select(SELECT_COLS)
      .eq('status', 'active').eq('is_promoted', false)
      .order('created_at', { ascending: false }).limit(limit - out.length)
    return [...out, ...((fresh || []) as unknown as Listing[])]
  } catch (e: any) {
    if (isMissingTable(e?.message)) return []
    throw e
  }
}

export async function getListing(id: string): Promise<Listing | null> {
  const sb = createAdminClient()
  try {
    const { data, error } = await sb.from('listings').select(SELECT_COLS).eq('id', id).maybeSingle()
    if (error) throw error
    return (data as unknown as Listing) ?? null
  } catch (e: any) {
    if (isMissingTable(e?.message)) return null
    throw e
  }
}

/** Kiti to paties autoriaus aktyvūs skelbimai (detalės puslapiui). */
export async function listByAuthor(authorId: string, exceptId?: string, limit = 6): Promise<Listing[]> {
  const sb = createAdminClient()
  try {
    let q = sb.from('listings').select(SELECT_COLS).eq('author_id', authorId).eq('status', 'active')
      .order('created_at', { ascending: false }).limit(limit + 1)
    const { data } = await q
    let rows = (data || []) as unknown as Listing[]
    if (exceptId) rows = rows.filter(r => r.id !== exceptId)
    return rows.slice(0, limit)
  } catch (e: any) {
    if (isMissingTable(e?.message)) return []
    throw e
  }
}

/** Mano skelbimai (visi statusai). */
export async function listMine(authorId: string): Promise<Listing[]> {
  const sb = createAdminClient()
  try {
    const { data } = await sb.from('listings').select(SELECT_COLS)
      .eq('author_id', authorId).neq('status', 'hidden')
      .order('created_at', { ascending: false }).limit(200)
    return (data || []) as unknown as Listing[]
  } catch (e: any) {
    if (isMissingTable(e?.message)) return []
    throw e
  }
}

/** Įsiminti skelbimai. */
export async function listSaved(userId: string): Promise<Listing[]> {
  const sb = createAdminClient()
  try {
    const { data: saves } = await sb.from('listing_saves').select('listing_id')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(200)
    const ids = (saves || []).map((s: any) => s.listing_id)
    if (!ids.length) return []
    const { data } = await sb.from('listings').select(SELECT_COLS).in('id', ids).eq('status', 'active')
    return (data || []) as unknown as Listing[]
  } catch (e: any) {
    if (isMissingTable(e?.message)) return []
    throw e
  }
}

export async function isSaved(listingId: string, userId: string): Promise<boolean> {
  const sb = createAdminClient()
  try {
    const { data } = await sb.from('listing_saves').select('listing_id')
      .eq('listing_id', listingId).eq('user_id', userId).maybeSingle()
    return !!data
  } catch { return false }
}

/** Skaičiai pagal tipą hub plytelėms. */
export async function countsByType(): Promise<Record<ListingType, number>> {
  const sb = createAdminClient()
  const base: Record<ListingType, number> = { rysiai: 0, paslaugos: 0, ploksteles: 0, instrumentai: 0, kita: 0 }
  try {
    const { data, error } = await sb.rpc('listings_counts_by_type')
    if (error) throw error
    for (const row of (data || []) as Array<{ type: ListingType; n: number }>) {
      if (row.type in base) base[row.type] = Number(row.n) || 0
    }
    return base
  } catch (e: any) {
    if (isMissingTable(e?.message)) return base
    // RPC gali neegzistuoti senoje DB — fallback į count užklausas.
    try {
      for (const t of LISTING_TYPE_ORDER) {
        const { count } = await sb.from('listings').select('id', { count: 'exact', head: true })
          .eq('type', t).eq('status', 'active')
        base[t] = count || 0
      }
    } catch {}
    return base
  }
}

export type CreateListingInput = {
  type: ListingType
  subtype?: string | null
  title: string
  description?: string | null
  city?: string | null
  genre?: string | null
  photos?: string[]
  price_cents?: number | null
  price_unit?: string | null
  is_free?: boolean
  instrument?: string | null
  experience?: string | null
  looking_for?: boolean | null
  artist_id?: number | null
  album_id?: number | null
  format?: string | null
  media_cond?: string | null
  sleeve_cond?: string | null
  release_year?: number | null
  release_country?: string | null
  catalog_no?: string | null
  brand?: string | null
  model?: string | null
  item_cond?: string | null
  item_year?: number | null
}

export async function createListing(authorId: string, input: CreateListingInput): Promise<Listing> {
  const sb = createAdminClient()
  const row: any = {
    author_id: authorId,
    type: input.type,
    subtype: input.subtype || null,
    title: input.title.trim(),
    slug: slugify(input.title || 'skelbimas'),
    description: input.description?.trim() || null,
    city: input.city || null,
    genre: input.genre || null,
    photos: Array.isArray(input.photos) ? input.photos.slice(0, 12) : [],
    price_cents: input.is_free ? null : (input.price_cents ?? null),
    price_unit: input.price_unit || null,
    is_free: !!input.is_free,
    instrument: input.instrument || null,
    experience: input.experience || null,
    looking_for: input.looking_for ?? null,
    artist_id: input.artist_id ?? null,
    album_id: input.album_id ?? null,
    format: input.format || null,
    media_cond: input.media_cond || null,
    sleeve_cond: input.sleeve_cond || null,
    release_year: input.release_year ?? null,
    release_country: input.release_country || null,
    catalog_no: input.catalog_no || null,
    brand: input.brand || null,
    model: input.model || null,
    item_cond: input.item_cond || null,
    item_year: input.item_year ?? null,
    status: 'active',
  }
  const { data, error } = await sb.from('listings').insert(row).select(SELECT_COLS).single()
  if (error) throw error
  return data as unknown as Listing
}

function isMissingTable(msg: string | null | undefined) {
  return !!msg && /relation .* does not exist|could not find the .* table|listings_counts_by_type/i.test(msg)
}
