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
import { normalizeForMatch, primaryArtist } from '@/lib/chart-resolve'

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

// Realus "laukia peržiūros" albumų kandidatų skaičius (Wikipedia album list
// scout) — visi status='pending'.
export async function getAlbumsInboxTotal(sb: SB): Promise<number> {
  try {
    const { count } = await sb
      .from('wiki_album_candidates')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
    return count ?? 0
  } catch {
    return 0
  }
}

// Realus "laukia peržiūros" YouTube discovery kandidatų skaičius (punktas A) —
// visi status='pending'. Best-effort: jei lentelės dar nėra (migracija
// nepaleista) — grąžina 0, nelaužo bendro count'o.
export async function getDiscoveryInboxTotal(sb: SB): Promise<number> {
  try {
    const { count } = await sb
      .from('yt_discovery_candidates')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
    return count ?? 0
  } catch {
    return 0
  }
}

// „Trūkstamos iš topų" — nesusietos (track_id IS NULL) dainos per visus
// dabartinius dainų topus, dedublikuotos pagal artist|title (tas pats raktas
// kaip /admin/charts/missing puslapyje). NEįtraukiama į `total` (kitas workflow
// nei inbox kandidatai) — rodoma tik atskiro tab'o badge'e.
export async function getMissingFromChartsTotal(sb: SB): Promise<number> {
  try {
    const { data: charts } = await sb
      .from('external_charts')
      .select('id, chart_key')
      .eq('is_current', true)
      .neq('source', 'consensus')
    // TIK dainų topai — albumų topus /admin/charts/missing puslapis irgi praleidžia,
    // tad count'as turi atitikti (anksčiau įskaitydavo albumus → count > sąrašas).
    const ids = ((charts || []) as any[]).filter((c) => c.chart_key !== 'albums').map((c) => c.id)
    if (!ids.length) return 0
    const { data: entries } = await sb
      .from('external_chart_entries')
      .select('artist_name, title')
      .in('chart_id', ids)
      .is('track_id', null)
      .in('resolve_state', ['pending', 'ambiguous', 'text_only'])
      .limit(2000)
    const seen = new Set<string>()
    for (const e of (entries || []) as any[]) {
      const key = normalizeForMatch(primaryArtist(e.artist_name)) + '|' + normalizeForMatch(e.title)
      if (key.replace(/\|/g, '').trim()) seen.add(key)
    }
    // Discovery kandidatai (YouTube) — puslapis juos irgi rodo, tad įtraukiam į
    // count'ą. Tas pats keying kaip GET: atlikėjas arba (jei nėra) yt:video_id.
    try {
      const { data: disc } = await sb
        .from('yt_discovery_candidates')
        .select('artist_raw, title_raw, video_id')
        .eq('status', 'pending')
        .limit(400)
      for (const d of (disc || []) as any[]) {
        const t = (d.title_raw || '').trim()
        const a = (d.artist_raw || '').trim()
        if (!t || !a) continue // be atlikėjo nerodom (kaip ir puslapyje)
        const key = normalizeForMatch(primaryArtist(a)) + '|' + normalizeForMatch(t)
        if (key.replace(/\|/g, '').trim()) seen.add(key)
      }
    } catch { /* lentelės gali nebūti */ }
    return seen.size
  } catch {
    return 0
  }
}

export type InboxCounts = {
  news: number
  events: number
  albums: number
  discovery: number
  missing: number
  total: number
}

// Bendras VISŲ inbox tab'ų skaičius — viršutinio "📥 Inbox" badge'o šaltinis.
// `total` = news + events + albums + discovery. Kai pridedamas naujas kandidatų
// tipas, pridėk jo helper'į ČIA ir įtrauk į `total` — badge'as visuose
// puslapiuose bei InboxTabs automatiškai jį apims, be pakeitimų UI.
export async function getInboxCounts(sb: SB): Promise<InboxCounts> {
  const [news, events, albums, discovery, missing] = await Promise.all([
    getNewsInboxTotal(sb),
    getEventsInboxTotal(sb),
    getAlbumsInboxTotal(sb),
    getDiscoveryInboxTotal(sb),
    getMissingFromChartsTotal(sb),
  ])
  // `missing` NEįeina į total (kitas workflow) — tik atskiro tab'o badge'ui.
  return { news, events, albums, discovery, missing, total: news + events + albums + discovery }
}
