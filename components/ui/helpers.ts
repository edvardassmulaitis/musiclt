// ── Shared utility functions ─────────────────────────────────────────────────
// Used across multiple admin & public pages

/** Extract YouTube video ID from various URL formats */
export function extractYouTubeId(url: string): string {
  return url.match(/(?:v=|youtu\.be\/)([^&?]+)/)?.[1] || ''
}

/** Generate a URL-safe slug from text */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ąčęėįšųūž]/g, c => {
      const map: Record<string, string> = { ą:'a', č:'c', ę:'e', ė:'e', į:'i', š:'s', ų:'u', ū:'u', ž:'z' }
      return map[c] || c
    })
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
