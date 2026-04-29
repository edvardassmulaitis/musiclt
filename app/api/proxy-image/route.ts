// app/api/proxy-image/route.ts
//
// Image proxy mobile Safari problemai apeiti. Mobile Safari (ir kai kurie
// Android browser'iai) blokuoja music.lt'o tiesioginį hot-link'inimą — net
// su referrerPolicy="no-referrer", paveiksliukai negrąžinami. Vietos
// hipotezė: music.lt CDN turi User-Agent / IP origin filter'ą kuris
// netoleruoja mobile request'ų iš trečių šalių (tokiu kaip vercel.app).
//
// Šis endpoint'as fetch'ina paveiksliuką server-side (node fetch), kur'ios
// User-Agent ir IP yra Vercel Functions, ir streamina turinį atgal
// klientui. Mobile Safari mato URL kaip vercel.app/api/proxy-image — jokio
// Referer / cross-origin issue.
//
// Saugumas: priimame TIK https URL'us iš whitelisted domenų — neleidžiame
// padaryti SSRF į intranet ar metadata endpoint'us. Cache'inam atsakymą
// 7 dienoms, kad Vercel CDN užkrautų stabiliems URL'ams (kaip thumbnail'ai).

import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_HOSTS = new Set([
  'www.music.lt',
  'music.lt',
  // ateityje galima pridėti kitas image source'us, jei reikės proxy
])

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) {
    return new NextResponse('Missing url param', { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return new NextResponse('Invalid url', { status: 400 })
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return new NextResponse('Only http(s) allowed', { status: 400 })
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return new NextResponse('Host not allowed', { status: 403 })
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      headers: {
        // Naudojam neutralų browser User-Agent'ą — kai kurie CDN'ai
        // grąžina 403 jei UA yra tuščias arba „node-fetch".
        'User-Agent': 'Mozilla/5.0 (compatible; MusicLtRebuildProxy/1.0)',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
      // Vercel Edge default — fail fast jei upstream slow
      signal: AbortSignal.timeout(10_000),
    })

    if (!upstream.ok) {
      return new NextResponse(`Upstream ${upstream.status}`, { status: upstream.status })
    }
    const contentType = upstream.headers.get('content-type') || 'image/jpeg'
    if (!contentType.startsWith('image/')) {
      return new NextResponse('Not an image', { status: 415 })
    }

    const buf = await upstream.arrayBuffer()
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // 7 dienos client-side + Vercel CDN. immutable — jei tas pats URL,
        // visada tas pats turinys (music.lt'e filename'ai dažniausiai
        // unique per upload).
        'Cache-Control': 'public, max-age=604800, s-maxage=604800, immutable',
      },
    })
  } catch (err: any) {
    return new NextResponse(`Proxy error: ${err?.message || 'unknown'}`, { status: 502 })
  }
}
