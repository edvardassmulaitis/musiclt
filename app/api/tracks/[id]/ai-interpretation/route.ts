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
      system: `Tu esi muzikos kritikas. Atsakyk TIKTAI lietuviškai. Būk įžvalgus ir poetiškas.

LABAI SVARBU: Atsakyk TIKTAI šiuo formatu be jokio papildomo teksto, be backtick'ų, be JSON etikečių:
INTERPRETACIJA: [2-3 paragrafai atskirti dviem eilutės pertraukomis]
IMAGE: [10-15 žodžių angliškai abstrakti nuotaika, be žmonių, be teksto]`,
      messages: [{
        role: 'user',
        content: `Daina: "${track.title}" — ${artistName}\n\nŽodžiai:\n${track.lyrics}`,
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

  let interpretation = ''
  let imagePrompt = ''

  // Parse new plain format: INTERPRETACIJA: ... \nIMAGE: ...
  const interpMatch = raw.match(/INTERPRETACIJA:\s*([\s\S]*?)(?:\nIMAGE:|$)/i)
  const imageMatch = raw.match(/IMAGE:\s*(.+)/i)

  if (interpMatch) {
    interpretation = interpMatch[1].trim().replace(/[—–]/g, '-')
  } else {
    // Fallback: strip any JSON artifacts
    interpretation = raw
      .replace(/```[\s\S]*?```/g, '')
      .replace(/\{[\s\S]*?"image_prompt"[\s\S]*?\}/g, '')
      .replace(/\{[\s\S]*?"interpretation"[\s\S]*?\}/g, '')
      .replace(/"interpretation"\s*:\s*"?/g, '')
      .replace(/[—–]/g, '-')
      .trim()
  }

  if (imageMatch) {
    imagePrompt = imageMatch[1].trim().replace(/"/g, '')
  }

  let imageUrl = ''
  if (imagePrompt) {
    const encoded = encodeURIComponent(imagePrompt + ', cinematic mood, abstract, no text, no faces')
    imageUrl = `https://image.pollinations.ai/prompt/${encoded}?width=800&height=400&nologo=true&seed=${track.id}`
  }

  // Save to DB
  await supabase
    .from('tracks')
    .update({ ai_interpretation: interpretation, ai_image_url: imageUrl })
    .eq('id', id)

  return NextResponse.json({ interpretation, image_url: imageUrl }, { status: 201 })
}
