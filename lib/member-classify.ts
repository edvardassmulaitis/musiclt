// lib/member-classify.ts
//
// Heuristinis (nemokamas) narių dienoraščio įrašo redakcinio tipo spėjimas.
// Naudojamas PRIEŠ Haiku (/api/internal/blog-classify) — aiškius atvejus
// išsprendžia deterministiškai, likusius (null) perduoda LLM'ui. Aukšta
// precizija svarbiau nei pilnumas (false positive blogiau nei „null → LLM").

import type { MemberTypeValue } from '@/lib/ai-normalize'

const RE_KONCERTAI = /koncert|festival(?:is|io|yje|iai)|\bturas?\b|bilietai|scenoj|pasirodym/i
const RE_RECENZIJA = /recenzij|apžvalg|įvertin|išklausiau|naujas albumas|albumo apžvalg/i
const RE_NUOMONE = /\bnuomon|\bmanau\b|ar verta\b|kodėl .* (geras|blogas|patinka)|aptarim/i

export function heuristicMemberType(p: { title?: string | null; body?: string | null; has_album?: boolean; has_track?: boolean }): MemberTypeValue | null {
  const title = (p.title || '').toLowerCase()
  const all = `${p.title || ''} ${p.body || ''}`.toLowerCase()

  // Stipriausi signalai antraštėje.
  if (/recenzij|apžvalg/.test(title)) return 'recenzija'
  if (RE_KONCERTAI.test(title)) return 'koncertai'

  // Koncertų įspūdžiai (body).
  if (RE_KONCERTAI.test(all)) return 'koncertai'

  // Recenzija: prisegtas albumas/daina + vertinimo leksika.
  if ((p.has_album || p.has_track) && RE_RECENZIJA.test(all)) return 'recenzija'
  if (/recenzij/.test(all)) return 'recenzija'

  // Nuomonė — konservatyviai (LLM geriau atskiria nuo dienoraščio).
  if (RE_NUOMONE.test(all)) return 'nuomone'

  return null // → Haiku
}
