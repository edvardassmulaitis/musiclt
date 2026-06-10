/**
 * Pilnas HTML entity dekoderis — be DOM dependency, veikia server + client.
 *
 * Kodėl: RSS title'ai ir og:title ateina su &#8217; &#8216; &#038; &nbsp;
 * ir pan. Anksčiau dekodavom tik 5 baz. entities, todėl /admin/inbox
 * angliškuose headeriuose matėsi „&#8217;s" vietoj „'s".
 *
 * Dekoduoja:
 *   - skaitines decimal (&#8217;) ir hex (&#x2019;) entities → Unicode char
 *   - dažniausias named entities (nbsp, quot, apos, mdash, hellip, ...)
 *   - &amp; dekoduojamas PASKUTINIS (kad &amp;#8217; → &#8217; → ' veiktų
 *     per dvigubą praėjimą, o ne sugadintų eiliškumo)
 */

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  hellip: '…',
  trade: '™',
  copy: '©',
  reg: '®',
  deg: '°',
  middot: '·',
  bull: '•',
  dagger: '†',
  eacute: 'é',
  egrave: 'è',
  uuml: 'ü',
  ouml: 'ö',
  auml: 'ä',
  aring: 'å',
  oslash: 'ø',
  ccedil: 'ç',
  ntilde: 'ñ',
  szlig: 'ß',
  amp: '&', // apdorojamas atskirai paskutinis
}

function decodeOnce(s: string): string {
  return s
    // Hex: &#x2019; / &#X2019;
    .replace(/&#[xX]([0-9a-fA-F]{1,6});/g, (_, hex) => {
      const cp = parseInt(hex, 16)
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ''
    })
    // Decimal: &#8217;
    .replace(/&#(\d{1,7});/g, (_, dec) => {
      const cp = parseInt(dec, 10)
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ''
    })
    // Named (be amp — jis paskutinis)
    .replace(/&([a-zA-Z]{2,10});/g, (match, name) => {
      if (name === 'amp') return match
      const lower = name.toLowerCase()
      return NAMED_ENTITIES[lower] !== undefined ? NAMED_ENTITIES[lower] : match
    })
    // amp paskutinis
    .replace(/&amp;/gi, '&')
}

/**
 * Dekoduoja HTML entities. Du praėjimai — apdoroja double-encoded atvejus
 * (&amp;#8217; → &#8217; → ').
 */
export function decodeHtmlEntities(s: string | null | undefined): string {
  if (!s) return ''
  let out = decodeOnce(s)
  if (/&(#\d|#[xX][0-9a-fA-F]|[a-zA-Z]{2,10};)/.test(out)) {
    out = decodeOnce(out)
  }
  return out
}
