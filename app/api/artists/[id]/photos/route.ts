import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function encodeCaption(p: any): string | null {
  const a = p.author || ''
  const s = p.sourceUrl || ''
  if (!a && !s) return p.caption || null
  return JSON.stringify({ a, s })
}

// PUT /api/artists/[id]/photos — replace all photos for artist
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const artistId = parseInt(id)
  if (isNaN(artistId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const { photos } = await req.json()
  if (!Array.isArray(photos)) return NextResponse.json({ error: 'photos must be array' }, { status: 400 })

  const validPhotos = photos.filter((p: any) => p?.url && typeof p.url === 'string' && !p.url.startsWith('data:'))

  const { error: delError } = await supabase.from('artist_photos').delete().eq('artist_id', artistId)
  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })

  if (validPhotos.length > 0) {
    const { error: insError } = await supabase.from('artist_photos').insert(
      validPhotos.map((p: any, i: number) => ({
        artist_id: artistId,
        url: p.url,
        caption: encodeCaption(p),
        sort_order: i,
      }))
    )
    if (insError) return NextResponse.json({ error: insError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, saved: validPhotos.length })
}
