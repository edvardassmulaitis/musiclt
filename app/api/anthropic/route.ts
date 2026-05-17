// Thin proxy į Anthropic messages API. Naudojama admin UI komponentų,
// kurie nori paprasto LLM call'o (ArtistForm „Generuoti aprašymą",
// pan.) be būtinybės eksponuoti API key'ą client'e.
//
// Body: { model, max_tokens, messages }
// Response: tas pats šešėlinis JSON, kurį Anthropic grąžina
//
// Autorizuojama tik admin/super_admin role'iams — kad nepiktnaudžiautų
// įprasti vartotojai mūsų API key.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      console.error('[/api/anthropic] ANTHROPIC_API_KEY not set')
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })

    const data = await res.json()
    if (!res.ok) {
      console.error('[/api/anthropic] Anthropic error:', res.status, JSON.stringify(data).slice(0, 500))
      return NextResponse.json(data, { status: res.status })
    }
    return NextResponse.json(data)
  } catch (e: any) {
    console.error('[/api/anthropic] exception:', e?.message)
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 })
  }
}
