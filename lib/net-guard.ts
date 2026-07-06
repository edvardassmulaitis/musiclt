// ─────────────────────────────────────────────────────────────────────────
// SSRF apsauga: leidžia tik viešus http(s) URL, blokuoja vidinius/private IP.
// Naudojama server-side fetch'ams su vartotojo pateiktu URL (fetch-image, upload).
//
// Pastaba: hostname-lygio patikra sustabdo tiesioginius vidinius URL ir
// (per re-check po fetch) paprastą redirect→internal. Gili DNS-rebind apsauga
// (resolve→validate IP) — Fazė 2/3.
// ─────────────────────────────────────────────────────────────────────────

const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /^metadata\.google\.internal$/i,
]

function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)]
  if (a === 10) return true                          // 10.0.0.0/8
  if (a === 127) return true                         // loopback
  if (a === 0) return true                           // 0.0.0.0/8
  if (a === 169 && b === 254) return true            // link-local + cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true   // 172.16.0.0/12
  if (a === 192 && b === 168) return true            // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true  // CGNAT 100.64.0.0/10
  if (a >= 224) return true                          // multicast / reserved
  return false
}

function isPrivateIPv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (h === '::1' || h === '::') return true          // loopback / unspecified
  if (h.startsWith('fc') || h.startsWith('fd')) return true // ULA fc00::/7
  if (h.startsWith('fe80')) return true               // link-local
  if (h.startsWith('::ffff:')) return true            // IPv4-mapped (could wrap private v4)
  return false
}

/** Meta klaidą, jei URL nesaugus (ne http(s) arba vidinis/private taikinys). */
export function assertPublicHttpUrl(raw: string): URL {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new Error('Netinkamas URL')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Leidžiami tik http(s) URL')
  }
  const host = u.hostname.toLowerCase()
  if (BLOCKED_HOST_PATTERNS.some((re) => re.test(host))) {
    throw new Error('Blokuotas host')
  }
  if (isPrivateIPv4(host) || isPrivateIPv6(host)) {
    throw new Error('Blokuotas vidinis adresas')
  }
  return u
}

/** true, jei URL saugus (be metimo). */
export function isPublicHttpUrl(raw: string): boolean {
  try {
    assertPublicHttpUrl(raw)
    return true
  } catch {
    return false
  }
}
