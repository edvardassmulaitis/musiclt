// /api/admin/galerija/flickr-import
//
// POST { album_url } → paima Flickr albumo nuotraukų sąrašą (be importo).
// Admin peržiūri ir tada siunčia į .../reportages/[id]/photos (su rehost).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { extractFlickrAlbum } from '@/lib/galerija-import'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['editor', 'admin', 'super_admin'].includes((session.user.role as string) || '')) return null
  return session
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Neteisingas body' }, { status: 400 }) }
  const albumUrl = (body?.album_url || '').toString().trim()
  if (!/flickr\.com/i.test(albumUrl)) return NextResponse.json({ ok: false, error: 'Įvesk Flickr albumo nuorodą' }, { status: 400 })

  try {
    const photos = await extractFlickrAlbum(albumUrl)
    if (!photos.length) return NextResponse.json({ ok: false, error: 'Albume nerasta nuotraukų (gal privatus arba pasikeitė formatas)' }, { status: 422 })
    return NextResponse.json({ ok: true, count: photos.length, photos })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Klaida' }, { status: 500 })
  }
}
