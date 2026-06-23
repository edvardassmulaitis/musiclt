// lib/wiki-credit.ts
//
// Server-side: Wikimedia Commons nuotraukos kreditas (autorius, licencija,
// failo aprašymo puslapis) iš `upload.wikimedia.org` URL. Naudojam news hero
// foto kreditui — kaip artist galerijoje rodom realų autorių, paimtą iš wiki.
//
// Nuoroda visada veda į PAČIĄ nuotrauką Wikimedia/Wikipedia File: puslapyje
// (ne į straipsnio šaltinį). Rezultatas cache'inamas 7 d.

export type WikiCredit = { author: string; license: string; url: string } | null

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Iš upload URL ištraukia projektą (commons/en/…) + File: pavadinimą. */
function fileTitleFromUpload(url: string): { host: string; title: string } | null {
  const m = url.match(/upload\.wikimedia\.org\/wikipedia\/([a-z-]+)\/[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)$/i)
  if (!m) return null
  const project = m[1].toLowerCase()
  const title = decodeURIComponent(m[2])
  const host = project === 'commons' ? 'commons.wikimedia.org' : `${project}.wikipedia.org`
  return { host, title }
}

/** Deterministinė (be fetch'o) File: puslapio nuoroda iš upload URL. */
export function wikiFilePageUrl(url?: string | null): string | null {
  if (!url) return null
  const parsed = fileTitleFromUpload(url)
  if (!parsed) return null
  return `https://${parsed.host}/wiki/File:${encodeURIComponent(parsed.title)}`
}

export async function wikiImageCredit(imageUrl?: string | null): Promise<WikiCredit> {
  if (!imageUrl) return null
  const parsed = fileTitleFromUpload(imageUrl)
  if (!parsed) return null
  try {
    const api =
      `https://${parsed.host}/w/api.php?action=query&prop=imageinfo` +
      `&iiprop=${encodeURIComponent('extmetadata|url')}` +
      `&titles=${encodeURIComponent('File:' + parsed.title)}&format=json&origin=*`
    const r = await fetch(api, { next: { revalidate: 604800 } }) // 7 d.
    if (!r.ok) return null
    const j: any = await r.json()
    const pages = j?.query?.pages || {}
    const page: any = Object.values(pages)[0]
    const ii = page?.imageinfo?.[0]
    const url = ii?.descriptionurl || wikiFilePageUrl(imageUrl) || ''
    if (!ii) return url ? { author: '', license: '', url } : null
    const em = ii.extmetadata || {}
    const author = stripHtml(em.Artist?.value || '')
    const license = stripHtml(em.LicenseShortName?.value || '')
    if (!author && !url) return null
    return { author, license, url }
  } catch {
    const url = wikiFilePageUrl(imageUrl)
    return url ? { author: '', license: '', url } : null
  }
}
