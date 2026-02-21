import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Instagram OAuth callback
// This handles the redirect after artist authorizes Instagram access
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL(`/admin/artists?error=instagram_denied`, req.url))
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL(`/admin/artists?error=invalid_callback`, req.url))
  }

  try {
    const { artistId } = JSON.parse(atob(state))

    // Exchange code for short-lived token
    const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.INSTAGRAM_CLIENT_ID!,
        client_secret: process.env.INSTAGRAM_CLIENT_SECRET!,
        grant_type: 'authorization_code',
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/instagram/callback`,
        code,
      }),
    })

    if (!tokenRes.ok) throw new Error('Token exchange failed')
    const { access_token: shortToken } = await tokenRes.json()

    // Exchange for long-lived token (60 days)
    const longRes = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${process.env.INSTAGRAM_CLIENT_SECRET}&access_token=${shortToken}`
    )

    if (!longRes.ok) throw new Error('Long-lived token failed')
    const { access_token: longToken, expires_in } = await longRes.json()

    // Get profile
    const profileRes = await fetch(
      `https://graph.instagram.com/me?fields=id,username,account_type&access_token=${longToken}`
    )

    if (!profileRes.ok) throw new Error('Profile fetch failed')
    const profile = await profileRes.json()

    // Encode connection data
    const connectionData = {
      artistId,
      platform: 'instagram',
      username: profile.username,
      accessToken: longToken,
      tokenExpiresAt: Date.now() + expires_in * 1000,
      connectedAt: Date.now(),
    }

    const encoded = btoa(JSON.stringify(connectionData))

    return NextResponse.redirect(
      new URL(`/admin/artists/${artistId}?instagram_connected=${encoded}`, req.url)
    )

  } catch (err: any) {
    console.error('Instagram callback error:', err)
    return NextResponse.redirect(
      new URL(`/admin/artists?error=instagram_failed`, req.url)
    )
  }
}
