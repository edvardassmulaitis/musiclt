import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { encode } from 'next-auth/jwt'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  const rawEmail = searchParams.get('email')

  if (!token || !rawEmail) {
    return NextResponse.redirect(new URL('/auth/error?error=InvalidToken', req.url))
  }

  // Normalizuojam — token'as išsaugotas lowercase'intas (magic-link route).
  const email = rawEmail.trim().toLowerCase()

  const supabase = createAdminClient()

  const { data: record } = await supabase
    .from('verification_tokens')
    .select()
    .eq('identifier', email)
    .eq('token', token)
    .single()

  if (!record) {
    return NextResponse.redirect(new URL('/auth/error?error=InvalidToken', req.url))
  }

  if (new Date(record.expires) < new Date()) {
    await supabase.from('verification_tokens').delete().eq('token', token)
    return NextResponse.redirect(new URL('/auth/error?error=ExpiredToken', req.url))
  }

  await supabase.from('verification_tokens').delete().eq('token', token)

  // Get or create profile — CASE-INSENSITIVE (kitur sistema naudoja ilike;
  // .eq() trūkdavo match'o ir kurdavo dublikatą, žr. 2026-05-02 incidentą).
  let { data: profile } = await supabase
    .from('profiles')
    .select('id, role, full_name, avatar_url, is_claimed, provider')
    .ilike('email', email)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!profile) {
    const { data: whitelisted } = await supabase
      .from('admin_whitelist')
      .select('role')
      .ilike('email', email)
      .limit(1)
      .maybeSingle()
    const role = whitelisted?.role || 'user'
    const { data: newProfile } = await supabase
      .from('profiles')
      .insert({ email, role, provider: 'email' })
      .select('id, role, full_name, avatar_url, is_claimed, provider')
      .single()
    profile = newProfile
  }

  if (!profile) {
    return NextResponse.redirect(new URL('/auth/error?error=ProfileError', req.url))
  }

  // Legacy profilio perėmimas — jei prisijungiama prie seno legacy_forum
  // profilio (admin priskyrė realų el. paštą), pažymim perimtą + provider.
  if (profile.is_claimed !== true && profile.provider === 'legacy_forum') {
    try {
      await supabase.from('profiles').update({ is_claimed: true, provider: 'email' }).eq('id', profile.id)
    } catch (e: any) {
      console.error('[legacy-claim/email] non-fatal:', e?.message || e)
    }
  }

  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const sessionToken = await encode({
    token: {
      id: profile.id,
      email,
      name: profile.full_name || email.split('@')[0],
      picture: profile.avatar_url,
      role: profile.role,
      sub: profile.id,
    },
    secret,
  })

  const isProduction = process.env.NODE_ENV === 'production'
  // Production uses __Secure- prefix, development does not
  const cookieName = isProduction
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token'

  const response = NextResponse.redirect(new URL('/sveiki', req.url))
  response.cookies.set(cookieName, sessionToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  })

  return response
}
