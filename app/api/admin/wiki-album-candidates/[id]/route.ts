/**
 * Admin veiksmai per vieną wiki album candidate'ą (punktas B).
 *
 * PATCH { action: 'approve', album_wiki_link?: string } — admin'as gali
 *   patvirtinti RANKA suradęs Wikipedia albumo nuorodą, jei scout'as dar
 *   nerescanino ir pats jos neaptiko (nelaukiant kito automatinio paleidimo).
 *   Jei album_wiki_link nepaduotas, naudojam jau saugomą (jei yra).
 * PATCH { action: 'reject', reason?: string } — status='rejected' (terminalu,
 *   scout'as šito fingerprint'o daugiau nebeliečia — žr. run/route.ts).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { commitAlbum } from '@/lib/quick-add'

export const runtime = 'nodejs'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['editor', 'admin', 'super_admin'].includes((session.user.role as string) || '')) return null
  return session
}

function albumWikiUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const candidateId = parseInt(id, 10)
  if (Number.isNaN(candidateId)) return NextResponse.json({ error: 'Bad ID' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const action = body.action as string | undefined
  const supabase = createAdminClient()

  const { data: cand, error: loadErr } = await supabase
    .from('wiki_album_candidates')
    .select('*')
    .eq('id', candidateId)
    .single()
  if (loadErr || !cand) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
  if (cand.status !== 'pending') return NextResponse.json({ error: `Already ${cand.status}` }, { status: 409 })

  if (action === 'reject') {
    const { error } = await supabase
      .from('wiki_album_candidates')
      .update({
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
        reject_reason: (body.reason || '').slice(0, 500),
      })
      .eq('id', candidateId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, status: 'rejected' })
  }

  if (action === 'approve') {
    const link = (typeof body.album_wiki_link === 'string' && body.album_wiki_link.trim()) || cand.album_wiki_link
    if (!link) return NextResponse.json({ error: 'Trūksta album_wiki_link — Wikipedia straipsnis dar neatsirado' }, { status: 400 })
    if (!cand.matched_artist_id) return NextResponse.json({ error: 'Nėra pririšto atlikėjo — negalima auto-commit\'inti' }, { status: 400 })

    const origin = req.nextUrl.origin
    try {
      const result = await commitAlbum(albumWikiUrl(link), origin, { artist_id: cand.matched_artist_id })
      if (!result.ok || result.kind !== 'album') {
        return NextResponse.json({ error: `Publish failed: ${!result.ok ? result.error : 'nežinoma klaida'}` }, { status: 500 })
      }
      await supabase
        .from('wiki_album_candidates')
        .update({
          status: 'approved',
          album_wiki_link: link,
          reviewed_at: new Date().toISOString(),
          published_album_id: result.album.id,
        })
        .eq('id', candidateId)
      return NextResponse.json({ ok: true, status: 'approved', album_id: result.album.id, warnings: result.warnings })
    } catch (e: any) {
      return NextResponse.json({ error: `Publish failed: ${e.message}` }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
