import { NextRequest, NextResponse } from 'next/server'
import { getAlbumById, updateAlbum, deleteAlbum } from '@/lib/supabase-albums'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

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

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin','super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    await deleteAlbum(parseInt(id))
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
