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
    .select('id, selection_start, selection_end, selected_text, type, text, likes, created_at')
    .eq('track_id', id)
    .order('created_at', { ascending: true })

  // Always return array — never 500 (client must always get usable data)
  if (error) {
    console.error('[lyric-comments GET]', error.message)
    return NextResponse.json([])
  }
  return NextResponse.json(data ?? [])
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }

  const { selected_text, selection_start, selection_end, type, text } = body as Record<string, unknown>

  if (!selected_text || selection_start === undefined || selection_end === undefined) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('track_lyric_comments')
    .insert({
      track_id: Number(id),
      selected_text: String(selected_text),
      selection_start: Number(selection_start),
      selection_end: Number(selection_end),
      type: String(type ?? 'like'),
      text: String(text ?? ''),
      likes: 0,
    })
    .select('id, selection_start, selection_end, selected_text, type, text, likes, created_at')
    .single()

  if (error) {
    console.error('[lyric-comments POST]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
