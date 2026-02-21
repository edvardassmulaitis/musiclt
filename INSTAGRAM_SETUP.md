# Instagram Integration Setup

## Kas tai?

Lietuviški atlikėjai gali prijungti savo Instagram paskyras prie music.lt. Po prijungimo, jų naujausi įrašai automatiškai atsiras:
- Atlikėjo profilyje music.lt
- `/instagram` puslapyje, sugrupuoti pagal muzikos stilius

## Kaip veikia?

### 1. Instagram App Setup (Facebook Developers)

Eik į https://developers.facebook.com/apps

**Sukurk naują app:**
1. "Create App" → "Consumer" → "Instagram Basic Display"
2. App vardas: "music.lt Instagram Integration"
3. App email: tavo@email.com

**Konfigūruok Instagram Basic Display:**
1. Eik į "Products" → "Instagram Basic Display" → "Basic Display"
2. "Create New App"
3. Užpildyk:
   - **Valid OAuth Redirect URIs:**
     - Development: `http://localhost:3000/api/instagram/callback`
     - Production: `https://tavo-domain.vercel.app/api/instagram/callback`
   - **Deauthorize Callback URL:** `https://tavo-domain.vercel.app/api/instagram/deauthorize`
   - **Data Deletion Request URL:** `https://tavo-domain.vercel.app/api/instagram/delete`

4. Išsaugok **Instagram App ID** ir **Instagram App Secret**

### 2. Environment Variables

Vercel arba local `.env.local`:

```env
# Instagram OAuth
INSTAGRAM_CLIENT_ID=your_instagram_app_id
INSTAGRAM_CLIENT_SECRET=your_instagram_app_secret
NEXT_PUBLIC_INSTAGRAM_CLIENT_ID=your_instagram_app_id
NEXT_PUBLIC_APP_URL=https://tavo-domain.vercel.app
```

### 3. Kaip atlikėjas prijungia Instagram

1. Admin → Atlikėjai → [Pasirink atlikėją]
2. Scroll žemyn → "Instagram integracija"
3. Spausk "📸 Prijungti Instagram"
4. Prisijunk su Instagram paskyra
5. Authorize music.lt
6. Redirectina atgal → Connection išsaugota

### 4. Token Management

- **Short-lived token:** 1 valandą (gaunamas iš OAuth)
- **Long-lived token:** 60 dienų (iškeičiamas automatiškai)
- **Refresh:** Galima atnaujinti prieš pasibaigiant

Sistema automatiškai:
1. Gauna short-lived token
2. Iškeiča į long-lived (60d)
3. Išsaugo localStorage (dabar), vėliau Supabase
4. Kiekvieną dieną fetch'ina naujus posts

### 5. Data Storage

**Dabar:** `localStorage`
```json
{
  "social_connections": [
    {
      "artistId": "1",
      "platform": "instagram",
      "username": "monika_liu",
      "accessToken": "IGQWRPa...",
      "tokenExpiresAt": 1234567890,
      "connectedAt": 1234567890
    }
  ]
}
```

**Vėliau (Supabase migration):**
```sql
CREATE TABLE social_connections (
  id UUID PRIMARY KEY,
  artist_id UUID REFERENCES artists(id),
  platform TEXT NOT NULL,
  username TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at BIGINT NOT NULL,
  connected_at BIGINT NOT NULL,
  last_synced_at BIGINT
);

CREATE TABLE instagram_posts (
  id TEXT PRIMARY KEY,
  artist_id UUID REFERENCES artists(id),
  media_type TEXT,
  media_url TEXT,
  permalink TEXT,
  caption TEXT,
  timestamp BIGINT,
  fetched_at BIGINT
);
```

### 6. Automated Sync (Future Enhancement)

Sukurti cron job kas 24h:
```typescript
// app/api/cron/sync-instagram/route.ts
export async function GET() {
  const connections = await getExpiringSoonConnections()
  
  for (const conn of connections) {
    // Refresh token if < 7 days left
    if (conn.daysUntilExpiry < 7) {
      await refreshToken(conn)
    }
    
    // Fetch new posts
    const posts = await fetchInstagramMedia(conn.accessToken)
    await saveToDatabase(posts, conn.artistId)
  }
  
  return new Response('OK')
}
```

Vercel Cron:
```json
{
  "crons": [{
    "path": "/api/cron/sync-instagram",
    "schedule": "0 2 * * *"
  }]
}
```

## API Routes

### `/api/instagram/callback`
OAuth redirect handler. Iškeiča code → token, išsaugo connection.

### `/api/instagram/media` (POST)
Fetch Instagram posts. Body: `{ accessToken, limit }`

### Future: `/api/instagram/refresh` (POST)
Refresh expiring token. Body: `{ artistId }`

## Usage in Components

### Artist Admin Panel
```tsx
import InstagramConnect from '@/components/InstagramConnect'

<InstagramConnect artistId={artist.id} artistName={artist.name} />
```

### Public Feed
Visit `/instagram` - shows all posts grouped by genre

## Testing Locally

1. Setup ngrok: `ngrok http 3000`
2. Update redirect URI in Facebook app: `https://abc123.ngrok.io/api/instagram/callback`
3. Update `.env.local`: `NEXT_PUBLIC_APP_URL=https://abc123.ngrok.io`
4. Test OAuth flow

## Limitations

- Instagram Basic Display API only (not Business API)
- Max 200 posts can be fetched
- Videos require thumbnail_url
- Token expires every 60 days (needs refresh)

## Security Notes

- Never commit `.env` files
- Store access tokens securely (encrypt in Supabase)
- Implement token rotation
- Add rate limiting to prevent abuse
