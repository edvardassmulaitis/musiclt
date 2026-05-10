// lib/slugify.ts
//
// URL-safe slug generation, Unicode-aware. Veikia bet kokio rašto tekstams:
//   - LT/lotyniški: „Ąžuolas" → „azuolas", „Atlanta" → „atlanta"
//   - Diakritikai (Latin extended): „Èkó" → „eko", „Mañana" → „manana"
//   - CJK: „東京" → „東京" (paliekam kaip yra, modern browser'iai display'ina IRI URL'uose)
//   - Arabų/persų: „بنی آدم" → „بنی-آدم"
//   - Pure non-letter: tuščia → fallback'as „t"
//
// Anksčiau buvo 4+ skirtingos slugify funkcijos po `lib/supabase-*.ts`, visi
// strip'indavo bet kokius ne-ASCII chars, todėl Coldplay „Èkó" tap'davo „k",
// o Coldplay „بنی آدم" tap'davo tuščia. Po šito refactoringo — vieninga
// utility funkcija, palaikanti visas kalbas.

const LT_DIACRITICS: Record<string, string> = {
  ą: 'a', č: 'c', ę: 'e', ė: 'e', į: 'i', š: 's', ų: 'u', ū: 'u', ž: 'z',
}

/**
 * Generate a URL-safe slug from any Unicode text.
 *
 * @param text raw input
 * @param maxLen max output length (default 80, truncates at word boundary if possible)
 * @returns slug — never empty (worst case `'t'`)
 */
export function slugify(text: string, maxLen = 80): string {
  if (!text) return 't'

  // 1) Normalize + lowercase. NFKD decomposuoja base+combining char'us:
  //    „Èkó" → "Èkó" → po combining strip → „eko"
  let s = text
    .toLowerCase()
    .normalize('NFKD')
    // Pašalinam visus combining mark'us (diakritikai)
    .replace(/[̀-ͯ]/g, '')

  // 2) LT-specifinės raidės — NFKD jas dažnai paliečia, bet aiškumo dėliai
  //    paliekam explicit map'ą.
  s = s.replace(/[ąčęėįšųūž]/g, c => LT_DIACRITICS[c] || c)

  // 3) Non-letter/non-digit chars → dash. \p{L}=any letter (Latin/Cyrillic/
  //    Arabic/CJK/etc), \p{N}=any digit. Visa kita (whitespace, punctuation,
  //    symbols) → dash separator.
  s = s.replace(/[^\p{L}\p{N}]+/gu, '-')

  // 4) Trim leading/trailing dashes + collapse multiple dashes
  s = s.replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-')

  // 5) Truncate. Naudojam graphemes-aware skaičiavimą per Array.from
  //    (kad CJK + emoji pilnai neperkertame per byte boundary).
  if ([...s].length > maxLen) {
    const chars = [...s]
    s = chars.slice(0, maxLen).join('')
    // Nukerpame paskutinę nepilną dalį iki paskutinio dash'o (jei toks yra)
    const lastDash = s.lastIndexOf('-')
    if (lastDash > maxLen / 2) s = s.slice(0, lastDash)
    s = s.replace(/^-+|-+$/g, '')
  }

  // 6) Fallback'as. Jei visiškai tuščia (pvz. įvedimas buvo tik whitespace/
  //    emoji), grąžinam „t" — short, URL-safe, nepainioja redirect'ų.
  return s || 't'
}

export default slugify
