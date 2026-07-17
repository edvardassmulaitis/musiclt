// lib/social-embed.ts
//
// Soc. postų embed pagalbininkai. F0: rankinis embed — atlikėjas įklijuoja
// posto nuorodą, mes atpažįstam platformą ir atvaizduojam.
// F-vėliau: Meta OAuth auto-traukimas (Graph API) tiems patiems laukams.
//
// Server-safe (jokio DOM). Atvaizdavimas — components/SocialEmbed.tsx.

export type SocialPlatform = 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'x' | 'unknown'

export function detectPlatform(rawUrl: string): SocialPlatform {
  const u = (rawUrl || '').toLowerCase()
  if (/instagram\.com/.test(u)) return 'instagram'
  if (/facebook\.com|fb\.watch/.test(u)) return 'facebook'
  if (/tiktok\.com/.test(u)) return 'tiktok'
  if (/youtube\.com|youtu\.be/.test(u)) return 'youtube'
  if (/twitter\.com|x\.com/.test(u)) return 'x'
  return 'unknown'
}

export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X',
  unknown: 'Nuoroda',
}

/** Normalizuoja URL (nukerpa tracking params, prideda https). */
export function normalizeSocialUrl(rawUrl: string): string | null {
  let s = (rawUrl || '').trim()
  if (!s) return null
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s
  try {
    const url = new URL(s)
    // Nukerpam reklaminius params (igshid, utm_*, fbclid…)
    const drop = ['igshid', 'fbclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'si']
    drop.forEach((k) => url.searchParams.delete(k))
    return url.toString()
  } catch {
    return null
  }
}

/** YouTube video ID iš įvairių URL formų. */
export function youtubeId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    if (url.hostname.includes('youtu.be')) return url.pathname.slice(1) || null
    if (url.searchParams.get('v')) return url.searchParams.get('v')
    const m = url.pathname.match(/\/(embed|shorts)\/([\w-]+)/)
    if (m) return m[2]
    return null
  } catch {
    return null
  }
}

/** Instagram post/reel shortcode iš URL. */
export function instagramShortcode(rawUrl: string): { kind: 'p' | 'reel' | 'tv'; code: string } | null {
  const m = (rawUrl || '').match(/instagram\.com\/(p|reel|tv)\/([\w-]+)/i)
  if (!m) return null
  return { kind: m[1].toLowerCase() as 'p' | 'reel' | 'tv', code: m[2] }
}

/** TikTok video ID iš URL (formos /video/{id} arba /embed/v2/{id}). */
export function tiktokVideoId(rawUrl: string): string | null {
  const m = (rawUrl || '').match(/tiktok\.com\/(?:@[\w.]+\/video|embed(?:\/v2)?)\/(\d+)/i)
  return m ? m[1] : null
}

/**
 * Iframe `src` grotuvui pagal platformą. Grąžina null, jei platforma neturi
 * paprasto iframe embed'o (X, Facebook, unknown) — tada rodom nuorodos kortelę.
 * Naudojama tiek admin peržiūroje (embedų preview), tiek galima ir viešame
 * puslapyje.
 */
export function buildEmbedSrc(rawUrl: string): string | null {
  const url = (rawUrl || '').trim()
  if (!url) return null
  const platform = detectPlatform(url)

  if (platform === 'youtube') {
    const id = youtubeId(url)
    return id ? `https://www.youtube-nocookie.com/embed/${id}?rel=0` : null
  }
  if (platform === 'instagram') {
    const ig = instagramShortcode(url)
    return ig ? `https://www.instagram.com/${ig.kind}/${ig.code}/embed` : null
  }
  if (platform === 'tiktok') {
    const id = tiktokVideoId(url)
    return id ? `https://www.tiktok.com/embed/v2/${id}` : null
  }
  if (/spotify\.com/i.test(url)) {
    const m = url.match(/open\.spotify\.com\/(track|album|artist|playlist|episode|show)\/([\w]+)/i)
    return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}` : null
  }
  if (/soundcloud\.com/i.test(url)) {
    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&visual=true`
  }
  // facebook, x, bandcamp, unknown → nėra paprasto iframe embed'o
  return null
}
