// ─────────────────────────────────────────────────────────────────────────
// Top-nav meniu punktų matomumo valdymas.
//
// Kiekvienas valdomas nav punktas turi visibility:
//   'public'     — matomas visiems (numatyta; trūkstamas įrašas = public)
//   'hidden'     — paslėptas visiems iš meniu (puslapis lieka pasiekiamas URL)
//   'restricted' — matomas TIK allowlist nariams (el. paštas arba @username)
//
// Skaitymas: lib + /api/nav-settings (per-user paslėpti key'ai).
// Valdymas:  /admin/settings → /api/admin/nav-settings.
// Saugykla:  public.nav_settings lentelė.
// ─────────────────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase'
import { unstable_cache } from 'next/cache'

export type NavVisibility = 'public' | 'hidden' | 'restricted'

export type NavSettingRow = {
  key: string
  visibility: NavVisibility
  allowlist: string[]
  updated_at?: string
}

/** Valdomi top-nav punktai — KEY'ai turi atitikti SiteHeader NAV key'us. */
export const MANAGEABLE_NAV: { key: string; label: string }[] = [
  { key: 'muzika',      label: 'Muzika' },
  { key: 'topai',       label: 'Topai' },
  { key: 'naujienos',   label: 'Naujienos' },
  { key: 'renginiai',   label: 'Koncertai' },
  { key: 'skelbimai',   label: 'Skelbimai' },
  { key: 'bendruomene', label: 'Bendruomenė' },
]

export const MANAGEABLE_NAV_KEYS = MANAGEABLE_NAV.map(n => n.key)

export type NavViewer = { email?: string | null; username?: string | null }

/** Normalizuoja allowlist įrašą / tapatybę palyginimui (lower + be @). */
export function normIdentity(s: string | null | undefined): string {
  return (s || '').trim().toLowerCase().replace(/^@/, '')
}

/** Ar viewer'is yra restricted punkto allowlist'e (pagal el. paštą ARBA username). */
export function viewerAllowed(allowlist: string[], viewer: NavViewer): boolean {
  const set = new Set((allowlist || []).map(normIdentity).filter(Boolean))
  if (set.size === 0) return false
  const e = normIdentity(viewer.email)
  const u = normIdentity(viewer.username)
  return (!!e && set.has(e)) || (!!u && set.has(u))
}

/** Grąžina nav key'us, kuriuos reikia PASLĖPTI šiam viewer'iui. */
export function hiddenKeysFor(rows: NavSettingRow[], viewer: NavViewer): string[] {
  const hidden: string[] = []
  for (const r of rows) {
    if (r.visibility === 'hidden') hidden.push(r.key)
    else if (r.visibility === 'restricted' && !viewerAllowed(r.allowlist || [], viewer)) hidden.push(r.key)
  }
  return hidden
}

/** Pilnas valdomų punktų sąrašas admin UI'ui. Trūkstami key'ai = public. */
export async function getNavSettings(): Promise<NavSettingRow[]> {
  const sb = createAdminClient()
  const { data } = await sb.from('nav_settings').select('key, visibility, allowlist, updated_at')
  const byKey = new Map<string, NavSettingRow>(
    ((data as any[]) || []).map((r: any) => [r.key as string, r as NavSettingRow]),
  )
  return MANAGEABLE_NAV.map(
    n => byKey.get(n.key) || { key: n.key, visibility: 'public' as NavVisibility, allowlist: [] },
  )
}

/** revalidateTag raktas — admin išsaugojus nustatymus. */
export const NAV_SETTINGS_TAG = 'nav-settings'

/**
 * GLOBALŪS ne-public nav key'ai (hidden + restricted) — vartotojo-nepriklausomi.
 * Naudoja SSR <style> (NavVisibilityStyle), kad paslėptų punktus PRIEŠ pirmą
 * paint'ą (be flash'o). Cache'inta + revalidate per NAV_SETTINGS_TAG.
 */
export const getNonPublicNavKeys = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await getNavSettings()
    return rows.filter(r => r.visibility !== 'public').map(r => r.key)
  },
  ['nav-non-public-keys'],
  { tags: [NAV_SETTINGS_TAG], revalidate: 300 },
)
