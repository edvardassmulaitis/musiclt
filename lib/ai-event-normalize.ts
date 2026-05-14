/**
 * Renginio normalize'as per Anthropic Tool Use API.
 *
 * Įvestis — žali HTML iš ticket portalo detail page'o (jau iš extract'into JSON-LD
 * arba HTML fallback'o). Sonnet'as grąžina struktūruotą event objektą su
 * lietuvišku description tekstu ir parsint'a datos info'ja.
 */

import type { EventDetail } from './events-extract'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const SONNET_MODEL = 'claude-sonnet-4-6'

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY env var not set')
  return key
}

export type NormalizedEvent = {
  is_music_event: boolean        // false = ne muzikinis (sportas, teatras) → atmesti
  title: string                  // LT antraštė
  description_html: string       // LT description su <p> tag'ais
  event_date_iso?: string        // YYYY-MM-DDTHH:mm jeigu galima parse'inti
  event_date_text?: string       // human-readable LT fallback (jei date sunku)
  venue_name?: string
  city?: string
  ticket_url?: string
  price_text?: string
  image_url?: string
  artists_mentioned: Array<{ name: string; confidence: number }>
  confidence: number
  model: string
}

const EVENT_SYSTEM = `Tu esi muzikos renginių klasifikatorius ir editor'ius music.lt portale.

Tau pateikiamas renginio listing'as (iš LT bilietų portalo). Tavo užduotis:

1. Nustatyti ar tai TIKRAI MUZIKINIS renginys (koncertas, festivalis, atlikėjo turas, muzikos vakaras).
   - PRIIMK: solo koncertai, grupiu pasirodymai, festivaliai, klasika, džiazas, opera
   - ATMESK: teatras, kinas, sportas, parodos, mokymai, paskaitos, family entertainment be muzikos centro

2. Jei muzikinis — sukurti lietuvišką antraštę ir description (3-5 sakiniai) faktinis, sausas stilius
3. Identifikuoti atlikėjus (gali būti keli)
4. Normalize'inti datą į ISO formą jei įmanoma (YYYY-MM-DDTHH:mm)
5. Išskirti vietos info (venue + miestas atskirai)

LIETUVIŲ KALBA:
- Faktinis žurnalistinis stilius, be reklamos
- Linksniavimas: koncertas → koncerto, koncerte; renginys → renginio
- Anglicizmų vengiame: "koncertas", "atlikėjas", "festivalis"

OUTPUT — naudok normalize_event tool'ą.`

export async function normalizeEvent(input: EventDetail & { source_portal?: string; artist_whitelist?: string[] }): Promise<NormalizedEvent> {
  const textTruncated = input.description.slice(0, 4000)
  const userMsg = [
    input.source_portal ? `Šaltinis: ${input.source_portal}` : '',
    input.source_lang ? `Originalo kalba: ${input.source_lang}` : '',
    input.artist_whitelist?.length
      ? `DB top atlikėjai (jei kuris paminėtas — naudok TIKSLŲ rašybą): ${input.artist_whitelist.slice(0, 80).join(', ')}`
      : '',
    '',
    `RENGINIO INFO IŠ SOURCE'O:`,
    input.title ? `Title: ${input.title}` : '',
    input.event_date_text ? `Data (raw): ${input.event_date_text}` : '',
    input.venue_name ? `Venue: ${input.venue_name}` : '',
    input.city ? `City: ${input.city}` : '',
    input.price_text ? `Price: ${input.price_text}` : '',
    input.artist_names.length > 0 ? `Performers: ${input.artist_names.join(', ')}` : '',
    '',
    'DESCRIPTION:',
    textTruncated,
  ].filter(Boolean).join('\n')

  const tool = {
    name: 'normalize_event',
    description: 'Classify and normalize a Lithuanian concert/festival listing.',
    input_schema: {
      type: 'object' as const,
      properties: {
        is_music_event: {
          type: 'boolean' as const,
          description: 'True only if this is a music event (concert, festival, music night). False for theater/sports/conferences.',
        },
        title: {
          type: 'string' as const,
          description: 'Lithuanian title, 40-80 chars, factual not clickbait.',
        },
        description_html: {
          type: 'string' as const,
          description: '3-5 sentence Lithuanian description with <p> tags.',
        },
        event_date_iso: {
          type: 'string' as const,
          description: 'ISO 8601 date YYYY-MM-DDTHH:mm if parseable, otherwise empty string.',
        },
        event_date_text: {
          type: 'string' as const,
          description: 'Human-readable Lithuanian date fallback (e.g. "2026 m. rugsėjo 15 d.").',
        },
        venue_name: {
          type: 'string' as const,
          description: 'Venue name without city.',
        },
        city: {
          type: 'string' as const,
          description: 'City name, Lithuanian.',
        },
        ticket_url: {
          type: 'string' as const,
          description: 'URL to ticket purchase page if found.',
        },
        price_text: {
          type: 'string' as const,
          description: 'Price range, e.g. "20-45 €".',
        },
        image_url: {
          type: 'string' as const,
          description: 'Image/poster URL from source.',
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
        confidence: {
          type: 'number' as const,
          description: 'Overall confidence 0..1',
        },
      },
      required: ['is_music_event', 'title', 'description_html', 'confidence'],
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
      system: EVENT_SYSTEM,
      tools: [tool],
      tool_choice: { type: 'tool', name: 'normalize_event' },
      messages: [{ role: 'user', content: userMsg }],
    }),
  })

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300)
    throw new Error(`Sonnet event API HTTP ${res.status}: ${detail}`)
  }

  const data = await res.json()
  const toolUse = (data.content || []).find((b: any) => b.type === 'tool_use')
  if (!toolUse || !toolUse.input) {
    return emptyEvent()
  }
  const p = toolUse.input

  return {
    is_music_event: Boolean(p.is_music_event),
    title: String(p.title || ''),
    description_html: String(p.description_html || ''),
    event_date_iso: (typeof p.event_date_iso === 'string' && p.event_date_iso) ? p.event_date_iso : undefined,
    event_date_text: (typeof p.event_date_text === 'string' && p.event_date_text) ? p.event_date_text : undefined,
    venue_name: p.venue_name || undefined,
    city: p.city || undefined,
    ticket_url: p.ticket_url || undefined,
    price_text: p.price_text || undefined,
    image_url: p.image_url || undefined,
    artists_mentioned: Array.isArray(p.artists_mentioned)
      ? p.artists_mentioned.map((a: any) => ({
          name: String(a?.name || ''),
          confidence: typeof a?.confidence === 'number' ? a.confidence : 0.5,
        })).filter((a: any) => a.name)
      : [],
    confidence: typeof p.confidence === 'number' ? Math.max(0, Math.min(1, p.confidence)) : 0,
    model: SONNET_MODEL,
  }
}

function emptyEvent(): NormalizedEvent {
  return {
    is_music_event: false,
    title: '',
    description_html: '',
    artists_mentioned: [],
    confidence: 0,
    model: SONNET_MODEL,
  }
}
