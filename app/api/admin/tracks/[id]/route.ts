/**
 * PATCH /api/admin/tracks/[id]
 *
 * Greitas dainos pavadinimo pataisymas iš news Muzikos žingsnio „Sistemoje jau
 * esančios dainos" sąrašo. YouTube pavadinimo auto-valymas (quick-add) dažniausiai
 * pataiko, bet kartais palieka triukšmą (feat. blokus, „Official Video" ir pan.).
 * Šitas endpoint'as leidžia adminui vietoje pataisyti `title` (be viso quick-add
 * flow'o). Kol kas palaikom tik `title` lauką.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export const runtime = 'nodejs'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user.role as string) || '')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const trackId = parseInt((await params).id, 10)
  if (!Number.isFinite(trackId)) return NextResponse.json({ ok: false, error: 'Bad id' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return NextResponse.json({ ok: false, error: 'Tuščias pavadinimas' }, { status: 400 })
  if (title.length > 200) return NextResponse.json({ ok: false, error: 'Per ilgas pavadinimas' }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('tracks')
    .update({ title })
    .eq('id', trackId)
    .select('id, title')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, track: data })
}
