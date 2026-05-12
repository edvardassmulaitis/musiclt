// lib/normalize-bio.ts
//
// Bio/description text normalization. Two purposes:
//
//   1. WRITE-TIME (svarbiausia): apply before storing į DB tame įraše,
//      kad nauji wiki/AI importai DB'oje jau būtų švarūs. Po to
//      bet kurioje display vietoje (BioModal, artist hero excerpt, sitemap,
//      RSS feed) tekstas atrodo gerai be runtime fix'ų.
//
//   2. DISPLAY-TIME (fallback): jei esami DB įrašai turi senų artefaktų ir
//      dar nebuvo re-importuoti, BioModal kviečia tą pačią funkciją render'io
//      metu. Idempotent: 2x apply = same output.
//
// Two layers:
//
//   • Mojibake fixes — wiki imports kartais turi BPE tokenizer relics
//     (Ġ = U+0120, space marker) ar Latin-1/UTF-8 round-trip corruption.
//     Specific char-level replacements.
//
//   • Paragraph wrapping — jei HTML neturi <p> tag'ų, split'inam pagal
//     `\n\n` (jei yra) arba sentence boundary (`. ` + capital letter).
//     Wrap'inam į <p> chunks. Anksčiau bio render'inosi kaip vienas
//     ilgas tekstas → wall of text, sunku skaityti.

const MOJIBAKE_REPLACEMENTS: Array<[RegExp, string]> = [
  // Ġ (U+0120) — Latin Capital G with dot above. In BPE-tokenized text
  // (GPT/sentencepiece) this often represents a word-boundary space.
  // Wiki imports su AI-generated/translated text sometimes preserve šituos.
  [/Ġ/g, ' '],
  // Ī (U+012A) — Latin Capital I with macron. Sometimes substitutes for
  // Lithuanian 'į' (i nosine) when encoding loses diacritic.
  [/Ī/g, 'į'],
  // Mojibake from UTF-8 → Latin-1 → UTF-8 round-trip.
  // 'â€™' = right-single-quote, 'â€œ' = left-double-quote, etc.
  [/â€™/g, '’'],
  [/â€˜/g, '‘'],
  [/â€œ/g, '“'],
  [/â€/g, '”'],
  [/â€“/g, '–'],
  [/â€”/g, '—'],
  [/â€¢/g, '•'],
  [/â€¦/g, '…'],
  // Bare Â (U+00C2) inserted before non-ASCII chars — common UTF-8 reading-as-Latin-1 artifact.
  [/Â/g, ''],
  // Generic latin-extended weirdness from misread bytes.
  [/Ã„/g, 'Ä'],
  [/Ã¤/g, 'ä'],
  [/Ãª/g, 'ê'],
  [/Ã©/g, 'é'],
  [/Ã /g, 'à'],
]

/** Apply mojibake fixes — char-level substitutions only. Does NOT touch HTML tags. */
function fixMojibake(s: string): string {
  let out = s
  for (const [re, replacement] of MOJIBAKE_REPLACEMENTS) {
    out = out.replace(re, replacement)
  }
  // Collapse 2+ spaces created by Ġ→space replacement
  out = out.replace(/[ \t]{2,}/g, ' ')
  // Trim trailing whitespace on each line
  out = out.replace(/[ \t]+$/gm, '')
  return out
}

/** Detect if HTML has paragraph structure. */
function hasParagraphs(html: string): boolean {
  return /<p[\s>]/i.test(html)
}

/** Split a flat string into paragraphs by natural breaks. */
function splitParagraphs(text: string): string[] {
  // Priority 1: double newlines (most explicit)
  if (/\n\s*\n/.test(text)) {
    return text.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean)
  }
  // Priority 2: chunk every ~3-4 sentences. Detect sentence boundaries
  // by `. ` (period+space) followed by uppercase incl. Lithuanian letters.
  const sentences = text.split(/(?<=[\.!?]) +(?=[A-ZĄČĘĖĮŠŲŪŽ])/)
  if (sentences.length <= 1) return [text.trim()]
  const out: string[] = []
  const chunkSize = 3
  for (let i = 0; i < sentences.length; i += chunkSize) {
    const chunk = sentences.slice(i, i + chunkSize).join(' ').trim()
    if (chunk) out.push(chunk)
  }
  return out
}

/** Wrap raw text into <p>...</p> chunks when no paragraph structure exists. */
function wrapParagraphs(html: string): string {
  if (hasParagraphs(html)) return html
  // Preserve inline tags by keeping them inside paragraphs.
  const paragraphs = splitParagraphs(html)
  return paragraphs.map(p => `<p>${p}</p>`).join('\n')
}

/**
 * Normalize bio/description HTML — call at write-time before storing.
 * Idempotent: calling 2x produces same output as 1x.
 */
export function normalizeBio(html: string | null | undefined): string {
  if (!html) return ''
  const fixed = fixMojibake(html)
  return wrapParagraphs(fixed)
}

/** Same normalization for plain-text fields (no HTML wrapping). Useful when
 *  caller wants mojibake fixes alone without imposing <p> structure (e.g.
 *  short subtitle/excerpt strings). */
export function normalizeBioPlainText(text: string | null | undefined): string {
  if (!text) return ''
  return fixMojibake(text)
}
