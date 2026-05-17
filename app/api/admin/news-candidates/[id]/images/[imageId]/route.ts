/**
 * PATCH /api/admin/news-candidates/{id}/images/{imageId}
 *
 * Admin'as gali edit'inti foto metadata prieš approve:
 *   - caption (admin override; default = caption_exif)
 *   - photographer_override (default = photographer iš EXIF)
 *   - copyright_override (default = copyright iš EXIF)
 *   - year_override (default = year_taken iš EXIF)
 *   - sort_order (jei nori pakeisti tvarką)
 *
 * EXIF-extracted reikšmės nepaliečiamos — overrides naudojami approve metu kaip
 * preferred reikšmė. Jei override NULL/empty — naudojama EXIF reikšmė.
 *
 * DELETE /api/admin/news-candidates/{id}/images/{imageId}
 *
 * Admin'as gali ištrint nereikalingą foto prieš approve. Trinama ir storage failas.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export const runtime = 'nodejs'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user.role as string) || '')) return null
  return session
}

function cleanText(v: any, max = 300): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s.slice(0, max) : null
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> },
) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, imageId } = await params
  const candidateId = parseInt(id, 10)
  const imgId = parseInt(imageId, 10)
  if (Number.isNaN(candidateId) || Number.isNaN(imgId)) {
    return NextResponse.json({ error: 'Bad ID' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const supabase = createAdminClient()

  const patch: any = {}
  if ('caption' in body) patch.caption = cleanText(body.caption, 500)
  if ('photographer_override' in body) patch.photographer_override = cleanText(body.photographer_override)
  if ('copyright_override' in body) patch.copyright_override = cleanText(body.copyright_override)
  if ('year_override' in body) {
    const y = typeof body.year_override === 'number' ? body.year_override : null
    patch.year_override = (y && y >= 1900 && y <= 2100) ? y : null
  }
  if ('sort_order' in body) {
    const n = typeof body.sort_order === 'number' ? body.sort_order : null
    if (n !== null && n >= 0 && n <= 99) patch.sort_order = n
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('news_candidate_images')
    .update(patch)
    .eq('id', imgId)
    .eq('candidate_id', candidateId)
    .select('id, caption, photographer_override, copyright_override, year_override, sort_order')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, image: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> },
) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, imageId } = await params
  const candidateId = parseInt(id, 10)
  const imgId = parseInt(imageId, 10)
  if (Number.isNaN(candidateId) || Number.isNaN(imgId)) {
    return NextResponse.json({ error: 'Bad ID' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Gauk storage path'ą kad trintume Storage failą atskirai
  const { data: row } = await supabase
    .from('news_candidate_images')
    .select('storage_path')
    .eq('id', imgId)
    .eq('candidate_id', candidateId)
    .maybeSingle()

  const { error: delErr } = await supabase
    .from('news_candidate_images')
    .delete()
    .eq('id', imgId)
    .eq('candidate_id', candidateId)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  if (row?.storage_path) {
    const { error: stErr } = await supabase.storage
      .from('news-attachments')
      .remove([row.storage_path])
    if (stErr) console.warn('[image delete] storage cleanup failed:', stErr.message)
  }

  return NextResponse.json({ ok: true })
}
