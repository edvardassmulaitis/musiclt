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
 * Pereinamojo laikotarpio fallback: kurią `top_weeks` savaitę rodyti public'e.
 *
 * Taisyklė:
 *   1. Einamoji kalendorinė savaitė (getCurrentWeekMonday) — JEI ji turi entries.
 *   2. Kitaip — naujausia finalizuota savaitė (legacy archyvas tinka).
 *
 * Kol nauja balsavimo sistema neturi balsų, einamoji savaitė tuščia →
 * pagrindiniai /top40 /top30 puslapiai rodytų "Sąrašas tuščias". Šis fallback
 * vietoj to parodo paskutinę užbaigtą (dažnai migruotą legacy) savaitę.
 *
 * Grąžina { week, isFallback }: isFallback=true reiškia, kad rodom NE einamąją
 * savaitę (UI gali parodyti "praėjusios savaitės topas" žymą + išjungti balsavimą).
 */
export async function resolveDisplayWeek(
  supabase: any,
  topType: string,
): Promise<{ week: any | null; isFallback: boolean }> {
  const thisMonday = getCurrentWeekMonday()
  const { data: cur } = await supabase
    .from('top_weeks')
    .select('*')
    .eq('top_type', topType)
    .eq('week_start', thisMonday)
    .maybeSingle()
  if (cur) {
    const { count } = await supabase
      .from('top_entries')
      .select('id', { count: 'exact', head: true })
      .eq('week_id', cur.id)
    if ((count || 0) > 0) return { week: cur, isFallback: false }
  }
  const { data: fin } = await supabase
    .from('top_weeks')
    .select('*')
    .eq('top_type', topType)
    .eq('is_finalized', true)
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (fin) return { week: fin, isFallback: true }
  return { week: cur ?? null, isFallback: false }
}

/**
 * Sufetchinti VISUS LIVE balsų count'us savaitei (registered + anon kartu).
 * Naudoti tik display'ui — rank'inimui imk `fetchLiveVoteSplit` ir naudok
 * `registered` map'ą.
 */
export async function fetchLiveVotes(supabase: any, weekId: number): Promise<Map<number, number>> {
  const split = await fetchLiveVoteSplit(supabase, weekId)
  const map = new Map<number, number>()
  for (const [tid, r] of split.registered) map.set(tid, r)
  for (const [tid, a] of split.anon) map.set(tid, (map.get(tid) || 0) + a)
  return map
}

/**
 * Sufetchinti LIVE balsus, suskirstytus pagal user_id NULL/NE-NULL.
 *
 *   registered = top_votes WHERE user_id IS NOT NULL  → naudoti rank'inimui (chart pozicijos)
 *   anon       = top_votes WHERE user_id IS NULL      → tik rodymui (admin spam-detection)
 *
 * Anti-spam taisyklė: anon balsai į top'o pozicijas NEĮEINA. Anon vis tiek
 * gali balsuoti (skatina prisijungti), bet jų balsai įtakoja tik display
 * counter'ius, ne ranking'ą.
 */
export async function fetchLiveVoteSplit(
  supabase: any,
  weekId: number,
): Promise<{ registered: Map<number, number>; anon: Map<number, number> }> {
  const { data: votes } = await supabase
    .from('top_votes')
    .select('track_id, user_id')
    .eq('week_id', weekId)
    .eq('vote_type', 'like')
  const registered = new Map<number, number>()
  const anon = new Map<number, number>()
  ;(votes || []).forEach((v: any) => {
    const target = v.user_id ? registered : anon
    target.set(v.track_id, (target.get(v.track_id) || 0) + 1)
  })
  return { registered, anon }
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
