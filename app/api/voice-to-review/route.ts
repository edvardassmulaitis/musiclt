// app/api/voice-to-review/route.ts
//
// Savarankiškas balso įvesties endpointas recenzijoms / renginių apžvalgoms.
// Viename kvietime: transkripcija (Groq Whisper) + sutvarkymas (Claude).
// SĄMONINGAI atskirtas nuo dainų tekstų (lyrics) pipeline — skirtingas
// kontekstas, neturi dalintis logika.
//
// Auth: reikalauja prisijungimo. Grąžina { text, raw } arba { error } su LT
// žinute. Transkripcija ~1s, sutvarkymas keli s — maxDuration 30 su atsarga.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { transcribeAudio, VoiceError } from '@/lib/voice-transcribe'
import { cleanupTranscript } from '@/lib/voice-cleanup'

export const runtime = 'nodejs'
export const maxDuration = 30

// Vercel serverless body limit ~4.5MB — paliekam atsargą.
const MAX_BYTES = Math.floor(4.3 * 1024 * 1024)
const MIN_BYTES = 2000 // < ~2KB praktiškai tuščias įrašas

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json(
      { error: 'Prisijunk, kad galėtum naudoti balso įvestį' },
      { status: 401 },
    )
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Netinkama užklausa' }, { status: 400 })
  }

  const file = form.get('audio')
  const context = (form.get('context') as string) || ''

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'Nėra audio įrašo' }, { status: 400 })
  }
  const audio = file as File

  if (audio.size < MIN_BYTES) {
    return NextResponse.json({ error: 'Įrašas per trumpas' }, { status: 400 })
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'Įrašas per didelis. Pabandyk trumpesnį (iki ~5 min).' },
      { status: 413 },
    )
  }

  try {
    const raw = await transcribeAudio(audio, { context })
    if (!raw.trim()) {
      return NextResponse.json(
        { error: 'Nepavyko nieko atpažinti. Pabandyk dar kartą.' },
        { status: 422 },
      )
    }

    // cleanupTranscript niekada nemeta — blogiausiu atveju grąžina žalią tekstą.
    const text = await cleanupTranscript(raw)
    return NextResponse.json({ text, raw })
  } catch (e: any) {
    if (e instanceof VoiceError) {
      const msg =
        e.code === 'NO_GROQ_KEY'
          ? 'Balso įvestis dar nesukonfigūruota serveryje.'
          : 'Nepavyko transkribuoti įrašo. Pabandyk dar kartą.'
      return NextResponse.json({ error: msg, code: e.code }, { status: 502 })
    }
    return NextResponse.json(
      { error: 'Nenumatyta klaida. Pabandyk dar kartą.', detail: e?.message },
      { status: 500 },
    )
  }
}
