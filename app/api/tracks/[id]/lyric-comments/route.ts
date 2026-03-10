// app/api/tracks/[id]/lyric-comments/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('track_lyric_comments')
    .select('*')
    .eq('track_id', id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()

  const { selected_text, selection_start, selection_end, type, text } = body

  if (!selected_text || selection_start === undefined || selection_end === undefined) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('track_lyric_comments')
    .insert({
      track_id: Number(id),
      selected_text,
      selection_start,
      selection_end,
      type: type ?? 'like',
      text: text ?? '',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
