// GET /api/studija/unsubscribe?a=<artistId>&u=<profileId>&s=<sig>
// Vienu paspaudimu atsisako atlikėjo el. laiškų (email_consent=false).
// Parašas HMAC — be prisijungimo, be DB tokenų.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { unsubscribeSig } from '@/lib/email'

function html(msg: string): string {
  return `<!doctype html><html lang="lt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>music.lt</title></head>
  <body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0d1320;color:#f0f4fc;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;">
    <div style="text-align:center;padding:40px;">
      <h1 style="font-weight:900;">music<span style="color:#f97316">.lt</span></h1>
      <p style="color:#9cb5d0;max-width:360px;">${msg}</p>
      <a href="/" style="color:#5a8ec8;">Į pagrindinį</a>
    </div>
  </body></html>`
}

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const artistId = Number(sp.get('a'))
  const profileId = sp.get('u') || ''
  const sig = sp.get('s') || ''

  if (!Number.isFinite(artistId) || !profileId || !sig || sig !== unsubscribeSig(artistId, profileId)) {
    return new NextResponse(html('Nuoroda netinkama arba pasibaigusi.'), { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }
  try {
    const sb = createAdminClient()
    await sb.from('artist_follows').update({ email_consent: false })
      .eq('artist_id', artistId).eq('user_id', profileId)
  } catch { /* tylim */ }
  return new NextResponse(html('Atsisakei šio atlikėjo el. laiškų. Pranešimus svetainėje vis tiek matysi, jei toliau seki.'), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
