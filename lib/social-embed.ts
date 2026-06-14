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
