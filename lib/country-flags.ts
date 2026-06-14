// lib/country-flags.ts
//
// Lietuviški šalių pavadinimai → vėliavos emoji. DB `artists.country` laukas
// saugo LT pavadinimus („Didžioji Britanija", „JAV", „Šveicarija"…), todėl
// mapinam iš jų į ISO-3166 alpha-2, o tada į regional-indicator emoji.

const LT_NAME_TO_ISO2: Record<string, string> = {
  'lietuva': 'LT', 'latvija': 'LV', 'estija': 'EE',
  'lenkija': 'PL', 'vokietija': 'DE', 'prancūzija': 'FR', 'ispanija': 'ES',
  'italija': 'IT', 'portugalija': 'PT', 'nyderlandai': 'NL', 'belgija': 'BE',
  'didžioji britanija': 'GB', 'jungtinė karalystė': 'GB', 'anglija': 'GB',
  'škotija': 'GB', 'airija': 'IE', 'islandija': 'IS', 'norvegija': 'NO',
  'švedija': 'SE', 'suomija': 'FI', 'danija': 'DK', 'šveicarija': 'CH',
  'austrija': 'AT', 'čekija': 'CZ', 'slovakija': 'SK', 'vengrija': 'HU',
  'graikija': 'GR', 'rumunija': 'RO', 'bulgarija': 'BG', 'kroatija': 'HR',
  'slovėnija': 'SI', 'serbija': 'RS', 'ukraina': 'UA', 'baltarusija': 'BY',
  'rusija': 'RU', 'jav': 'US', 'jungtinės valstijos': 'US', 'kanada': 'CA',
  'meksika': 'MX', 'brazilija': 'BR', 'argentina': 'AR', 'australija': 'AU',
  'naujoji zelandija': 'NZ', 'japonija': 'JP', 'kinija': 'CN',
  'pietų korėja': 'KR', 'korėja': 'KR', 'indija': 'IN', 'izraelis': 'IL',
  'turkija': 'TR', 'pietų afrika': 'ZA', 'jamaika': 'JM',
}

function iso2ToEmoji(iso2: string): string {
  return iso2
    .toUpperCase()
    .replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)))
}

/** Grąžina vėliavos emoji pagal LT šalies pavadinimą arba null jei nežinoma. */
export function countryFlag(country?: string | null): string | null {
  if (!country) return null
  const iso = LT_NAME_TO_ISO2[country.trim().toLowerCase()]
  return iso ? iso2ToEmoji(iso) : null
}
