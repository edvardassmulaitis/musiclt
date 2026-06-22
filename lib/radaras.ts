// lib/radaras.ts
//
// SERVER data sluoksnis „Naujos muzikos radarui" (/nauji-atlikejai). VISI
// fetch'ai server-side, react-cache'inami, try/catch degrade — kaip muzika-hub.
// Klientui saugūs tipai/hrefs gyvena lib/radaras-shared.ts (re-export žemiau).
//
// ── EMERGING DETEKCIJA (hibridas) ──────────────────────────────────────────
// DB neturi švaraus „emerging" flag'o; `legacy_id IS NULL` poolas užterštas
// chartų scaffold'u; `recent_score` visur 0; bandcamp/soundcloud tušti.
// VIENINTELIS gyvas šviežumo signalas — tracks.video_uploaded_at.
//   Auto-pool (TIK LIETUVA): įkėlimas per RADAR_WINDOW_DAYS (180 = „pusė metų" →
//   automatinis išėmimas, kai atlikėjas nustoja kelti) + legacy_likes <
//   RADAR_LIKES_CEIL (mažai žinomas) + cover. Užsienio emerging — RANKOMIS per
//   admin „Įtraukti" (legacy_likes užsieniečiams nereiškia „emerging"). Šalies
//   filtras client-side. Admin override: radar_status featured/included/excluded.

// NB: client komponentai importuoja iš lib/radaras-shared (ne iš čia), todėl
// server kodas (createAdminClient) į client bundle'į nepatenka.
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase'
import {
  type RadarArtist, type RadarTrack, type RadarStats, type RadarStyle,
  styleLabel,
} from '@/lib/radaras-shared'

// Re-export, kad esami `import { ... } from '@/lib/radaras'` veiktų toliau.
export type { RadarArtist, RadarTrack, RadarStats, RadarStyle } from '@/lib/radaras-shared'
export {
  radarArtistHref, radarTrackHref, styleHref, getYouTubeId, ytThumb, styleLabel,
} from '@/lib/radaras-shared'

/* ─────────────────────────── Tuning ─────────────────────────── */
/** Šviežumo langas (d.). 180 = „pusė metų" → atlikėjas auto-iškrenta iš radaro,
 *  jei per 6 mėn. neturi nė vieno naujo įkėlimo. */
export const RADAR_WINDOW_DAYS = 180
/** legacy_likes lubos — virš jų atlikėjas laikomas jau žinomu (ne radarui). */
export const RADAR_LIKES_CEIL = 250
/** Karjeros amžiaus riba: PIRMAS YT įkėlimas negali būti senesnis nei tiek dienų
 *  (≈1 metai). Taip atmetam veteranus, kurie turi naują dainą bet seną karjerą
 *  (pvz. Romas Dambrauskas, Saulės Kliošas). Taikoma TIK auto-pool'ui; admin
 *  „Įtraukti" praeina nepriklausomai. */
export const RADAR_CAREER_MAX_DAYS = 366
/* ── Užsienio auto-pool (NAUJA) ──────────────────────────────────────────────
 * Užsieniečiams legacy_likes ir karjeros amžius neveikia kaip „emerging" signalas
 * (jų katalogai mūsų DB seni, o music.lt like'ų mažai net garsiems). Vietoj to
 * naudojam atlikėjo populiarumo `score` juostą: pakankamai traukos, kad būtų
 * „promising", bet ne megažvaigždė. Diversifikuojam per žanrus + ribojam kiekį. */
/** Apatinė score riba — turi būti realių YT duomenų / traukos (atmeta tuščius). */
export const FOREIGN_SCORE_FLOOR = 18
/** Viršutinė score riba — virš jos jau garsus (Eminem 92, Shakira 89, Muse 85…). */
export const FOREIGN_SCORE_CEIL = 70
/** music.lt įsitraukimo lubos — dar mažai kam žinomas LT publikai. */
export const FOREIGN_LIKES_CEIL = 220
/** Karjeros pradžios riba užsieniečiams: PIRMAS YT įkėlimas per ≤tiek dienų
 *  (≈3 metai). Atmeta senus/legacy aktus (Public Enemy, The Monkees…), palieka
 *  tikrai naujus (Cortis, Bella Kay, Luis R. Conriquez…). Skaičiuojama per
 *  radar_first_uploads RPC (REST 1000-eil. limitas → bulk select nepatikimas). */
export const FOREIGN_CAREER_MAX_DAYS = 1100
/** Kiek užsienio atlikėjų maks. rodom radare (po žanrų diversifikacijos). */
export const FOREIGN_CAP = 18
/** „Šviežia" ženkliukas — paskutinis įkėlimas per tiek dienų. */
const FRESH_BADGE_DAYS = 45

const ARTIST_COLS =
  'id, slug, name, country, cover_image_url, cover_image_position, is_verified, legacy_likes, score, radar_status, radar_blurb, radar_sort, radar_set_at, created_at'

const SINCE = () => new Date(Date.now() - RADAR_WINDOW_DAYS * 86_400_000).toISOString()

/* ─────────────────── Genres helper (batch) ─────────────────── */
async function genresForArtists(ids: number[]): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>()
  if (ids.length === 0) return out
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('artist_genres')
      .select('artist_id, genres(name)')
      .in('artist_id', ids)
    for (const r of (data || []) as any[]) {
      const name = r.genres?.name
      if (!name) continue
      const arr = out.get(r.artist_id) || []
      if (arr.length < 2 && !arr.includes(name)) arr.push(name)
      out.set(r.artist_id, arr)
    }
  } catch { /* degrade */ }
  return out
}

/** Admin 'excluded' atlikėjų id rinkinys. */
const excludedIds = cache(async (): Promise<Set<number>> => {
  try {
    const sb = createAdminClient()
    const { data } = await sb.from('artists').select('id').eq('radar_status', 'excluded')
    return new Set(((data || []) as any[]).map((a) => a.id))
  } catch { return new Set() }
})

/* ─────────── Latest LT track uploads (šviežumo signalas) ───────────
 * SVARBU: auto-pool TIK Lietuva. „Mažai žinomas" = legacy_likes (music.lt
 * įsitraukimas) — užsienio atlikėjams šis signalas NEVEIKIA (pvz. The Cranberries,
 * Wiz Khalifa turi mažai music.lt like'ų, bet NĖRA emerging). Užsienio emerging
 * pridedami RANKOMIS per admin „Įtraukti" (radar_status='included'). */
type LatestRow = { artist_id: number; latest_title: string | null; latest_at: string | null; latest_video_url: string | null; legacy_likes: number | null }

function isLt(c: string | null | undefined): boolean {
  return !!c && (c === 'Lietuva' || c === 'LT' || c === 'Lithuania')
}

async function recentTrackArtists(limit = 700): Promise<{ order: number[]; latest: Map<number, LatestRow> }> {
  const latest = new Map<number, LatestRow>()
  const order: number[] = []
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('tracks')
      .select('artist_id, title, video_url, video_uploaded_at, artists!tracks_artist_id_fkey(country, legacy_likes, cover_image_url, radar_status)')
      .not('video_uploaded_at', 'is', null)
      .gte('video_uploaded_at', SINCE())
      .order('video_uploaded_at', { ascending: false })
      .limit(limit)
    for (const t of (data || []) as any[]) {
      const a = t.artists || {}
      if (!t.artist_id) continue
      if (!isLt(a.country)) continue                           // tik Lietuva (auto)
      if (!a.cover_image_url) continue                         // realus profilis
      if ((a.legacy_likes ?? 0) >= RADAR_LIKES_CEIL) continue  // mažai žinomas
      if (a.radar_status === 'excluded') continue              // DB lygio filtras
      if (!latest.has(t.artist_id)) {
        latest.set(t.artist_id, { artist_id: t.artist_id, latest_title: t.title ?? null, latest_at: t.video_uploaded_at ?? null, latest_video_url: t.video_url ?? null, legacy_likes: a.legacy_likes ?? null })
        order.push(t.artist_id)
      }
    }
  } catch { /* degrade */ }
  return { order, latest }
}

/* ─────────── Užsienio emerging kandidatai (auto, NAUJA) ───────────
 * Analogiškas recentTrackArtists, bet užsieniečiams. „Emerging" gate'as —
 * score juosta (promising, ne megažvaigždė) + maža music.lt auditorija + cover
 * + KARJEROS PRADŽIA ≤FOREIGN_CAREER_MAX_DAYS (pirmas YT įkėlimas, per RPC). */
async function recentForeignArtists(limit = 1000): Promise<{ order: number[]; latest: Map<number, LatestRow> }> {
  const latest = new Map<number, LatestRow>()
  const order: number[] = []
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('tracks')
      .select('artist_id, title, video_url, video_uploaded_at, artists!tracks_artist_id_fkey(country, legacy_likes, score, cover_image_url, radar_status)')
      .not('video_uploaded_at', 'is', null)
      .gte('video_uploaded_at', SINCE())
      .order('video_uploaded_at', { ascending: false })
      .limit(limit)
    for (const t of (data || []) as any[]) {
      const a = t.artists || {}
      if (!t.artist_id) continue
      if (!a.country || isLt(a.country)) continue              // tik užsienis (šalis privaloma)
      if (!a.cover_image_url) continue                         // kokybiškas vizualas
      if (a.radar_status === 'excluded') continue
      const score = a.score ?? 0
      if (score < FOREIGN_SCORE_FLOOR || score > FOREIGN_SCORE_CEIL) continue   // promising, ne megažvaigždė
      if ((a.legacy_likes ?? 0) >= FOREIGN_LIKES_CEIL) continue                 // dar mažai žinomas LT
      if (!latest.has(t.artist_id)) {
        latest.set(t.artist_id, { artist_id: t.artist_id, latest_title: t.title ?? null, latest_at: t.video_uploaded_at ?? null, latest_video_url: t.video_url ?? null, legacy_likes: a.legacy_likes ?? null })
        order.push(t.artist_id)
      }
    }
    // KARJEROS PRADŽIOS filtras — palik tik tuos, kurių pirmas YT įkėlimas ≤ ribos.
    // RPC radar_first_uploads(ids) = patikima min(date) per atlikėją (REST agregatai
    // išjungti, o bulk select kapojamas ties 1000 eil.). Degrade: jei RPC krenta /
    // grąžina tuščią — paliekam pool be filtro (nesunaikinam viso radaro).
    if (order.length > 0) {
      const cutoff = Date.now() - FOREIGN_CAREER_MAX_DAYS * 86_400_000
      const firstAt = new Map<number, number>()
      try {
        const { data: fu } = await sb.rpc('radar_first_uploads', { ids: order })
        for (const r of (fu || []) as any[]) {
          if (r.first_at) firstAt.set(r.artist_id, Date.parse(r.first_at))
        }
      } catch { /* degrade */ }
      if (firstAt.size > 0) {
        const kept = order.filter((id) => { const t = firstAt.get(id); return t != null && t >= cutoff })
        order.length = 0
        order.push(...kept)
      }
    }
  } catch { /* degrade */ }
  return { order, latest }
}

/** Žanrų diversifikacija — round-robin per pirmąjį žanrą, kad sąrašas būtų
 *  įvairus (ne 18 to paties stiliaus). `keepFirst` (admin „Įtraukti") visada lieka. */
function diversifyByGenre(arts: RadarArtist[], keepFirst: Set<number>, cap: number): RadarArtist[] {
  const pinned = arts.filter((a) => keepFirst.has(a.id))
  const auto = arts.filter((a) => !keepFirst.has(a.id))
  const buckets = new Map<string, RadarArtist[]>()
  for (const a of auto) {
    const key = a.genres[0] || '∅'
    const arr = buckets.get(key) || []
    arr.push(a)
    buckets.set(key, arr)
  }
  const order = [...buckets.keys()]
  const picked: RadarArtist[] = []
  let added = true
  while (added && picked.length < cap) {
    added = false
    for (const k of order) {
      const arr = buckets.get(k)!
      if (arr.length) {
        picked.push(arr.shift()!)
        added = true
        if (picked.length >= cap) break
      }
    }
  }
  return [...pinned, ...picked]
}

/** Top YT URL'ai per atlikėją (collage fallback kai nėra cover) — maks. 4 per atlikėją. */
async function topVideoUrls(ids: number[]): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>()
  if (ids.length === 0) return out
  try {
    const sb = createAdminClient()
    // BUG fix: anksčiau buvo vienas globalus order(date desc)+limit(ids*6) →
    // artist'ai su daug/seniau įkeltų dainų iškrisdavo už limito ir negaudavo
    // NĖ vieno thumb'o (collage tuščias → nematomas placeholder). Dabar
    // grupuojam pagal artist_id (eilutės gretimos) + dosnus limitas, kad
    // KIEKVIENAS atlikėjas turėtų savo įkėlimus rinkinyje. 4-cap loop'e.
    const { data } = await sb
      .from('tracks')
      .select('artist_id, video_url, video_uploaded_at')
      .in('artist_id', ids)
      .not('video_url', 'is', null)
      .order('artist_id', { ascending: true })
      .order('video_uploaded_at', { ascending: false, nullsFirst: false })
      .limit(Math.max(ids.length * 40, 4000))
    for (const t of (data || []) as any[]) {
      if (!t.video_url) continue
      const arr = out.get(t.artist_id) || []
      if (arr.length < 4) { arr.push(t.video_url); out.set(t.artist_id, arr) }
    }
  } catch { /* degrade */ }
  return out
}

/** Pirmo YT įkėlimo DATA per atlikėją (veiklos startas, ISO) — vienam id rinkiniui. */
async function firstUploadDates(ids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  if (ids.length === 0) return out
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('tracks')
      .select('artist_id, video_uploaded_at')
      .in('artist_id', ids)
      .not('video_uploaded_at', 'is', null)
      .order('video_uploaded_at', { ascending: true })
      .limit(4000)
    for (const t of (data || []) as any[]) {
      if (!out.has(t.artist_id) && t.video_uploaded_at) out.set(t.artist_id, t.video_uploaded_at)
    }
  } catch { /* degrade */ }
  return out
}

async function hydrate(ids: number[], latest: Map<number, LatestRow>): Promise<RadarArtist[]> {
  if (ids.length === 0) return []
  try {
    const sb = createAdminClient()
    const { data } = await sb.from('artists').select(ARTIST_COLS).in('id', ids)
    const byId = new Map<number, any>()
    for (const a of (data || []) as any[]) byId.set(a.id, a)
    const [genres, firstUploads, videoUrls] = await Promise.all([
      genresForArtists(ids), firstUploadDates(ids), topVideoUrls(ids),
    ])
    const now = Date.now()
    const out: RadarArtist[] = []
    for (const id of ids) {
      const a = byId.get(id)
      if (!a) continue
      if (a.radar_status === 'excluded') continue  // papildomas saugiklis
      const lr = latest.get(id)
      const latestMs = lr?.latest_at ? Date.parse(lr.latest_at) : 0
      out.push({
        id: a.id, slug: a.slug, name: a.name, country: a.country,
        cover_image_url: a.cover_image_url, cover_image_position: a.cover_image_position,
        is_verified: a.is_verified, legacy_likes: a.legacy_likes, score: a.score,
        radar_blurb: a.radar_blurb ?? null,
        genres: genres.get(id) || [],
        latest_title: lr?.latest_title ?? null, latest_at: lr?.latest_at ?? null,
        latest_video_url: lr?.latest_video_url ?? null,
        first_upload_at: firstUploads.get(id) ?? null,
        is_fresh: latestMs > 0 && now - latestMs < FRESH_BADGE_DAYS * 86_400_000,
        top_video_urls: videoUrls.get(id) || [],
      })
    }
    return out
  } catch { return [] }
}

/* ─────────────────────────── Public API ─────────────────────────── */

/** FEATURED — admin „prisegti" herojai (spotlight viršuje). */
export const getFeaturedArtists = cache(async (): Promise<RadarArtist[]> => {
  try {
    const sb = createAdminClient()
    const { data } = await sb.from('artists').select('id')
      .eq('radar_status', 'featured')
      .order('radar_sort', { ascending: false })
      .order('radar_set_at', { ascending: false, nullsFirst: false })
      .limit(8)
    const ids = ((data || []) as any[]).map((a) => a.id)
    if (ids.length === 0) return []
    const { latest } = await recentTrackArtists()
    return hydrate(ids, latest)
  } catch { return [] }
})

/** EMERGING tinklelis — included (admin) + auto-pool. Featured praleidžiam.
 *  Grąžina LIETUVĄ ir UŽSIENĮ kartu (puslapis/admin atskiria pagal šalį):
 *   • LT:       included(LT) + LT auto-pool (karjeros riba ≤1 m.) — auto-live.
 *   • Užsienis: included(world) VISADA; auto-pool (score juosta, diversifikuota)
 *               TIK kai `foreignAuto` (admino kandidatams). Viešas psl. rodo tik
 *               admino patvirtintus užsieniečius — apsauga nuo netinkamo turinio,
 *               nes score-only signalas gali iškelti ofenzyvių/legacy aktų. */
export const getEmergingArtists = cache(async (limit = 36, foreignAuto = false): Promise<RadarArtist[]> => {
  try {
    const sb = createAdminClient()
    const [excl, included, featuredRes, recentLt] = await Promise.all([
      excludedIds(),
      sb.from('artists').select('id, country, radar_sort').eq('radar_status', 'included').order('radar_sort', { ascending: false }).limit(80),
      sb.from('artists').select('id').eq('radar_status', 'featured'),
      recentTrackArtists(),
    ])
    const featuredSet = new Set(((featuredRes.data || []) as any[]).map((a) => a.id))
    const includedRows = (included.data || []) as any[]
    const includedSet = new Set<number>(includedRows.map((a) => a.id))
    const careerCutoff = Date.now() - RADAR_CAREER_MAX_DAYS * 86_400_000

    // ── LIETUVA ── included(LT) + auto LT, su karjeros riba (≤1 m. naujam auto) ──
    const ltOrdered: number[] = []
    const seenLt = new Set<number>()
    const pushLt = (id: number) => { if (seenLt.has(id) || excl.has(id) || featuredSet.has(id)) return; seenLt.add(id); ltOrdered.push(id) }
    includedRows.filter((a) => isLt(a.country)).forEach((a) => pushLt(a.id))
    recentLt.order.forEach(pushLt)
    const ltHydrated = await hydrate(ltOrdered.slice(0, Math.max(limit * 2, 60)), recentLt.latest)
    const ltFiltered = ltHydrated.filter((a) =>
      includedSet.has(a.id) || (a.first_upload_at != null && Date.parse(a.first_upload_at) >= careerCutoff),
    ).slice(0, limit)

    // ── UŽSIENIS ── included(world) VISADA; auto-pool tik admino kandidatams ──
    const recentForeign = foreignAuto ? await recentForeignArtists() : { order: [] as number[], latest: new Map<number, LatestRow>() }
    const fOrdered: number[] = []
    const seenF = new Set<number>()
    const pushF = (id: number) => { if (seenF.has(id) || excl.has(id) || featuredSet.has(id)) return; seenF.add(id); fOrdered.push(id) }
    includedRows.filter((a) => !isLt(a.country)).forEach((a) => pushF(a.id))
    recentForeign.order.forEach(pushF)
    const fHydrated = await hydrate(fOrdered.slice(0, Math.max(FOREIGN_CAP * 4, 60)), recentForeign.latest)
    // Auto kandidatams — diversifikuojam + ribojam. Be auto (vieša) — rodom visus patvirtintus.
    const fCurated = foreignAuto ? diversifyByGenre(fHydrated, includedSet, FOREIGN_CAP) : fHydrated

    return [...ltFiltered, ...fCurated]
  } catch { return [] }
})

/** Stiliai, REALIAI esantys radare (filtro chip'ams), pagal kiekį. */
export const getRadarStyles = cache(async (): Promise<RadarStyle[]> => {
  try {
    const arts = await getEmergingArtists(80)
    const counts = new Map<string, number>()
    for (const a of arts) for (const g of a.genres) counts.set(g, (counts.get(g) || 0) + 1)
    return [...counts.entries()]
      .map(([name, n]) => ({ name, n }))
      .filter((s) => styleLabel(s.name).length > 0)
      .sort((a, b) => b.n - a.n)
  } catch { return [] }
})

/** ŠVIEŽIOS DAINOS — naujausi LT track įkėlimai nuo mažiau žinomų atlikėjų. */
export const getFreshTracks = cache(async (limit = 16): Promise<RadarTrack[]> => {
  try {
    const sb = createAdminClient()
    const excl = await excludedIds()
    const { data } = await sb
      .from('tracks')
      .select('id, slug, title, cover_url, video_url, video_views, video_uploaded_at, artist_id, artists!tracks_artist_id_fkey(name, slug, country, legacy_likes, cover_image_url)')
      .not('video_uploaded_at', 'is', null)
      .gte('video_uploaded_at', SINCE())
      .order('video_uploaded_at', { ascending: false })
      .limit(160)
    // Pirma surenkam kandidatus, tada atmetam veteranus (pirmas įkėlimas > 1 m.).
    const rows = ((data || []) as any[]).filter((t) => {
      const a = t.artists || {}
      return isLt(a.country) && a.cover_image_url && (a.legacy_likes ?? 0) < RADAR_LIKES_CEIL && !excl.has(t.artist_id)
    })
    const artistIds = [...new Set(rows.map((t) => t.artist_id))]
    const careers = await firstUploadDates(artistIds)
    const careerCutoff = Date.now() - RADAR_CAREER_MAX_DAYS * 86_400_000
    const out: RadarTrack[] = []
    for (const t of rows) {
      const fu = careers.get(t.artist_id)
      if (!fu || Date.parse(fu) < careerCutoff) continue   // tik nauja karjera (≤1 m.)
      const a = t.artists || {}
      out.push({
        id: t.id, slug: t.slug ?? null, title: t.title,
        cover_url: t.cover_url ?? a.cover_image_url ?? null,
        video_url: t.video_url ?? null,
        video_views: t.video_views ?? null, uploaded_at: t.video_uploaded_at ?? null,
        artist_id: t.artist_id, artist_name: a.name, artist_slug: a.slug,
      })
      if (out.length >= limit) break
    }
    return out
  } catch { return [] }
})

/** Hero statistikos juostai. */
export const getRadarStats = cache(async (): Promise<RadarStats> => {
  try {
    const sb = createAdminClient()
    const [emerging, featured] = await Promise.all([getEmergingArtists(80), getFeaturedArtists()])
    let freshTracks = 0
    try {
      const { count } = await sb.from('tracks').select('id', { count: 'exact', head: true })
        .not('video_uploaded_at', 'is', null).gte('video_uploaded_at', SINCE())
      freshTracks = count ?? 0
    } catch { /* ignore */ }
    return { emerging: emerging.length, freshTracks, featured: featured.length }
  } catch { return { emerging: 0, freshTracks: 0, featured: 0 } }
})
