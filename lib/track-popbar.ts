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

  // Likes threshold'ai (music.lt community scale) — v4 2026-05-25:
  // 500 buvo per aukšta LT atlikėjui (net Mamontovo Geltona ŽR 322 likes
  // negaudavo 5/5). Sumažinta į 250, kad kiekvienas top LT atlikėjas
  // turėtų bent 1 „crown jewel" daina 5/5. INTL atlikėjams views/d
  // signal'as dažniausiai dominuoja, tad likes mažėjimas jiems neturi
  // įtakos. Spacing maždaug ×2.5 tarp lygių.
  //   5/5 — 250+ likes — LT crown jewel (Geltona ŽR 322 → 5/5)
  //   4/5 — 100+ likes — major LT hit (Tavo svajonė 177 → 4/5)
  //   3/5 — 30+  likes — žinomos klasikos
  //   2/5 — 8+   likes — turinčios fanų
  //   1/5 — 1+   like  — bent kažkam patiko
  let lLevel = 0
  if (likes >= 250) lLevel = 5
  else if (likes >= 100) lLevel = 4
  else if (likes >= 30) lLevel = 3
  else if (likes >= 8) lLevel = 2
  else if (likes >= 1) lLevel = 1

  return Math.max(vLevel, lLevel)
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

/** Lexicographic sort value:
 *    primary:   trackPopAbsoluteLevel (discrete 0-5) — garantuoja, kad
 *               sort tvarka MATCHINA bar level'į (track 5/5 visada virš
 *               track 4/5)
 *    secondary: continuous score — tiebreaker tame pačiame level'yje
 *
 *  Pakuojam į vieną number'į: level * 10000 + continuous. Continuous
 *  diapazonas ~0-150 << 10000, tad level visada dominuoja sort'e.
 */
export function trackArtistSortVal(t: any, nowMs: number = Date.now()): number {
  const level = trackPopAbsoluteLevel(t, nowMs)
  const continuous = trackCompositeScore(t, nowMs)
  return level * 10000 + continuous
}

/** Sukurta vienos eilės factory'oje, kad sortinimas vyktų per vieną
 *  cache'intą (t)=>number callback'ą. */
export function makeArtistTrackScorer(_tracks: any[]): (t: any) => number {
  const now = Date.now()
  return (t: any) => trackArtistSortVal(t, now)
}
