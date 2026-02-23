import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase'
import { randomBytes } from 'crypto'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Generate token
    const token = randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h

    // Save to verification_tokens table
    await supabase.from('verification_tokens').upsert({
      identifier: email,
      token,
      expires: expires.toISOString(),
    })

    const url = `${process.env.NEXTAUTH_URL}/api/auth/magic-link/verify?token=${token}&email=${encodeURIComponent(email)}`

    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
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

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Magic link error:', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
