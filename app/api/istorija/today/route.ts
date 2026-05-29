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

  const items: any[] = []

  // ⚠️ Atlikėjų gimtadieniai/mirties metinės kol kas išjungti — `.ilike` ant
  // birth_date DATE kolonos pilnai scan'ina >12k artistų (Vercel timeout).
  // Grįš su month/day indexed kolonomis ar RPC ateityje.

  // ── Albumų sukaktys ŠĮ MĖNESĮ ──
  // month indexed (greitas eq). Anksčiau buvo EXACT day + apvalūs 5 m. jubiliejai
  // → beveik visada tuščia. Dabar imam visus šio mėnesio albumus (year < dabar);
  // šiandienos sukaktys + apvalūs jubiliejai keliami į priekį. 2026-05-29.
  const MON = ['sausio', 'vasario', 'kovo', 'balandžio', 'gegužės', 'birželio', 'liepos', 'rugpjūčio', 'rugsėjo', 'spalio', 'lapkričio', 'gruodžio']
  try {
    const { data: albums } = await sb
      .from('albums')
      .select('id, slug, title, cover_image_url, year, month, day, ' +
        'artists!albums_artist_id_fkey(id, slug, name)')
      .eq('month', now.getMonth() + 1)
      .not('year', 'is', null)
      .lt('year', currentYear)
      .order('year', { ascending: true })
      .limit(120)
    for (const a of (albums || []) as any[]) {
      const yrsAgo = currentYear - a.year
      if (yrsAgo < 1) continue
      const artistName = a.artists?.name || ''
      const artistSlug = a.artists?.slug || ''
      const isToday = a.day === now.getDate()
      const subtitle = isToday
        ? `Lygiai prieš ${yrsAgo} m. išleistas albumas`
        : `Prieš ${yrsAgo} m. · ${a.day || ''} ${MON[(a.month || 1) - 1]}`
      items.push({
        id: `alb-${a.id}`,
        type: 'album_anniversary',
        title: `${artistName ? artistName + ' – ' : ''}${a.title}`,
        subtitle,
        href: artistSlug ? `/albumai/${artistSlug}-${(a.slug || a.id)}-${a.id}` : `/albumai/${a.slug || a.id}-${a.id}`,
        emoji: '💿',
        cover: a.cover_image_url || null,
        year: a.year,
        age: yrsAgo,
        _today: isToday,
      })
    }
  } catch {}

  // Rikiavimas: šiandienos sukaktys pirma, tada apvalūs jubiliejai (÷5), tada
  // pagal senumą (metų skaičių) desc.
  items.sort((a: any, b: any) => {
    if (!!b._today !== !!a._today) return a._today ? -1 : 1
    const ar = a.age && a.age % 5 === 0 ? 1 : 0
    const br = b.age && b.age % 5 === 0 ? 1 : 0
    if (ar !== br) return br - ar
    return (b.age || 0) - (a.age || 0)
  })
  return (items as IstItem[]).slice(0, 16)
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
