import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// PUT /api/artists/[id]/avatar — update cover_image_url only
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const artistId = parseInt(id)
  if (isNaN(artistId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const { url } = await req.json()
  if (!url || typeof url !== 'string') return NextResponse.json({ error: 'url required' }, { status: 400 })

  const { error } = await supabase
    .from('artists')
    .update({ cover_image_url: url, updated_at: new Date().toISOString() })
    .eq('id', artistId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
