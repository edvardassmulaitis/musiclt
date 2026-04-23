import { NextRequest, NextResponse } from 'next/server'
import { getAlbumById, updateAlbum, deleteAlbum } from '@/lib/supabase-albums'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

// Next.js 15 by default cache'ina GET responses. Admin UI reikia live data,
// nes tracks/albums gali keistis tuo pačiu metu — force dynamic.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const album = await getAlbumById(parseInt(id))
    return NextResponse.json(album)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin','super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const data = await req.json()
    await updateAlbum(parseInt(id), data)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin','super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { searchParams } = new URL(req.url)
    const deleteTracks = searchParams.get('deleteTracks') === 'true'

    if (deleteTracks) {
      const supabase = createAdminClient()

      // Surasti visas albumo dainas prieš trinant albumą
      const { data: albumTracks } = await supabase
        .from('album_tracks')
        .select('track_id')
        .eq('album_id', parseInt(id))

      const trackIds = (albumTracks || []).map((r: any) => r.track_id).filter(Boolean)

      // Ištrinti albumą (kaskadiškai pašalins album_tracks įrašus)
      await deleteAlbum(parseInt(id))

      // Ištrinti dainas — tik tas kurios neturi kitų albumų
      if (trackIds.length > 0) {
        const { data: otherLinks } = await supabase
          .from('album_tracks')
          .select('track_id')
          .in('track_id', trackIds)

        const linkedToOther = new Set((otherLinks || []).map((r: any) => r.track_id))
        const toDelete = trackIds.filter((tid: number) => !linkedToOther.has(tid))

        if (toDelete.length > 0) {
          await supabase.from('tracks').delete().in('id', toDelete)
        }
      }
    } else {
      // Trinti tik albumą, dainos lieka
      await deleteAlbum(parseInt(id))
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
