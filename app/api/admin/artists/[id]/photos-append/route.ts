/**
 * POST /api/admin/artists/[id]/photos-append
 *
 * Prideda vieną ar kelias nuotraukas prie atlikėjo profilio (artist_photos),
 * NENAIKINDAMAS esamų (skirtingai nuo PUT /api/artists/[id]/photos, kuris
 * pakeičia visą sąrašą). Naudojama news inbox'o Nuotraukų žingsnyje: pasirinkus
 * Wikimedia nuotrauką ji ne tik prisega prie naujienos, bet ir papildo atlikėjo
 * galeriją (dedup pagal url).
 *
 * Body: { photos: [{ url, author?, license?, sourceUrl?, takenAt? }] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { resolvePhotographerId, splitAuthorLicense } from '@/lib/photographers'

export const runtime = 'nodejs'

function encodeCaption(author?: string | null, sourceUrl?: string | null): string | null {
  const a = author || ''
  const s = sourceUrl || ''
  if (!a && !s) return null
  return JSON.stringify({ a, s })
}

function parseTakenAt(raw: any): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const s = raw.trim()
  const m = s.match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/)
  if (m) {
    const yr = parseInt(m[1], 10)
    if (yr >= 1900 && yr <= 2100) {
      const mo = String(parseInt(m[2] || '1', 10)).padStart(2, '0')
      const dy = String(parseInt(m[3] || '1', 10)).padStart(2, '0')
      return `${m[1]}-${mo}-${dy}`
    }
  }
  return null
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user.role as string) || '')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const artistId = parseInt((await params).id, 10)
  if (!Number.isFinite(artistId)) return NextResponse.json({ ok: false, error: 'Bad id' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const photos: any[] = Array.isArray(body.photos) ? body.photos : []
  const valid = photos.filter(p => p?.url && typeof p.url === 'string' && !p.url.startsWith('data:'))
  if (valid.length === 0) return NextResponse.json({ ok: true, added: 0, skipped: 0 })

  const supabase = createAdminClient()

  // Esamos atlikėjo nuotraukos — dedup pagal url + kitą sort_order.
  const { data: existing } = await supabase
    .from('artist_photos')
    .select('url, sort_order')
    .eq('artist_id', artistId)
  const existingUrls = new Set<string>((existing || []).map((r: any) => r.url))
  let nextSort = (existing || []).reduce((mx: number, r: any) => Math.max(mx, r.sort_order ?? 0), -1) + 1

  const inserts: any[] = []
  let skipped = 0
  for (const p of valid) {
    if (existingUrls.has(p.url)) { skipped++; continue }
    existingUrls.add(p.url)
    const fromAuthor = splitAuthorLicense(typeof p.author === 'string' ? p.author : '')
    const name = fromAuthor.name
    const license = (typeof p.license === 'string' && p.license.trim()) ? p.license.trim() : fromAuthor.license
    const sourceUrl = typeof p.sourceUrl === 'string' ? p.sourceUrl : null
    const photographerId = name ? await resolvePhotographerId(supabase, name, sourceUrl) : null
    inserts.push({
      artist_id: artistId,
      url: p.url,
      caption: encodeCaption(p.author, sourceUrl),
      photographer_id: photographerId,
      license,
      source_url: sourceUrl,
      taken_at: parseTakenAt(p.takenAt),
      sort_order: nextSort++,
      // Wikimedia → iškart aktyvi profilyje (admin sąmoningai pasirinko).
      is_active: true,
    })
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from('artist_photos').insert(inserts)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, added: inserts.length, skipped })
}
