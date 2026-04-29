/**
 * POST /api/admin/wiki/parse
 *
 * Vienas universalus parsing endpoint'as. Įrankis ir UI komponentams
 * (per session), ir Python worker'iui (per X-Internal-Secret header).
 *
 * Body: {
 *   type: 'tracklist' | 'discography_page' | 'main_discography'
 *       | 'certifications' | 'peak_chart' | 'singles_infobox'
 *       | 'years_active' | 'band_members' | 'genres_infobox'
 *       | 'map_genres' | 'find_country',
 *   wikitext?: string,
 *   row_lines?: string[],
 *   genre_labels?: string[],
 *   text?: string,
 *   options?: { soloOnly?: boolean; groupFilter?: string }
 * }
 *
 * Returns: { ok: true, data: <parsed> } | { ok: false, error: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { COUNTRIES, SUBSTYLES } from '@/lib/constants'
import * as wikiParser from '@/lib/wiki-parser'

// Inicializuojam parser konstantas su projekto-specific data (lengvas one-time call)
let _initialized = false
function ensureInitialized() {
  if (_initialized) return
  wikiParser.initializeConstants(COUNTRIES as readonly string[] as string[], SUBSTYLES)
  _initialized = true
}

async function authorize(req: NextRequest): Promise<{ ok: boolean; reason?: string }> {
  // Pirma — internal secret (Python worker'iui)
  const sec = req.headers.get('x-internal-secret')
  const expected = process.env.INTERNAL_API_SECRET
  if (sec && expected && sec === expected) {
    return { ok: true }
  }
  // Tada — session admin role
  const session = await getServerSession(authOptions)
  if (session?.user?.role && ['admin', 'super_admin'].includes(session.user.role)) {
    return { ok: true }
  }
  return { ok: false, reason: 'Unauthorized' }
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.reason || 'Unauthorized' }, { status: 401 })

  ensureInitialized()

  let body: any
  try { body = await req.json() }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  const type = String(body.type || '').toLowerCase()
  const wikitext: string = typeof body.wikitext === 'string' ? body.wikitext : ''
  const opts = body.options || {}

  try {
    let data: any
    switch (type) {
      case 'tracklist':
        if (!wikitext) return NextResponse.json({ ok: false, error: 'wikitext required' }, { status: 400 })
        data = wikiParser.parseTracklist(wikitext)
        break

      case 'discography_page':
        if (!wikitext) return NextResponse.json({ ok: false, error: 'wikitext required' }, { status: 400 })
        data = wikiParser.parseDiscographyPage(wikitext)
        break

      case 'main_discography':
        if (!wikitext) return NextResponse.json({ ok: false, error: 'wikitext required' }, { status: 400 })
        data = wikiParser.parseMainPageDiscography(wikitext, !!opts.soloOnly, opts.groupFilter)
        break

      case 'certifications': {
        const rowLines: string[] = Array.isArray(body.row_lines) ? body.row_lines : []
        // Jei row_lines neperduotos — bandyti split'inti wikitext po lines
        const lines = rowLines.length ? rowLines : (wikitext ? wikitext.split('\n') : [])
        data = wikiParser.parseCertifications(lines)
        break
      }

      case 'peak_chart': {
        const rowLines: string[] = Array.isArray(body.row_lines) ? body.row_lines : []
        const lines = rowLines.length ? rowLines : (wikitext ? wikitext.split('\n') : [])
        data = wikiParser.parsePeakChartPosition(lines)
        break
      }

      case 'singles_infobox': {
        if (!wikitext) return NextResponse.json({ ok: false, error: 'wikitext required' }, { status: 400 })
        const r = wikiParser.parseSinglesFromInfobox(wikitext)
        // Set/Map serialize'inami į arrays
        data = {
          names: Array.from(r.names),
          dates: Array.from(r.dates.entries()).map(([k, v]) => ({ name: k, ...v })),
        }
        break
      }

      case 'years_active': {
        const raw: string = typeof body.raw === 'string' ? body.raw : ''
        if (!raw) return NextResponse.json({ ok: false, error: 'raw required' }, { status: 400 })
        data = wikiParser.parseYearsActive(raw)
        break
      }

      case 'band_members': {
        if (!wikitext) return NextResponse.json({ ok: false, error: 'wikitext required' }, { status: 400 })
        data = wikiParser.parseBandMembers(wikitext)
        break
      }

      case 'genres_infobox':
        if (!wikitext) return NextResponse.json({ ok: false, error: 'wikitext required' }, { status: 400 })
        data = wikiParser.parseInfoboxGenres(wikitext)
        break

      case 'map_genres': {
        const labels: string[] = Array.isArray(body.genre_labels) ? body.genre_labels : []
        data = wikiParser.mapGenres(labels)
        break
      }

      case 'find_country': {
        const text: string = typeof body.text === 'string' ? body.text : ''
        data = wikiParser.findCountry(text)
        break
      }

      case 'extract_field': {
        const field: string = String(body.field || '')
        if (!wikitext || !field) {
          return NextResponse.json({ ok: false, error: 'wikitext + field required' }, { status: 400 })
        }
        data = wikiParser.extractFieldNested(wikitext, field)
        break
      }

      case 'extract_track_listings':
        if (!wikitext) return NextResponse.json({ ok: false, error: 'wikitext required' }, { status: 400 })
        data = wikiParser.extractTrackListingsWithPos(wikitext)
        break

      case 'clean_wiki_text': {
        const raw: string = typeof body.raw === 'string' ? body.raw : ''
        data = wikiParser.cleanWikiText(raw)
        break
      }

      case 'parse_featuring': {
        const raw: string = typeof body.raw === 'string' ? body.raw : ''
        data = wikiParser.parseFeaturing(raw)
        break
      }

      case 'awards_article': {
        if (!wikitext) return NextResponse.json({ ok: false, error: 'wikitext required' }, { status: 400 })
        data = wikiParser.parseAwardsArticle(wikitext)
        break
      }

      default:
        return NextResponse.json({ ok: false, error: `Unknown type: ${type}` }, { status: 400 })
    }

    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
