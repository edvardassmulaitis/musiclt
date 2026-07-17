/**
 * POST /api/admin/wiki-album-scout/trigger — rankinis wiki-album-scout
 * paleidimas iš admin UI (žr. app/admin/inbox/albums/page.tsx "Paleisti
 * dabar" mygtuką). Session-auth (admin/super_admin), TA PATI logika kaip
 * cron endpoint'as (`app/api/internal/wiki-album-scout/run`) — abu kviečia
 * `runWikiAlbumScout()` iš `lib/wiki-album-scout-run.ts`, kad admin'ui
 * nereikėtų laukti iki kito 06:00 UTC paleidimo, kai nori patikrinti scan'ą
 * iš karto (pvz. iškart po migracijos arba naujo scout_sources įrašo).
 *
 * Body: { dry_run?: boolean }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { runWikiAlbumScout } from '@/lib/wiki-album-scout-run'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['editor', 'admin', 'super_admin'].includes((session.user.role as string) || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const dryRun = !!body.dry_run

  const { status, body: resultBody } = await runWikiAlbumScout({ dryRun, origin: req.nextUrl.origin })
  return NextResponse.json(resultBody, { status })
}
