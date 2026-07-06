'use client'

// ─────────────────────────────────────────────────────────────────────────
// Device fingerprint — stabilus įrenginio/naršyklės atpažinimas anti-cheat'ui.
//
// Renka daug signalų (canvas, WebGL, audio, ekranas, navigator, šriftai, laiko
// zona) ir sumaišo į stabilų SHA-256 hex hash'ą. Naudojama balsavimuose kaip
// papildomas dedup/limito matmuo (žr. lib/vote-guard.ts serveryje).
//
// PASTABA: fingerprint'as siunčiamas iš kliento → determinuotas atakuotojas gali
// jį suklastoti. Todėl serveryje jis derinamas su IP + Turnstile + distinct-user
// reitingu (gynyba sluoksniais). Prieš atsitiktinį multi-account (tas pats
// įrenginys, kelios Google paskyros) — labai efektyvu.
// ─────────────────────────────────────────────────────────────────────────

const CACHE_KEY = 'ml_device_fp_v1'
let _cached: string | null = null

async function sha256Hex(input: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    // Fallback: paprastas string hash (jei subtle nepasiekiamas).
    let h = 0
    for (let i = 0; i < input.length; i++) { h = (Math.imul(31, h) + input.charCodeAt(i)) | 0 }
    return 'f' + (h >>> 0).toString(16)
  }
}

function canvasSignal(): string {
  try {
    const c = document.createElement('canvas')
    c.width = 240; c.height = 60
    const ctx = c.getContext('2d')
    if (!ctx) return 'no-canvas'
    ctx.textBaseline = 'top'
    ctx.font = "14px 'Arial'"
    ctx.fillStyle = '#f60'; ctx.fillRect(125, 1, 62, 20)
    ctx.fillStyle = '#069'; ctx.fillText('music.lt \u{1F3B5} 0O', 2, 15)
    ctx.fillStyle = 'rgba(102,204,0,0.7)'; ctx.fillText('music.lt \u{1F3B5} 0O', 4, 17)
    return c.toDataURL().slice(-120)
  } catch { return 'canvas-err' }
}

function webglSignal(): string {
  try {
    const c = document.createElement('canvas')
    const gl = (c.getContext('webgl') || c.getContext('experimental-webgl')) as WebGLRenderingContext | null
    if (!gl) return 'no-webgl'
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    const vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)
    const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
    return `${vendor}~${renderer}`
  } catch { return 'webgl-err' }
}

function audioSignal(): string {
  try {
    const AC = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext
    if (!AC) return 'no-audio'
    // Sinchroniniai parametrai (be async render'io — pakanka signalo įvairovei).
    const ctx = new AC(1, 44100, 44100)
    return `${ctx.sampleRate}~${ctx.destination.channelCount}~${(ctx as any).destination.maxChannelCount || 0}`
  } catch { return 'audio-err' }
}

function fontsSignal(): string {
  try {
    const base = ['monospace', 'sans-serif', 'serif']
    const test = ['Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana', 'Helvetica', 'Comic Sans MS', 'Impact']
    const span = document.createElement('span')
    span.style.cssText = 'position:absolute;left:-9999px;font-size:72px'
    span.textContent = 'mmmmmmmmmmlli'
    document.body.appendChild(span)
    const baseW: Record<string, number> = {}
    for (const b of base) { span.style.fontFamily = b; baseW[b] = span.offsetWidth }
    const found: string[] = []
    for (const f of test) {
      for (const b of base) {
        span.style.fontFamily = `'${f}',${b}`
        if (span.offsetWidth !== baseW[b]) { found.push(f); break }
      }
    }
    document.body.removeChild(span)
    return found.join(',')
  } catch { return 'fonts-err' }
}

async function compute(): Promise<string> {
  const n = navigator as any
  const s = screen as any
  const parts = [
    n.userAgent || '',
    n.language || '', (n.languages || []).join(','),
    n.platform || '', n.hardwareConcurrency || '', n.deviceMemory || '',
    n.maxTouchPoints || '', n.vendor || '',
    `${s.width}x${s.height}x${s.colorDepth}`, window.devicePixelRatio || '',
    new Date().getTimezoneOffset(),
    (Intl.DateTimeFormat().resolvedOptions().timeZone) || '',
    canvasSignal(), webglSignal(), audioSignal(), fontsSignal(),
  ]
  return sha256Hex(parts.join('|'))
}

/** Grąžina stabilų įrenginio fingerprint'ą (cache'inamas). */
export async function getDeviceFingerprint(): Promise<string> {
  if (_cached) return _cached
  try {
    const stored = localStorage.getItem(CACHE_KEY)
    if (stored && stored.length >= 8) { _cached = stored; return stored }
  } catch {}
  const fp = await compute()
  _cached = fp
  try { localStorage.setItem(CACHE_KEY, fp) } catch {}
  return fp
}

/**
 * Sinchroninis fingerprint'o getter'is call-site'ams (pvz. balsavimo body).
 * Grąžina jau apskaičiuotą reikšmę (arba iš localStorage), arba '' jei dar neparuošta.
 * Skaičiavimas paleidžiamas eagerly puslapio krovimo metu (žr. apačioje).
 */
export function deviceFpSync(): string {
  if (_cached) return _cached
  try {
    const stored = localStorage.getItem(CACHE_KEY)
    if (stored && stored.length >= 8) { _cached = stored; return stored }
  } catch {}
  return ''
}

// Eager skaičiavimas kliente — kad iki pirmo balso fingerprint'as būtų paruoštas.
if (typeof window !== 'undefined') {
  getDeviceFingerprint().catch(() => {})
}
