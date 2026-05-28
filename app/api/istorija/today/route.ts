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

export const dynamic = 'force-dynamic'
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
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const mmdd = `${mm}-${dd}`

  const items: IstItem[] = []

  // ── Atlikėjų gimtadieniai (ne mirtieji) ──
  // Postgres'as: substring(birth_date::text from 6 for 5) = 'MM-DD'
  try {
    const { data: birthdays } = await sb
      .from('artists')
      .select('id, slug, name, cover_image_url, birth_date, death_date')
      .not('birth_date', 'is', null)
      .ilike('birth_date', `%-${mmdd}`)
      .limit(20)
    for (const a of (birthdays || []) as any[]) {
      // Mirštantiems atlikėjams rodom „atminčiai" (sekcijoje death_anniversary tik mirties datą)
      if (a.death_date) continue
      const by = a.birth_date ? Number(a.birth_date.slice(0, 4)) : null
      const age = by ? currentYear - by : null
      items.push({
        id: `bday-${a.id}`,
        type: 'birthday',
        title: a.name,
        subtitle: age ? `Šiandien sukanka ${age} m.` : 'Gimtadienis',
        href: `/atlikejai/${a.slug}`,
        emoji: '🎂',
        cover: a.cover_image_url || null,
        year: by,
        age,
      })
    }
  } catch {}

  // ── Mirties metinės ──
  try {
    const { data: deaths } = await sb
      .from('artists')
      .select('id, slug, name, cover_image_url, death_date, birth_date')
      .not('death_date', 'is', null)
      .ilike('death_date', `%-${mmdd}`)
      .limit(20)
    for (const a of (deaths || []) as any[]) {
      const dy = a.death_date ? Number(a.death_date.slice(0, 4)) : null
      const yrsAgo = dy ? currentYear - dy : null
      items.push({
        id: `death-${a.id}`,
        type: 'death_anniversary',
        title: a.name,
        subtitle: yrsAgo ? `Prieš ${yrsAgo} m. atsisveikinome` : 'Mirties metinės',
        href: `/atlikejai/${a.slug}`,
        emoji: '🕯️',
        cover: a.cover_image_url || null,
        year: dy,
      })
    }
  } catch {}

  // ── Albumų jubiliejai ──
  // Imam albumus su tiksliu mėnesiu + diena = šiandien. Jubiliejus =
  // metų skirtumas dalijasi iš 5 (5, 10, 15, 20, 25 ir t.t.).
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
      if (yrsAgo < 5) continue // Mažai įdomu — pirmiems metams nerodom
      if (yrsAgo % 5 !== 0) continue // Tik apvalūs (5, 10, 15...)
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

  // Sortuojam: gimtadieniai pirma, tada album'ai pagal jubiliejaus dydį DESC,
  // tada mirties metinės. Apriboiam 12 įrašų — kortelės juostai pakanka.
  const order: Record<IstItem['type'], number> = { birthday: 0, album_anniversary: 1, death_anniversary: 2 }
  items.sort((a, b) => {
    const oa = order[a.type], ob = order[b.type]
    if (oa !== ob) return oa - ob
    if (a.type === 'album_anniversary' && b.type === 'album_anniversary') {
      return (b.year ? currentYear - b.year : 0) - (a.year ? currentYear - a.year : 0)
    }
    return 0
  })

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
