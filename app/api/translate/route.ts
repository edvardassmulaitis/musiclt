import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  // Reikalauja prisijungimo — sustabdo anoniminį AI sąskaitos eikvojimą.
  const session = await getServerSession(authOptions)
  if (!(session?.user as any)?.id) {
    return NextResponse.json({ translated: '', error: 'UNAUTHORIZED' }, { status: 401 })
  }
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    return NextResponse.json({ translated: '', error: 'NO_API_KEY' }, { status: 503 })
  }

  let text = ''
  try {
    const body = await req.json()
    text = body.text || ''
  } catch (e) {
    return NextResponse.json({ translated: '', error: 'INVALID_JSON' }, { status: 400 })
  }

  if (!text.trim()) {
    return NextResponse.json({ translated: '' })
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Translate to Lithuanian. Return ONLY the translation:\n\n${text.substring(0, 700)}`
        }]
      })
    })

    const responseText = await res.text()

    if (!res.ok) {
      return NextResponse.json({
        translated: '',
        error: `HTTP_${res.status}`,
        detail: responseText.substring(0, 200)
      }, { status: 500 })
    }

    const data = JSON.parse(responseText)
    const translated = data.content?.[0]?.text?.trim() || ''
    return NextResponse.json({ translated })

  } catch (e: any) {
    return NextResponse.json({
      translated: '',
      error: 'FETCH_ERROR',
      detail: e.message
    }, { status: 500 })
  }
}

// GET testinis kvietimas — tik prisijungusiems (kad nebūtų anon AI cost).
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!(session?.user as any)?.id) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ ok: false, error: 'NO_KEY' })

  // Test call
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 50,
        messages: [{ role: 'user', content: 'Say "OK" in one word' }]
      })
    })
    const txt = await res.text()
    return NextResponse.json({ ok: res.ok, status: res.status, response: txt.substring(0, 200) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message })
  }
}
