/**
 * Centralizuotas helperis "einamosios savaitės" logikai.
 *
 * Tvirta taisyklė: aktyvi topas savaitė = einamoji kalendorinė savaitė
 * (Mon-Sun konvencija). NIEKADA nekuriame ateities savaičių rankomis —
 * tik kron'as automatu sekmadienį/šeštadienį.
 *
 * Naudoti VISUR kur reikia rasti einamąjį `top_weeks` įrašą:
 * - /api/top/weeks GET (self-heal create-if-missing)
 * - /api/top/entries GET
 * - /api/top/populate POST
 * - /api/top/reset POST
 * - /app/top40/page.tsx, /app/top30/page.tsx (public)
 */

/**
 * Grąžina einamosios savaitės pirmadienio datą formatu YYYY-MM-DD.
 *
 * Pavyzdžiai:
 *   Mon 2026-05-04 → "2026-05-04"
 *   Tue 2026-05-05 → "2026-05-04"
 *   Sun 2026-05-10 → "2026-05-04"
 *   Mon 2026-05-11 → "2026-05-11"
 */
export function getCurrentWeekMonday(now: Date = new Date()): string {
  const d = new Date(now)
  const day = d.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

/**
 * Skaičiuoja vote_close timestamp einamai savaitei.
 *
 * top40 → sekmadienis 13:00 UTC (= 15/16:00 Vilniaus)
 * lt_top30 → šeštadienis 13:00 UTC
 */
export function getVoteClose(topType: string, mondayStr: string): string {
  const monday = new Date(mondayStr + 'T00:00:00')
  if (topType === 'lt_top30') {
    const sat = new Date(monday)
    sat.setDate(sat.getDate() + 5)
    sat.setUTCHours(13, 0, 0, 0)
    return sat.toISOString()
  } else {
    const sun = new Date(monday)
    sun.setDate(sun.getDate() + 6)
    sun.setUTCHours(13, 0, 0, 0)
    return sun.toISOString()
  }
}
