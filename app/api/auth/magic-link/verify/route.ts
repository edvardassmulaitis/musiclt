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

  // Check token
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

  // Delete used token
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

  // Create JWT session token
  const sessionToken = await encode({
    token: {
      id: profile.id,
      email,
      name: profile.full_name || email.split('@')[0],
      picture: profile.avatar_url,
      role: profile.role,
      sub: profile.id,
    },
    secret: process.env.NEXTAUTH_SECRET || 'kjcxLaUePrIgs0SM6C6yen/Whkp87MDKywsUjmrBPYE=',
  })

  // Set cookie and redirect
  const response = NextResponse.redirect(new URL('/', req.url))
  response.cookies.set('next-auth.session-token', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  })

  return response
}
