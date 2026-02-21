# 📸 Instagram Integration Feature

## Sukurta

✅ **Backend:**
- `/lib/instagram.ts` - Instagram OAuth & API helpers
- `/app/api/instagram/callback/route.ts` - OAuth callback handler
- `/app/api/instagram/media/route.ts` - Media fetch endpoint

✅ **Components:**
- `InstagramConnect.tsx` - Artist admin component (connect/disconnect Instagram)
- `/app/instagram/page.tsx` - Public feed page (grouped by genre)

✅ **Documentation:**
- `INSTAGRAM_SETUP.md` - Full setup & migration guide

## Kaip integruoti į esamą kodą

### 1. Pridėti į Artist Edit puslapį

`/app/admin/artists/[id]/page.tsx`:

```tsx
import InstagramConnect from '@/components/InstagramConnect'

// Render forms
<ArtistForm ... />
<WikipediaImport ... />

{/* ADD THIS: */}
<InstagramConnect artistId={artist.id} artistName={artist.name} />
```

### 2. Pridėti nuorodą į Nav

`/app/page.tsx` arba nav component:

```tsx
{[
  ['Naujienos','#'],
  ['Instagram','/instagram'], // ADD THIS
  ['Topai','#'],
  ...
]}
```

### 3. Environment Variables

`.env.local`:
```env
INSTAGRAM_CLIENT_ID=your_app_id
INSTAGRAM_CLIENT_SECRET=your_app_secret
NEXT_PUBLIC_INSTAGRAM_CLIENT_ID=your_app_id
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Vercel production:
```
INSTAGRAM_CLIENT_ID=...
INSTAGRAM_CLIENT_SECRET=...
NEXT_PUBLIC_INSTAGRAM_CLIENT_ID=...
NEXT_PUBLIC_APP_URL=https://musiclt.vercel.app
```

## User Flow

1. **Admin panel:**
   - Artist → Edit → "Instagram integracija" sekcija
   - Click "Prijungti Instagram"
   - Instagram OAuth → authorize
   - Redirect back → token saved to localStorage

2. **Public view:**
   - Visit `/instagram`
   - See all connected artists' latest posts
   - Filter by genre
   - Click post → opens Instagram
   - Click artist name → goes to artist profile

## Storage

**Now:** localStorage
```json
{
  "social_connections": [{
    "artistId": "1",
    "platform": "instagram",
    "username": "monika_liu",
    "accessToken": "IGQWR...",
    "tokenExpiresAt": 1740000000000,
    "connectedAt": 1735000000000
  }]
}
```

**Later (Supabase):** Migrate to `social_connections` table

## Features

✅ OAuth 2.0 flow with Instagram
✅ Long-lived tokens (60 days)
✅ Token expiry warnings
✅ Public feed page
✅ Genre filtering
✅ Artist attribution
✅ Video/carousel support
✅ Timestamp formatting
✅ Responsive grid layout

## Future Enhancements

- [ ] Auto-refresh expiring tokens (cron)
- [ ] Persist posts in database
- [ ] Artist profile Instagram widget
- [ ] Homepage "Latest from Instagram" section
- [ ] Multiple platform support (TikTok, Facebook)
- [ ] Post engagement metrics (if using Business API)

## Instagram App Setup (Quick Guide)

1. Go to https://developers.facebook.com/apps
2. Create App → Consumer → Instagram Basic Display
3. Configure OAuth Redirect URIs:
   - `http://localhost:3000/api/instagram/callback`
   - `https://yourdomain.com/api/instagram/callback`
4. Copy App ID & Secret → add to env vars
5. Test with ngrok for local development

See `INSTAGRAM_SETUP.md` for detailed instructions.
