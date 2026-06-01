/**
 * chart-artist-status.ts — read-only chart įrašo atlikėjų analizė resolver UI'ui.
 *
 * Grąžina primary atlikėją + featuring sąrašą, kiekvieną su katalogo statusu
 * (exists/id/slug), NIEKO nesukurdamas. Resolver UI tada rodo nuorodą į
 * administraciją (jei yra) arba „Sukurti" veiksmą.
 *
 * Savarankiškas (nepriklauso nuo quick-add internų) — naudoja TIK chart-resolve
 * eksportuotus helper'ius + DB lookup'us. Skaidymo logika atspindi
 * quick-add.resolveTrackArtists, kad UI statusas atitiktų „Sukurti" elgseną.
 */
import { createAdminClient } from '@/lib/supabase'
import { normalizeForMatch, primaryArtist, slugifyLt } from '@/lib/chart-resolve'

type Sb = any

export type ChartArtistStatus = { name: string; exists: boolean; id: number | null; slug: string | null }
type Match = { id: number; name: string; slug: string | null }

// Skirtukai (mirror quick-add): stiprūs = visada kolaboracija; silpni = tik kai
// ≥2 dalys atitinka esamus atlikėjus (apsaugo „Simon & Garfunkel" tipo vardus).
const STRONG_SEP = /\s+(?:feat\.?|ft\.?|featuring|vs\.?|x|×|✕)\s+/i
const WEAK_SEP = /\s*(?:&|,|\+|\swith\s)\s*/i
// Pavadinimo featuring: „(feat. X)" / „ft. X" gale.
const TITLE_FEAT = /[\(\[]\s*(?:feat|ft|featuring|with)\.?\s+([^)\]]+)[\)\]]|\b(?:feat|ft|featuring)\.?\s+(.+)$/i

function cleanName(s: string): string {
  return (s || '').replace(/^["'«»“”„‚‘’\s]+|["'«»“”„‚‘’\s]+$/g, '').replace(/\s{2,}/g, ' ').trim()
}

/** Ilgiausias RAW žodis (su diakritika/Cyrillic) ilike prefiltrui. */
function rawLongestToken(s: string): string {
  const toks = (s || '').split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2)
  return (toks.sort((a, b) => b.length - a.length)[0] || (s || '').trim()).replace(/[%_]/g, '')
}

/** Atlikėjo paieška kataloge (be kūrimo): slug → tikslus, tada normalizuotas vardas. */
async function matchArtist(sb: Sb, raw: string): Promise<Match | null> {
  const name = cleanName(primaryArtist(raw))
  if (name.length < 2) return null
  const slug = slugifyLt(name)
  const bySlug = await sb.from('artists').select('id, name, slug').eq('slug', slug).maybeSingle()
  if (bySlug.data) return bySlug.data as Match
  const nNorm = normalizeForMatch(name)
  const tok = rawLongestToken(name)
  if (!tok) return null
  const { data } = await sb.from('artists').select('id, name, slug').ilike('name', `%${tok}%`).limit(60)
  const hit = (data || []).find((a: any) => normalizeForMatch(a.name) === nNorm)
  return (hit as Match) || null
}

function splitSegment(seg: string): { parts: string[]; strong: boolean } {
  if (STRONG_SEP.test(seg)) {
    const parts = seg.split(STRONG_SEP).map((s) => s.trim()).filter(Boolean)
    if (parts.length >= 2) return { parts, strong: true }
  }
  if (WEAK_SEP.test(seg)) {
    const parts = seg.split(WEAK_SEP).map((s) => s.trim()).filter(Boolean)
    if (parts.length >= 2) return { parts, strong: false }
  }
  return { parts: [seg.trim()], strong: true }
}

/** Pavadinimo featuring vardai („Song (feat. A & B)" → [A, B]). */
function titleFeaturing(rawTitle: string): string[] {
  const m = (rawTitle || '').match(TITLE_FEAT)
  if (!m) return []
  const blob = m[1] || m[2] || ''
  return blob.split(WEAK_SEP).map((s) => cleanName(s)).filter(Boolean)
}

const toStatus = (m: Match | null, fallbackName: string): ChartArtistStatus =>
  m ? { name: m.name, exists: true, id: m.id, slug: m.slug ?? null }
    : { name: cleanName(fallbackName), exists: false, id: null, slug: null }

/**
 * Pilna analizė: primary atlikėjas + featuring (su statusais). Featuring jungia
 * segmento („A feat. B") ir pavadinimo („Song (feat. C)") šaltinius.
 */
export async function analyzeChartArtists(
  artistSegment: string, rawTitle: string,
): Promise<{ primary: ChartArtistStatus; featuring: ChartArtistStatus[] }> {
  const sb = createAdminClient()
  const seg = (artistSegment || '').trim()

  let primaryMatch: Match | null = null
  let primaryName = cleanName(seg)
  const featNames: string[] = []

  // 1) Visas segmentas kaip vienas (registruotas) atlikėjas — apsaugo grupes.
  const whole = await matchArtist(sb, seg)
  if (whole) {
    primaryMatch = whole
    primaryName = whole.name
  } else {
    const { parts, strong } = splitSegment(seg)
    if (parts.length < 2) {
      primaryMatch = await matchArtist(sb, seg)
      primaryName = primaryMatch?.name || cleanName(seg)
    } else {
      const matched = await Promise.all(parts.map((p) => matchArtist(sb, p)))
      const matchedCount = matched.filter(Boolean).length
      if (strong || matchedCount >= 2) {
        primaryMatch = matched[0]
        primaryName = matched[0]?.name || cleanName(parts[0])
        for (let i = 1; i < parts.length; i++) featNames.push(parts[i])
      } else {
        primaryMatch = await matchArtist(sb, seg)
        primaryName = primaryMatch?.name || cleanName(seg)
      }
    }
  }

  const primary = toStatus(primaryMatch, primaryName)

  // Featuring iš segmento + pavadinimo; dedupe ir be primary.
  const primarySlug = primary.slug || slugifyLt(primary.name)
  const allFeat = Array.from(new Set(
    [...featNames, ...titleFeaturing(rawTitle)]
      .map((n) => cleanName(n))
      .filter((n) => n && slugifyLt(primaryArtist(n)) !== primarySlug),
  ))

  const featuring: ChartArtistStatus[] = await Promise.all(
    allFeat.map(async (name) => toStatus(await matchArtist(sb, name), name)),
  )

  return { primary, featuring }
}
