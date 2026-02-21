/**
 * Instagram Basic Display API Integration
 * Allows Lithuanian artists to connect their Instagram accounts
 * and display their latest posts on music.lt
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type InstagramMedia = {
  id: string
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'
  media_url: string
  permalink: string
  caption?: string
  timestamp: string
  thumbnail_url?: string // for videos
}

export type InstagramAccount = {
  id: string
  username: string
  account_type: string
}

export type ArtistSocialConnection = {
  artistId: string
  artistName: string
  platform: 'instagram' | 'facebook' | 'twitter' | 'tiktok'
  username: string
  accessToken: string
  refreshToken?: string
  tokenExpiresAt: number
  connectedAt: number
  lastSyncedAt?: number
}

// ─── Instagram OAuth Flow ─────────────────────────────────────────────────────

/**
 * Step 1: Generate Instagram authorization URL
 * Artist clicks "Connect Instagram" → redirects to this URL
 */
export function getInstagramAuthUrl(artistId: string): string {
  const clientId = process.env.NEXT_PUBLIC_INSTAGRAM_CLIENT_ID
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/instagram/callback`
  const state = btoa(JSON.stringify({ artistId, timestamp: Date.now() }))
  
  const params = new URLSearchParams({
    client_id: clientId!,
    redirect_uri: redirectUri,
    scope: 'user_profile,user_media',
    response_type: 'code',
    state,
  })

  return `https://api.instagram.com/oauth/authorize?${params.toString()}`
}

/**
 * Step 2: Exchange code for access token
 * Called from /api/instagram/callback after user authorizes
 */
export async function exchangeCodeForToken(code: string): Promise<{
  access_token: string
  user_id: number
}> {
  const res = await fetch('https://api.instagram.com/oauth/access_token', {
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

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Instagram token exchange failed: ${error}`)
  }

  return res.json()
}

/**
 * Step 3: Exchange short-lived token for long-lived token (60 days)
 */
export async function getLongLivedToken(shortLivedToken: string): Promise<{
  access_token: string
  token_type: string
  expires_in: number
}> {
  const params = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: process.env.INSTAGRAM_CLIENT_SECRET!,
    access_token: shortLivedToken,
  })

  const res = await fetch(`https://graph.instagram.com/access_token?${params.toString()}`)

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Long-lived token exchange failed: ${error}`)
  }

  return res.json()
}

/**
 * Refresh long-lived token (call before it expires)
 */
export async function refreshLongLivedToken(currentToken: string): Promise<{
  access_token: string
  token_type: string
  expires_in: number
}> {
  const params = new URLSearchParams({
    grant_type: 'ig_refresh_token',
    access_token: currentToken,
  })

  const res = await fetch(`https://graph.instagram.com/refresh_access_token?${params.toString()}`)

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Token refresh failed: ${error}`)
  }

  return res.json()
}

// ─── Fetch Instagram Data ─────────────────────────────────────────────────────

/**
 * Get artist's Instagram profile
 */
export async function getInstagramProfile(accessToken: string): Promise<InstagramAccount> {
  const params = new URLSearchParams({
    fields: 'id,username,account_type',
    access_token: accessToken,
  })

  const res = await fetch(`https://graph.instagram.com/me?${params.toString()}`)

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Failed to fetch Instagram profile: ${error}`)
  }

  return res.json()
}

/**
 * Get artist's latest Instagram posts
 */
export async function getInstagramMedia(
  accessToken: string,
  limit = 12
): Promise<InstagramMedia[]> {
  const params = new URLSearchParams({
    fields: 'id,media_type,media_url,permalink,caption,timestamp,thumbnail_url',
    access_token: accessToken,
    limit: String(limit),
  })

  const res = await fetch(`https://graph.instagram.com/me/media?${params.toString()}`)

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Failed to fetch Instagram media: ${error}`)
  }

  const data = await res.json()
  return data.data || []
}

// ─── Storage helpers (for localStorage/Supabase migration) ───────────────────

/**
 * Save artist's social connection
 * Currently uses localStorage, will migrate to Supabase
 */
export function saveSocialConnection(connection: ArtistSocialConnection): void {
  const key = 'social_connections'
  const stored = localStorage.getItem(key)
  const connections: ArtistSocialConnection[] = stored ? JSON.parse(stored) : []
  
  // Remove old connection for same artist+platform
  const filtered = connections.filter(
    c => !(c.artistId === connection.artistId && c.platform === connection.platform)
  )
  
  filtered.push(connection)
  localStorage.setItem(key, JSON.stringify(filtered))
}

/**
 * Get all social connections
 */
export function getSocialConnections(): ArtistSocialConnection[] {
  const stored = localStorage.getItem('social_connections')
  return stored ? JSON.parse(stored) : []
}

/**
 * Get connections for specific artist
 */
export function getArtistConnections(artistId: string): ArtistSocialConnection[] {
  return getSocialConnections().filter(c => c.artistId === artistId)
}

/**
 * Get all Instagram-connected artists grouped by genre
 */
export function getInstagramArtistsByGenre(): Record<string, ArtistSocialConnection[]> {
  const connections = getSocialConnections().filter(c => c.platform === 'instagram')
  const artists = localStorage.getItem('artists')
  const artistsData = artists ? JSON.parse(artists) : []
  
  const grouped: Record<string, ArtistSocialConnection[]> = {}
  
  for (const conn of connections) {
    const artist = artistsData.find((a: any) => a.id === conn.artistId)
    if (!artist) continue
    
    const genre = artist.genre || 'Kita'
    if (!grouped[genre]) grouped[genre] = []
    grouped[genre].push(conn)
  }
  
  return grouped
}

/**
 * Disconnect social account
 */
export function disconnectSocial(artistId: string, platform: string): void {
  const connections = getSocialConnections()
  const filtered = connections.filter(
    c => !(c.artistId === artistId && c.platform === platform)
  )
  localStorage.setItem('social_connections', JSON.stringify(filtered))
}
