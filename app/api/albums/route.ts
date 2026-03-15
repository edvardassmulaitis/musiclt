import { NextRequest, NextResponse } from 'next/server'
import { getAlbums, createAlbum } from '@/lib/supabase-albums'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const artistId = searchParams.get('artist_id')
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')
  const search = searchParams.get('search') || ''

  // ── Dublikatų tikrinimas: ?check_titles=[...]&artist_id=123 ────────────────
  const checkTitles = searchParams.get('check_titles')
  if (checkTitles && artistId) {
    try {
      const titles: string[] = JSON.parse(checkTitles)
      const supabase = createAdminClient()
      const { data } = await supabase
        .from('albums')
        .select('id, title')
        .eq('artist_id', parseInt(artistId))
        .in('title', titles)
      const found: Record<string, number> = {}
      for (const row of data || []) found[row.title.toLowerCase()] = row.id
      return NextResponse.json({ found })
    } catch {
      return NextResponse.json({ found: {} })
    }
  }

  try {
    const result = await getAlbums(artistId ? parseInt(artistId) : undefined, limit, offset, search)
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const data = await req.json()
    const id = await createAlbum(data)
    return NextResponse.json({ id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
