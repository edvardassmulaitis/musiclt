import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'
import { randomBytes } from 'crypto'
import { rateLimit, clientIp } from '@/lib/rate-limit'

const BASE = process.env.NEXTAUTH_URL || 'https://musiclt.vercel.app'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    // Durable rate limit (bendras store): 3/email/val + 8/IP/val + 1/email/30s.
    // Sustabdo email-bomb ir spam-relay per Resend (in-memory Map neveikė serverless).
    const ip = clientIp(req)
    const [okEmailBurst, okEmailHour, okIpHour] = await Promise.all([
      rateLimit(`ml:e30:${email}`, 1, 30),
      rateLimit(`ml:eh:${email}`, 3, 3600),
      rateLimit(`ml:ip:${ip}`, 8, 3600),
    ])
    if (!okEmailBurst) {
      return NextResponse.json({ error: 'Per dažnai — palaukite kelias sekundes.' }, { status: 429 })
    }
    if (!okEmailHour || !okIpHour) {
      return NextResponse.json({ error: 'Per daug bandymų. Pabandykite vėliau.' }, { status: 429 })
    }

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
      subject: 'Jūsų prisijungimo nuoroda — music.lt',
      html: `
        <div style="background:#f4f5f7;margin:0;padding:32px 12px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
            <div style="background-color:#f4f7fc;background:linear-gradient(135deg,#eef3fb 0%,#fdf2ea 100%);padding:28px 40px 22px;text-align:center;border-bottom:1px solid #eef0f3;">
              <img src="https://musiclt.vercel.app/email-logo.png" width="44" height="44" alt="music.lt" style="display:inline-block;vertical-align:middle;border:0;" />
              <span style="display:inline-block;vertical-align:middle;margin-left:11px;font-size:28px;font-weight:800;letter-spacing:-0.5px;"><span style="color:#1a73e8;">music</span><span style="color:#f97316;">.lt</span></span>
              <div style="color:#8a93a3;font-size:14px;margin-top:10px;">Lietuviškos muzikos bendruomenė</div>
            </div>
            <div style="padding:36px 40px;text-align:center;">
              <h1 style="font-size:20px;font-weight:700;color:#1a1a1a;margin:0 0 12px;">Prisijunkite prie music.lt</h1>
              <p style="color:#5f6368;font-size:16px;line-height:1.6;margin:0 0 28px;">
                Sveiki! Paspauskite mygtuką žemiau ir iškart prisijungsite — slaptažodžio nereikia.
              </p>
              <a href="${url}" style="display:inline-block;background-color:#f97316;background:linear-gradient(135deg,#1a73e8,#f97316);color:#ffffff;font-weight:700;padding:16px 44px;border-radius:12px;text-decoration:none;font-size:16px;">
                Prisijungti
              </a>
              <p style="color:#9aa0a6;font-size:14px;margin:28px 0 0;">
                Nuoroda galioja <strong style="color:#5f6368;">24 valandas</strong>.
              </p>
            </div>
            <div style="padding:20px 40px 30px;border-top:1px solid #eef0f3;text-align:center;">
              <p style="color:#9aa0a6;font-size:12px;line-height:1.6;margin:0;">
                Jei šios nuorodos neprašėte, tiesiog nepaisykite šio laiško — į jūsų paskyrą niekas neprisijungs.
              </p>
              <p style="color:#c3c7cc;font-size:12px;margin:12px 0 0;">
                © music.lt · Didžiausias lietuviškos muzikos portalas
              </p>
            </div>
          </div>
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
