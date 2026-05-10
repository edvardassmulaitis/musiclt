// lib/forum-title.ts
//
// Shared helper for cleaning legacy forum / discussion titles.
//
// Music.lt diskusijų slug'ai dažnai turi vidinį `-l\d{5,}` priesagą
// („coldplay-l194526"), kuri persikelia ir į `title` lauką. Vartotojui
// tas vidinis ID nieko nepasako — strip'iname jį prieš render'inant.
//
// Naudojama:
//   - app/atlikejai/[slug]/artist-profile-client.tsx (DiscussionRow korteles)
//   - app/diskusijos/[slug]/page.tsx (h1 + metadata)
//   - app/diskusijos/tema/[id]/thread-page-client.tsx (legacy bridge h1)
//   - app/diskusijos/page.tsx (sąrašo view)

/** Clean'ina slug'ą į žmoniškai skaitomą title.
 *  „coldplay-l194526" → „Coldplay" (be uodegos + capitalize). */
export function slugToForumTitle(slug: string): string {
  const cleaned = (slug || '')
    .replace(/\/$/, '')
    .replace(/-l\d{4,}$/i, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return 'Diskusija'
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

/** Auto-slug detection: jei title atrodo kaip auto-generated slug
 *  (lower-case, su trailing legacy ID), reikia perleisti per
 *  slugToForumTitle. Real žmoniški pavadinimai („Coldplay daina
 *  \"The Scientist\"") aiškiai turi diakritikus / didžiąsias raides. */
export function isAutoSlugTitle(title: string): boolean {
  if (!title) return false
  if (/\sl\d{4,}$/i.test(title)) return true
  // Pure lower-case ASCII / LT diakritikai be jokio didžiosios raidės,
  // skaičių, skyrybos — auto-slug pattern
  return /^[a-zĄČĘĖĮŠŲŪŽąčęėįšųūž][a-zĄČĘĖĮŠŲŪŽąčęėįšųūž\s\-_]*$/.test(title)
}

/** Šaltinis-of-truth: jei title atrodo auto-slug, naudojam slug-based
 *  prettify; kitaip — paliekam original title. */
export function prettifyDiscussionTitle(title: string | null | undefined, slug: string): string {
  const raw = (title || '').trim() || slugToForumTitle(slug)
  return isAutoSlugTitle(raw) ? slugToForumTitle(slug) : raw
}
