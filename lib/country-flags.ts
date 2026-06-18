// lib/country-flags.ts
//
// Lietuviški šalių pavadinimai → vėliavos emoji. DB `artists.country` laukas
// saugo LT pavadinimus („Didžioji Britanija", „JAV", „Šveicarija"…), todėl
// mapinam iš jų į ISO-3166 alpha-2, o tada į regional-indicator emoji.
//
// Map'as turi padengti VISUS DB esančius `country` pavadinimus (žr. SQL:
// select distinct country from artists). Jei pavadinimas nerastas →
// countryFlag() grąžina null, o UI parodo 🌍 fallback'ą, kad vėliava NIEKADA
// nedingtų (anksčiau Meksika ir kt. nerodydavo nieko — bug 2026-06-18).

const LT_NAME_TO_ISO2: Record<string, string> = {
  // Baltijos / kaimynai
  'lietuva': 'LT', 'latvija': 'LV', 'estija': 'EE',
  'lenkija': 'PL', 'baltarusija': 'BY', 'rusija': 'RU', 'ukraina': 'UA',
  'moldavija': 'MD',
  // Vakarų / Vidurio Europa
  'vokietija': 'DE', 'prancūzija': 'FR', 'ispanija': 'ES', 'italija': 'IT',
  'portugalija': 'PT', 'nyderlandai': 'NL', 'olandija': 'NL', 'belgija': 'BE',
  'liuksemburgas': 'LU', 'šveicarija': 'CH', 'austrija': 'AT',
  'lichtenšteinas': 'LI', 'monakas': 'MC', 'andora': 'AD', 'san marinas': 'SM',
  'malta': 'MT',
  // Jungtinė Karalystė + sudėtinės dalys
  'didžioji britanija': 'GB', 'jungtinė karalystė': 'GB', 'anglija': 'GB',
  'škotija': 'GB', 'velsas': 'GB', 'airija': 'IE',
  // Šiaurės Europa
  'islandija': 'IS', 'norvegija': 'NO', 'švedija': 'SE', 'suomija': 'FI',
  'danija': 'DK',
  // Pietryčių / Rytų Europa, Balkanai, Kaukazas
  'čekija': 'CZ', 'slovakija': 'SK', 'vengrija': 'HU', 'rumunija': 'RO',
  'bulgarija': 'BG', 'graikija': 'GR', 'kroatija': 'HR', 'slovėnija': 'SI',
  'serbija': 'RS', 'bosnija ir hercegovina': 'BA', 'juodkalnija': 'ME',
  'makedonija': 'MK', 'šiaurės makedonija': 'MK', 'albanija': 'AL',
  'kipras': 'CY', 'gruzija': 'GE', 'armėnija': 'AM', 'azerbaidžanas': 'AZ',
  'turkija': 'TR', 'kazachija': 'KZ', 'kazachstanas': 'KZ',
  'kirgizija': 'KG', 'kirgistanas': 'KG',
  // Šiaurės Amerika
  'jav': 'US', 'jungtinės valstijos': 'US', 'kanada': 'CA', 'meksika': 'MX',
  'kuba': 'CU', 'dominika': 'DM', 'dominikos respublika': 'DO', 'haitis': 'HT',
  'bahamai': 'BS', 'barbadosas': 'BB', 'jamaika': 'JM', 'puerto rikas': 'PR',
  'trinidadas ir tobagas': 'TT', 'kosta rika': 'CR', 'panama': 'PA',
  'gvatemala': 'GT',
  // Pietų Amerika
  'brazilija': 'BR', 'argentina': 'AR', 'čilė': 'CL', 'kolumbija': 'CO',
  'venesuela': 'VE', 'peru': 'PE', 'urugvajus': 'UY', 'gajana': 'GY',
  // Azija
  'japonija': 'JP', 'kinija': 'CN', 'pietų korėja': 'KR', 'korėja': 'KR',
  'indija': 'IN', 'indonezija': 'ID', 'filipinai': 'PH', 'malaizija': 'MY',
  'singapūras': 'SG', 'pakistanas': 'PK', 'iranas': 'IR', 'izraelis': 'IL',
  'libanas': 'LB', 'jordanija': 'JO',
  // Afrika
  'pietų afrika': 'ZA', 'pietų afrikos respublika': 'ZA', 'egiptas': 'EG',
  'alžyras': 'DZ', 'tunisas': 'TN', 'nigerija': 'NG', 'nigeris': 'NE',
  'gana': 'GH', 'senegalas': 'SN', 'malis': 'ML', 'malavis': 'MW',
  'kamerūnas': 'CM', 'kongas': 'CG', 'etiopija': 'ET', 'zambija': 'ZM',
  'zimbabvė': 'ZW', 'dramblio kaulo krantas': 'CI', 'žaliasis kyšulys': 'CV',
  // Okeanija
  'australija': 'AU', 'naujoji zelandija': 'NZ', 'saliamono salos': 'SB',
  // Kita Azija
  'afganistanas': 'AF',
}

function iso2ToEmoji(iso2: string): string {
  return iso2
    .toUpperCase()
    .replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)))
}

/** Grąžina vėliavos emoji pagal LT šalies pavadinimą arba null jei nežinoma.
 *  „Kita" ir nepažįstamos reikšmės → null (UI rodo 🌍). */
export function countryFlag(country?: string | null): string | null {
  if (!country) return null
  const iso = LT_NAME_TO_ISO2[country.trim().toLowerCase()]
  return iso ? iso2ToEmoji(iso) : null
}
