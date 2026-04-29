/**
 * POST /api/admin/yt/artist/[id]/enrich
 *
 * Bulk YouTube enrichment vienam atlikėjui — eina per visus jo
 * trackus ir kviečia tą pačią logiką, kaip
 * /api/admin/yt/track/[id]/enrich.
 *
 * Body (JSON, optional):
 *   {
 *     force?: boolean,         // re-search net jei youtube_searched_at jau yra
 *     refreshViews?: boolean,  // jei false — praleidžia views check track'ams,
 *                              // kuriuos jau tikrinom < refreshAfterDays
 *     refreshAfterDays?: number, // default 30
 *     limit?: number,          // default unlimited (paima visus artist track'us)
 *   }
 *
 * Response:
 *   {
 *     ok: true,
 *     artistId: number,
 *     totalTracks: number,
 *     processed: number,
 *     searched: number,        // kiek faktiškai darėm YT search
 *     foundNew: number,        // kiek naujų video_url radom
 *     viewsUpdated: number,    // kiek track'ų gavo naują views snapshot'ą
 *     errors: number,
 *     details: EnrichResult[]  // kiekvieno track'o rezultatas (gali būti didelis)
 *   }
 *
 * Saugumas: viskas server-side per service role; atsako per JSON
 * (ne stream) — UI rodo progress'ą per polling'ą ant track count'ų.
 * Pavienis enrichment trunka ~1-3 sekundes (search + player), tad
 * 30 track'ų artist'ui tai ~60-90s — JSON užtenka.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'
import { enrichTrack, type EnrichResult } from '@/lib/yt-enrich'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireAdminOrInternal(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret')
  if (secret && process.env.INTERNAL_API_SECRET && secret === process.env.INTERNAL_API_SECRET) {
    return true
  }
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return false
  }
  return true
}

const SLEEP_MS = 250 // tarp track'ų — kad nepiktinti InnerTube'o

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdminOrInternal(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: idStr } = await params
  const artistId = Number(idStr)
  if (!Number.isFinite(artistId) || artistId <= 0) {
    return NextResponse.json({ error: 'Bad artist id' }, { status: 400 })
  }

  let body: any = {}
  try { body = await req.json() } catch { /* empty body OK */ }
  const force = !!body?.force
  const refreshViews = body?.refreshViews !== false // default true
  const refreshAfterDays = Number(body?.refreshAfterDays) || 30
  const limit = Number(body?.limit) || 0

  // Paimam visus artist'o trackus su minimaliu select'u — sprendžiam, ką
  // reikia processint (force / žymėjimo flag'ai), o pati enrichTrack
  // perskaitys pilną row vidinai.
  let q = supabase
    .from('tracks')
    .select('id, video_url, youtube_searched_at, video_views_checked_at')
    .eq('artist_id', artistId)
    .order('id', { ascending: true })

  if (limit > 0) q = q.limit(limit)

  const { data: trackRows, error: tErr } = await q
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })
  if (!trackRows) return NextResponse.json({ error: 'No tracks loaded' }, { status: 500 })

  const refreshCutoff = Date.now() - refreshAfterDays * 24 * 60 * 60 * 1000

  // Filtruojam — kuriuos track'us reikia liesti
  const toProcess = trackRows.filter((t: any) => {
    // Search dar reikalingas? (nėra video_url + (force || dar neieškota))
    const needsSearch = !t.video_url && (force || !t.youtube_searched_at)
    // Views refresh reikalingas? (turi video_url, ir refreshViews on, ir
    // arba dar netikrinta, arba seniai)
    const lastChecked = t.video_views_checked_at ? new Date(t.video_views_checked_at).getTime() : 0
    const needsViews = !!t.video_url && refreshViews && lastChecked < refreshCutoff
    return needsSearch || needsViews
  })

  const details: EnrichResult[] = []
  let searched = 0, foundNew = 0, skipped = 0, viewsUpdated = 0, errors = 0

  for (const row of toProcess) {
    const r = await enrichTrack((row as any).id, force)
    if (!r.ok) {
      errors++
      // Vis dėlto įrašom result placeholder'į — kad UI matytų klaidą per warnings.
      const placeholder: EnrichResult = {
        ok: true,
        trackId: (row as any).id,
        trackTitle: null,
        videoId: null, videoUrl: null,
        videoTitle: null, videoChannel: null, matchScore: null,
        wasSearched: false, wasFound: false, skipReason: null,
        viewsBefore: null, viewsAfter: null, viewsDelta: null,
        historyId: null,
        warnings: [`enrichTrack failed: ${r.error}`],
      }
      details.push(placeholder)
      continue
    }
    if (r.wasSearched) searched++
    if (r.wasFound) foundNew++
    if (r.skipReason) skipped++
    if (r.viewsAfter !== null) viewsUpdated++
    details.push(r)

    // Throttle — tarp track'ų leidžiam mažą pauzę, kad nepiktinti InnerTube'o.
    if (SLEEP_MS > 0) await new Promise(res => setTimeout(res, SLEEP_MS))
  }

  return NextResponse.json({
    ok: true,
    artistId,
    totalTracks: trackRows.length,
    processed: toProcess.length,
    searched,
    foundNew,
    skipped,        // search'inom, bet nė vienas kandidatas nesiekė threshold'o
    viewsUpdated,
    errors,
    details,
  })
}
