// ─────────────────────────────────────────────────────────────────────────
// SSRF apsauga: leidžia tik viešus http(s) URL, blokuoja vidinius/private IP.
// Naudojama server-side fetch'ams su vartotojo pateiktu URL (fetch-image, upload).
//
// Dvi patikros:
//   assertPublicHttpUrl(url)        — sinchroninė (schema + literalaus host'o patikra)
//   assertPublicHttpUrlResolved(url)— async: PAPILDOMAI resolve'ina DNS ir validuoja
//                                     KIEKVIENĄ gautą IP (uždaro nip.io/DNS-rebind).
// ─────────────────────────────────────────────────────────────────────────

import { lookup } from 'dns/promises'

const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /(^|\.)metadata\.google\.internal$/i,
]

export function isPrivateIPv4(host: string): boolean {
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

/** Išskleidžia IPv6 (su galimu embedded IPv4) į 16 baitų; null jei netinkamas. */
function ipv6ToBytes(input: string): number[] | null {
  let s = input.trim().toLowerCase().replace(/^\[|\]$/g, '')
  if (s === '') return null
  // Embedded IPv4 gale (pvz. ::ffff:1.2.3.4 arba 64:ff9b::1.2.3.4)
  let tailV4: number[] | null = null
  const v4m = s.match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4m) {
    tailV4 = [parseInt(v4m[1]), parseInt(v4m[2]), parseInt(v4m[3]), parseInt(v4m[4])]
    if (tailV4.some((n) => n > 255)) return null
    // Pakeičiam v4 dalį dviem placeholder grupėm (0:0), kurios vėliau
    // perrašomos tailV4 baitais. (Buvo bug'as: papildomas :0 nustumdavo grupes.)
    s = s.slice(0, v4m.index)
    if (!s.endsWith(':')) s += ':'
    s += '0:0'
  }
  const halves = s.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':').filter(Boolean) : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':').filter(Boolean) : []
  let groups: string[]
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length
    if (missing < 0) return null
    groups = [...head, ...Array(missing).fill('0'), ...tail]
  } else {
    groups = head
  }
  if (groups.length !== 8) return null
  const bytes: number[] = []
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null
    const v = parseInt(g, 16)
    bytes.push((v >> 8) & 0xff, v & 0xff)
  }
  if (tailV4) { bytes[12] = tailV4[0]; bytes[13] = tailV4[1]; bytes[14] = tailV4[2]; bytes[15] = tailV4[3] }
  return bytes
}

export function isPrivateIPv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase()
  const b = ipv6ToBytes(h)
  if (!b) {
    // Nepavyko išparse'inti — atsargiai blokuojam žinomus prefiksus.
    return h === '::1' || h === '::' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')
  }
  const allZero = (arr: number[]) => arr.every((x) => x === 0)
  // ::1 loopback / :: unspecified
  if (allZero(b.slice(0, 15)) && (b[15] === 1 || b[15] === 0)) return true
  // ULA fc00::/7
  if ((b[0] & 0xfe) === 0xfc) return true
  // link-local fe80::/10
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true
  // IPv4-mapped ::ffff:0:0/96  ir  IPv4-compat ::/96 → tikrinam embedded v4
  const mapped = allZero(b.slice(0, 10)) && b[10] === 0xff && b[11] === 0xff
  const compat = allZero(b.slice(0, 12))
  // NAT64 64:ff9b::/96
  const nat64 = b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && allZero(b.slice(4, 12))
  if (mapped || compat || nat64) {
    return isPrivateIPv4(`${b[12]}.${b[13]}.${b[14]}.${b[15]}`)
  }
  // 6to4 2002::/16 → embedded v4 baituose 2..5
  if (b[0] === 0x20 && b[1] === 0x02) {
    return isPrivateIPv4(`${b[2]}.${b[3]}.${b[4]}.${b[5]}`)
  }
  return false
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, '') // nuimam trailing dot (FQDN bypass)
}

/** Sinchroninė patikra: schema + literalaus host'o. Meta klaidą jei nesaugu. */
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
  const host = normalizeHost(u.hostname)
  if (!host) throw new Error('Netinkamas host')
  if (BLOCKED_HOST_PATTERNS.some((re) => re.test(host))) {
    throw new Error('Blokuotas host')
  }
  if (isPrivateIPv4(host) || isPrivateIPv6(host)) {
    throw new Error('Blokuotas vidinis adresas')
  }
  return u
}

/**
 * Async patikra su DNS resolve'inimu — uždaro nip.io/sslip.io ir paprastą
 * DNS-rebind (validuoja KIEKVIENĄ gautą IP). Naudoti PRIEŠ fetch.
 */
export async function assertPublicHttpUrlResolved(raw: string): Promise<URL> {
  const u = assertPublicHttpUrl(raw)
  const host = normalizeHost(u.hostname)
  // Jei host jau IP literalas — jau patikrintas aukščiau.
  const isIpLiteral = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')
  if (isIpLiteral) return u
  let addrs: { address: string; family: number }[]
  try {
    addrs = await lookup(host, { all: true })
  } catch {
    throw new Error('DNS resolve nepavyko')
  }
  if (!addrs.length) throw new Error('Host neišsprendžiamas')
  for (const a of addrs) {
    const bad = a.family === 6 ? isPrivateIPv6(a.address) : isPrivateIPv4(a.address)
    if (bad) throw new Error('Blokuotas vidinis adresas (DNS)')
  }
  return u
}

/** true, jei URL saugus (sinchroninė patikra, be metimo). */
export function isPublicHttpUrl(raw: string): boolean {
  try {
    assertPublicHttpUrl(raw)
    return true
  } catch {
    return false
  }
}
