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
  // Wikipedia rate-limit'ina default User-Agent'us → grąžina HTML klaidos puslapį
  // (ne JSON), o `res.json()` tada meta „Unexpected token '<'…". Todėl: normalus
  // UA + gynybinis parse + 1 pakartojimas laikinoms klaidoms.
  let lastErr = 'nežinoma klaida'
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 700))
    try {
      const res = await fetch(api, {
        signal: AbortSignal.timeout(15000),
        headers: {
          'User-Agent': 'musiclt/1.0 (https://musiclt.vercel.app; album scout)',
          Accept: 'application/json',
        },
      })
      const text = await res.text()
      if (!res.ok) { lastErr = `HTTP ${res.status}`; continue }
      let json: any
      try { json = JSON.parse(text) } catch { lastErr = 'ne JSON atsakymas (galimai rate-limit)'; continue }
      const pages = json?.query?.pages || {}
      const first: any = Object.values(pages)[0]
      return first?.revisions?.[0]?.slots?.main?.['*'] || ''
    } catch (e: any) {
      lastErr = String(e?.message || e).slice(0, 100)
    }
  }
  throw new Error(`Wikipedia API laikinai neprieinama (${lastErr}) — bandyk dar kartą`)
}
