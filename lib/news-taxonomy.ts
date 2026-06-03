// lib/news-taxonomy.ts
//
// Naujienų naršymo taksonomija — single source of truth /naujienos filtrams,
// SEO landing'ams (/naujienos/stilius/[slug], /naujienos/tipas/[slug]) ir
// header mega-menu nuorodoms.
//
// Dvi ašys:
//   • TIPAS — redakcinis naujienos tipas (Naujiena/Interviu/Recenzija/Foto/Topai/
//     Koncertai/Klipas/Kita). AI-priskirtas šviežioms naujienoms (news_category
//     stulpelis); admin gali keisti. Žr. /api/internal/news-classify.
//   • STILIUS — 8 top-level žanrai (genres.parent_id IS NULL). Slug'as sutampa
//     su /zanrai/[slug] (ltSlugify(name)), kad nuorodų tinklas būtų vientisas.
//
// Pastaba: DB stulpelis vis dar vadinasi `news_category` (jis nekeičiamas), bet
// reikšmės dabar = redakciniai tipai (žemiau esantys `key`).

import { ltSlugify } from './artist-browse'

/* ─────────────────────────── Tipai ─────────────────────────── */

export type NewsTypeKey =
  | 'naujiena' | 'interviu' | 'recenzija' | 'foto'
  | 'topai' | 'koncertai' | 'klipas' | 'kita'

export type NewsType = {
  key: NewsTypeKey
  slug: string
  label: string
  /** Daugiskaita filtrų chip'ui / landing antraštei */
  labelPlural: string
  /** Trumpas SEO/landing aprašymas */
  blurb: string
  icon: string
  accent: string
}

export const NEWS_TYPES: NewsType[] = [
  {
    key: 'naujiena', slug: 'naujienos', label: 'Naujiena', labelPlural: 'Naujienos',
    blurb: 'Šviežiausios muzikos scenos žinios: nauji išleidimai, scenos įvykiai ir pranešimai.',
    icon: '📰', accent: '#0ea5e9',
  },
  {
    key: 'interviu', slug: 'interviu', label: 'Interviu', labelPlural: 'Interviu',
    blurb: 'Pokalbiai su atlikėjais, prodiuseriais ir muzikos scenos žmonėmis.',
    icon: '🎙️', accent: '#8b5cf6',
  },
  {
    key: 'recenzija', slug: 'recenzijos', label: 'Recenzija', labelPlural: 'Recenzijos',
    blurb: 'Albumų, singlų ir koncertų recenzijos bei apžvalgos.',
    icon: '⭐', accent: '#f59e0b',
  },
  {
    key: 'foto', slug: 'foto', label: 'Foto reportažas', labelPlural: 'Foto reportažai',
    blurb: 'Koncertų ir renginių foto reportažai bei galerijos.',
    icon: '📸', accent: '#ec4899',
  },
  {
    key: 'topai', slug: 'topai', label: 'Topai', labelPlural: 'Topai ir sąrašai',
    blurb: 'Reitingai, geriausiųjų sąrašai ir muzikos topai.',
    icon: '🏆', accent: '#ef4444',
  },
  {
    key: 'koncertai', slug: 'koncertai', label: 'Koncertai', labelPlural: 'Koncertai ir anonsai',
    blurb: 'Koncertų ir festivalių anonsai, turų datos bei bilietų pardavimai.',
    icon: '🎫', accent: '#10b981',
  },
  {
    key: 'klipas', slug: 'klipai', label: 'Vaizdo klipas', labelPlural: 'Vaizdo klipai',
    blurb: 'Naujų vaizdo klipų ir premjerų pristatymai.',
    icon: '🎬', accent: '#06b6d4',
  },
  {
    key: 'kita', slug: 'kita', label: 'Kita', labelPlural: 'Kita',
    blurb: 'Jubiliejai, apdovanojimai, prisiminimai ir kitos scenos istorijos.',
    icon: '🎶', accent: '#64748b',
  },
]

const TYPE_BY_SLUG = new Map<string, NewsType>(
  NEWS_TYPES.map((t) => [t.slug, t] as [string, NewsType])
)
const TYPE_BY_KEY = new Map<string, NewsType>(
  NEWS_TYPES.map((t) => [t.key, t] as [string, NewsType])
)

export function findTypeBySlug(slug: string): NewsType | undefined {
  return TYPE_BY_SLUG.get((slug || '').toLowerCase())
}
export function findTypeByKey(key: string | null | undefined): NewsType | undefined {
  if (!key) return undefined
  return TYPE_BY_KEY.get(key)
}
export function typeLabel(key: string | null | undefined): string | null {
  if (!key) return null
  return TYPE_BY_KEY.get(key)?.label || null
}

export const NEWS_TYPE_KEYS: NewsTypeKey[] = NEWS_TYPES.map((t) => t.key)

/* ───────────────────────────── Stiliai ───────────────────────────── */

export type NewsStyle = {
  /** genres.id (top-level) */
  id: number
  name: string
  slug: string
  icon: string
  accent: string
}

// genres.id reikšmės fiksuotos (žr. 20260425_seed_genres_substyles.sql seed'ą).
// Slug'as išvedamas per ltSlugify, kad sutaptų su /zanrai/[slug].
const STYLE_SEED: Array<{ id: number; name: string; icon: string; accent: string }> = [
  { id: 1000562, name: 'Roko muzika',                icon: '🎸', accent: '#ef4444' },
  { id: 1000560, name: 'Pop, R&B muzika',            icon: '🎤', accent: '#ec4899' },
  { id: 1000558, name: "Hip-hop'o muzika",           icon: '🎧', accent: '#f59e0b' },
  { id: 1000557, name: 'Elektroninė, šokių muzika',  icon: '🎛️', accent: '#06b6d4' },
  { id: 1000556, name: 'Alternatyvioji muzika',      icon: '🎚️', accent: '#8b5cf6' },
  { id: 1000563, name: 'Sunkioji muzika',            icon: '🔥', accent: '#b91c1c' },
  { id: 1000561, name: 'Rimtoji muzika',             icon: '🎻', accent: '#0ea5e9' },
  { id: 1000559, name: 'Kitų stilių muzika',         icon: '🔀', accent: '#10b981' },
]

export const NEWS_STYLES: NewsStyle[] = STYLE_SEED.map((s) => ({
  ...s,
  slug: ltSlugify(s.name),
}))

const STYLE_BY_SLUG = new Map<string, NewsStyle>(
  NEWS_STYLES.map((s) => [s.slug, s] as [string, NewsStyle])
)
const STYLE_BY_ID = new Map<number, NewsStyle>(
  NEWS_STYLES.map((s) => [s.id, s] as [number, NewsStyle])
)

export function findStyleBySlug(slug: string): NewsStyle | undefined {
  return STYLE_BY_SLUG.get((slug || '').toLowerCase())
}
export function styleById(id: number | null | undefined): NewsStyle | undefined {
  return id == null ? undefined : STYLE_BY_ID.get(id)
}

/* ───────────────────────────── Scope ─────────────────────────────── */

export type NewsScope = 'lt' | 'world'
export const NEWS_SCOPES: Array<{ key: NewsScope; slug: string; label: string }> = [
  { key: 'lt', slug: 'lietuva', label: 'Lietuva' },
  { key: 'world', slug: 'pasaulis', label: 'Pasaulis' },
]
