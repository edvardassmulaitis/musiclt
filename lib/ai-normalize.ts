/**
 * Anthropic Claude wrapper'is news automation pipeline'ui.
 *
 * Du tipai call'ų:
 *  - classifyMusicRelevance() — pigi Haiku batch klasifikacija (5-10 items per call)
 *  - normalizeArticle() — Sonnet'as straipsnio rewrite'ui į LT su strict JSON output'u
 *
 * Patikrina ANTHROPIC_API_KEY env var'ą, throw'ina jei nėra.
 */

import { buildRelevancePrompt, LIGHT_REWRITE_SYSTEM, type AIRelevanceCategory, type NewsCategoryKey } from './news-categories'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const SONNET_MODEL = 'claude-sonnet-4-6'

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY env var not set')
  return key
}

// ─────────────────────────────────────────────────────────────
// 1) Music relevance classification (Haiku batch)
// ─────────────────────────────────────────────────────────────

export type RelevanceResult = {
  idx: number
  category: AIRelevanceCategory
  confidence: number
  brief_why: string
}

export async function classifyMusicRelevance(
  items: Array<{ idx: number; title: string; summary?: string }>
): Promise<RelevanceResult[]> {
  if (items.length === 0) return []

  const prompt = buildRelevancePrompt(items)

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200)
    throw new Error(`Haiku API HTTP ${res.status}: ${detail}`)
  }

  const data = await res.json()
  const text: string = data.content?.[0]?.text || '[]'

  // Claude'as kartais grąžina aplink JSON tekstą — paimam tarp [..]
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) {
    console.warn('[ai-normalize] Haiku response no JSON array found:', text.slice(0, 200))
    return items.map(it => ({ idx: it.idx, category: 'none' as const, confidence: 0, brief_why: 'parse_error' }))
  }

  try {
    const parsed: RelevanceResult[] = JSON.parse(match[0])
    // Sanitize — užtikrinam, kad kategorija valid
    return parsed.map(p => ({
      idx: typeof p.idx === 'number' ? p.idx : -1,
      category: isValidCategory(p.category) ? p.category : 'none',
      confidence: typeof p.confidence === 'number' ? Math.max(0, Math.min(1, p.confidence)) : 0,
      brief_why: typeof p.brief_why === 'string' ? p.brief_why : '',
    }))
  } catch (e: any) {
    console.warn('[ai-normalize] Haiku JSON parse failed:', e.message, text.slice(0, 200))
    return items.map(it => ({ idx: it.idx, category: 'none' as const, confidence: 0, brief_why: 'parse_error' }))
  }
}

function isValidCategory(v: any): v is AIRelevanceCategory {
  return v === 'release' || v === 'performance' || v === 'tour' || v === 'career_step' || v === 'other' || v === 'none'
}

// ─────────────────────────────────────────────────────────────
// 2) Full article normalize → LT light rewrite (Sonnet)
// ─────────────────────────────────────────────────────────────

export type NormalizedArticle = {
  category: AIRelevanceCategory
  title: string
  body_html: string
  summary: string
  artists_mentioned: Array<{ name: string; confidence: number }>
  tracks_mentioned: Array<{ title: string; artist: string }>
  embed_urls: string[]
  confidence: number
  model: string
  raw_response?: string  // debug
}

export async function normalizeArticle(input: {
  full_text: string
  source_lang?: string         // 'en' | 'lt' | 'ru' | etc.
  source_name?: string         // "Pitchfork" — kontekstui
  source_url?: string          // šaltinio URL (į prompt'ą, AI niekur jį neideda — tik kontekstui)
  artist_whitelist?: string[]  // top atlikėjų pavadinimai DB hint'ui
}): Promise<NormalizedArticle> {
  const textTruncated = input.full_text.slice(0, 8000) // ~2k tokens limit'as

  const userMsg = [
    input.source_name ? `Šaltinis: ${input.source_name}` : '',
    input.source_lang ? `Originalo kalba: ${input.source_lang}` : '',
    input.artist_whitelist?.length
      ? `Mūsų DB top atlikėjai (jei kuris paminėtas — naudok TIKSLŲ rašybą): ${input.artist_whitelist.slice(0, 100).join(', ')}`
      : '',
    '',
    'STRAIPSNIS:',
    textTruncated,
  ].filter(Boolean).join('\n')

  // Tool Use API — Anthropic'as priverčia modelį grąžint validuotą JSON
  // pagal schema. Tai eliminuoja Sonnet'o atvejus, kai jis grąžina invalid
  // JSON su unescape'intais simboliais.
  const tool = {
    name: 'publish_news',
    description: 'Publish a normalized Lithuanian news article based on the source.',
    input_schema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string' as const,
          enum: ['release', 'performance', 'tour', 'career_step', 'other', 'none'],
          description: 'Article category. Use "none" ONLY if article has nothing to do with music. Use "other" for borderline music articles (interviews, anniversaries, awards, charts).',
        },
        title: {
          type: 'string' as const,
          description: 'Lithuanian title, 60-80 chars. Use typographic quotes „..." for inner quotation.',
        },
        body_html: {
          type: 'string' as const,
          description: 'HTML body with <p> tags, 200-400 words in Lithuanian.',
        },
        summary: {
          type: 'string' as const,
          description: '2-sentence Lithuanian preview for inbox.',
        },
        artists_mentioned: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              name: { type: 'string' as const },
              confidence: { type: 'number' as const },
            },
            required: ['name'],
          },
        },
        tracks_mentioned: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              title: { type: 'string' as const },
              artist: { type: 'string' as const },
            },
            required: ['title'],
          },
        },
        embed_urls: {
          type: 'array' as const,
          description: 'YouTube, Spotify, SoundCloud or Bandcamp URLs found in source article (especially for new release announcements). Include full URLs.',
          items: { type: 'string' as const },
        },
        confidence: {
          type: 'number' as const,
          description: 'Overall confidence 0..1',
        },
      },
      required: ['category', 'title', 'body_html', 'summary', 'confidence'],
    },
  }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: SONNET_MODEL,
      max_tokens: 2048,
      system: LIGHT_REWRITE_SYSTEM,
      tools: [tool],
      tool_choice: { type: 'tool', name: 'publish_news' },
      messages: [{ role: 'user', content: userMsg }],
    }),
  })

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300)
    throw new Error(`Sonnet API HTTP ${res.status}: ${detail}`)
  }

  const data = await res.json()

  // Tool Use response — JSON jau parsint'as Anthropic'o, gaunamas iš tool_use blokes.
  const toolUseBlock = (data.content || []).find((b: any) => b.type === 'tool_use')
  if (!toolUseBlock || !toolUseBlock.input) {
    const textBlock = (data.content || []).find((b: any) => b.type === 'text')
    console.warn('[ai-normalize] Sonnet no tool_use:', JSON.stringify(data.content)?.slice(0, 300))
    return emptyArticle(textBlock?.text || JSON.stringify(data.content).slice(0, 500))
  }
  const parsed = toolUseBlock.input
  const text = JSON.stringify(parsed) // for debug raw_response

  try {
    return {
      category: isValidCategory(parsed.category) ? parsed.category : 'none',
      title: String(parsed.title || ''),
      body_html: String(parsed.body_html || ''),
      summary: String(parsed.summary || ''),
      artists_mentioned: Array.isArray(parsed.artists_mentioned)
        ? parsed.artists_mentioned.map((a: any) => ({
            name: String(a?.name || ''),
            confidence: typeof a?.confidence === 'number' ? a.confidence : 0,
          })).filter((a: any) => a.name)
        : [],
      tracks_mentioned: Array.isArray(parsed.tracks_mentioned)
        ? parsed.tracks_mentioned.map((t: any) => ({
            title: String(t?.title || ''),
            artist: String(t?.artist || ''),
          })).filter((t: any) => t.title)
        : [],
      embed_urls: Array.isArray(parsed.embed_urls)
        ? parsed.embed_urls.map((u: any) => String(u || '')).filter(Boolean)
        : [],
      confidence: typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence)) : 0,
      model: SONNET_MODEL,
      raw_response: text.slice(0, 500), // debug
    }
  } catch (e: any) {
    console.warn('[ai-normalize] Sonnet JSON parse failed:', e.message, text.slice(0, 300))
    return emptyArticle(text)
  }
}

function emptyArticle(rawText: string): NormalizedArticle {
  return {
    category: 'none',
    title: '',
    body_html: '',
    summary: '',
    artists_mentioned: [],
    tracks_mentioned: [],
    embed_urls: [],
    confidence: 0,
    model: SONNET_MODEL,
    raw_response: rawText.slice(0, 500),
  }
}

/**
 * Repair Sonnet'o JSON — kartais Sonnet'as įdeda neeskape'intas " kabutes
 * į title/body_html/summary string values, sulauždamas parser'į.
 *
 * Strategija: Find'inam JSON fields ("title", "body_html", "summary", "name",
 * "artist", "brief_why") ir VIDINIUS " replace'inam į „ (atveriamoji
 * lietuviška kabutė) — taip JSON tampa validus, o turinys lieka skaitomas.
 */
function repairJsonQuotes(s: string): string {
  const fields = ['title', 'body_html', 'summary', 'name', 'artist', 'brief_why']
  let out = s
  for (const field of fields) {
    // Pattern: "field": "...value..."
    // value gali turėti nesEscape'intus " — pakeisim į „
    const re = new RegExp(`("${field}"\\s*:\\s*")((?:\\\\.|[^"\\\\])*?(?:"[^"\\\\}]*?)*)(",\\s*[\\n"]|"\\s*\\})`, 'g')
    out = out.replace(re, (_match, prefix, value, suffix) => {
      // Escape'inam vidinius " į „
      const fixed = value.replace(/"/g, '\\u201E')
      return prefix + fixed + suffix
    })
  }
  return out
}
