import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'
import { randomBytes } from 'crypto'

const BASE = process.env.NEXTAUTH_URL || 'https://musiclt.vercel.app'

// Best-effort rate-limit (per serverless instance) — apsauga nuo spam relay.
const lastSent = new Map<string, number>()
const COOLDOWN_MS = 30_000

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    const now = Date.now()
    const prev = lastSent.get(email)
    if (prev && now - prev < COOLDOWN_MS) {
      return NextResponse.json({ error: 'Per dažnai — palaukite kelias sekundes.' }, { status: 429 })
    }
    lastSent.set(email, now)

    const supabase = createAdminClient()

    // Generate token
    const token = randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h

    // Save to verification_tokens table (identifier saugomas lowercase'intas)
    await supabase.from('verification_tokens').upsert({
      identifier: email,
      token,
      expires: expires.toISOString(),
    })

    const url = `${BASE}/api/auth/magic-link/verify?token=${token}&email=${encodeURIComponent(email)}`

    const sendRes = await sendEmail({
      to: email,
      subject: 'Prisijungimas prie music.lt',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 20px;">
          <h1 style="font-size:28px;font-weight:900;margin-bottom:4px;">
            <span style="color:#1a73e8">music</span><span style="color:#f97316">.lt</span>
          </h1>
          <p style="color:#666;margin-bottom:32px;">Didziausia lietuviskos muzikos portalas</p>
          <h2 style="font-size:20px;margin-bottom:8px;">Prisijungimo nuoroda</h2>
          <p style="color:#444;margin-bottom:24px;">Spauskite mygtuka zemiau noredami prisijungti. Nuoroda galioja 24 valandas.</p>
          <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#1a73e8,#f97316);color:white;font-weight:700;padding:14px 32px;border-radius:12px;text-decoration:none;font-size:16px;">
            Prisijungti prie music.lt
          </a>
          <p style="color:#999;font-size:12px;margin-top:32px;">
            Jei neregistravotes music.lt, ignoruokite si laiska.
          </p>
        </div>
      `,
    })

    if (!sendRes.ok) {
      console.error('Magic link send failed:', sendRes.error)
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Magic link error:', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
