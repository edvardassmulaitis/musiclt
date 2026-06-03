// lib/member-classify.ts
//
// Heuristinis (nemokamas) narių dienoraščio įrašo redakcinio tipo spėjimas.
// Naudojamas PRIEŠ Haiku (/api/internal/blog-classify) — aiškius atvejus
// išsprendžia deterministiškai, likusius (null) perduoda LLM'ui. Aukšta
// precizija svarbiau nei pilnumas (false positive blogiau nei „null → LLM").

import type { MemberTypeValue } from '@/lib/ai-normalize'

// Aukšta precizija: tik antraštės signalai. Visa kita → null → Haiku → „kita".
const RE_KONCERTAI = /koncert|festival|gyvai scenoj|pasirodym/i
const RE_RECENZIJA = /recenzij|apžvalg/i

export function heuristicMemberType(p: { title?: string | null; body?: string | null; has_album?: boolean; has_track?: boolean }): MemberTypeValue | null {
  const title = (p.title || '').toLowerCase()

  if (RE_RECENZIJA.test(title)) return 'recenzija'
  if (RE_KONCERTAI.test(title)) return 'koncertai'

  return null // → Haiku (recenzija / koncertai / kita)
}
