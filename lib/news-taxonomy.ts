// lib/news-taxonomy.ts
//
// Naujienų naršymo taksonomija — single source of truth /naujienos filtrams,
// SEO landing'ams (/naujienos/stilius/[slug], /naujienos/kategorija/[slug]) ir
// header mega-menu nuorodoms.
//
// Dvi ašys:
//   • KATEGORIJA — AI-priskirta (release/tour/performance/career_step/other).
//     Žr. lib/news-categories.ts (NEWS_CATEGORIES) ir /api/admin/news/classify.
//   • STILIUS — 8 top-level žanrai (genres.parent_id IS NULL). Slug'as sutampa
//     su /zanrai/[slug] (ltSlugify(name)), kad nuorodų tinklas būtų vientisas.

import { ltSlugify } from './artist-browse'

/* ─────────────────────────── Kategorijos ─────────────────────────── */

export type NewsCategoryKey = 'release' | 'tour' | 'performance' | 'career_step' | 'other'

export type NewsBrowseCategory = {
  key: NewsCategoryKey
  slug: string
  label: string
  /** Trumpas SEO/landing aprašymas */
  blurb: string
  icon: string
  accent: string
}

export const NEWS_BROWSE_CATEGORIES: NewsBrowseCategory[] = [
  {
    key: 'release',
    slug: 'isleidimai',
    label: 'Nauji išleidimai',
    blurb: 'Naujausi singlai, EP, albumai, klipai ir muzikos vaizdo įrašai.',
    icon: '💿',
    accent: '#0ea5e9',
  },
  {
    key: 'tour',
    slug: 'turai',
    label: 'Turai ir koncertai',
    blurb: 'Koncertų anonsai, turų datos, bilietai ir papildomi pasirodymai.',
    icon: '🎫',
    accent: '#f59e0b',
  },
  {
    key: 'performance',
    slug: 'pasirodymai',
    label: 'Specialūs pasirodymai',
    blurb: 'Festivalių headlineriai, kolaboracijos, vienkartiniai šou ir duetai.',
    icon: '🎤',
    accent: '#ef4444',
  },
  {
    key: 'career_step',
    slug: 'karjera',
    label: 'Karjera ir scena',
    blurb: 'Sutartys, naujų grupių susikūrimas, projektai ir karjeros žingsniai.',
    icon: '🚀',
    accent: '#8b5cf6',
  },
  {
    key: 'other',
    slug: 'kita',
    label: 'Kita',
    blurb: 'Interviu, jubiliejai, apdovanojimai, chartai ir scenos istorijos.',
    icon: '🎶',
    accent: '#10b981',
  },
]

const CATEGORY_BY_SLUG = new Map(NEWS_BROWSE_CATEGORIES.map((c) => [c.slug, c]))
const CATEGORY_BY_KEY = new Map(NEWS_BROWSE_CATEGORIES.map((c) => [c.key, c]))

export function findCategoryBySlug(slug: string): NewsBrowseCategory | undefined {
  return CATEGORY_BY_SLUG.get((slug || '').toLowerCase())
}
export function categoryLabel(key: string | null | undefined): string | null {
  if (!key) return null
  return CATEGORY_BY_KEY.get(key as NewsCategoryKey)?.label || null
}

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

const STYLE_BY_SLUG = new Map(NEWS_STYLES.map((s) => [s.slug, s]))
const STYLE_BY_ID = new Map(NEWS_STYLES.map((s) => [s.id, s]))

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
