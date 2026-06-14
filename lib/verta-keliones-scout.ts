// lib/verta-keliones-scout.ts
//
// F2 AI scout — server-side surenka 2026 m. turų koncertus iš Wikipedia
// „Category:2026 concert tours", matchina su aktyviomis kryptimis ir įdeda į
// `abroad_event_candidates` (status=pending) admin patvirtinimui.
//
// Veikia TIK serveryje (Vercel Node fetch). Niekada nepublikuoja tiesiogiai —
// viskas per admin approve. Defensyvus: per-turą try/catch, niekada nekrenta.

import { createAdminClient } from '@/lib/supabase'

const WIKI = 'https://en.wikipedia.org/w/api.php'

// Anglų miestų → mūsų destKey. Matchinam tik tas, kurios yra aktyviose kryptyse.
const EN_CITY_TO_DEST: Record<string, string> = {
  london: 'london', warsaw: 'warsaw', berlin: 'berlin', vienna: 'vienna',
  copenhagen: 'copenhagen', stockholm: 'stockholm', madrid: 'madrid', milan: 'milan',
  rome: 'rome', barcelona: 'barcelona', amsterdam: 'amsterdam', paris: 'paris',
  budapest: 'budapest', prague: 'prague', munich: 'munich', oslo: 'oslo',
  helsinki: 'helsinki', gdansk: 'gdansk', gdynia: 'gdansk', riga: 'riga', tallinn: 'tallinn',
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
}

const VENUE_RE = /(stadium|arena|stadion|stadio|park|halle|hall|dome|festival|centre|center|field|garden|forum|palace|bowl|amphithe'?re|amphitheatre)/i

function slug(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '')
}

async function wiki(params: Record<string, string>): Promise<any> {
  const u = WIKI + '?' + new URLSearchParams({ format: 'json', origin: '*', ...params }).toString()
  const r = await fetch(u, { headers: { 'User-Agent': 'musiclt-verta-keliones-scout/1.0' } })
  if (!r.ok) throw new Error('wiki ' + r.status)
  return r.json()
}

/** Iš datos teksto → ISO 'YYYY-MM-DD' arba null (tik 2026). */
function parseDate(text: string): string | null {
  // {{dts|2026|6|10}} / {{start date|2026|6|10}}
  let m = text.match(/\{\{(?:dts|start date)\|\s*2026\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/i)
  if (m) return `2026-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  // "August 4, 2026"
  m = text.match(/([A-Z][a-z]+)\s+(\d{1,2}),?\s+2026/)
  if (m && MONTHS[m[1].toLowerCase()]) return `2026-${String(MONTHS[m[1].toLowerCase()]).padStart(2, '0')}-${m[2].padStart(2, '0')}`
  // "4 August 2026"
  m = text.match(/(\d{1,2})\s+([A-Z][a-z]+)\s+2026/)
  if (m && MONTHS[m[2].toLowerCase()]) return `2026-${String(MONTHS[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

function cleanCell(s: string): string {
  return s
    .replace(/\{\{[^}]*\}\}/g, ' ')
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
    .replace(/<[^>]+>/g, ' ')
    .replace(/''+/g, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

type Cand = {
  artist_name: string; artist_slug: string | null; artist_id: number | null
  tour_name: string; dest_key: string; city: string; country: string
  venue_name: string | null; start_date: string; image_url: string | null
  popularity: number; is_festival: boolean; source: string; source_url: string
  dedupe_key: string; status: string; genres: string[]
}

export async function runScout(opts: { maxTours?: number; maxCandidates?: number } = {}): Promise<{
  tours: number; matched: number; inserted: number; skipped_existing: number; note: string
}> {
  const sb = createAdminClient()
  const maxTours = opts.maxTours ?? 40
  const maxCandidates = opts.maxCandidates ?? 80

  // Aktyvios kryptys (tik jas matchinam).
  const { data: destRowsRaw } = await sb.from('travel_destinations').select('key, city, country').eq('is_active', true)
  const destRows: any[] = (destRowsRaw as any[]) || []
  const activeDestKeys = new Set(destRows.map(d => d.key))
  const destInfo = new Map<string, any>(destRows.map(d => [d.key, d] as [string, any]))
  const cityToDest: [string, string][] = Object.entries(EN_CITY_TO_DEST).filter(([, k]) => activeDestKeys.has(k))
  if (!cityToDest.length) return { tours: 0, matched: 0, inserted: 0, skipped_existing: 0, note: 'Nėra aktyvių krypčių' }

  // Kategorijos nariai (turų sąrašas).
  let members: { title: string }[] = []
  try {
    const cat = await wiki({ action: 'query', list: 'categorymembers', cmtitle: 'Category:2026 concert tours', cmlimit: '200', cmtype: 'page' })
    members = (cat?.query?.categorymembers || [])
  } catch (e: any) {
    return { tours: 0, matched: 0, inserted: 0, skipped_existing: 0, note: 'Wiki kategorija nepasiekiama: ' + (e?.message || '') }
  }

  const cands: Cand[] = []
  let processed = 0
  for (const mem of members) {
    if (processed >= maxTours || cands.length >= maxCandidates) break
    const title = mem.title
    if (/list of|template:|category:/i.test(title)) continue
    processed++
    try {
      const w = await wiki({ action: 'parse', page: title, prop: 'wikitext', redirects: '1' })
      const text: string = w?.parse?.wikitext?.['*'] || ''
      if (!text) continue
      const artist = title.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+(World )?Tour.*$/i, '').trim() || title
      const isFestival = /festival/i.test(title)

      // Skaidom į eilutes (wikitable). Kiekvienoj ieškom destinacijos miesto + datos.
      const rows = text.split(/\n\|-/)
      const seenInThisTour = new Set<string>()
      for (const row of rows) {
        const lower = row.toLowerCase()
        let hit: { city: string; key: string } | null = null
        for (const [enCity, key] of cityToDest) {
          if (new RegExp(`(^|[^a-z])${enCity}([^a-z]|$)`, 'i').test(lower)) { hit = { city: enCity, key }; break }
        }
        if (!hit) continue
        const date = parseDate(row)
        if (!date) continue
        const di = destInfo.get(hit.key)!
        // venue: pirmas „venue-like" cell'as
        let venue: string | null = null
        for (const cell of row.split('||')) {
          const cl = cleanCell(cell)
          if (VENUE_RE.test(cl) && cl.length < 60 && !EN_CITY_TO_DEST[cl.toLowerCase()]) { venue = cl; break }
        }
        const dk = `${slug(artist)}|${hit.key}|${date}`
        if (seenInThisTour.has(dk)) continue
        seenInThisTour.add(dk)
        cands.push({
          artist_name: artist, artist_slug: null, artist_id: null,
          tour_name: title, dest_key: hit.key, city: di.city, country: di.country,
          venue_name: venue, start_date: date, image_url: null, popularity: 0,
          is_festival: isFestival, source: 'wiki',
          source_url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_')),
          dedupe_key: dk, status: 'pending', genres: isFestival ? ['Festivalis'] : [],
        })
        if (cands.length >= maxCandidates) break
      }
    } catch { /* praleidžiam šį turą */ }
  }

  const matched = cands.length
  if (!matched) return { tours: processed, matched: 0, inserted: 0, skipped_existing: 0, note: 'Naujų atitikmenų nerasta' }

  // Populiarumo vartai: paliekam tik tuos atlikėjus, kurie YRA mūsų DB (=aktualūs
  // LT auditorijai) arba festivalius. Praturtinam nuotrauka/slug/score iš DB.
  const names = Array.from(new Set(cands.map(c => c.artist_name)))
  const dbByName = new Map<string, any>()
  for (const n of names) {
    try {
      const { data } = await sb.from('artists').select('id, name, slug, cover_image_url, score, legacy_likes')
        .ilike('name', n).limit(1)
      if (data && data[0]) dbByName.set(n.toLowerCase(), data[0])
    } catch { /* skip */ }
  }

  const keep = cands.filter(c => c.is_festival || dbByName.has(c.artist_name.toLowerCase()))
  for (const c of keep) {
    const a = dbByName.get(c.artist_name.toLowerCase())
    if (a) {
      c.artist_id = a.id; c.artist_slug = a.slug; c.image_url = a.cover_image_url || null
      const score = Number(a.score) || 0
      const likes = Number(a.legacy_likes) || 0
      c.popularity = Math.min(100, Math.max(55, Math.round(score) || (likes > 250 ? 90 : 60)))
    } else {
      c.popularity = 80 // festivaliai
    }
  }

  if (!keep.length) return { tours: processed, matched, inserted: 0, skipped_existing: 0, note: 'Atitikmenys neatitiko populiarumo filtro' }

  // Įdedam su dedupe (on_conflict dedupe_key → nieko nedarom).
  let inserted = 0, skipped = 0
  try {
    const { data, error } = await sb.from('abroad_event_candidates')
      .upsert(keep, { onConflict: 'dedupe_key', ignoreDuplicates: true })
      .select('id')
    if (error) throw error
    inserted = (data || []).length
    skipped = keep.length - inserted
  } catch (e: any) {
    return { tours: processed, matched, inserted: 0, skipped_existing: 0, note: 'DB klaida: ' + (e?.message || '') }
  }

  return { tours: processed, matched, inserted, skipped_existing: skipped, note: 'OK' }
}
