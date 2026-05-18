/**
 * Press release credit extraction iš email body, .docx body ir attachment filename.
 *
 * Lietuviški press release'ai dažnai turi:
 *   - "Nuotrauka: Rytis Šeškaitis" — body inline credit (LT)
 *   - "Nuotraukos: NAME" — daugiskaita
 *   - "Foto: NAME"
 *   - "Autorius: NAME"
 *   - "© NAME"
 *
 * Angliški (international):
 *   - "Photo: NAME"
 *   - "Photographer: NAME"
 *   - "Credit: NAME"
 *   - "Photo credit: NAME"
 *   - "Image courtesy of NAME"
 *
 * Filename'ai (anglų):
 *   - "ARTIST_LEAD_PRESS_CREDIT_PHOTOGRAPHER.jpg"
 *   - "by_PHOTOGRAPHER.jpg"
 *   - "©PHOTOGRAPHER.jpg"
 */

const TEXT_PATTERNS: Array<{ regex: RegExp; group: number }> = [
  // LT
  { regex: /(?:^|\n)\s*Nuotraukos?\s*[:\-–]\s*([^\n,]+?)(?:[,\n]|$)/i, group: 1 },
  { regex: /(?:^|\n)\s*Foto\s*[:\-–]\s*([^\n,]+?)(?:[,\n]|$)/i, group: 1 },
  { regex: /(?:^|\n)\s*Fotografas\s*[:\-–]\s*([^\n,]+?)(?:[,\n]|$)/i, group: 1 },
  { regex: /(?:^|\n)\s*Autori(?:us|ai)\s*[:\-–]\s*([^\n,]+?)(?:[,\n]|$)/i, group: 1 },
  // EN
  { regex: /(?:^|\n)\s*Photo(?:graphy)?\s*[:\-–]\s*([^\n,]+?)(?:[,\n]|$)/i, group: 1 },
  { regex: /(?:^|\n)\s*Photographer\s*[:\-–]\s*([^\n,]+?)(?:[,\n]|$)/i, group: 1 },
  { regex: /(?:^|\n)\s*Photo\s+credit\s*[:\-–]\s*([^\n,]+?)(?:[,\n]|$)/i, group: 1 },
  { regex: /(?:^|\n)\s*Credit\s*[:\-–]\s*([^\n,]+?)(?:[,\n]|$)/i, group: 1 },
  { regex: /Image\s+courtesy\s+of\s+([^\n,.]+?)(?:[,\n.]|$)/i, group: 1 },
  // Copyright symbol pattern — "© Rytis Šeškaitis" or "© 2025 Name"
  { regex: /©\s*(?:\d{4}\s+)?([A-ZĄČĘĖĮŠŲŪŽ][^\n,.©]{2,60}?)(?:[,\n.©]|$)/, group: 1 },
]

function cleanName(s: string): string | null {
  const cleaned = s
    .trim()
    .replace(/[.,;:\s]+$/, '')
    .replace(/^[.,;:\s]+/, '')
  if (cleaned.length < 2 || cleaned.length > 80) return null
  // Filter out obvious non-names (URLs, generic phrases)
  if (/https?:|www\.|\.com|\.lt|\.org/i.test(cleaned)) return null
  if (/^(yes|no|please|attached|inside|below|above|above|see\b)/i.test(cleaned)) return null
  return cleaned
}

export function extractPhotographerFromText(text: string): string | null {
  if (!text) return null
  const snippet = text.slice(0, 3000)  // tik pirmi paragraphai
  for (const { regex, group } of TEXT_PATTERNS) {
    const m = snippet.match(regex)
    if (m && m[group]) {
      const name = cleanName(m[group])
      if (name) return name
    }
  }
  return null
}

/**
 * Filename pattern'ai:
 *   ARTIST_LEAD_PRESS_CREDIT_FABRICE BOURGELLE.jpg
 *   photo_by_john_smith.jpg
 *   © Name.jpg
 *   by-Name.jpg
 */
export function extractPhotographerFromFilename(filename: string): string | null {
  if (!filename) return null
  // Strip extension
  const base = filename.replace(/\.[a-z0-9]+$/i, '')

  // CREDIT_NAME pattern
  let m = base.match(/CREDIT[_\s\-]+([A-ZÀ-ÿ][A-Za-zÀ-ÿ\s'\-]{2,60})/i)
  if (m && m[1]) {
    const name = cleanName(m[1].replace(/[_\-]+/g, ' '))
    if (name) return name
  }

  // by_NAME or by-NAME pattern
  m = base.match(/(?:^|[_\s\-])by[_\s\-]+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'\-_]{2,60})$/i)
  if (m && m[1]) {
    const name = cleanName(m[1].replace(/[_\-]+/g, ' '))
    if (name) return name
  }

  // © NAME pattern
  m = base.match(/©\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'\-_]{2,60})/i)
  if (m && m[1]) {
    const name = cleanName(m[1].replace(/[_\-]+/g, ' '))
    if (name) return name
  }

  return null
}

/**
 * Drive folder/file links iš teksto.
 * Match'inam:
 *   https://drive.google.com/file/d/FILEID/view
 *   https://drive.google.com/drive/folders/FOLDERID
 *   https://docs.google.com/document/d/DOCID/...
 */
export function extractDriveLinks(text: string): string[] {
  if (!text) return []
  const matches = text.match(/https?:\/\/(?:drive|docs)\.google\.com\/[^\s<>"]+/gi) || []
  return Array.from(new Set(matches))
}
