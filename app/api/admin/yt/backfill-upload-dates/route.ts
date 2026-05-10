/**
 * POST /api/admin/yt/backfill-upload-dates
 *
 * Backfill'ina `tracks.video_uploaded_at` esamiems track'ams kurie turi
 * `video_url` ir NULL upload date. Naudoja YouTube Data API v3 batch
 * endpoint'ą (iki 50 video IDs per request), kad sutaupytume quota.
 *
 * Query params:
 *   ?limit=200           — kiek tracks apdoroti per call (default 200)
 *   ?artist_id=42        — apriboti vienam atlikėjui
 *   ?dry_run=1           — neperrašom DB, tik loginame kiek būtų
 *
 * Response:
 *   { processed, updated, missing, batches, sample: [{id, title, uploadedAt}], errors }
 *
 * Saugumas: tik admin/super_admin.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** Iš `https://www.youtube.com/watch?v=ID` arba `youtu.be/ID` ištraukia ID. */
function extractVideoId(url: string): string | null {
  if (!url) return null
  const m1 = url.match(/[?&]v=([A-Za-z0-9_-]{11})/)
  if (m1) return m1[1]
  const m2 = url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/)
  if (m2) return m2[1]
  const m3 = url.match(/\/embed\/([A-Za-z0-9_-]{11})/)
  if (m3) return m3[1]
  return null
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'YOUTUBE_API_KEY not set' }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10), 1000)
  const artistId = searchParams.get('artist_id')
  const dryRun = searchParams.get('dry_run') === '1'

  // Tracks su video_url ir NULL video_uploaded_at.
  let query = supabase
    .from('tracks')
    .select('id, title, video_url')
    .not('video_url', 'is', null)
    .is('video_uploaded_at', null)
    .order('id', { ascending: true })
    .limit(limit)
  if (artistId) query = query.eq('artist_id', parseInt(artistId, 10))

  const { data: tracks, error: tErr } = await query
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })
  if (!tracks || tracks.length === 0) {
    return NextResponse.json({ processed: 0, updated: 0, missing: 0, batches: 0 })
  }

  // Map track → videoId. Track'us be parsable video ID praleidžiam (missing).
  type Item = { trackId: number; title: string; videoId: string }
  const items: Item[] = []
  let missing = 0
  for (const t of tracks as any[]) {
    const vid = extractVideoId(t.video_url || '')
    if (!vid) { missing++; continue }
    items.push({ trackId: t.id, title: t.title || '', videoId: vid })
  }

  // Batch'inam po 50 (Data API max).
  const BATCH = 50
  let updated = 0
  const sample: Array<{ id: number; title: string; uploadedAt: string }> = []
  const errors: string[] = []
  let batches = 0
  for (let i = 0; i < items.length; i += BATCH) {
    const chunk = items.slice(i, i + BATCH)
    const ids = chunk.map(c => c.videoId).join(',')
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${ids}&key=${apiKey}`
    batches++
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
      if (!res.ok) {
        errors.push(`batch ${i}: HTTP ${res.status}`)
        continue
      }
      const data = (await res.json()) as any
      const itemsRet = data?.items || []
      // Data API gali grąžinti mažiau, jei kai kurie video privatūs/ištrinti.
      // Map'inam by videoId.
      const byId = new Map<string, string>()
      for (const it of itemsRet) {
        const vid = it?.id
        const pub = it?.snippet?.publishedAt
        if (vid && pub) byId.set(vid, pub)
      }
      // Per-track update (PostgREST batch update with row-specific values neturi
      // čia native suport'o, todėl kviečiam po vieną PATCH — bet jie greiti).
      for (const c of chunk) {
        const pub = byId.get(c.videoId)
        if (!pub) continue
        if (sample.length < 5) sample.push({ id: c.trackId, title: c.title, uploadedAt: pub })
        if (dryRun) { updated++; continue }
        const { error: uErr } = await (supabase
          .from('tracks') as any)
          .update({ video_uploaded_at: pub })
          .eq('id', c.trackId)
        if (uErr) errors.push(`track ${c.trackId}: ${uErr.message?.slice(0, 80)}`)
        else updated++
      }
    } catch (e: any) {
      errors.push(`batch ${i}: ${String(e?.message || e).slice(0, 100)}`)
    }
  }

  return NextResponse.json({
    processed: items.length,
    updated,
    missing,
    batches,
    sample,
    errors: errors.length ? errors.slice(0, 20) : undefined,
    note: dryRun ? 'DRY RUN — no DB writes' : undefined,
  })
}
