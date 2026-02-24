import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const trackId = searchParams.get('track_id')
  const albumId = searchParams.get('album_id')

  if (!trackId || !albumId) {
    return NextResponse.json({ error: 'track_id and album_id required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('album_tracks')
    .delete()
    .eq('track_id', parseInt(trackId))
    .eq('album_id', parseInt(albumId))

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
