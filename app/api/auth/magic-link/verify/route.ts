import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { encode } from 'next-auth/jwt'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  const email = searchParams.get('email')

  if (!token || !email) {
    return NextResponse.redirect(new URL('/auth/error?error=InvalidToken', req.url))
  }

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

  // Get or create profile
  let { data: profile } = await supabase
    .from('profiles')
    .select('id, role, full_name, avatar_url')
    .eq('email', email)
    .single()

  if (!profile) {
    const { data: whitelisted } = await supabase
      .from('admin_whitelist')
      .select('role')
      .eq('email', email)
      .single()
    const role = whitelisted?.role || 'user'
    const { data: newProfile } = await supabase
      .from('profiles')
      .insert({ email, role, provider: 'email' })
      .select('id, role, full_name, avatar_url')
      .single()
    profile = newProfile
  }

  if (!profile) {
    return NextResponse.redirect(new URL('/auth/error?error=ProfileError', req.url))
  }

  const secret = process.env.NEXTAUTH_SECRET || 'kjcxLaUePrIgs0SM6C6yen/Whkp87MDKywsUjmrBPYE='

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

  const response = NextResponse.redirect(new URL('/', req.url))
  response.cookies.set(cookieName, sessionToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  })

  return response
}
