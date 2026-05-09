// ── Shared utility functions ─────────────────────────────────────────────────
// Used across multiple admin & public pages

/** Extract YouTube video ID from various URL formats */
export function extractYouTubeId(url: string): string {
  return url.match(/(?:v=|youtu\.be\/)([^&?]+)/)?.[1] || ''
}

/** Generate a URL-safe slug from text. Re-eksportas iš lib/slugify.ts —
 *  palaiko visas kalbas (Arabic / CJK / Cyrillic ir t.t.), ne tik LT. */
export { slugify } from '@/lib/slugify'
