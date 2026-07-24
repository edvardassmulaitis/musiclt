// Topo „jau balsavau" žyma (per įrenginį, localStorage) — kai vartotojas
// prabalsuoja tam tikrame tope, tas topas pasislepia iš pagrindinio feed'o
// (hero/reels) iki kitos savaitės. (Edvardo spec 2026-07-24.)
//
// Reikšmė = galiojimo pabaigos timestamp (kitas pirmadienis 00:00 vietiniu).
// Taip žyma AUTOMATIŠKAI pasibaigia savaitės pradžioj → naujas topas vėl rodomas,
// nereikia žinoti savaitės ID hero komponente.

function nextMondayMs(): number {
  const d = new Date()
  const day = d.getDay() // 0=sekmad..6=šeštad
  const daysUntilMon = day === 0 ? 1 : 8 - day
  const mon = new Date(d)
  mon.setDate(d.getDate() + daysUntilMon)
  mon.setHours(0, 0, 0, 0)
  return mon.getTime()
}

// chart_lt/chart_world → lt_top30/top40
export function chartTypeToTop(type: string): 'lt_top30' | 'top40' | null {
  if (type === 'chart_lt') return 'lt_top30'
  if (type === 'chart_world') return 'top40'
  return null
}

export function markTopVoted(topType: string): void {
  try { localStorage.setItem(`topVoted:${topType}`, String(nextMondayMs())) } catch { /* ignore */ }
}

export function isTopVoted(topType: string | null): boolean {
  if (!topType) return false
  try {
    const v = Number(localStorage.getItem(`topVoted:${topType}`) || 0)
    return v > Date.now()
  } catch { return false }
}

// Serverio patikra (pagal user_id / IP) — ar jau balsuota tame tope. Naudojama,
// kad prabalsuoto topo kortelė pasislėptų ir naujoj (incognito) sesijoj.
export async function fetchTopVoted(topType: string): Promise<boolean> {
  try {
    const r = await fetch(`/api/top/voted?type=${topType}`, { cache: 'no-store' })
    const d = await r.json()
    return !!d.voted
  } catch { return false }
}
