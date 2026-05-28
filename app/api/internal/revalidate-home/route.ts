/**
 * POST /api/internal/revalidate-home?kind=tracks|albums|news|all
 *
 * Manualinis homepage cache invalidation'as. Naudojamas:
 *   - Iš scrape job'ų (po batch INSERT'ų tracks/albums/news lentelėse)
 *   - Iš admin migration tool'ų (po wipe + import)
 *   - Iš GitHub Actions po news-scout cron'o
 *
 * Auth: bear token iš `INTERNAL_REVALIDATE_TOKEN` env var arba admin session.
 *
 * Pavyzdys (CLI):
 *   curl -X POST "https://music.lt/api/internal/revalidate-home?kind=tracks" \
 *        -H "Authorization: Bearer $INTERNAL_REVALIDATE_TOKEN"
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { HOME_TAGS, revalidateHomeTag } from '@/lib/home-latest'

const KINDS = ['tracks', 'albums', 'news', 'events', 'all'] as const

export async function POST(req: NextRequest) {
  // Auth check — token VS admin session
  const auth = req.headers.get('authorization') || ''
  const tokenOK =
    !!process.env.INTERNAL_REVALIDATE_TOKEN &&
    auth === `Bearer ${process.env.INTERNAL_REVALIDATE_TOKEN}`

  if (!tokenOK) {
    const session = await getServerSession(authOptions)
    if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const kind = req.nextUrl.searchParams.get('kind') || 'all'
  if (!KINDS.includes(kind as any)) {
    return NextResponse.json({ error: `kind must be one of: ${KINDS.join(', ')}` }, { status: 400 })
  }

  const revalidated: string[] = []
  if (kind === 'all') {
    for (const k of ['tracks', 'albums', 'news', 'events'] as const) {
      revalidateHomeTag(k)
      revalidated.push(HOME_TAGS[k])
    }
  } else {
    const k = kind as 'tracks' | 'albums' | 'news' | 'events'
    revalidateHomeTag(k)
    revalidated.push(HOME_TAGS[k])
  }

  return NextResponse.json({ ok: true, revalidated })
}
