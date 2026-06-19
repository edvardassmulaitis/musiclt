// ─────────────────────────────────────────────────────────────────────────
// Admin sekcijų + rolių VIENAS TIESOS ŠALTINIS.
//
// Iš šio failo gyvena:
//   1. Admin homepage (app/admin/page.tsx) — renderina grupes, filtruoja pagal rolę.
//   2. Middleware (middleware.ts) — priverčia minRole serveryje (/admin/*, /api/admin/*).
//   3. Auth helperiai (lib/admin-auth.ts) — route-lygio apsauga.
//
// Edge-safe: tik gryni duomenys + grynos funkcijos, jokių React/Node priklausomybių,
// kad middleware (edge runtime) galėtų importuoti.
//
// Rolių modelis (sprendimas 2026-06-18):
//   super_admin (3) — pilnas
//   admin       (2) — pilnas (esami adminai NEPRARANDA prieigos)
//   editor      (1) — regular admin: turinys + moderavimas + augimas; BE migracijų/sistemos
//   moderator/user/* (0) — jokios admin prieigos
// ─────────────────────────────────────────────────────────────────────────

export type Role = 'user' | 'editor' | 'admin' | 'super_admin' | 'moderator' | string | null | undefined

/** Mažiausia rolė, reikalinga sekcijai/keliui. */
export type MinRole = 'editor' | 'admin'

export const ROLE_RANK: Record<string, number> = {
  super_admin: 3,
  admin: 2,
  editor: 1,
  moderator: 0,
  user: 0,
}

export function roleRank(role: Role): number {
  if (!role) return 0
  return ROLE_RANK[role] ?? 0
}

/** Ar `role` pasiekia bent `min` lygį. */
export function hasMinRole(role: Role, min: MinRole): boolean {
  const need = ROLE_RANK[min] ?? 0
  return roleRank(role) >= need
}

/** Bet kokia admin-tier rolė (editor ir aukščiau). */
export function isAdminTier(role: Role): boolean {
  return roleRank(role) >= 1
}

/** Pilna admin rolė (admin / super_admin). */
export function isFullAdmin(role: Role): boolean {
  return roleRank(role) >= 2
}

// ── Grupės ─────────────────────────────────────────────────────────────────
export type GroupKey = 'review' | 'content' | 'growth' | 'community' | 'imports' | 'system'

export type AdminGroup = {
  key: GroupKey
  title: string
  icon: string
  /** Sutraukta pagal nutylėjimą (collapse). */
  collapsed?: boolean
  /** Visa grupė reikalauja šios rolės (rodymui + numatytas sekcijų minRole). */
  minRole: MinRole
}

export const ADMIN_GROUPS: AdminGroup[] = [
  { key: 'review',    title: 'Reikia peržiūros',           icon: '📥', minRole: 'editor' },
  { key: 'content',   title: 'Turinys',                     icon: '📚', minRole: 'editor' },
  { key: 'community', title: 'Bendruomenė ir moderavimas',  icon: '💬', minRole: 'editor' },
  { key: 'imports',   title: 'Importai ir migracija',       icon: '🚀', minRole: 'admin', collapsed: true },
  { key: 'system',    title: 'Sistema',                     icon: '⚙️', minRole: 'admin', collapsed: true },
]

// ── Sekcijos ─────────────────────────────────────────────────────────────────
export type AdminSection = {
  key: string
  href: string
  newHref?: string
  icon: string
  label: string
  hint?: string
  group: GroupKey
  minRole: MinRole
  /** Raktas iš /api/admin/dashboard-summary total skaičiui. */
  countKey?: string
  /** Raktas iš dashboard-summary „laukia" badge'ui. */
  badgeKey?: string
}

export const ADMIN_SECTIONS: AdminSection[] = [
  // ── Reikia peržiūros ──────────────────────────────────────────────────────
  { key: 'inbox',          group: 'review', minRole: 'editor', href: '/admin/inbox',          icon: '📥', label: 'Naujienų inbox',          hint: 'News scout kandidatai → review / publish', badgeKey: 'inbox_pending' },
  { key: 'inbox-events',   group: 'review', minRole: 'editor', href: '/admin/inbox/events',   icon: '🗓️', label: 'Renginių inbox',          hint: 'Renginių kandidatai → patvirtinti',         badgeKey: 'events_inbox_pending' },
  { key: 'radaras',        group: 'review', minRole: 'editor', href: '/admin/radaras',        icon: '📡', label: 'Naujų atlikėjų radaras',  hint: 'Sugeneruoti / įtraukti / paslėpti — /nauji-atlikejai', badgeKey: 'radar_pending' },
  { key: 'truksta',        group: 'review', minRole: 'editor', href: '/admin/truksta-muzikos',icon: '🧩', label: 'Trūkstama muzika',        hint: 'Bendruomenės minimi atlikėjai/albumai/dainos, kurių nėra DB', badgeKey: 'missing_music' },
  { key: 'atradimai',      group: 'review', minRole: 'editor', href: '/admin/atradimai',      icon: '✨', label: 'Muzikos atradimai',       hint: 'Trūkstami atlikėjai — susieti / sukurti', badgeKey: 'atradimai_pending' },
  { key: 'claims',         group: 'review', minRole: 'editor', href: '/admin/claims',         icon: '🎫', label: 'Atlikėjų prašymai',       hint: '„Tai mano profilis" claim\'ai → studijos prieiga', badgeKey: 'claims_pending' },
  { key: 'topai-vidiniai', group: 'review', minRole: 'editor', href: '/admin/topai-vidiniai', icon: '📋', label: 'Vidiniai topai',          hint: 'Narių topai laukia susiejimo + patvirtinimo (per mėn.)', badgeKey: 'internal_tops' },
  { key: 'irasai',         group: 'review', minRole: 'editor', href: '/admin/irasai',         icon: '🗂️', label: 'Narių įrašai',            hint: 'Neperžiūrėti narių įrašai homepage juostai (per mėn.)', badgeKey: 'member_posts' },
  { key: 'substiliai',     group: 'review', minRole: 'editor', href: '/admin/substiliai',     icon: '🏷️', label: 'Substilių peržiūra',      hint: 'Pending substiliai — merge / approve / delete', badgeKey: 'substyles_pending' },
  { key: 'charts',         group: 'review', minRole: 'editor', href: '/admin/charts',         icon: '🌍', label: 'Išoriniai topai',         hint: 'Nesumatchintos dainos po dienos atnaujinimo', badgeKey: 'charts_unmatched' },
  { key: 'top',            group: 'review', minRole: 'editor', href: '/admin/top',            icon: '🏆', label: 'TOP sąrašai',             hint: 'Trūksta patvirtintų pasiūlymų ateinančiai savaitei (TOP40≥10, LT TOP30≥5)', badgeKey: 'top_short' },

  // ── Turinys ───────────────────────────────────────────────────────────────
  { key: 'artists',  group: 'content', minRole: 'editor', href: '/admin/artists',  newHref: '/admin/artists/new',  icon: '🎤', label: 'Atlikėjai',       countKey: 'artists' },
  { key: 'albums',   group: 'content', minRole: 'editor', href: '/admin/albums',   newHref: '/admin/albums/new',   icon: '💿', label: 'Albumai',         countKey: 'albums' },
  { key: 'tracks',   group: 'content', minRole: 'editor', href: '/admin/tracks',   newHref: '/admin/tracks/new',   icon: '🎵', label: 'Dainos',          countKey: 'tracks' },
  { key: 'news',     group: 'content', minRole: 'editor', href: '/admin/news',     newHref: '/admin/news/new',     icon: '📰', label: 'Naujienos',       countKey: 'news' },
  { key: 'events',   group: 'content', minRole: 'editor', href: '/admin/events',   newHref: '/admin/events/new',   icon: '📅', label: 'Renginiai',       countKey: 'events' },
  { key: 'venues',   group: 'content', minRole: 'editor', href: '/admin/venues',   newHref: '/admin/venues/new',   icon: '📍', label: 'Vietos',          countKey: 'venues' },
  { key: 'koncertu', group: 'content', minRole: 'editor', href: '/admin/koncertu-irasai', icon: '🎬', label: 'Koncertų įrašai', hint: 'Live pasirodymai iš YouTube' },
  { key: 'galerija', group: 'content', minRole: 'editor', href: '/admin/galerija', icon: '📸', label: 'Foto galerijos',  hint: 'Foto reportažai + fotografai' },
  { key: 'contacts', group: 'content', minRole: 'editor', href: '/admin/contacts', icon: '📇', label: 'Vadybininkų bazė', hint: 'Atlikėjų vadyba / booking / label kontaktai' },
  { key: 'kolekcijos', group: 'content', minRole: 'editor', href: '/admin/kolekcijos', icon: '🎼', label: 'Kolekcijos',     hint: 'Teminės dainų/albumų kolekcijos' },
  { key: 'verta',    group: 'content', minRole: 'editor', href: '/admin/verta-keliones', icon: '✈️', label: 'Verta kelionės', hint: 'Scout turai → kandidatai · koncertai · kryptys' },
  { key: 'voting',   group: 'content', minRole: 'editor', href: '/admin/voting',   icon: '🗳️', label: 'Balsavimai',  hint: 'Apdovanojimai, votings' },

  // ── Bendruomenė ir moderavimas ─────────────────────────────────────────────
  { key: 'comments',     group: 'community', minRole: 'editor', href: '/admin/comments',    icon: '💬', label: 'Komentarai',  hint: 'Visi komentarai per visas surfaces' },
  { key: 'dienos-daina', group: 'community', minRole: 'editor', href: '/admin/dienos-daina', icon: '⭐', label: 'Dienos daina', hint: 'Daily song spotlight' },

  // ── Importai ir migracija (admin tier) ─────────────────────────────────────
  { key: 'import',          group: 'imports', minRole: 'admin', href: '/admin/import',          icon: '🚀', label: 'Atlikėjų migracija', hint: 'Wiki + scrape job queue, bulk run', badgeKey: 'active_jobs' },
  { key: 'artist-import',   group: 'imports', minRole: 'admin', href: '/admin/artist-import',   icon: '📋', label: 'JSON importas',      hint: 'GPT JSON → atlikėjo info' },
  { key: 'import-forum',    group: 'imports', minRole: 'admin', href: '/admin/import/forum',    icon: '🧵', label: 'Forumo migracija',   hint: 'Senas forumas → diskusijų threads' },
  { key: 'eventai',         group: 'imports', minRole: 'admin', href: '/admin/eventai',         icon: '📆', label: 'Eventai (legacy)',   hint: 'Senų renginių importas' },
  { key: 'users-migration', group: 'imports', minRole: 'admin', href: '/admin/users-migration', icon: '👤', label: 'Narių UGC migracija', hint: 'Per-user content + likes', badgeKey: 'users_migrated' },

  // ── Sistema (admin tier) ───────────────────────────────────────────────────
  { key: 'users',            group: 'system', minRole: 'admin', href: '/admin/users',            icon: '👥', label: 'Vartotojai',       hint: 'Rolės, paieška, impersonation' },
  { key: 'search',           group: 'system', minRole: 'admin', href: '/admin/search',           icon: '🔍', label: 'Paieška',          hint: 'Paieškos indeksas / debug' },
  { key: 'genres',           group: 'system', minRole: 'admin', href: '/admin/genres',           icon: '🎨', label: 'Žanrai' },
  { key: 'role-translations',group: 'system', minRole: 'admin', href: '/admin/role-translations',icon: '🌐', label: 'Sritys / vertimai' },
  { key: 'boombox',          group: 'system', minRole: 'admin', href: '/admin/boombox',          icon: '🎛️', label: 'Boombox',          hint: 'Live stream player config' },
  { key: 'db-stats',         group: 'system', minRole: 'admin', href: '/admin/db-stats',         icon: '💾', label: 'DB stats',         hint: 'Lentelių dydžiai, dead indexes, bloat' },
  { key: 'yt-backfill',      group: 'system', minRole: 'admin', href: '/admin/yt-backfill',      icon: '🎞️', label: 'YouTube backfill', hint: 'Foninis YT info pildymas' },
  { key: 'settings',         group: 'system', minRole: 'admin', href: '/admin/settings',         icon: '🔧', label: 'Nustatymai' },
]

// ── Kelių → minRole resolveris (middleware) ─────────────────────────────────
//
// Defense-in-depth: nepriklauso nuo ADMIN_SECTIONS href tikslumo. Aiškūs prefiksai.
//
// editor-išimtys tikrinami PIRMI (specifiškesni už restricted prefiksus), pvz.
// /admin/import/pending yra review eilė (editor), nors /admin/import = migracija (admin).

const EDITOR_EXCEPTIONS = [
  '/admin/import/pending',
  '/api/admin/import/pending',
]

// Reikalauja PILNOS admin rolės (editor blokuojamas). Migracija + sistema + jautrūs.
const ADMIN_ONLY_PREFIXES = [
  '/admin/users',
  '/admin/import',
  '/admin/artist-import',
  '/admin/migration',
  '/admin/eventai',
  '/admin/users-migration',
  '/admin/boombox',
  '/admin/db-stats',
  '/admin/role-translations',
  '/admin/genres',
  '/admin/settings',
  '/admin/yt-backfill',
  '/admin/search',
  '/api/admin/users',
  '/api/admin/import',
  '/api/admin/artist-import',
  '/api/admin/migration',
  '/api/admin/eventai',
  '/api/admin/users-migration',
  '/api/admin/boombox',
  '/api/admin/db-stats',
  '/api/admin/role-translations',
  '/api/admin/genres',
  '/api/admin/recalc-artist-cascade',
  '/api/admin/rehost-scan',
  '/api/admin/wiki',
  '/api/admin/wiki-ignore-album',
  '/api/admin/wiki-meta',
  '/api/admin/internal',
  '/api/admin/search-stats',
]

function startsWithPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/')
}

/**
 * Grąžina mažiausią rolę, reikalingą šiam keliui. `null` = ne admin kelias
 * (middleware nelies). Naudojama TIK /admin ir /api/admin keliams.
 */
export function minRoleForPath(pathname: string): MinRole | null {
  const isAdminPage = startsWithPrefix(pathname, '/admin')
  const isAdminApi = startsWithPrefix(pathname, '/api/admin')
  if (!isAdminPage && !isAdminApi) return null

  // Specifiškesnės editor-išimtys nugali restricted prefiksus.
  if (EDITOR_EXCEPTIONS.some(p => startsWithPrefix(pathname, p))) return 'editor'

  if (ADMIN_ONLY_PREFIXES.some(p => startsWithPrefix(pathname, p))) return 'admin'

  return 'editor'
}

/** Ar duota rolė mato sekciją (homepage filtravimui). */
export function canSeeSection(role: Role, section: AdminSection): boolean {
  return hasMinRole(role, section.minRole)
}
