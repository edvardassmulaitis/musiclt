// lib/concert-recordings.ts
//
// SERVER data sluoksnis „Koncertų įrašams" (/koncertu-irasai). Visi fetch'ai
// server-side, react-cache'inami, try/catch degrade — kaip lib/radaras.ts.
// Klientui saugūs tipai/helper'iai gyvena lib/concert-recordings-shared.ts.
//
// Taip pat: YT Data API + AI parse — admin „greitas pridėjimas" iš nuorodos.

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase'
import {
  type ConcertRecording, type RecordingStyle, type RecordingType,
  inferRecordingType,
} from '@/lib/concert-recordings-shared'

export type { ConcertRecording, RecordingStyle, RecordingType } from '@/lib/concert-recordings-shared'
export {
  inferRecordingType, recordingTypeLabel, RECORDING_TYPE_LABELS, RECORDING_TYPE_ORDER,
  formatDuration, formatRecordedDate, recordingPlaceLine, recordingHref,
  extractYouTubeId, ytThumbFromId, ytEmbedUrl,
} from '@/lib/concert-recordings-shared'

/* ─────────────────────── Row → ConcertRecording ─────────────────────── */

const SELECT_COLS =
  'id, slug, youtube_id, youtube_url, title, artist_id, artist_name_cached, ' +
  'duration_seconds, recording_type, venue, city, country, recorded_on, recorded_year, ' +
  'uploaded_at, channel, description, thumbnail_url, view_count, styles, is_featured, ' +
  'artists:artist_id(name, slug)'

function mapRow(r: any): ConcertRecording {
  const a = r.artists || null
  return {
    id: r.id,
    slug: r.slug,
    youtube_id: r.youtube_id,
    youtube_url: r.youtube_url,
    title: r.title,
    artist_id: r.artist_id ?? null,
    artist_name: a?.name ?? r.artist_name_cached ?? null,
    artist_slug: a?.slug ?? null,
    duration_seconds: r.duration_seconds ?? null,
    recording_type: (r.recording_type as RecordingType) || 'full',
    venue: r.venue ?? null,
    city: r.city ?? null,
    country: r.country ?? null,
    recorded_on: r.recorded_on ?? null,
    recorded_year: r.recorded_year ?? null,
    uploaded_at: r.uploaded_at ?? null,
    channel: r.channel ?? null,
    description: r.description ?? null,
    thumbnail_url: r.thumbnail_url ?? null,
    view_count: r.view_count ?? null,
    styles: Array.isArray(r.styles) ? r.styles : [],
    is_featured: !!r.is_featured,
  }
}

/* ─────────────────────────── Public fetch ─────────────────────────── */

/** Naujausi publikuoti įrašai (landing + filtras client-side). */
export const getLatestRecordings = cache(async (limit = 120): Promise<ConcertRecording[]> => {
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('concert_recordings')
      .select(SELECT_COLS)
      .eq('is_published', true)
      .order('is_featured', { ascending: false })
      .order('uploaded_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(limit)
    return ((data || []) as any[]).map(mapRow)
  } catch { return [] }
})

/** Vienas įrašas pagal slug (detalės puslapiui). */
export const getRecordingBySlug = cache(async (slug: string): Promise<ConcertRecording | null> => {
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('concert_recordings')
      .select(SELECT_COLS)
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle()
    return data ? mapRow(data) : null
  } catch { return null }
})

/** Visi slug'ai (sitemap / generateStaticParams). */
export const getAllRecordingSlugs = cache(async (): Promise<string[]> => {
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('concert_recordings')
      .select('slug')
      .eq('is_published', true)
      .limit(2000)
    return ((data || []) as any[]).map((r) => r.slug).filter(Boolean)
  } catch { return [] }
})

/** Konkretaus atlikėjo įrašai (atlikėjo puslapio sekcija). */
export const getArtistRecordings = cache(async (artistId: number, limit = 24): Promise<ConcertRecording[]> => {
  if (!artistId) return []
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('concert_recordings')
      .select(SELECT_COLS)
      .eq('artist_id', artistId)
      .eq('is_published', true)
      .order('is_featured', { ascending: false })
      .order('uploaded_at', { ascending: false, nullsFirst: false })
      .limit(limit)
    return ((data || []) as any[]).map(mapRow)
  } catch { return [] }
})

/** Susiję įrašai (to paties atlikėjo / stiliaus) — detalės puslapiui. */
export const getRelatedRecordings = cache(async (rec: ConcertRecording, limit = 8): Promise<ConcertRecording[]> => {
  try {
    const sb = createAdminClient()
    const out: ConcertRecording[] = []
    const seen = new Set<number>([rec.id])
    // 1) To paties atlikėjo
    if (rec.artist_id) {
      const { data } = await sb.from('concert_recordings').select(SELECT_COLS)
        .eq('artist_id', rec.artist_id).eq('is_published', true).neq('id', rec.id)
        .order('uploaded_at', { ascending: false, nullsFirst: false }).limit(limit)
      for (const r of ((data || []) as any[]).map(mapRow)) { if (!seen.has(r.id)) { seen.add(r.id); out.push(r) } }
    }
    // 2) To paties stiliaus (papildom)
    if (out.length < limit && rec.styles.length > 0) {
      const { data } = await sb.from('concert_recordings').select(SELECT_COLS)
        .eq('is_published', true).overlaps('styles', rec.styles).neq('id', rec.id)
        .order('uploaded_at', { ascending: false, nullsFirst: false }).limit(limit * 2)
      for (const r of ((data || []) as any[]).map(mapRow)) {
        if (out.length >= limit) break
        if (!seen.has(r.id)) { seen.add(r.id); out.push(r) }
      }
    }
    return out.slice(0, limit)
  } catch { return [] }
})

/** Stiliai, REALIAI esantys įrašuose (filtro chip'ams), pagal kiekį. */
export const getRecordingStyles = cache(async (): Promise<RecordingStyle[]> => {
  try {
    const recs = await getLatestRecordings(300)
    const counts = new Map<string, number>()
    for (const r of recs) for (const s of r.styles) if (s) counts.set(s, (counts.get(s) || 0) + 1)
    return [...counts.entries()]
      .map(([name, n]) => ({ name, n }))
      .sort((a, b) => b.n - a.n)
  } catch { return [] }
})

/* ───────────────────── Atlikėjo žanrai → styles[] ───────────────────── */

/** Atlikėjo žanrų pavadinimai (denorm. į concert_recordings.styles filtrui). */
export async function stylesForArtist(artistId: number): Promise<string[]> {
  if (!artistId) return []
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('artist_genres')
      .select('genres(name)')
      .eq('artist_id', artistId)
    const out: string[] = []
    for (const r of (data || []) as any[]) {
      const name = r.genres?.name
      if (name && !out.includes(name)) out.push(name)
    }
    return out
  } catch { return [] }
}

/* ════════════════════════ YouTube + AI parse ════════════════════════ */

export type ParsedConcert = {
  ok: boolean
  error?: string
  youtube_id: string
  youtube_url: string
  title: string
  channel: string | null
  duration_seconds: number | null
  uploaded_at: string | null
  view_count: number | null
  thumbnail_url: string | null
  description: string | null
  // AI / heuristika (redaguojama admine):
  suggested_type: RecordingType
  venue: string | null
  city: string | null
  country: string | null
  recorded_on: string | null      // ISO date
  recorded_year: number | null
  // Atlikėjo spėjimas iš kanalo/title (admin patvirtina):
  artist_guess: string | null
}

/** ISO 8601 trukmė (PT1H2M5S) → sekundės. */
function iso8601ToSeconds(iso: string | null | undefined): number | null {
  if (!iso) return null
  const m = iso.match(/P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return null
  const d = parseInt(m[1] || '0', 10)
  const h = parseInt(m[2] || '0', 10)
  const min = parseInt(m[3] || '0', 10)
  const s = parseInt(m[4] || '0', 10)
  return d * 86400 + h * 3600 + min * 60 + s
}

/** YT Data API: vienas video → snippet+contentDetails+statistics. */
async function fetchYtMeta(videoId: string): Promise<{
  title: string; channel: string | null; uploadedAt: string | null;
  duration: number | null; views: number | null; thumb: string | null;
  description: string | null;
} | null> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) return null
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${key}`,
      { signal: AbortSignal.timeout(8000) },
    )
    const json = await res.json()
    const v = json?.items?.[0]
    if (!v) return null
    const sn = v.snippet || {}
    const cd = v.contentDetails || {}
    const st = v.statistics || {}
    const th = sn.thumbnails || {}
    return {
      title: sn.title || '',
      channel: sn.channelTitle || null,
      uploadedAt: sn.publishedAt || null,
      duration: iso8601ToSeconds(cd.duration),
      views: st.viewCount ? parseInt(st.viewCount, 10) : null,
      thumb: th.maxres?.url || th.standard?.url || th.high?.url || th.medium?.url || null,
      description: sn.description || null,
    }
  } catch { return null }
}

const LT_MONTH_MAP: Record<string, number> = {
  sausio: 1, vasario: 2, kovo: 3, balandžio: 4, gegužės: 5, birželio: 6,
  liepos: 7, rugpjūčio: 8, rugsėjo: 9, spalio: 10, lapkričio: 11, gruodžio: 12,
}

/** Greita heuristika datai/metams iš title+description (fallback be AI). */
function heuristicDate(text: string): { iso: string | null; year: number | null } {
  // „2024 m. birželio 14" / „2024 birželio 14 d."
  const lt = text.match(/(\d{4})\s*m?\.?\s*(sausio|vasario|kovo|balandžio|gegužės|birželio|liepos|rugpjūčio|rugsėjo|spalio|lapkričio|gruodžio)\s*(\d{1,2})/i)
  if (lt) {
    const y = +lt[1]; const mo = LT_MONTH_MAP[lt[2].toLowerCase()]; const d = +lt[3]
    if (y && mo && d) return { iso: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`, year: y }
  }
  // ISO / 2024-06-14 / 2024.06.14
  const isoM = text.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/)
  if (isoM) {
    const y = +isoM[1], mo = +isoM[2], d = +isoM[3]
    if (y > 1950 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31)
      return { iso: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`, year: y }
  }
  // Tik metai
  const yM = text.match(/\b(19[5-9]\d|20[0-4]\d)\b/)
  if (yM) return { iso: null, year: +yM[1] }
  return { iso: null, year: null }
}

/** AI parse: vieta/miestas/šalis/data/tipas iš title+description. Haiku.
 *  Degrade į heuristiką jei nėra ANTHROPIC_API_KEY arba klaida. */
async function aiParse(title: string, description: string, durationSec: number | null): Promise<{
  venue: string | null; city: string | null; country: string | null;
  recorded_on: string | null; recorded_year: number | null; artist_guess: string | null;
} | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  const prompt = `Tu analizuoji YouTube koncertinio (gyvo) pasirodymo vaizdo įrašo metaduomenis. Iš pavadinimo ir aprašymo ištrauk struktūruotą informaciją apie KONCERTĄ.

PAVADINIMAS: ${title}

APRAŠYMAS (gali būti tuščias):
${(description || '').slice(0, 1500)}

Grąžink TIK JSON (be markdown, be paaiškinimų) su laukais:
{
  "venue": vieta/salė kur vyko koncertas (pvz. "Žalgirio arena", "Compensa", "Tamsta klubas") arba null,
  "city": miestas (pvz. "Vilnius", "Kaunas") arba null,
  "country": šalis lietuviškai (pvz. "Lietuva") arba null,
  "recorded_on": koncerto data formatu "YYYY-MM-DD" jei aiški diena, kitaip null,
  "recorded_year": koncerto metai (skaičius) arba null,
  "artist_guess": pagrindinio atlikėjo vardas (be "- Live", be dainos pavadinimo) arba null
}

Jei kažko nežinai — null. NEspėliok vietos jei jos nėra tekste.`
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(15000),
    })
    const json = await res.json()
    const text = json?.content?.[0]?.text || ''
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return null
    const parsed = JSON.parse(m[0])
    return {
      venue: parsed.venue || null,
      city: parsed.city || null,
      country: parsed.country || null,
      recorded_on: parsed.recorded_on || null,
      recorded_year: parsed.recorded_year ? Number(parsed.recorded_year) : null,
      artist_guess: parsed.artist_guess || null,
    }
  } catch { return null }
}

/** Pagrindinis admin parse: nuoroda → metaduomenys + AI pasiūlymai. */
export async function parseConcertUrl(rawUrl: string): Promise<ParsedConcert> {
  const { extractYouTubeId } = await import('@/lib/concert-recordings-shared')
  const id = extractYouTubeId(rawUrl)
  const base: ParsedConcert = {
    ok: false, youtube_id: id || '', youtube_url: rawUrl,
    title: '', channel: null, duration_seconds: null, uploaded_at: null,
    view_count: null, thumbnail_url: null, description: null,
    suggested_type: 'full', venue: null, city: null, country: null,
    recorded_on: null, recorded_year: null, artist_guess: null,
  }
  if (!id) return { ...base, error: 'Neatpažinta YouTube nuoroda' }

  const meta = await fetchYtMeta(id)
  if (!meta) return { ...base, error: 'Nepavyko gauti YouTube duomenų (patikrink nuorodą / YOUTUBE_API_KEY)' }

  const fullText = `${meta.title}\n${meta.description || ''}`
  const ai = await aiParse(meta.title, meta.description || '', meta.duration)
  const heur = heuristicDate(fullText)

  const recorded_on = ai?.recorded_on || heur.iso || null
  const recorded_year = ai?.recorded_year || heur.year || (recorded_on ? new Date(recorded_on).getFullYear() : null)

  return {
    ok: true,
    youtube_id: id,
    youtube_url: `https://www.youtube.com/watch?v=${id}`,
    title: meta.title,
    channel: meta.channel,
    duration_seconds: meta.duration,
    uploaded_at: meta.uploadedAt,
    view_count: meta.views,
    thumbnail_url: meta.thumb || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    description: meta.description,
    suggested_type: inferRecordingType(meta.duration),
    venue: ai?.venue || null,
    city: ai?.city || null,
    country: ai?.country || null,
    recorded_on,
    recorded_year,
    artist_guess: ai?.artist_guess || meta.channel || null,
  }
}
