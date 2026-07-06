// ─────────────────────────────────────────────────────────────────────────
// Bendras HTML sanitizeris user turiniui (blogas, komentarai, diskusijos).
// Naudoja DOMPurify (isomorphic — veikia serveryje ir naršyklėje).
//
// Taikoma RAŠANT (API route'uose, prieš įrašant į DB) IR gynybiškai prieš
// render'inimą per dangerouslySetInnerHTML. Sustabdo stored XSS
// (<script>, on*-handler'iai, javascript:, <svg onload> ir pan.).
// ─────────────────────────────────────────────────────────────────────────

import DOMPurify from 'isomorphic-dompurify'

// Embed iframe'ai leidžiami tik iš patikimų host'ų (YouTube/Spotify/SoundCloud/Bandcamp).
const ALLOWED_IFRAME_HOSTS = [
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
  'open.spotify.com',
  'w.soundcloud.com',
  'bandcamp.com',
]

let hookInstalled = false
function installIframeHook() {
  if (hookInstalled) return
  hookInstalled = true
  // Numetam iframe'us, kurių src ne iš allowlist'o.
  DOMPurify.addHook('uponSanitizeElement', (node: any, data: any) => {
    if (data.tagName === 'iframe') {
      const src = String(node.getAttribute?.('src') || '')
      let ok = false
      try {
        const u = new URL(src, 'https://x')
        ok = (u.protocol === 'https:' || u.protocol === 'http:') &&
          ALLOWED_IFRAME_HOSTS.includes(u.hostname.toLowerCase())
      } catch { ok = false }
      if (!ok && node.parentNode) {
        node.parentNode.removeChild(node)
      }
    }
  })
}

const RICH_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'span', 'div', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'ins', 'mark', 'sub', 'sup', 'small',
    'a', 'img', 'figure', 'figcaption',
    'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    'iframe',
  ],
  ALLOWED_ATTR: [
    'href', 'target', 'rel', 'title',
    'src', 'alt', 'width', 'height', 'loading', 'srcset', 'sizes',
    'class', 'colspan', 'rowspan', 'align',
    'allow', 'allowfullscreen', 'frameborder', 'scrolling',
  ],
  // Tik saugios schemos (be javascript:, data: HTML).
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  ADD_ATTR: ['target'],
  FORBID_ATTR: ['style'], // inline style'ai gali nešti expression()/url() piktnaudžiavimą
}

const COMMENT_CONFIG = {
  ALLOWED_TAGS: ['p', 'br', 'span', 'b', 'strong', 'i', 'em', 'u', 's', 'del', 'a', 'img', 'blockquote', 'ul', 'ol', 'li', 'code', 'pre'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'title', 'src', 'alt', 'width', 'height', 'class'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  FORBID_ATTR: ['style'],
}

/** Blogas / turtingas turinys (leidžia embed iframe'us iš allowlist'o). */
export function sanitizeRichHtml(html: string | null | undefined): string {
  if (!html) return ''
  installIframeHook()
  return String(DOMPurify.sanitize(html, RICH_CONFIG as any))
}

/** Komentarai / diskusijos (be iframe'ų). */
export function sanitizeCommentHtml(html: string | null | undefined): string {
  if (!html) return ''
  return String(DOMPurify.sanitize(html, COMMENT_CONFIG as any))
}

/** Griežtas: pašalina VISĄ HTML, palieka tik tekstą (pvz. summary/pavadinimams). */
export function stripAllHtml(html: string | null | undefined): string {
  if (!html) return ''
  return String(DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] } as any))
}
