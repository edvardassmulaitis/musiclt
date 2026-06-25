// components/NavVisibilityStyle.tsx
//
// Server component — įdeda <style>, kuris PASLEPIA visus ne-public top-nav
// punktus PRIEŠ pirmą paint'ą (be flash'o). SiteHeader (klientas) po
// /api/nav-settings perrašo šį style'ą į vartotojui specifinį sąrašą — taip
// allowlist nariams restricted punktai vėl pasirodo.
//
// Cache'inta (getNonPublicNavKeys per unstable_cache) → NEpaverčia layout'o
// dinaminiu; atsinaujina per revalidateTag(NAV_SETTINGS_TAG) admin išsaugojus.

import { getNonPublicNavKeys } from '@/lib/nav-settings'

export async function NavVisibilityStyle() {
  let keys: string[] = []
  try {
    keys = await getNonPublicNavKeys()
  } catch {
    keys = []
  }
  if (!keys.length) return null
  const css = keys.map(k => `[data-nav-key="${k}"]{display:none!important}`).join('')
  return <style id="nav-vis-ssr" dangerouslySetInnerHTML={{ __html: css }} />
}
