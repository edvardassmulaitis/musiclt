# 🎵 Music.lt - Next.js Platform

## ✅ STEP 1: VERCEL DEPLOYMENT (2 MINUTĖS)

### 1. Upload į GitHub

```bash
# Delete seną repo
GitHub → musiclt → Settings → Delete repository

# Create new
GitHub → New repository
Name: musiclt
Public
Create repository

# Upload visus failus
Download musiclt-nextjs.tar.gz
Extract visus failus
GitHub → Upload files
Drag VISUS failus iš musiclt-nextjs/ folder
Commit "Next.js initial setup"
```

### 2. Deploy į Vercel

```bash
1. Eik: https://vercel.com
2. Login su GitHub
3. "Add New Project"
4. Import "musiclt" repo
5. Framework Preset: Next.js (auto-detect)
6. Click "Deploy"
7. Wait 1-2 minutes
8. DONE! ✅
```

### 3. Atidaryti

```
https://musiclt.vercel.app

Matysi gražų puslapį su:
- 🎵 Animuota muzika
- Gradient "music.lt"
- 4 feature cards su hover
- Stats
- Professional dizainą
```

---

## ✅ STEP 2: SUPABASE SETUP (5 MINUTĖS)

### 1. Sukurti projektą

```bash
1. Eik: https://supabase.com
2. Sign up (nemokamai)
3. "New Project"
   Name: musiclt
   Database Password: [sugeneruok stiprų]
   Region: Europe (Frankfurt)
4. Click "Create new project"
5. Wait 2 minutes
```

### 2. Gauti credentials

```bash
Supabase → Project Settings → API

Copy:
- Project URL
- anon (public) key
```

### 3. Pridėti į Vercel

```bash
Vercel → musiclt project → Settings → Environment Variables

Add:
NEXT_PUBLIC_SUPABASE_URL = [tavo URL]
NEXT_PUBLIC_SUPABASE_ANON_KEY = [tavo key]

Redeploy
```

---

## ✅ STEP 3: DATABASE SCHEMA

Supabase → SQL Editor → New query:

```sql
-- Artists table
CREATE TABLE artists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  country TEXT DEFAULT 'Lietuva',
  genre TEXT,
  description TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Albums table
CREATE TABLE albums (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  artist_id UUID REFERENCES artists(id),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  release_date DATE,
  cover_url TEXT,
  spotify_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Songs table
CREATE TABLE songs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  artist_id UUID REFERENCES artists(id),
  album_id UUID REFERENCES albums(id),
  title TEXT NOT NULL,
  duration TEXT,
  spotify_url TEXT,
  youtube_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- News table
CREATE TABLE news (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category TEXT,
  summary TEXT,
  content TEXT,
  image_url TEXT,
  published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Events table
CREATE TABLE events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  date DATE NOT NULL,
  time TEXT,
  venue TEXT,
  city TEXT DEFAULT 'Vilnius',
  price TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Run → SUCCESS!

---

## 📁 PROJECT STRUCTURE

```
musiclt-nextjs/
├── app/
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Homepage
│   ├── globals.css         # Tailwind CSS
│   ├── admin/              # Admin panel (coming)
│   └── api/                # API routes (coming)
├── package.json
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
└── README.md
```

---

## 🎯 NEXT STEPS (Aš pridėsiu):

### Phase 1: Admin Panel
- [ ] Admin login page
- [ ] Dashboard
- [ ] Artists CRUD
- [ ] Albums CRUD
- [ ] Songs CRUD
- [ ] News CRUD
- [ ] Events CRUD

### Phase 2: Frontend
- [ ] Artists listing page
- [ ] Artist detail page
- [ ] Albums page
- [ ] News page
- [ ] Events page
- [ ] TOP 40 page
- [ ] Song of the Day

### Phase 3: Features
- [ ] User authentication
- [ ] Comments system
- [ ] Voting system
- [ ] Search functionality
- [ ] Spotify integration

---

## 💻 LOCAL DEVELOPMENT (jei reikia)

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Open http://localhost:3000
```

---

## 🚀 DEPLOYMENT WORKFLOW

**Kaip aš update'insiu:**

```bash
1. Aš sukuriu naują feature lokaliai
2. Push į GitHub
3. Vercel auto-deploy per 30 sek
4. Tu matai live iškart
```

**Tu:**
- Nieko nedarai techniškai
- Tik naudojiesi admin panel
- Pridedi content
- Instant live

---

## 📊 TECH STACK

- **Frontend:** Next.js 15, React 19, TypeScript
- **Styling:** Tailwind CSS
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth
- **Storage:** Supabase Storage
- **Hosting:** Vercel
- **Domain:** music.lt (vėliau)

---

## 💰 COST

**FREE tier pakanka:**
- Vercel: 100GB bandwidth, unlimited deployments
- Supabase: 500MB database, 1GB storage, 2GB bandwidth

**Paid (jei išaugs):**
- Vercel Pro: $20/mėn
- Supabase Pro: $25/mėn

---

## ✅ SUCCESS!

Kai pamatysi gražų puslapį Vercel URL - **VEIKIA!**

Tada aš pridedu admin panel ir database integration step-by-step.

**Upload dabar į GitHub!** 🚀
