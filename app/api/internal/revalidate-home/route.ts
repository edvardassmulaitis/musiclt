/**
 * POST /api/internal/revalidate-home?kind=tracks|albums|news|events|artists|all
 *
 * Manualinis cache invalidation'as visiems ISR/unstable_cache tag'ams.
 * Apima homepage sekcijas (tracks/albums/news/events) ir entity puslapius
 * (artists, vėliau — albums/tracks/users).
 *
 * Naudojamas:
 *   - Iš scrape job'ų (po batch INSERT'ų tracks/albums/news lentelėse)
 *   - Iš admin migration tool'ų (po wipe + import)
 *   - Iš GitHub Actions po news-scout cron'o
 *   - Iš admin UI mygtukų /admin/settings
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
import {
  HOME_TAGS,
  ENTITY_TAGS,
  revalidateHomeTag,
  revalidateEntityTag,
} from '@/lib/home-latest'

// Home tags — homepage'o lane'ai
type HomeKind = keyof typeof HOME_TAGS
// Entity tags — detail page'ai (artist/album/track/user)
type EntityKind = keyof typeof ENTITY_TAGS

const HOME_KINDS: HomeKind[] = ['tracks', 'albums', 'news', 'events']
const ENTITY_KINDS: EntityKind[] = ['artist', 'album', 'track', 'user']
// `artists` (plural) — UI'ui patogu (mygtukas „Atlikėjai") — mapping į `artist`.
const ALIASES: Record<string, EntityKind> = {
  artists: 'artist',
  albums_pages: 'album',
  tracks_pages: 'track',
  users: 'user',
}
const ALL_KINDS = [...HOME_KINDS, ...ENTITY_KINDS, ...Object.keys(ALIASES), 'all']

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

  const rawKind = req.nextUrl.searchParams.get('kind') || 'all'
  if (!ALL_KINDS.includes(rawKind)) {
    return NextResponse.json(
      { error: `kind must be one of: ${ALL_KINDS.join(', ')}` },
      { status: 400 }
    )
  }

  // Resolve aliases (`artists` → `artist`). Tipas — paprastas string, kad TS
  // narrowing'as nepraleistų 'all' branch'o.
  const kind: string = ALIASES[rawKind] ?? rawKind

  const revalidated: string[] = []
  if (kind === 'all') {
    for (const k of HOME_KINDS) {
      revalidateHomeTag(k)
      revalidated.push(HOME_TAGS[k])
    }
    for (const k of ENTITY_KINDS) {
      revalidateEntityTag(k)
      revalidated.push(ENTITY_TAGS[k])
    }
  } else if ((HOME_KINDS as string[]).includes(kind)) {
    revalidateHomeTag(kind as HomeKind)
    revalidated.push(HOME_TAGS[kind as HomeKind])
  } else {
    revalidateEntityTag(kind as EntityKind)
    revalidated.push(ENTITY_TAGS[kind as EntityKind])
  }

  return NextResponse.json({ ok: true, revalidated })
}
