/**
 * Albumo pavadinimo normalizacija dedupe palyginimui (NE rodymui).
 * Sprendžia atvejus, kai katalogo pavadinimas turi „ EP" / „(album)" / „(deluxe)"
 * priedą, o kandidatas — švarų pavadinimą (pvz. katalogas „Days of Ash EP" vs
 * kandidatas „Days of Ash" → abu → „days of ash", tad atpažįstamas dublikatas).
 */
export function normalizeAlbumTitle(s: string): string {
  const nfd = (s || '').toLowerCase().normalize('NFD')
  // Nuimam combining diacritical mark'us (U+0300..U+036F) per code point (patikimiau
  // nei \u regex literal, kurį įrankiai kartais dvigubai escape'ina).
  let t = ''
  for (const ch of nfd) {
    const cp = ch.codePointAt(0) || 0
    if (cp >= 0x0300 && cp <= 0x036f) continue
    t += ch
  }
  // Skliaustų kvalifikatoriai — (album), (EP), (deluxe edition), (remastered), ...
  t = t.replace(/[([][^)\]]*(album|ep|single|deluxe|expanded|remaster\w*|edition|version|mixtape|bonus|reissue|anniversary)[^)\]]*[)\]]/g, ' ')
  // Galūnės kvalifikatoriai — „… EP", „… LP", „… - Single"
  t = t.replace(/\b(e\.?p\.?|lp)\b/g, ' ')
  t = t.replace(/-\s*single\b/g, ' ')
  // Tik raidės/skaičiai
  t = t.replace(/[^a-z0-9]+/g, ' ').trim()
  return t
}
