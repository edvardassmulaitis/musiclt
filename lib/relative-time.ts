// lib/relative-time.ts
//
// Lithuanian relative-time formatter for comments / posts. Returns short
// "Prieš 2 d." / "Prieš 5 sav." / "Prieš 8 mėn." strings. If the timestamp is
// older than ~1 year, returns null — caller decides whether to fall back to
// absolute date or just hide the timestamp entirely.
//
// Design notes:
//   - Lithuanian noun forms switch by count (1 minute, 2-9 minutes, 11+).
//     We avoid the trickier plural forms by using the abbreviated "min." /
//     "val." / "d." / "sav." / "mėn." which work uniformly across counts.
//   - "Ką tik" (just now) under 1 minute — friendlier than "Prieš 0 min.".

const YEAR_MS = 365 * 24 * 60 * 60 * 1000

export function relativeTime(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const now = Date.now()
  const diffMs = now - d.getTime()
  if (diffMs < 0) return 'Ką tik'
  if (diffMs >= YEAR_MS) return null

  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return 'Ką tik'
  const min = Math.floor(sec / 60)
  if (min < 60) return `Prieš ${min} min.`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `Prieš ${hr} val.`
  const day = Math.floor(hr / 24)
  if (day < 7) return `Prieš ${day} d.`
  const wk = Math.floor(day / 7)
  if (wk < 5) return `Prieš ${wk} sav.`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `Prieš ${mo} mėn.`
  return null
}
