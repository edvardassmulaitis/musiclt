// lib/track-popbar.ts
//
// PopBar level (0..5) — absoliutūs threshold'ai, kuriais remiamasi tiek
// public puslapyje /atlikejai/[slug], tiek admin debug puslapyje
// /admin/artists/[id]/tracks-debug. Ekstraktuota iš artist-profile-client.tsx
// 2026-05-25 v3, kad server (admin) komponentai galėtų importuoti pure
// utility neištraukdami visą 'use client' bundle'į.
//
// Formulė imama MAX iš dviejų signalų:
//   • viewsPerDay (YT views / amžius dienomis, min 30 d kad nauji release'ai
//     neturėtų inflated metric'os)
//   • likes count (music.lt community love)
//
// Threshold'ai v3 (2026-05-25): 5/5 pakelta į „mega-hit only" lygį, kad
// rikiavime aiškiai matytųsi 1-2 absoliutūs viršūniniai vietoj 5-10.

/** ABSOLUTE PopBar level (0..5) — replaces percentile-based ranking
 *  2026-05-25 v3.
 *
 *  Threshold'ai kalibruoti pagal realią music.lt duomenų bazę:
 *    - „Hymn for the Weekend" (Coldplay) ~630k views/d → 5/5
 *    - „Yellow" (Coldplay) ~110k views/d → 4/5
 *    - „Geltona" (Mamontovas) 107 likes → 4/5
 *    - „Tavo svajonė" (Mamontovas) 177 likes ~325 v/d → 4/5
 *
 *  Tikslas: vienodi semantiniai dashes — 5/5 reiškia realiai TOP global
 *  hit'ą, ne tiesiog „šio atlikėjo populiariausias". */
export function trackPopAbsoluteLevel(t: any, nowMs: number = Date.now()): number {
  const views = Number(t?.video_views || 0)
  const likes = Number(t?.like_count || 0)

  // Track age in days — min 30 d, kad ką tik išleisti track'ai neturėtų
  // dirbtinai didelės views/day metric'os.
  let ageDays = 365
  const yr = Number(t?.release_year || 0)
  if (yr > 1900 && yr <= new Date(nowMs).getFullYear() + 1) {
    const mo = Math.max(1, Math.min(12, Number(t?.release_month || 6))) - 1
    const dy = Math.max(1, Math.min(28, Number(t?.release_day || 15)))
    const releaseMs = new Date(yr, mo, dy).getTime()
    if (Number.isFinite(releaseMs) && releaseMs < nowMs) {
      ageDays = Math.max(30, (nowMs - releaseMs) / 86400000)
    }
  } else if (t?.release_date) {
    const releaseMs = new Date(t.release_date).getTime()
    if (Number.isFinite(releaseMs) && releaseMs < nowMs) {
      ageDays = Math.max(30, (nowMs - releaseMs) / 86400000)
    }
  }

  const viewsPerDay = views > 0 ? views / ageDays : 0

  // Views/day threshold'ai — 2026-05-25 v3: spacing eksponentinis ×10
  //   5/5 — 300k+ views/d (~110M/metus)   — top ~50 dainų istorijoje
  //   4/5 — 30k+  views/d (~11M/metus)    — major global hit
  //   3/5 — 3k+   views/d (~1M/metus)     — solid, žinoma daina
  //   2/5 — 200+  views/d                 — turinti auditoriją
  //   1/5 — 1+    views/d                 — bent kažkokia veikla
  let vLevel = 0
  if (viewsPerDay >= 300000) vLevel = 5
  else if (viewsPerDay >= 30000) vLevel = 4
  else if (viewsPerDay >= 3000) vLevel = 3
  else if (viewsPerDay >= 200) vLevel = 2
  else if (viewsPerDay >= 1) vLevel = 1

  // ── Likes — SECONDARY signal'as 2026-05-25 v5 ────────────────────────
  // Anksčiau (v1-v4) buvo `max(vLevel, lLevel)` — likes galėjo dominuoti
  // vienas (LT atlikėjas su 322 likes ir 0 YT views gaudavo 5/5). Problema:
  // music.lt likes priklauso nuo site useriu aktivumo, ne nuo realaus
  // dainos populiarumo globaliai. Coldplay „Yellow" (110k v/d) ir
  // nepopuliari LT daina su pakeltais likes gaudavo tą patį 5/5 — semantika
  // nesutapdavo.
  //
  // Dabar likes veikia tik kaip „LT community signal'as": jei artist'as
  // gauna stiprų likes count'ą, level pakeliamas +1 (pvz. modest YT footprint
  // + LT crown jewel = 1 → 2/5, ne 5/5). Pridėtinis +1 dar jei labai stiprus.
  // Likes NIEKADA negali būti vienintelis kelias į 5/5 — tas reserved
  // realiai viraliniams YT hit'ams (300k+ v/d).
  //
  // Floor: jei YT data trūksta (vLevel=0) bet likes egzistuoja → bent 1/5,
  // kad music.lt-only track'ai nebūtų pilnai 0/5.
  let level = vLevel

  // +1 nudge: stiprus LT community signal'as (≥ 100 likes — major LT hit)
  if (likes >= 100 && level < 5) level = level + 1

  // +2 nudge: labai stiprus crown jewel signal'as (≥ 500 likes — legendinė)
  // Tai gali maks pakelti views-based 3/5 į 5/5, bet ne views-based 0/5 (toks
  // case'as turi 1/5 floor only) — nelygu reservation 5/5 viraliniams hit'ams.
  if (likes >= 500 && level >= 3 && level < 5) level = level + 1

  // Floor: tracks be YT data (vLevel=0) bet su likes — bent 1/5 kad bar
  // matytųsi. NB: šitas case'as paprastai LT atlikėjas be YT enrichment'o.
  if (level === 0 && likes >= 8) level = 1

  return Math.min(5, level)
}

// ───────────────────────────────────────────────────────────────────────
// Composite continuous score + lexicographic sort value
// ───────────────────────────────────────────────────────────────────────
// Ekstraktuota iš artist-profile-client.tsx 2026-05-25 v4, kad admin
// debug puslapis (server component) sort'intų tracks lygiai taip pat
// kaip public puslapis — anksčiau admin turėjo savo log10(views)*50 +
// log10(likes)*10 formulę, kuri nesutapdavo su public lexicographic sort.

/** Composite popularity score — naudojamas TIK kaip continuous tiebreaker
 *  per `trackArtistSortVal` lexicographic sort'ą. PopBar level'is gauna
 *  primary rank'ą iš `trackPopAbsoluteLevel`, o čia gražinama smooth value
 *  tarp 0-150, kad track'ai TAS PAČIAS level'is būtų tvarkingoje eilėje
 *  pagal jų stiprumą (level=5 vidury vis tiek aukščiau už level=5 ribose).
 *
 *  Formulė: log10(views/day) + log10(likes) — abu signal'ai sveriami
 *  log-skale (kompresija), tada pridėjam mažus bonus'us už is_single ir
 *  video_url buvimą (tiebreaker'iai kai abi metrikos identiškos).
 */
export function trackCompositeScore(t: any, nowMs: number = Date.now()): number {
  const views = Number(t?.video_views || 0)
  const likes = Number(t?.like_count || 0)

  // Track age — identiškai kaip trackPopAbsoluteLevel'yje (kad sort'as ir
  // level'is naudotų tą pačią age semantiką → monotoniškas mapping'as).
  let ageDays = 365
  const yr = Number(t?.release_year || 0)
  if (yr > 1900 && yr <= new Date(nowMs).getFullYear() + 1) {
    const mo = Math.max(1, Math.min(12, Number(t?.release_month || 6))) - 1
    const dy = Math.max(1, Math.min(28, Number(t?.release_day || 15)))
    const releaseMs = new Date(yr, mo, dy).getTime()
    if (Number.isFinite(releaseMs) && releaseMs < nowMs) {
      ageDays = Math.max(30, (nowMs - releaseMs) / 86400000)
    }
  } else if (t?.release_date) {
    const releaseMs = new Date(t.release_date).getTime()
    if (Number.isFinite(releaseMs) && releaseMs < nowMs) {
      ageDays = Math.max(30, (nowMs - releaseMs) / 86400000)
    }
  }

  const viewsPerDay = views > 0 ? views / ageDays : 0

  // Continuous score — abu signal'ai pridedami (ne max), kad track'as su
  // gerom abiem metrikom rankuotų aukščiau už track'ą su viena puikia +
  // viena nuline. Diapazonas ~0-150.
  const viewsScore = Math.log10(viewsPerDay + 1) * 10  // max ~50 prie 1M views/d
  const likesScore = Math.log10(likes + 1) * 20        // max ~80 prie 10000 likes
  const single = t?.is_single ? 0.5 : 0
  const video = t?.video_url ? 0.2 : 0

  return viewsScore + likesScore + single + video
}

/** Sort value — 2026-05-25 v6 supaprastinta į `trackCompositeScore`.
 *
 *  Anksčiau (v2-v5): `level * 10000 + continuous` — lexicographic, kad
 *  level garantuotų primary tvarką. Bet su v6 per-artist percentile,
 *  level pats išvedamas iš `trackCompositeScore` rank'o, tad sortinant
 *  pagal continuous score gauname identišką rezultatą (be reikalo dauginti).
 *  Bar'ai garantuotai monotoniški: sort'as ir level abu kyla iš to paties
 *  score'o. */
export function trackArtistSortVal(t: any, nowMs: number = Date.now()): number {
  return trackCompositeScore(t, nowMs)
}

/** Sukurta vienos eilės factory'oje, kad sortinimas vyktų per vieną
 *  cache'intą (t)=>number callback'ą. */
export function makeArtistTrackScorer(_tracks: any[]): (t: any) => number {
  const now = Date.now()
  return (t: any) => trackArtistSortVal(t, now)
}

// ───────────────────────────────────────────────────────────────────────
// Per-artist PopBar level (v6 2026-05-25)
// ───────────────────────────────────────────────────────────────────────
// v1-v5 buvo absoliutus per-track level (3-5 dashes pagal global thresholds).
// Problema: LT atlikėjai globaliai mažesni nei INTL, todėl jų bar'ai
// visada būdavo žemi — neatspindėdavo intra-artist gradacijos (kuri daina
// to atlikėjo top'as, kuri prastesnė). Edvardo skundas 2026-05-25:
// „LT atlikėjai verda tam paciam katile, nes nevienoda konkurencija del
// rinku dydzio. prie atlikejo reikia, kad issidestymas butu to atlikejo
// lygyje, o ne bendrame kontekste."
//
// v6: PopBar level kvintilinis PER ATLIKĖJO sąrašą. Kiekvienas atlikėjas
// turi savo „top hit'us" (5/5) ir „prastesnes" (1/5) — neatsižvelgiant
// į global popularity. Sort'as taip pat pagal `trackCompositeScore`,
// tad bar'ai monotoniški.
//
// Tier distribucija v7 (2026-05-25): logaritminė, ne kvintile — kad 5/5
// reiškia REALIAI „crown jewel" (1-5 dainų catalog'e, dažnai 1-3, kartais 1
// jei one-hit-wonder). Quintile (v6) duodavo 20% catalog'o su 5/5 — per daug,
// bar'ai prarado prasmę. Edvardo skundas 2026-05-25: „top dainu butu iki 5
// max, daznai vos 2-3 ar net viena jei one hit wonder".
//
// Tier sizes (rank capped + percent based):
//   5/5: cap 1-5, ~1% total              (220 dainų → 3, 50 → 1, 10 → 1)
//   4/5: cap 2-15, ~6% total             (220 → 14, 50 → 3, 10 → 2)
//   3/5: cap 5-40, ~18% total            (220 → 40, 50 → 9, 10 → 5)
//   2/5: cap 10-100, ~40% total          (220 → 88, 50 → 20, 10 → 2)
//   1/5: rest                            (220 → 75, 50 → 17, 10 → 0)
//
// Tracks su score ≤ 0 (jokio signal'o) → 0/5 (bar slepiamas).

/** Factory: priima atlikėjo tracks sąrašą, grąžina `(t) => level` callback'ą.
 *  Levels pre-computed pagal `trackCompositeScore` rank'ą. Lookup per track.id,
 *  tad kviečiantis kodas gali iterate'inti subsets (filter'ius) — kiekvienas
 *  track gauna lygiai tokį pat level'į kaip ir pilname sąraše.
 *
 *  Edge cases:
 *   - 0 tracks → leveler grąžina 0 visiems
 *   - 1 track → 5/5 (vienintelis = crown)
 *   - tracks su score=0 → 0/5 (no bar)
 *   - artist su VISŲ tracks score=0 → visi 0/5 (informatyvu)
 */
export function makeArtistTrackLeveler(
  tracks: any[],
  nowMs?: number,
): (t: any) => number {
  const now = nowMs ?? Date.now()
  const total = tracks.length
  if (total === 0) {
    return () => 0
  }

  // Sort'as descending pagal score; ties — stabili (pirma encountered).
  const sortedByScoreDesc = [...tracks].sort(
    (a, b) => trackCompositeScore(b, now) - trackCompositeScore(a, now),
  )

  // Tier sizes — log-augantys cap'ai, kad mažiems catalog'ams būtų prasminga
  // distribucija, dideliems — 5/5 nepadalintų į dešimtis dainų.
  const t1 = Math.min(5,   Math.max(1,  Math.ceil(total * 0.01)))  // 5/5: 1-5
  const t2 = Math.min(15,  Math.max(2,  Math.ceil(total * 0.06)))  // 4/5: 2-15
  const t3 = Math.min(40,  Math.max(5,  Math.ceil(total * 0.18)))  // 3/5: 5-40
  const t4 = Math.min(100, Math.max(10, Math.ceil(total * 0.40)))  // 2/5: 10-100
  const c1 = t1
  const c2 = c1 + t2
  const c3 = c2 + t3
  const c4 = c3 + t4

  // Map<track.id, level> — kiekvienam track ID priskiriam tier'į pagal rank.
  const idToLevel = new Map<any, number>()
  sortedByScoreDesc.forEach((t, rank) => {
    const score = trackCompositeScore(t, now)
    if (score <= 0) {
      idToLevel.set(t.id, 0)
      return
    }
    let lvl: number
    if (rank < c1) lvl = 5
    else if (rank < c2) lvl = 4
    else if (rank < c3) lvl = 3
    else if (rank < c4) lvl = 2
    else lvl = 1
    idToLevel.set(t.id, lvl)
  })

  return (t: any) => {
    if (!t) return 0
    return idToLevel.get(t.id) ?? 0
  }
}
