// lib/collection-suggest.ts
//
// AI-padedamas kandidatų generavimas teminei DAINŲ kolekcijai (flow B1):
//   1) Haiku → temos paieškos raktažodžiai (LT + EN sinonimai).
//   2) SQL → tracks pagal title ILIKE raktažodžius, video_views DESC, dedup.
//   3) Haiku → atrenka/rikiuoja kandidatus pagal temos atitiktį (relevance).
//   4) Grąžinam kandidatus admin peržiūrai (jokio auto-insert — Edvardo B1).
//
// Degrade be ANTHROPIC_API_KEY: tik raktažodžių heuristika (žingsnis 1+3 praleisti).

import { createAdminClient } from '@/lib/supabase'

export type SuggestCandidate = {
  track_id: number
  title: string
  slug: string | null
  cover_url: string | null
  video_views: number | null
  artist_name: string | null
  artist_slug: string | null
  country: string | null
  relevance?: number
}

async function callHaiku(prompt: string, maxTokens = 800): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(20000),
    })
    const json = await res.json()
    return json?.content?.[0]?.text || null
  } catch { return null }
}

function parseJsonBlock(text: string | null): any {
  if (!text) return null
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}

/** Žingsnis 1: temos raktažodžiai. Fallback — žodžiai iš pavadinimo. */
async function themeKeywords(title: string, intro: string, manual?: string[]): Promise<string[]> {
  if (manual && manual.length) return manual.slice(0, 10)
  const prompt = `Tu padedi sudaryti lietuvišką muzikos kolekciją „${title}". Aprašymas: ${intro}

Sugeneruok paieškos raktažodžius, kurie tikėtinai pasitaikytų DAINŲ PAVADINIMUOSE, tinkančiose šiai kolekcijai. Įtrauk lietuviškus IR angliškus variantus/sinonimus. Pvz. meilės temai: meilė, myliu, širdis, love, heart.

Grąžink TIK JSON: {"keywords": ["...", "..."]} (8–14 trumpų raktažodžių, po 1 žodį, be paaiškinimų).`
  const parsed = parseJsonBlock(await callHaiku(prompt, 400))
  const kws = Array.isArray(parsed?.keywords) ? parsed.keywords : []
  const clean = kws.map((k: any) => String(k).toLowerCase().replace(/[%,()]/g, '').trim()).filter((k: string) => k.length >= 2)
  if (clean.length) return clean.slice(0, 14)
  // Fallback: title žodžiai
  return title.toLowerCase().replace(/[^a-ząčęėįšųūž\s]/gi, ' ').split(/\s+/).filter((w) => w.length >= 4).slice(0, 5)
}

/** Žingsnis 2: kandidatai iš tracks pagal raktažodžius. */
async function fetchCandidates(keywords: string[], excludeIds: Set<number>, genreName?: string | null): Promise<SuggestCandidate[]> {
  const sb = createAdminClient()
  const byId = new Map<number, SuggestCandidate>()
  for (const kw of keywords.slice(0, 12)) {
    const { data } = await sb
      .from('tracks')
      .select('id, slug, title, cover_url, video_views, artist_id, artists!tracks_artist_id_fkey(name, slug, country)')
      .ilike('title', `%${kw}%`)
      .not('cover_url', 'is', null)
      .order('video_views', { ascending: false, nullsFirst: false })
      .limit(20)
    for (const t of (data || []) as any[]) {
      if (excludeIds.has(t.id) || byId.has(t.id)) continue
      const artist = Array.isArray(t.artists) ? t.artists[0] : t.artists
      byId.set(t.id, {
        track_id: t.id, title: t.title, slug: t.slug, cover_url: t.cover_url,
        video_views: t.video_views, artist_name: artist?.name || null,
        artist_slug: artist?.slug || null, country: artist?.country || null,
      })
    }
  }
  // Dedup per atlikėją (max 3 dainos vienam atlikėjui), rikiuojam pagal views
  const all = [...byId.values()].sort((a, b) => (b.video_views || 0) - (a.video_views || 0))
  const perArtist = new Map<string, number>()
  const out: SuggestCandidate[] = []
  for (const c of all) {
    const k = c.artist_slug || c.artist_name || String(c.track_id)
    const n = perArtist.get(k) || 0
    if (n >= 3) continue
    perArtist.set(k, n + 1)
    out.push(c)
    if (out.length >= 80) break
  }
  return out
}

/** Žingsnis 3: Haiku atrenka tinkamus + relevance. Fallback — visi (views tvarka). */
async function rankCandidates(title: string, intro: string, cands: SuggestCandidate[]): Promise<SuggestCandidate[]> {
  if (cands.length === 0) return []
  const list = cands.map((c) => `${c.track_id}|${c.title}|${c.artist_name || '?'}|${c.country || '?'}`).join('\n')
  const prompt = `Kolekcija „${title}". Aprašymas: ${intro}

Žemiau dainų kandidatai (formatas: id|pavadinimas|atlikėjas|šalis). Atrink TIK tas dainas, kurios tikrai tinka šiai kolekcijai pagal temą/nuotaiką (ne vien dėl raktažodžio sutapimo pavadinime). Atmesk netinkamas.

${list}

Grąžink TIK JSON: {"keep": [{"id": 123, "rel": 0.9}, ...]} — rel nuo 0 iki 1 (atitikties stiprumas), rikiuok nuo geriausių. Be paaiškinimų.`
  const parsed = parseJsonBlock(await callHaiku(prompt, 1500))
  const keep = Array.isArray(parsed?.keep) ? parsed.keep : null
  if (!keep) return cands // be AI — grąžinam visus views tvarka
  const relById = new Map<number, number>()
  for (const k of keep) { const id = Number(k.id); if (id) relById.set(id, Number(k.rel) || 0.5) }
  return cands
    .filter((c) => relById.has(c.track_id))
    .map((c) => ({ ...c, relevance: relById.get(c.track_id) }))
    .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
}

/** Pagrindinis: kolekcija → ranked kandidatai admin peržiūrai. */
export async function suggestTracksForCollection(opts: {
  slug: string
  title: string
  intro: string
  genreName?: string | null
  manualKeywords?: string[]
}): Promise<{ keywords: string[]; candidates: SuggestCandidate[] }> {
  const sb = createAdminClient()
  // Jau esančias dainas išmetam iš kandidatų
  const { data: existing } = await sb.from('collection_tracks').select('track_id').eq('collection_slug', opts.slug)
  const excludeIds = new Set<number>(((existing || []) as any[]).map((r) => r.track_id))

  const keywords = await themeKeywords(opts.title, opts.intro, opts.manualKeywords)
  const cands = await fetchCandidates(keywords, excludeIds, opts.genreName)
  const ranked = await rankCandidates(opts.title, opts.intro, cands)
  return { keywords, candidates: ranked.slice(0, 40) }
}
