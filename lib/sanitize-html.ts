// ─────────────────────────────────────────────────────────────────────────
// Bendras HTML sanitizeris user turiniui (blogas, komentarai, diskusijos).
//
// Naudoja `sanitize-html` (GRYNAS JS, be jsdom) — veikia ir Vercel serverless
// runtime, ir naršyklėje. (Anksčiau naudotas isomorphic-dompurify traukė jsdom,
// kuris LŪŽTA Vercel serverless — visi importuojantys route'ai grąžindavo 500.)
//
// Taikoma RAŠANT (API route'uose prieš įrašant į DB) IR gynybiškai prieš render.
// Sustabdo stored XSS (<script>, on*-handler'iai, javascript:, <svg onload> ...).
// ─────────────────────────────────────────────────────────────────────────

import sanitizeHtml from 'sanitize-html'

const ALLOWED_IFRAME_HOSTS = [
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
  'open.spotify.com',
  'w.soundcloud.com',
  'bandcamp.com',
]

const RICH_OPTS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'span', 'div', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'ins', 'mark', 'sub', 'sup', 'small',
    'a', 'img', 'figure', 'figcaption',
    'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    'iframe',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel', 'title'],
    img: ['src', 'alt', 'width', 'height', 'loading', 'srcset', 'sizes'],
    iframe: ['src', 'width', 'height', 'allow', 'allowfullscreen', 'frameborder', 'scrolling'],
    '*': ['class', 'colspan', 'rowspan', 'align', 'title'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  allowedIframeHostnames: ALLOWED_IFRAME_HOSTS,
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  // Inline style'ai išmetami (nėra 'style' allowedAttributes) — apsauga nuo
  // expression()/url() piktnaudžiavimo.
}

const COMMENT_OPTS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'span', 'b', 'strong', 'i', 'em', 'u', 's', 'del', 'a', 'img', 'blockquote', 'ul', 'ol', 'li', 'code', 'pre'],
  allowedAttributes: {
    a: ['href', 'target', 'rel', 'title'],
    img: ['src', 'alt', 'width', 'height'],
    '*': ['class', 'title'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  disallowedTagsMode: 'discard',
}

/** Blogas / turtingas turinys (leidžia embed iframe'us iš allowlist'o). */
export function sanitizeRichHtml(html: string | null | undefined): string {
  if (!html) return ''
  return sanitizeHtml(String(html), RICH_OPTS)
}

/** Komentarai / diskusijos (be iframe'ų). */
export function sanitizeCommentHtml(html: string | null | undefined): string {
  if (!html) return ''
  return sanitizeHtml(String(html), COMMENT_OPTS)
}

/** Griežtas: pašalina VISĄ HTML, palieka tik tekstą (pvz. summary/pavadinimams). */
export function stripAllHtml(html: string | null | undefined): string {
  if (!html) return ''
  return sanitizeHtml(String(html), { allowedTags: [], allowedAttributes: {}, disallowedTagsMode: 'discard' })
}
