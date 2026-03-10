// app/api/tracks/[id]/ai-interpretation/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

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

  // Load track + artist
  const { data: track, error: trackError } = await supabase
    .from('tracks')
    .select('id, title, lyrics, artist_id')
    .eq('id', id)
    .single()

  if (trackError || !track) return NextResponse.json({ error: 'Track not found' }, { status: 404 })
  if (!track.lyrics) return NextResponse.json({ error: 'No lyrics' }, { status: 400 })

  const { data: artist } = await supabase
    .from('artists')
    .select('name')
    .eq('id', track.artist_id)
    .single()

  const artistName = artist?.name ?? 'Nežinomas'

  // Call Anthropic API with plain fetch (no SDK needed)
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Missing API key' }, { status: 500 })

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      system: `Tu esi muzikos kritikas ir lyrikų interpretatorius. Atsakyk TIKTAI lietuviškai. Būk įžvalgus, nuoširdus, poetiškas — ne akademiškas. Neminėk dainos pavadinimo ar atlikėjo pirmame sakinyje. Atsakyk TIKTAI JSON formatu be jokio kito teksto: { "interpretation": "2-3 paragrafai atskirti \\n\\n", "image_prompt": "abstract art 10-15 words in English capturing emotional essence, no people, no text" }`,
      messages: [{
        role: 'user',
        content: `Daina: "${track.title}" — ${artistName}\n\nŽodžiai:\n${track.lyrics}\n\nSugeneruok interpretaciją ir image prompt.`,
      }],
    }),
  })

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text()
    console.error('Anthropic error:', err)
    return NextResponse.json({ error: 'Anthropic API failed', detail: err }, { status: 500 })
  }

  const anthropicData = await anthropicRes.json()
  const raw = anthropicData.content?.find((b: any) => b.type === 'text')?.text ?? ''
  // More robust JSON extraction — handle backticks, extra whitespace, etc.
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  const clean = jsonMatch ? jsonMatch[0] : raw

  let interpretation = ''
  let imageUrl = ''

  try {
    const parsed = JSON.parse(clean)
    // Clean up escaped \n\n into real newlines
    interpretation = (parsed.interpretation ?? raw).replace(/\\n/g, '\n')
    if (parsed.image_prompt) {
      const prompt = encodeURIComponent(parsed.image_prompt.replace(/"/g, '') + ', cinematic lighting, no text, no people')
      imageUrl = `https://image.pollinations.ai/prompt/${prompt}?width=800&height=380&nologo=true&seed=${track.id}`
    }
  } catch {
    // If JSON parse fails, use raw text as interpretation
    interpretation = raw.replace(/```json|```|\{|\}/g, '').trim()
  }

  // Save to DB
  await supabase
    .from('tracks')
    .update({ ai_interpretation: interpretation, ai_image_url: imageUrl })
    .eq('id', id)

  return NextResponse.json({ interpretation, image_url: imageUrl }, { status: 201 })
}
