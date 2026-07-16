/**
 * Bendras Wikipedia wikitext fetch'eris — iškeltas iš `lib/quick-add.ts`
 * (2026-07-16, punktas B), kad `lib/wiki-album-list.ts` (naujas albumų sąrašo
 * scout'as) galėtų juo naudotis be dubliavimo. `quick-add.ts` anksčiau turėjo
 * savo lokalią (module-private) kopiją — dabar importuoja iš čia.
 *
 * Pastaba: `app/api/admin/awards/import/route.ts` turi TREČIĄ, nepriklausomą
 * kopiją (šiek tiek kitokią — grąžina `string | null` su fallback-title retry).
 * Nekeičiam jos šiame round'e (out of scope), bet ateityje verta suvienodinti.
 */

export async function fetchWikitext(title: string): Promise<string> {
  const api = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=revisions&rvprop=content&rvslots=main&format=json&origin=*&redirects=1`
  const res = await fetch(api, { signal: AbortSignal.timeout(15000) })
  const json = await res.json()
  const pages = json?.query?.pages || {}
  const first: any = Object.values(pages)[0]
  return first?.revisions?.[0]?.slots?.main?.['*'] || ''
}
