// lib/inbox-counts.ts
//
// 2026-07-16: bendra "kiek laukia peržiūros" skaičiavimo logika naujienoms ir
// renginiams. Anksčiau /admin/inbox (app/api/admin/news-candidates) ir admin
// homepage dashboard'as (app/api/admin/dashboard-summary) kiekvienas turėjo
// SAVO, nesutampantį query — dashboard'as papildomai filtravo pagal amžių
// (7d) ir tik status='pending' (be 'preview'), o renginiams pridėjo
// event_date >= today filtrą, kuris NULL datų renginius tyliai išmesdavo.
// Rezultatas: tas pats duomenų rinkinys rodydavo 3 skirtingus skaičius trijose
// vietose (pvz. "Inbox 150" / "Naujienos 150" / dashboard "1 laukia").
//
// Šitas failas — vienintelis šaltinis abiem endpoint'ams, kad tokia
// nesantaika nebegalėtų atsirasti.

import type { createAdminClient } from '@/lib/supabase'

type SB = ReturnType<typeof createAdminClient>

const NEWS_SCORE_FLOOR = () => parseInt(process.env.NEWS_SCORE_FLOOR || '20', 10)

// Realus "laukia peržiūros" naujienų kandidatų skaičius: status IN
// (preview, pending), atmetus matched žemo-score (< SCORE_FLOOR) atlikėjus —
// lygiai ta pati logika, kaip news-candidates/route.ts naudoja `total` laukui.
export async function getNewsInboxTotal(sb: SB): Promise<number> {
  try {
    const { data } = await sb
      .from('news_candidates')
      .select('primary_artist_id, primary_artist:artists!news_candidates_primary_artist_id_fkey(score)')
      .in('status', ['preview', 'pending'])
      .limit(1000)
    const floor = NEWS_SCORE_FLOOR()
    let count = 0
    for (const c of (data || []) as any[]) {
      const hasArtist = !!c.primary_artist_id
      const score = c.primary_artist?.score ?? 0
      if (hasArtist && score < floor) continue
      count++
    }
    return count
  } catch {
    return 0
  }
}

// Realus "laukia peržiūros" renginių kandidatų skaičius: visi status='pending',
// be jokio papildomo event_date filtro (praėję renginiai jau hard-deleted per
// event-candidates/route.ts cleanup'ą kiekvieno list GET metu — čia papildomas
// datos filtras tik nutylėdavo NULL-datų renginius, ne padėdavo).
export async function getEventsInboxTotal(sb: SB): Promise<number> {
  try {
    const { count } = await sb
      .from('event_candidates')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
    return count ?? 0
  } catch {
    return 0
  }
}
