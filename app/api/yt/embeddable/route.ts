/**
 * GET /api/yt/embeddable?videoId={id}
 *
 * Patikrina, ar YouTube video leidžia embed'inti trečioms šalims.
 * Daug muzikos label'ų (pvz SelMusic) yra išjungę embedding'ą — jų
 * iframe'ai užkrauna juodą langą su "Klaida 153" / "Video unavailable".
 *
 * Algoritmas:
 *   1. Fetch'inam /embed/{id} kaip plain HTML
 *   2. Grep'inam "Klaida 153" (LT) ARBA "errorScreen" + "playerErrorMessageRenderer"
 *      ARBA "Video unavailable" (EN)
 *   3. Jei kažkurio match'as → embeddable=false; kitaip true
 *
 * Cache: HTTP `Cache-Control: public, max-age=86400` (24h) — videoo embed
 * statusas keičiasi retai (tik kai kanalas pakeičia setting'us).
 *
 * Response: { videoId, embeddable: boolean, source: 'check' | 'cache' }
 */
import { NextRequest, NextResponse } from 'next/server'

// In-memory cache (per Vercel function instance) — papildoma prieš HTTP cache
// kad pakartotinūs request'ai tame pačiame cold start'e neleistų YT scrape'ui.
const _memCache = new Map<string, { embeddable: boolean; t: number }>()
const MEM_TTL_MS = 30 * 60_000 // 30 min

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const videoId = (searchParams.get('videoId') || '').trim()

  // Validate — YT video IDs are [A-Za-z0-9_-]{11} (su _ ir -). Konservatyviai
  // priimam 6-32 length range, reject viską kita.
  if (!videoId || !/^[A-Za-z0-9_-]{6,32}$/.test(videoId)) {
    return NextResponse.json({ error: 'Invalid videoId' }, { status: 400 })
  }

  const now = Date.now()
  const cached = _memCache.get(videoId)
  if (cached && now - cached.t < MEM_TTL_MS) {
    return NextResponse.json(
      { videoId, embeddable: cached.embeddable, source: 'cache' },
      { headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' } }
    )
  }

  let embeddable = true // optimistic default — if check fails, render iframe and let it try
  try {
    const r = await fetch(`https://www.youtube.com/embed/${encodeURIComponent(videoId)}`, {
      method: 'GET',
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.5' },
      // Per Vercel egress dažnai gauname rate-limit — 8s timeout užtenka
      signal: AbortSignal.timeout(8000),
    })
    if (r.ok) {
      const html = await r.text()
      // YT renderins embed-disabled error puslapį net su HTTP 200
      if (
        /Klaida\s*15[01]\b/.test(html) ||
        /Error\s*15[01]\b/.test(html) ||
        /"errorScreen":\s*\{[^}]*?"playerErrorMessageRenderer"/.test(html) ||
        // EN tekstas, kai embed'as iš viso išjungtas
        /Video unavailable/.test(html) ||
        // LT tekstas tame pačiame kontekste
        /Vaizdo įrašų leistuvės konfigūracijos klaida/.test(html)
      ) {
        embeddable = false
      }
    }
  } catch {
    // Network klaidos — paliekam optimistic true, kitas request'as gal pavyks
  }

  _memCache.set(videoId, { embeddable, t: now })

  return NextResponse.json(
    { videoId, embeddable, source: 'check' },
    { headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' } }
  )
}
