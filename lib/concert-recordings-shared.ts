// lib/concert-recordings-shared.ts
//
// Client-safe tipai + helper'iai „Koncertų įrašams" (/koncertu-irasai).
// Server data sluoksnis gyvena lib/concert-recordings.ts (re-export'ina šituos).
// Šitas failas NEturi createAdminClient — saugu importuoti į client komponentus.

export type RecordingType = 'full' | 'special' | 'session'

export type ConcertRecording = {
  id: number
  slug: string
  youtube_id: string
  youtube_url: string
  title: string
  artist_id: number | null
  artist_name: string | null
  artist_slug: string | null
  duration_seconds: number | null
  recording_type: RecordingType
  venue: string | null
  city: string | null
  country: string | null
  recorded_on: string | null   // ISO date
  recorded_year: number | null
  uploaded_at: string | null
  channel: string | null
  description: string | null
  thumbnail_url: string | null
  view_count: number | null
  styles: string[]
  is_featured: boolean
}

export type RecordingStyle = { name: string; n: number }

/* ───────────────────────── Tipo etiketės ───────────────────────── */

/** Trukmės ribos (sekundėmis), pagal kurias siūlomas recording_type. */
export const TYPE_THRESHOLDS = { full: 45 * 60, special: 12 * 60 } as const

/** Auto recording_type pagal trukmę. Admin gali perrašyti. */
export function inferRecordingType(durationSeconds: number | null | undefined): RecordingType {
  const d = durationSeconds ?? 0
  if (d >= TYPE_THRESHOLDS.full) return 'full'
  if (d >= TYPE_THRESHOLDS.special) return 'special'
  return 'session'
}

export const RECORDING_TYPE_LABELS: Record<RecordingType, string> = {
  full: 'Pilnas koncertas',
  special: 'Gyvas pasirodymas',
  session: 'Live sesija',
}

export const RECORDING_TYPE_ORDER: RecordingType[] = ['full', 'special', 'session']

export function recordingTypeLabel(t: RecordingType): string {
  return RECORDING_TYPE_LABELS[t] || 'Įrašas'
}

/* ───────────────────────── Formatavimas ───────────────────────── */

/** 3725 → „1:02:05", 245 → „4:05". */
export function formatDuration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(seconds ?? 0))
  if (!s) return ''
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

const LT_MONTHS = ['sausio', 'vasario', 'kovo', 'balandžio', 'gegužės', 'birželio',
  'liepos', 'rugpjūčio', 'rugsėjo', 'spalio', 'lapkričio', 'gruodžio']

/** ISO data → „2024 m. birželio 14 d." arba tik metai jei nėra dienos. */
export function formatRecordedDate(iso: string | null | undefined, yearFallback?: number | null): string {
  if (iso) {
    const d = new Date(iso)
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()} m. ${LT_MONTHS[d.getMonth()]} ${d.getDate()} d.`
    }
  }
  if (yearFallback) return `${yearFallback} m.`
  return ''
}

/** Trumpas „vieta · data" subtitras kortelei. */
export function recordingPlaceLine(r: Pick<ConcertRecording, 'venue' | 'city' | 'recorded_on' | 'recorded_year'>): string {
  const place = [r.venue, r.city].filter(Boolean).join(', ')
  const date = formatRecordedDate(r.recorded_on, r.recorded_year)
  return [place, date].filter(Boolean).join(' · ')
}

/** Peržiūrų skaičius → trumpas LT formatas: 345149 → „345 tūkst.", 1.2M → „1,2 mln." */
export function formatViews(n: number | null | undefined): string {
  if (n == null || n <= 0) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')} mln.`
  if (n >= 1_000) return `${Math.round(n / 1_000)} tūkst.`
  return String(n)
}

/* ───────────────────────── YouTube helper'iai ───────────────────────── */

const YT_ID_RE = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([\w-]{11})/

export function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(YT_ID_RE)
  if (m) return m[1]
  // Bare 11-char ID
  const t = url.trim()
  if (/^[\w-]{11}$/.test(t)) return t
  return null
}

export function ytThumbFromId(id: string | null | undefined): string | null {
  if (!id) return null
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
}

export function ytEmbedUrl(id: string, autoplay = false): string {
  const params = autoplay ? '?autoplay=1&rel=0' : '?rel=0'
  return `https://www.youtube.com/embed/${id}${params}`
}

/* ───────────────────────── Hrefs ───────────────────────── */

export function recordingHref(r: { slug: string }): string {
  return `/koncertu-irasai/${r.slug}`
}
