// lib/substyle-resolve.ts
//
// VIENINTELIS substilių „resolve" kelias importams / atlikėjo formoms.
// Tikslas: NUSTOTI kurti šiukšlinius / dublikatinius substilius.
//
// Logika vienam vardui:
//   1) Sanity filtras — akivaizdi šiukšlė (Wikipedia `| length = …`, URL,
//      `{{cite}}`, laiko kodai, per ilgi) → SKIP (nieko nerašom).
//   2) Fuzzy match prieš ESAMUS substilius (matchGenreToSubstyle: exact →
//      alias → normalize → slug). Radom → grąžinam tą id (jokio naujo įrašo).
//   3) Nerasta → kuriam NAUJĄ kaip `status='pending'`, priskirtą atlikėjo
//      pagrindiniam žanrui (genre_id), su review_note. Patenka į
//      /admin/substiliai eilę, kur adminas sujungia arba patvirtina.
//
// Visi insert'ai per perduotą service-role klientą. Be PostgREST .catch().

import type { SupabaseClient } from '@supabase/supabase-js'
import { slugify } from './slugify'
import { matchGenreToSubstyle, normalizeGenreKey, type SubstyleRow } from './genre-match'

export interface SubstyleRowFull extends SubstyleRow {
  status?: string | null
  genre_id?: number | null
}

export interface SubstyleResolution {
  id: number | null
  status: 'approved' | 'pending' | 'skipped'
  created: boolean
  matchedName?: string
  reason?: string
}

/** Akivaizdžios parse-šiukšlės, kurių NIEKADA nekuriam kaip substilio. */
export function isLikelyGarbageSubstyle(raw: string): boolean {
  const s = (raw || '').trim()
  if (!s) return true
  if (s.length > 40) return true                 // tikras žanras ~ <40 simb.
  if (/[|{}]/.test(s)) return true               // Wikipedia infobox likučiai
  if (/\b(length|title|cite|url|ref|http|www\.|\.com)\b/i.test(s)) return true
  if (/^\d/.test(s)) return true                 // „70s rock", „2:31" laiko kodai
  if (/\d{1,3}:\d{2}/.test(s)) return true        // mm:ss
  if (/[\n\r\t]/.test(s)) return true
  if (!/[a-zA-Ząčęėįšųūž]/.test(s)) return true   // be raidžių
  return false
}

/** Užkrauna VISUS substilių rows (approved + pending) match'inimui. */
export async function loadSubstyleRows(sb: SupabaseClient): Promise<SubstyleRowFull[]> {
  const { data } = await sb.from('substyles').select('id, name, slug, status, genre_id')
  return (data || []) as SubstyleRowFull[]
}

/**
 * Resolve'ina vieną žanro vardą į substyle id.
 * @param rows — preloaded loadSubstyleRows() (kad loop'e nekartotume užklausų).
 *               Sukurti pending įrašai PRIDEDAMI į šį masyvą (dedup batch'e).
 * @param artistGenreId — atlikėjo pagrindinis žanras (genre_id), priskiriamas
 *                        naujam pending substiliui.
 */
export async function resolveSubstyle(
  sb: SupabaseClient,
  rawName: string,
  rows: SubstyleRowFull[],
  opts: { artistGenreId?: number | null; source?: string } = {}
): Promise<SubstyleResolution> {
  const name = (rawName || '').trim()
  if (!name) return { id: null, status: 'skipped', created: false, reason: 'empty' }
  if (isLikelyGarbageSubstyle(name)) {
    return { id: null, status: 'skipped', created: false, reason: 'garbage' }
  }

  // 2) Fuzzy match prieš esamus (įsk. anksčiau sukurtus pending)
  const match = matchGenreToSubstyle(name, rows as SubstyleRow[])
  if (match) {
    return { id: match.id, status: 'approved', created: false, matchedName: match.name }
  }

  // 3) Naujas pending. Dar kartą įsitikinam, kad nėra dublio pagal norm key.
  const norm = normalizeGenreKey(name)
  const dup = rows.find(r => normalizeGenreKey(r.name) === norm)
  if (dup) return { id: dup.id, status: (dup.status as any) || 'pending', created: false, matchedName: dup.name }

  let slug = slugify(name)
  const { data: slugHit } = await sb.from('substyles').select('id').eq('slug', slug).maybeSingle()
  if (slugHit) slug = `${slug}-${Date.now().toString(36)}`

  const { data: ins, error } = await sb
    .from('substyles')
    .insert({
      name,
      slug,
      status: 'pending',
      genre_id: opts.artistGenreId ?? null,
      review_note: `Auto iš ${opts.source || 'import'} — nerastas taksonomijoje, laukia peržiūros`,
    })
    .select('id, name, slug, status, genre_id')
    .single()

  if (error || !ins) {
    return { id: null, status: 'skipped', created: false, reason: error?.message || 'insert failed' }
  }
  rows.push(ins as SubstyleRowFull)
  return { id: ins.id, status: 'pending', created: true, matchedName: ins.name }
}

/**
 * Batch: vardų sąrašas → substyle id'jai, paruošti linkinti į
 * artist_substyles. Grąžina ir statistiką UI/log'ui.
 */
export async function resolveSubstyleIds(
  sb: SupabaseClient,
  names: string[],
  opts: { artistGenreId?: number | null; source?: string } = {}
): Promise<{ ids: number[]; created: string[]; skipped: string[] }> {
  const rows = await loadSubstyleRows(sb)
  const ids: number[] = []
  const seen = new Set<number>()
  const created: string[] = []
  const skipped: string[] = []
  for (const n of names) {
    const r = await resolveSubstyle(sb, n, rows, opts)
    if (r.id && !seen.has(r.id)) { ids.push(r.id); seen.add(r.id) }
    if (r.created) created.push(n)
    if (r.status === 'skipped') skipped.push(n)
  }
  return { ids, created, skipped }
}
