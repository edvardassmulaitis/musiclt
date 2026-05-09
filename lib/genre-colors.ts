// lib/genre-colors.ts
//
// Centralizuotos 8 main muzikos žanrų spalvos. Atitinka GENRES iš
// `lib/constants.ts` ir DB `genres` table'ę (seed migracija
// 20260425_seed_genres_substyles.sql).
//
// Spalvinis kodavimas pagal žanro pobūdį — naudojama nav dropdown'e,
// planuojam pakartotinai naudoti atlikėjų / albumų puslapiuose
// (žanro badge'ai, žanro page'ų hero accent'ai, žanro tile'ai).

export type GenreColor = {
  name:    string   // tikslus DB pavadinimas (turi atitikti genres.name)
  short:   string   // trumpas display label nav'e ("Pop", "Rokas")
  href:    string   // link'as į žanro page'ą (kol nėra individualių page'ų — bendras /zanrai)
  hex:     string   // bazinė spalva (pvz #ec4899)
  rgb:     string   // ta pati kaip CSS rgba() arg'as ("236, 72, 153")
  vibe:    string   // human-readable apibūdinimas (debug / docs)
}

export const GENRE_COLORS: GenreColor[] = [
  { name: 'Alternatyvioji muzika',     short: 'Alternatyvioji', href: '/zanrai', hex: '#6366f1', rgb: '99, 102, 241',  vibe: 'indigo (alt-rock indie)' },
  { name: 'Elektroninė, šokių muzika', short: 'Elektroninė',    href: '/zanrai', hex: '#06b6d4', rgb: '6, 182, 212',   vibe: 'cyan (electric, neon)' },
  { name: "Hip-hop'o muzika",          short: 'Hip-hop',        href: '/zanrai', hex: '#eab308', rgb: '234, 179, 8',   vibe: 'gold (urban, swag)' },
  { name: 'Kitų stilių muzika',        short: 'Kiti stiliai',   href: '/zanrai', hex: '#14b8a6', rgb: '20, 184, 166',  vibe: 'teal (eclectic mix)' },
  { name: 'Pop, R&B muzika',           short: 'Pop, R&B',       href: '/zanrai', hex: '#ec4899', rgb: '236, 72, 153',  vibe: 'pink-red (pop / mainstream)' },
  { name: 'Rimtoji muzika',            short: 'Rimtoji',        href: '/zanrai', hex: '#7c3aed', rgb: '124, 58, 237',  vibe: 'royal purple (classical)' },
  { name: 'Roko muzika',               short: 'Rokas',          href: '/zanrai', hex: '#dc2626', rgb: '220, 38, 38',   vibe: 'red (rock fire)' },
  { name: 'Sunkioji muzika',           short: 'Sunkioji',       href: '/zanrai', hex: '#374151', rgb: '55, 65, 81',    vibe: 'near-black (metal / dark)' },
]

export const GENRE_COLOR_BY_NAME: Record<string, GenreColor> =
  Object.fromEntries(GENRE_COLORS.map(g => [g.name, g]))

/** Patogus helper: gauna spalvą pagal DB genre name. Jei žanro nėra
 *  GENRE_COLORS sąraše — grąžina default Kitų stilių spalvą. */
export function getGenreColor(name: string | null | undefined): GenreColor {
  if (!name) return GENRE_COLORS[3] // 'Kitų stilių muzika'
  return GENRE_COLOR_BY_NAME[name] || GENRE_COLORS[3]
}
