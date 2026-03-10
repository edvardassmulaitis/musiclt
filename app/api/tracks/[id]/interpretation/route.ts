// app/api/tracks/[id]/ai-interpretation/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('tracks')
    .select('ai_interpretation, ai_image_url')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()

  // Load track data
  const { data: track, error: trackError } = await supabase
    .from('tracks')
    .select('id, title, lyrics, artist_id')
    .eq('id', id)
    .single()

  if (trackError || !track) return NextResponse.json({ error: 'Track not found' }, { status: 404 })
  if (!track.lyrics) return NextResponse.json({ error: 'No lyrics' }, { status: 400 })

  // Load artist name
  const { data: artist } = await supabase
    .from('artists')
    .select('name')
    .eq('id', track.artist_id)
    .single()

  const artistName = artist?.name ?? 'Nežinomas'

  // Generate with Claude
  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    system: `Tu esi muzikos kritikas ir lyrikų interpretatorius. Atsakyk TIKTAI lietuviškai. Būk įžvalgus, nuoširdus, poetiškas — ne akademiškas. Neminėk dainos pavadinimo ar atlikėjo pirmame sakinyje. Atsakyk TIKTAI JSON formatu be jokio kito teksto: { "interpretation": "2-3 paragrafai atskirti \\n\\n", "image_prompt": "abstract art 10-15 words in English capturing emotional essence, no people, no text" }`,
    messages: [{
      role: 'user',
      content: `Daina: "${track.title}" — ${artistName}\n\nŽodžiai:\n${track.lyrics}\n\nSugeneruok interpretaciją ir image prompt.`,
    }],
  })

  const raw = message.content.find(b => b.type === 'text')?.text ?? ''
  const clean = raw.replace(/```json|```/g, '').trim()

  let interpretation = ''
  let imageUrl = ''

  try {
    const parsed = JSON.parse(clean)
    interpretation = parsed.interpretation ?? raw
    if (parsed.image_prompt) {
      const prompt = encodeURIComponent(parsed.image_prompt + ', cinematic lighting, no text')
      imageUrl = `https://image.pollinations.ai/prompt/${prompt}?width=800&height=380&nologo=true&seed=${track.id}`
    }
  } catch {
    interpretation = raw
  }

  // Save to DB
  const { error: updateError } = await supabase
    .from('tracks')
    .update({ ai_interpretation: interpretation, ai_image_url: imageUrl })
    .eq('id', id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ interpretation, image_url: imageUrl }, { status: 201 })
}
