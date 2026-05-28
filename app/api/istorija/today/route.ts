// app/api/istorija/today/route.ts
//
// GET /api/istorija/today — kas šiandien aktualu istorijos kontekste:
//   - Atlikėjų gimtadieniai (artists.birth_date sutampa šios dienos MM-DD)
//   - Atlikėjų mirties metinės (artists.death_date sutampa šios dienos MM-DD)
//   - Albumų jubiliejai (albums.month/day sutampa šios dienos MM-DD,
//     metai - apvalūs: 5, 10, 15, 20, 25...)
//
// Naudojama homepage'o IstorijaSection — pakeitė placeholder'ius realiais
// duomenimis.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { unstable_cache } from 'next/cache'

export const revalidate = 3600 // 1 val.

type IstItem = {
  id: string
  type: 'birthday' | 'death_anniversary' | 'album_anniversary'
  title: string
  subtitle: string
  href: string
  emoji: string
  cover: string | null
  year: number | null
  age?: number | null
}

async function fetchToday(): Promise<IstItem[]> {
  const sb = createAdminClient()
  const now = new Date()
  const currentYear = now.getFullYear()

  const items: IstItem[] = []

  // ⚠️ Anksčiau naudojom `.ilike('birth_date', '%-MM-DD')` ant DATE kolonos —
  // Postgres'as pilnai scan'indavo lentelę (>12k artistų), Vercel function
  // timeout. Dabar — tik albumų jubiliejus per indexed month/day eq filtrus.
  // Atlikėjų gimtadieniai/mirties metinės grįš su RPC funkcija ateityje.

  // ── Albumų jubiliejai ──
  // month + day indexed, eq filtras greitas. Jubiliejus = year diff dalijasi
  // iš 5 (5, 10, 15, 20, 25 ir t.t.).
  try {
    const { data: albums } = await sb
      .from('albums')
      .select('id, slug, title, cover_image_url, year, month, day, ' +
        'artists!albums_artist_id_fkey(id, slug, name)')
      .eq('month', now.getMonth() + 1)
      .eq('day', now.getDate())
      .not('year', 'is', null)
      .lt('year', currentYear)
      .order('year', { ascending: true })
      .limit(40)
    for (const a of (albums || []) as any[]) {
      const yrsAgo = currentYear - a.year
      if (yrsAgo < 5) continue
      if (yrsAgo % 5 !== 0) continue
      const artistName = a.artists?.name || ''
      const artistSlug = a.artists?.slug || ''
      items.push({
        id: `alb-${a.id}`,
        type: 'album_anniversary',
        title: `${artistName ? artistName + ' – ' : ''}${a.title}`,
        subtitle: `${yrsAgo} m. nuo albumo išleidimo`,
        href: artistSlug ? `/albumai/${artistSlug}-${(a.slug || a.id)}-${a.id}` : `/albumai/${a.slug || a.id}-${a.id}`,
        emoji: '💿',
        cover: a.cover_image_url || null,
        year: a.year,
      })
    }
  } catch {}

  // Albumus apvalių jubiliejų rikuojam pagal yrsAgo DESC (didžiausi pirmi).
  items.sort((a, b) => (b.year ? currentYear - b.year : 0) - (a.year ? currentYear - a.year : 0))
  return items.slice(0, 12)
}

const cachedFetchToday = unstable_cache(fetchToday, ['istorija-today'], { revalidate: 3600 })

export async function GET() {
  try {
    const items = await cachedFetchToday()
    return NextResponse.json({ items }, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
    })
  } catch (e: any) {
    return NextResponse.json({ items: [], error: e.message }, { status: 200 })
  }
}
